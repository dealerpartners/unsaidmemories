import "server-only"
import pg from "pg"
import { withPg, TENANT_ID } from "@/lib/crm/enterprise"
import { accrueCommissionsForAppointment, runnerFromClient } from "@/lib/crm/commissions"
import { verifyStaffPin } from "@/lib/enterprise/register-pin"
import {
  loadPromotionTargets,
  resolveEligibleLines,
  computePromotionDiscount,
} from "@/lib/enterprise/promotions"

// ============================================================================
// enterprise/pos.ts — the Cloud POS data layer (enterprise-grade).
//
// Financial integrity rules enforced:
//   1. Single DB transaction (BEGIN ... COMMIT / ROLLBACK)
//   2. Idempotency key (commerce_idempotency) — blocks double-submission
//   3. Journal balance guardrail (Σ Debits − Σ Credits == 0 before commit)
//   4. Returns create NEW negative rows (never UPDATE/DELETE historical)
//   5. Gift cards query a distinct ledger + log balance_before/after
//   6. Cash drawer trigger via ESC/POS command in receipt raw text
// ============================================================================

const DEFAULT_TENANT = TENANT_ID

// ---- Types ----
export type PosCatalogItem = {
  id: string
  sku: string
  name: string
  itemType: "product" | "service" | "subscription"
  price: number
  compareAtPrice: number | null
  stock: number | null
  posEnabled: boolean
  categoryName?: string | null
  subscriptionPlanCode?: string | null
  subscriptionPlanInterval?: string | null
  /** The salon's own favorites flag (commerce_catalog_items.metadata
   *  is_house_favorite) — 193 live products carry it; the register's
   *  Favorites surface reads it. */
  isSalonFavorite?: boolean
  /** Age-verification flags from catalog metadata (age_restricted /
   *  min_age). No live product carries them today; the register's
   *  attestation flow keys off these the moment one does. */
  ageRestricted?: boolean
  minAge?: number | null
}

export type PosCategory = {
  id: string | null
  name: string
  itemCount: number
}

export type PosPaymentMethod = {
  id: string
  code: string
  name: string
  methodType: string
  processor: string | null
}

export type PosRegister = {
  id: string
  registerNumber: string
  name: string
  branchId: string
  status: string
  active: boolean
}

export type PosRegisterSession = {
  id: string
  registerId: string
  status: string
  openingCash: number
  expectedCash: number
  countedCash: number | null
  variance: number | null
  openedAt: string
  closedAt: string | null
  openedBy: string | null
}

export type PosSaleResult = {
  saleId: string
  saleNumber: string
  receiptNumber: string
  total: number
  paidTotal: number
  changeDue: number
  receiptRaw: string  // ESC/POS raw text for thermal printers
  journalEntryId: string | null  // the GL posting (balanced)
  // Lines sold beyond proper stock at the sale warehouse (Sunny's
  // zero-stock ruling: warn, never block — and flag for the daily
  // report; one pos_stock_alerts row per entry here).
  oversoldLines: {
    productName: string
    skuCode: string | null
    quantitySold: number
    quantityAvailable: number
    quantityShort: number
  }[]
}

export type GiftCardBalance = {
  id: string
  cardNumber: string
  balance: number
  status: string
  holderName: string | null
}

// ============================================================================
// READ — register tax rates from the tenant's OWN acct_tax_rules.
// Rates are per-tenant configuration (Settings → Taxes), never a global
// constant: the register must charge what THIS store configured. Stored
// rate values are percents (7.000 = 7%); the register works in fractions.
// A rule whose classification marks it goods-only (RETAIL_GOODS_ONLY)
// applies to product lines only; every other auto-calc rule applies to
// the whole taxable base — the same split completePosSale uses when it
// writes commerce_sale_taxes.
// ============================================================================

export type PosTaxRates = {
  configured: boolean
  /** fraction applied to product lines, e.g. 0.0925 */
  productRate: number
  /** fraction applied to service/subscription lines, e.g. 0.07 */
  otherRate: number
  rules: { jurisdiction: string; ratePct: number; classification: string | null; goodsOnly: boolean }[]
}

export async function getPosTaxRates(tenantId?: string): Promise<PosTaxRates> {
  return (await withPg(async (client) => {
    const tenant = tenantId ?? DEFAULT_TENANT()
    const { rows } = await client.query(`
      SELECT jurisdiction, rate::float8 AS rate, classification
      FROM public.acct_tax_rules
      WHERE tenant_id = $1 AND is_active = true AND auto_calc = true AND rate > 0
      ORDER BY rate DESC
    `, [tenant]).catch(() => ({ rows: [] as { jurisdiction: string; rate: number; classification: string | null }[] }))
    const rules = rows.map(r => ({
      jurisdiction: String(r.jurisdiction || "tax"),
      ratePct: Number(r.rate) || 0,
      classification: r.classification ? String(r.classification) : null,
      goodsOnly: /GOODS|RETAIL|PRODUCT/i.test(String(r.classification || "")),
    }))
    const productRate = rules.reduce((s, r) => s + r.ratePct, 0) / 100
    const otherRate = rules.filter(r => !r.goodsOnly).reduce((s, r) => s + r.ratePct, 0) / 100
    return { configured: rules.length > 0, productRate, otherRate, rules }
  })) ?? { configured: false, productRate: 0, otherRate: 0, rules: [] }
}

// ============================================================================
// READ — catalog with categories
// ============================================================================

export async function getPosCatalog(tenantId?: string): Promise<{ items: PosCatalogItem[]; categories: PosCategory[] }> {
  return (await withPg(async (client) => {
    const tenant = tenantId ?? DEFAULT_TENANT()

    // Stock shown at the register is the SALE warehouse's stock (the
    // tenant's MAIN — where completePosSale decrements), derived per
    // (sku, warehouse) from erp_stock_levels. Every movement resolves to
    // MAIN today, so these numbers match the old global derivation; when
    // other warehouses hold stock, the register still reads its own.
    const { rows: whRows } = await client.query(
      `SELECT id FROM public.erp_warehouses WHERE tenant_id = $1 AND is_active
        ORDER BY (code = 'MAIN') DESC, created_at LIMIT 1`,
      [tenant],
    ).catch(() => ({ rows: [] as { id: string }[] }))
    const saleWarehouseId = whRows[0]?.id ?? null

    // Products with their category (from commerce_catalog_items + commerce_categories)
    const { rows: products } = await client.query(`
      SELECT ci.id, ci.sku, ci.name, ci.item_type, ci.pos_enabled,
             ci.short_description,
             cp.price, cp.compare_at_price,
             COALESCE(stock.qty, 0) AS stock,
             (ci.metadata->>'is_salon_favorite') = 'true' AS is_house_favorite,
             (ci.metadata->>'age_restricted') = 'true' AS age_restricted,
             CASE WHEN (ci.metadata->>'min_age') ~ '^[0-9]+$' THEN (ci.metadata->>'min_age')::int END AS min_age,
             cc.name AS category_name
      FROM public.commerce_catalog_items ci
      LEFT JOIN public.commerce_prices cp
        ON cp.catalog_item_id = ci.id
        AND cp.price_list_id = (SELECT id FROM public.commerce_price_lists WHERE tenant_id = ci.tenant_id AND code = 'RETAIL' AND active = true LIMIT 1)
      LEFT JOIN LATERAL (SELECT SUM(on_hand) AS qty FROM public.erp_stock_levels
                          WHERE sku_id = ci.sku_id AND ($2::uuid IS NULL OR warehouse_id = $2)) stock ON true
      LEFT JOIN public.commerce_categories cc ON cc.id::text = ci.metadata->>'category_id'
      WHERE ci.tenant_id = $1 AND ci.active = true AND ci.pos_enabled = true
      ORDER BY ci.name
    `, [tenant, saleWarehouseId])

    // Services come from crm_services — the priced service catalog the
    // booking system sells (default_price). The old source was the CMS
    // `services` table (marketing categories like "GROOMING" / "BATH &
    // SPA" with NO price column at all), so every service rang up at
    // $0.00 and completed as a zero-dollar sale.
    const { rows: services } = await client.query(`
      SELECT id, name, code, default_price FROM public.crm_services
      WHERE tenant_id = $1 AND is_active = true ORDER BY name
    `, [tenant])

    const { rows: plans } = await client.query(`
      SELECT id, code, name, billing_interval, price FROM public.commerce_subscription_plans WHERE tenant_id = $1 AND active = true ORDER BY name
    `, [tenant])

    const items: PosCatalogItem[] = []
    const categoryMap = new Map<string, number>()

    for (const p of products) {
      const cat = p.category_name || "Uncategorized"
      categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1)
      items.push({
        id: p.id, sku: p.sku, name: p.name, itemType: "product",
        price: Number(p.price) || 0,
        compareAtPrice: p.compare_at_price ? Number(p.compare_at_price) : null,
        stock: Number(p.stock) || 0, posEnabled: p.pos_enabled,
        categoryName: cat,
        isSalonFavorite: p.is_house_favorite === true,
        ageRestricted: p.age_restricted === true,
        minAge: p.min_age != null ? Number(p.min_age) : null,
      })
    }
    for (const s of services) {
      items.push({
        id: s.id, sku: s.code ? `SVC-${s.code}` : `SVC-${s.id.slice(0, 8)}`, name: s.name,
        itemType: "service", price: Number(s.default_price) || 0, compareAtPrice: null,
        stock: null, posEnabled: true, categoryName: "Services",
      })
      categoryMap.set("Services", (categoryMap.get("Services") || 0) + 1)
    }
    for (const p of plans) {
      items.push({
        id: p.id, sku: p.code, name: p.name, itemType: "subscription",
        price: Number(p.price) || 0, compareAtPrice: null,
        stock: null, posEnabled: true, categoryName: "Subscriptions",
        subscriptionPlanCode: p.code, subscriptionPlanInterval: p.billing_interval,
      })
      categoryMap.set("Subscriptions", (categoryMap.get("Subscriptions") || 0) + 1)
    }

    const categories: PosCategory[] = [
      { id: null, name: "All Items", itemCount: items.length },
      ...Array.from(categoryMap.entries()).map(([name, count]) => ({
        id: name, name, itemCount: count,
      })),
    ]

    return { items, categories }
  })) ?? { items: [], categories: [] }
}

// ============================================================================
// READ — payment methods
// ============================================================================

export async function getPosPaymentMethods(tenantId?: string): Promise<PosPaymentMethod[]> {
  return (await withPg(async (client) => {
    const { rows } = await client.query(`
      SELECT id, code, name, method_type, processor
      FROM public.commerce_payment_methods
      WHERE tenant_id = $1 AND active = true
      ORDER BY method_type, name
    `, [tenantId ?? DEFAULT_TENANT()])
    return rows.map((r: any) => ({
      id: r.id, code: r.code, name: r.name,
      methodType: r.method_type, processor: r.processor,
    }))
  })) ?? []
}

// ============================================================================
// READ — registers + sessions
// ============================================================================

export async function getPosRegisters(tenantId?: string): Promise<PosRegister[]> {
  return (await withPg(async (client) => {
    const { rows } = await client.query(`
      SELECT id, register_number, name, branch_id, status, active
      FROM public.commerce_registers WHERE tenant_id = $1 AND active = true ORDER BY register_number
    `, [tenantId ?? DEFAULT_TENANT()])
    return rows.map((r: any) => ({
      id: r.id, registerNumber: r.register_number, name: r.name,
      branchId: r.branch_id, status: r.status, active: r.active,
    }))
  })) ?? []
}

export async function getActiveRegisterSession(registerId: string): Promise<PosRegisterSession | null> {
  return (await withPg(async (client) => {
    const { rows } = await client.query(`
      SELECT id, register_id, status, opening_cash, expected_cash, counted_cash, variance,
             opened_at, closed_at, opened_by
      FROM public.commerce_register_sessions
      WHERE register_id = $1 AND status = 'open' ORDER BY opened_at DESC LIMIT 1
    `, [registerId])
    if (rows.length === 0) return null
    const r = rows[0]
    return {
      id: r.id, registerId: r.register_id, status: r.status,
      openingCash: Number(r.opening_cash) || 0,
      expectedCash: Number(r.expected_cash) || 0,
      countedCash: r.counted_cash ? Number(r.counted_cash) : null,
      variance: r.variance ? Number(r.variance) : null,
      openedAt: r.opened_at, closedAt: r.closed_at, openedBy: r.opened_by,
    }
  })) ?? null
}

// ============================================================================
// WRITE — open / close register
// ============================================================================

export type OpenRegisterResult =
  | PosRegisterSession
  | { error: string; code: "pin_not_set" | "invalid_pin" }

export async function openRegister(
  registerId: string,
  openingCash: number,
  opts?: { staffId?: string; userId?: string; pin?: string; tenantId?: string },
): Promise<OpenRegisterResult | null> {
  // Register ACCESS gate (Sunny, 2026-10-13): opening a session requires
  // the cashier's OWN PIN — access only, never an approval. Verified
  // BEFORE the existing-session short-circuit so a walk-up can't ride
  // someone else's open drawer. The session's opened_by carries the
  // VERIFIED cashier identity — the staff profile's auth user id (the
  // column FKs to the users table; every historical session left it
  // NULL because nothing ever wrote a resolvable identity there) —
  // never a client-supplied string.
  let openedBy: string | null = null
  if (opts?.staffId) {
    const verdict = await verifyStaffPin(opts.staffId, opts.pin || "")
    if (verdict === "no_pin") {
      return {
        error: "PIN not set — set your register PIN in your staff profile before opening a register.",
        code: "pin_not_set",
      }
    }
    if (verdict !== "ok") {
      return { error: "Incorrect PIN — the register was not opened.", code: "invalid_pin" }
    }
    openedBy = opts.userId ?? null
  }
  return (await withPg(async (client) => {
    // One open session per register: a second open (double-click, second
    // terminal) returns the existing session instead of stacking sessions
    // whose sales then split across two drawers.
    const existing = await getActiveRegisterSession(registerId)
    if (existing) return existing
    const tenant = opts?.tenantId ?? DEFAULT_TENANT()
    const { rows } = await client.query(`
      INSERT INTO public.commerce_register_sessions (tenant_id, register_id, opened_by, status, opening_cash, expected_cash)
      VALUES ($1, $2, $3, 'open', $4, $4) RETURNING id, register_id, status, opening_cash, expected_cash, opened_at, opened_by
    `, [tenant, registerId, openedBy, openingCash])
    const r = rows[0]
    // OPERATOR EVENT RESPONSE (Sunny's doctrine: "if a register opens
    // sends notification to user, email a receipt"). A NEW session just
    // landed — the platform responds: owner/staff notification records +
    // the session receipt email through sendEmail. Fail-soft by design:
    // the response can never block a register from opening. Only this
    // new-session path fires — the already-open short-circuit above does
    // not re-respond.
    try {
      const { respondToRegisterOpen } = await import("@/lib/ai-ops/operator")
      await respondToRegisterOpen(client as any, tenant, {
        id: String(r.id),
        register_id: String(r.register_id),
        opened_by: r.opened_by ? String(r.opened_by) : null,
        opening_cash: Number(r.opening_cash) || 0,
        opened_at: new Date(r.opened_at).toISOString(),
      })
    } catch {
      // The register open stands; the response is best-effort.
    }
    return {
      id: r.id, registerId: r.register_id, status: r.status,
      openingCash: Number(r.opening_cash) || 0,
      expectedCash: Number(r.expected_cash) || 0,
      countedCash: null, variance: null,
      openedAt: r.opened_at, closedAt: null, openedBy: r.opened_by,
    }
  })) ?? null
}

export async function closeRegister(sessionId: string, countedCash: number, closedBy?: string): Promise<boolean> {
  return (await withPg(async (client) => {
    const { rows: sess } = await client.query(`SELECT expected_cash, status FROM public.commerce_register_sessions WHERE id = $1`, [sessionId])
    if (sess.length === 0 || sess[0].status !== 'open') return false
    const expected = Number(sess[0].expected_cash) || 0
    const variance = countedCash - expected
    await client.query(`
      UPDATE public.commerce_register_sessions
      SET status = 'closed', counted_cash = $2, variance = $3, closed_at = now(), closed_by = $4 WHERE id = $1 AND status = 'open'
    `, [sessionId, countedCash, variance, closedBy || null])
    return true
  })) ?? false
}

export async function recordCashMovement(sessionId: string, type: string, amount: number, reason?: string, createdBy?: string): Promise<boolean> {
  return (await withPg(async (client) => {
    // The movement's tenant is the SESSION's tenant — a cash movement is
    // part of that register session's books, whoever keys it in.
    const { rows: sess } = await client.query(
      `SELECT tenant_id FROM public.commerce_register_sessions WHERE id = $1 LIMIT 1`,
      [sessionId],
    ).catch(() => ({ rows: [] as { tenant_id: string }[] }))
    const tenant = sess[0]?.tenant_id || DEFAULT_TENANT()
    await client.query(`
      INSERT INTO public.commerce_cash_movements (tenant_id, register_session_id, movement_type, amount, reason, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [tenant, sessionId, type, amount, reason || null, createdBy || null])
    const adj = type === "cash_in" ? amount : type === "cash_out" ? -amount : 0
    if (adj !== 0) {
      await client.query(`UPDATE public.commerce_register_sessions SET expected_cash = expected_cash + $2 WHERE id = $1`, [sessionId, adj])
    }
    return true
  })) ?? false
}

// ============================================================================
// GIFT CARD — query balance
// ============================================================================

export async function queryGiftCard(cardNumber: string, tenantId?: string): Promise<GiftCardBalance | null> {
  return (await withPg(async (client) => {
    const { rows } = await client.query(`
      SELECT gc.id, gc.card_number, gc.balance, gc.status,
             COALESCE(gc.recipient_name, gc.holder_customer_id::text, '') AS holder_name
      FROM public.commerce_gift_cards gc
      WHERE gc.card_number = $1 AND gc.tenant_id = $2
      LIMIT 1
    `, [cardNumber, tenantId ?? DEFAULT_TENANT()])
    if (rows.length === 0) return null
    const r = rows[0]
    return {
      id: r.id, cardNumber: r.card_number,
      balance: Number(r.balance) || 0, status: r.status,
      holderName: r.holder_name || null,
    }
  })) ?? null
}

// ============================================================================
// WRITE — complete a POS sale (ENTERPRISE-GRADE)
//
// Enforces:
//   1. Idempotency (commerce_idempotency — blocks double-submission)
//   2. Single DB transaction (BEGIN ... COMMIT / ROLLBACK)
//   3. Journal balance guardrail (Σ Debits − Σ Credits == 0)
//   4. Gift card ledger entries (balance_before/after)
//   5. ESC/POS raw receipt text generation
//   6. Cash drawer trigger command (for cash/check payments)
// ============================================================================

export type PosSaleInput = {
  idempotencyKey: string  // client-generated UUID — blocks double-submission
  registerSessionId: string
  /** The business whose books this sale lands on. Callers that serve a
   *  signed-in tenant (the POS route, card-payment finalization) pass the
   *  SESSION-resolved tenant; omitted = the deployment's home tenant
   *  (the historical single-tenant behavior). A register session that
   *  belongs to a different tenant refuses the sale. */
  tenantId?: string
  customerId?: string | null
  petId?: string | null
  appointmentId?: string | null
  staffId?: string | null
  lines: {
    catalogItemId?: string | null
    skuId?: string | null
    serviceId?: string | null
    subscriptionPlanId?: string | null
    description: string
    quantity: number
    unitPrice: number
    discountAmount?: number
    costAmount?: number
    itemType: "product" | "service" | "subscription"
  }[]
  discountTotal?: number  // TOTAL discount incl. line discounts (callers send the line-discount sum today)
  couponCode?: string | null  // SA-83: validated + redeemed server-side inside the sale transaction
  taxTotal?: number
  payments: {
    paymentMethodId: string
    amount: number
    tipAmount?: number
    processorTransactionId?: string
    authorizationCode?: string
    giftCardNumber?: string  // for gift card payments
    checkReference?: string  // for check payments
  }[]
  depositAmount?: number
  notes?: string
  createdBy?: string
  /** Age-verification attestation captured at the register when the
   *  cart held an age-restricted item: the customer's date of birth as
   *  checked against ID, and the staff member who checked it. Stored
   *  in the sale's metadata — the audit trail for the attestation. */
  ageVerification?: { dateOfBirth: string; verifiedByStaffId?: string | null } | null
}

export async function completePosSale(input: PosSaleInput): Promise<PosSaleResult | { error: string; idempotent?: boolean }> {
  return (await withPg(async (client) => {
    const tenant = input.tenantId ?? DEFAULT_TENANT()

    // ---- 0. REGISTER SESSION TENANT CHECK ----
    // The register session is a tenant's drawer. A sale keyed against
    // another business's session must never land on this tenant's books.
    if (input.registerSessionId) {
      const { rows: sessRows } = await client.query(
        `SELECT tenant_id FROM public.commerce_register_sessions WHERE id = $1 LIMIT 1`,
        [input.registerSessionId],
      ).catch(() => ({ rows: [] as { tenant_id: string }[] }))
      if (sessRows.length > 0 && String(sessRows[0].tenant_id) !== String(tenant)) {
        return { error: "That register session belongs to a different business — the sale was not recorded." }
      }
    }

    // ---- 1. IDEMPOTENCY CHECK ----
    // If this idempotency_key already exists, return the cached response
    // (blocks double-submission from cashier double-clicks).
    const { rows: existing } = await client.query(`
      SELECT response_body FROM public.commerce_idempotency
      WHERE idempotency_key = $1 AND tenant_id = $2 AND expires_at > now()
    `, [input.idempotencyKey, tenant])
    if (existing.length > 0 && existing[0].response_body) {
      // response_body is jsonb — pg returns it as a parsed object
      const cached = typeof existing[0].response_body === 'string'
        ? JSON.parse(existing[0].response_body)
        : existing[0].response_body
      return cached as PosSaleResult
    }

    await client.query("BEGIN")
    try {
      // ---- 2. CALCULATE TOTALS ----
      // subtotal is GROSS (before discounts). The previous math accumulated
      // subtotal net of line discounts AND subtracted discountTotal again —
      // every line discount was taken twice, undercharging the customer and
      // understating revenue (the journal still balanced, so it hid).
      let subtotal = 0
      let totalCost = 0
      let lineDiscountTotal = 0
      for (const line of input.lines) {
        const gross = line.unitPrice * line.quantity
        const disc = line.discountAmount || 0
        subtotal += gross
        lineDiscountTotal += disc
        totalCost += (line.costAmount || 0) * line.quantity
      }
      // input.discountTotal is the caller's TOTAL discount (incl. line
      // discounts); anything above the line sum is an order-level discount.
      const orderDiscount = input.discountTotal && input.discountTotal > lineDiscountTotal
        ? input.discountTotal - lineDiscountTotal
        : 0
      let discountTotal = lineDiscountTotal + orderDiscount
      const taxTotal = input.taxTotal || 0

      // ---- 2b. COUPON REDEMPTION (SA-83) ----
      // Validated against the live coupon + promotion INSIDE the sale
      // transaction (same rules as promotions.validateCoupon: status,
      // validity window, usage limits, promotion window/minimum/maximum).
      // A valid coupon's discount joins discountTotal, its redemption is
      // counted (usage_count on coupon + promotion), and the ledger row
      // lands in commerce_sale_discounts below. An invalid coupon aborts
      // the sale — never a silent no-discount completion.
      let couponDiscount = 0
      let couponId: string | null = null
      let couponPromotionId: string | null = null
      if (input.couponCode && String(input.couponCode).trim()) {
        const code = String(input.couponCode).trim()
        const { rows: cRows } = await client.query(`
          SELECT c.id, c.promotion_id, c.usage_limit, c.usage_count, c.status, c.valid_from, c.valid_to,
                 p.promotion_type, p.value, p.minimum_subtotal, p.maximum_discount,
                 p.active AS p_active, p.start_at, p.end_at,
                 p.usage_limit AS p_usage_limit, p.usage_count AS p_usage_count
            FROM public.commerce_coupons c
            LEFT JOIN public.commerce_promotions p ON p.id = c.promotion_id
           WHERE c.tenant_id = $1 AND UPPER(c.code) = UPPER($2)
           LIMIT 1
        `, [tenant, code])
        if (cRows.length === 0) throw new Error(`Coupon ${code} not found — sale not completed`)
        const c = cRows[0]
        const now = Date.now()
        const fail = (why: string) => { throw new Error(`Coupon ${code}: ${why} — sale not completed`) }
        if (c.status !== "active") fail("coupon is no longer active")
        if (c.valid_from && new Date(c.valid_from).getTime() > now) fail("coupon is not yet valid")
        if (c.valid_to && new Date(c.valid_to).getTime() < now) fail("coupon has expired")
        if (c.usage_limit != null && Number(c.usage_count || 0) >= Number(c.usage_limit)) fail("coupon usage limit reached")
        if (!c.promotion_id) fail("coupon has no promotion attached, so no discount can be computed")
        if (!c.p_active) fail("promotion is no longer active")
        if (c.start_at && new Date(c.start_at).getTime() > now) fail("promotion has not started yet")
        if (c.end_at && new Date(c.end_at).getTime() < now) fail("promotion has ended")
        if (c.p_usage_limit != null && Number(c.p_usage_count || 0) >= Number(c.p_usage_limit)) fail("promotion usage limit reached")
        // Scope (Sunny 2026-10-13): when the promotion carries targets,
        // the discount basis is the ELIGIBLE lines only (products named
        // directly + products under targeted taxonomy nodes) and the
        // minimum is checked against that basis. Cart-wide promotions
        // (no targets) keep the whole-subtotal basis. Math is the shared
        // computePromotionDiscount — the same function the SA-83
        // pre-check runs, so the quoted and charged discounts agree.
        const promoTargets = await loadPromotionTargets(client, tenant, c.promotion_id)
        const cartLines = input.lines.map((l) => ({ catalogItemId: l.catalogItemId ?? null, quantity: l.quantity, unitPrice: l.unitPrice }))
        const eligibleLines = await resolveEligibleLines(client, tenant, promoTargets, cartLines)
        const eligibleSubtotal = eligibleLines.reduce((s, l) => s + l.unitPrice * l.quantity, 0)
        if (c.minimum_subtotal != null && Number(c.minimum_subtotal) > 0 && eligibleSubtotal < Number(c.minimum_subtotal)) {
          fail(`requires a $${Number(c.minimum_subtotal).toFixed(2)} minimum subtotal`)
        }
        const ptype = String(c.promotion_type || "").toLowerCase()
        if (ptype === "bogo") {
          fail("buy-one-get-one coupons are not redeemable at the register")
        }
        couponDiscount = computePromotionDiscount(
          {
            promotionType: String(c.promotion_type || ""),
            value: c.value != null ? Number(c.value) : null,
            maximumDiscount: c.maximum_discount != null ? Number(c.maximum_discount) : null,
          },
          eligibleSubtotal,
          eligibleLines,
        )
        if (!(couponDiscount > 0)) fail("no discount could be computed for this coupon")
        couponId = c.id
        couponPromotionId = c.promotion_id
        discountTotal += couponDiscount
        await client.query(`UPDATE public.commerce_coupons SET usage_count = usage_count + 1 WHERE id = $1`, [couponId])
        if (couponPromotionId) {
          await client.query(`UPDATE public.commerce_promotions SET usage_count = usage_count + 1 WHERE id = $1`, [couponPromotionId])
        }
      }

      // ---- 2c. AUTOMATIC PROMOTIONS ----
      // No code claimed: the single best active automatic promotion
      // applies on its own — same scope resolution, minimum, and cap
      // rules as a coded redemption. Usage is counted on the promotion
      // and the ledger row lands in commerce_sale_discounts below.
      let autoPromotionId: string | null = null
      let autoPromotionName: string | null = null
      if (!couponId) {
        const { rows: autoRows } = await client.query(`
          SELECT id, name, promotion_type, value, maximum_discount, minimum_subtotal
            FROM public.commerce_promotions
           WHERE tenant_id = $1 AND active = true AND is_automatic = true
             AND (start_at IS NULL OR start_at <= now())
             AND (end_at IS NULL OR end_at >= now())
             AND (usage_limit IS NULL OR usage_count < usage_limit)
           ORDER BY created_at ASC
        `, [tenant])
        if (autoRows.length > 0) {
          const cartLines = input.lines.map((l) => ({ catalogItemId: l.catalogItemId ?? null, quantity: l.quantity, unitPrice: l.unitPrice }))
          let best = 0
          for (const ar of autoRows) {
            const targets = await loadPromotionTargets(client, tenant, ar.id)
            const eligible = await resolveEligibleLines(client, tenant, targets, cartLines)
            const basis = eligible.reduce((s, l) => s + l.unitPrice * l.quantity, 0)
            if (ar.minimum_subtotal != null && Number(ar.minimum_subtotal) > 0 && basis < Number(ar.minimum_subtotal)) continue
            const d = computePromotionDiscount(
              {
                promotionType: String(ar.promotion_type || ""),
                value: ar.value != null ? Number(ar.value) : null,
                maximumDiscount: ar.maximum_discount != null ? Number(ar.maximum_discount) : null,
              },
              basis,
              eligible,
            )
            if (d > best) {
              best = d
              autoPromotionId = String(ar.id)
              autoPromotionName = ar.name ? String(ar.name) : null
            }
          }
          if (autoPromotionId && best > 0) {
            couponDiscount = best
            discountTotal += couponDiscount
            await client.query(`UPDATE public.commerce_promotions SET usage_count = usage_count + 1 WHERE id = $1`, [autoPromotionId])
          }
        }
      }

      const total = subtotal - discountTotal + taxTotal
      const paidTotal = input.payments.reduce((sum, p) => sum + p.amount, 0)
      const changeDue = Math.max(0, paidTotal - total)

      const saleNumber = `POS-${Date.now().toString().slice(-10)}`
      const receiptNumber = `R-${Date.now().toString().slice(-10)}`

      // ---- 3. INSERT commerce_sales ----
      const { rows: saleRows } = await client.query(`
        INSERT INTO public.commerce_sales
          (tenant_id, sale_number, register_session_id, customer_id, dependent_id, appointment_id,
           source, status, currency, subtotal, discount_total, tax_total, total, paid_total, change_due,
           sale_at, completed_at, created_by, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, 'pos', 'completed', 'USD', $7, $8, $9, $10, $11, $12, now(), now(), $13, $14)
        RETURNING id
      `, [
        tenant, saleNumber, input.registerSessionId,
        input.customerId || null, input.petId || null, input.appointmentId || null,
        subtotal, discountTotal, taxTotal, total, paidTotal, changeDue,
        input.createdBy || null,
        JSON.stringify({ notes: input.notes || "", staffId: input.staffId || null, depositAmount: input.depositAmount || 0, ageVerification: input.ageVerification || null }),
      ])
      const saleId = saleRows[0].id

      // ---- 4. INSERT commerce_sale_lines ----
      for (let i = 0; i < input.lines.length; i++) {
        const line = input.lines[i]
        const gross = line.unitPrice * line.quantity
        const disc = line.discountAmount || 0
        const lineTotal = gross - disc
        await client.query(`
          INSERT INTO public.commerce_sale_lines
            (sale_id, line_no, catalog_item_id, sku_id, service_id, description, quantity,
             unit_price, gross_amount, discount_amount, taxable_amount, tax_amount, line_total, cost_amount)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        `, [
          saleId, i + 1,
          line.itemType === "product" ? line.catalogItemId : null,
          line.skuId || null,
          line.itemType === "service" ? line.serviceId : null,
          line.description, line.quantity, line.unitPrice,
          gross, disc, lineTotal, 0, lineTotal,
          (line.costAmount || 0) * line.quantity,
        ])

        // For subscription items, create the subscription record
        if (line.itemType === "subscription" && line.subscriptionPlanId) {
          const subNumber = `SUB-${Date.now().toString().slice(-10)}-${i}`
          await client.query(`
            INSERT INTO public.commerce_subscriptions
              (tenant_id, subscription_number, plan_id, customer_id, dependent_id, status,
               billing_interval, interval_count, price, currency, start_date,
               current_period_start, current_period_end, next_billing_date)
            SELECT $1, $2, $3, $4, $5, 'active', billing_interval, interval_count, price, 'USD',
                   CURRENT_DATE, CURRENT_DATE,
                   CASE WHEN billing_interval = 'month' THEN CURRENT_DATE + (interval_count || ' month')::interval
                        WHEN billing_interval = 'year' THEN CURRENT_DATE + (interval_count || ' year')::interval
                        ELSE CURRENT_DATE + '1 month'::interval END,
                   CASE WHEN billing_interval = 'month' THEN CURRENT_DATE + (interval_count || ' month')::interval
                        WHEN billing_interval = 'year' THEN CURRENT_DATE + (interval_count || ' year')::interval
                        ELSE CURRENT_DATE + '1 month'::interval END
            FROM public.commerce_subscription_plans WHERE id = $3
          `, [tenant, subNumber, line.subscriptionPlanId, input.customerId || null, input.petId || null])
        }
      }

      // ---- 5. INSERT commerce_sale_taxes + commerce_sale_discounts ----
      // Per-jurisdiction rows from the tenant's OWN acct_tax_rules (the same
      // rules the register reads to price tax — settings are per-tenant,
      // never a global constant). The old body wrote ONE row with
      // jurisdiction 'local' and rate 0, which made the tax ledger useless:
      // no rate, no jurisdiction split, nothing to file a return from.
      // Amounts are allocated across rules by each rule's taxable base
      // (goods-only classifications ride the product lines; everything else
      // rides the whole net base) and forced to sum EXACTLY to taxTotal —
      // the rounding delta lands on the largest row. No configured rules →
      // one row carrying the sale's effective rate (still truthful).
      if (taxTotal > 0) {
        const round2 = (n: number) => Math.round(n * 100) / 100
        const netBase = Math.max(0, subtotal - discountTotal)
        const productBase = round2(input.lines
          .filter(l => l.itemType === "product")
          .reduce((s, l) => s + (l.unitPrice * l.quantity - (l.discountAmount || 0)), 0))
        const { rows: taxRules } = await client.query(`
          SELECT jurisdiction, rate::float8 AS rate, classification
          FROM public.acct_tax_rules
          WHERE tenant_id = $1 AND is_active = true AND auto_calc = true AND rate > 0
          ORDER BY rate DESC
        `, [tenant]).catch(() => ({ rows: [] as { jurisdiction: string; rate: number; classification: string | null }[] }))
        type TaxRow = { jurisdiction: string; rate: number; base: number; amount: number }
        let taxRows: TaxRow[] = []
        if (taxRules.length > 0) {
          taxRows = taxRules.map(r => {
            const cls = String(r.classification || "")
            const goodsOnly = /GOODS|RETAIL|PRODUCT/i.test(cls)
            const base = goodsOnly ? productBase : netBase
            // acct_tax_rules.rate is stored as a PERCENT (7.000 = 7%).
            // The row records the rule's own rate value; the amount math
            // uses the fraction.
            const ratePct = Number(r.rate) || 0
            return { jurisdiction: String(r.jurisdiction || "tax"), rate: ratePct, base, amount: round2(base * ratePct / 100) }
          }).filter(r => r.base > 0)
          const allocated = round2(taxRows.reduce((s, r) => s + r.amount, 0))
          if (taxRows.length > 0 && allocated > 0) {
            // Scale to the sale's actual tax (the register's taxTotal is the
            // amount collected) and pin the rounding delta on the largest row.
            const scale = taxTotal / allocated
            taxRows = taxRows.map(r => ({ ...r, amount: round2(r.amount * scale) }))
            const drift = round2(taxTotal - taxRows.reduce((s, r) => s + r.amount, 0))
            if (drift !== 0) {
              let largest = 0
              taxRows.forEach((r, i) => { if (r.amount > taxRows[largest].amount) largest = i })
              taxRows[largest].amount = round2(taxRows[largest].amount + drift)
            }
          }
        }
        if (taxRows.length === 0) {
          // Effective rate as a percent, same convention as acct_tax_rules.
          taxRows = [{ jurisdiction: "local", rate: netBase > 0 ? Math.round((taxTotal / netBase) * 100 * 10000) / 10000 : 0, base: netBase, amount: taxTotal }]
        }
        for (const tr of taxRows) {
          if (tr.amount <= 0) continue
          await client.query(
            `INSERT INTO public.commerce_sale_taxes (sale_id, jurisdiction, rate, taxable_amount, tax_amount) VALUES ($1, $2, $3, $4, $5)`,
            [saleId, tr.jurisdiction, tr.rate, tr.base, tr.amount],
          )
        }
      }
      if (discountTotal - couponDiscount > 0) {
        await client.query(`INSERT INTO public.commerce_sale_discounts (sale_id, description, amount) VALUES ($1, 'POS discount', $2)`, [saleId, discountTotal - couponDiscount])
      }
      if (couponDiscount > 0 && couponId) {
        await client.query(
          `INSERT INTO public.commerce_sale_discounts (sale_id, promotion_id, coupon_id, description, amount) VALUES ($1, $2, $3, $4, $5)`,
          [saleId, couponPromotionId, couponId, `Coupon ${String(input.couponCode).trim().toUpperCase()}`, couponDiscount],
        )
      }
      if (couponDiscount > 0 && !couponId && autoPromotionId) {
        await client.query(
          `INSERT INTO public.commerce_sale_discounts (sale_id, promotion_id, description, amount) VALUES ($1, $2, $3, $4)`,
          [saleId, autoPromotionId, `Automatic promotion ${autoPromotionName || ""}`.trim(), couponDiscount],
        )
      }

      // ---- 6. INSERT commerce_payments (with gift card + check handling) ----
      let hasCashOrCheck = false
      let cashTendered = 0
      let nonCashTendered = 0
      for (const pmt of input.payments) {
        const payNumber = `PAY-${Date.now().toString().slice(-10)}-${Math.random().toString(36).slice(2, 5)}`

        // Get the payment method to check if cash/check (for drawer trigger)
        const { rows: pmRows } = await client.query(`SELECT method_type, code FROM public.commerce_payment_methods WHERE id = $1`, [pmt.paymentMethodId])
        const methodType = pmRows[0]?.method_type || ""
        const methodCode = pmRows[0]?.code || ""
        if (methodType === "cash" || methodType === "check") hasCashOrCheck = true
        if (methodType === "cash") cashTendered += Number(pmt.amount) || 0
        else nonCashTendered += Number(pmt.amount) || 0

        await client.query(`
          INSERT INTO public.commerce_payments
            (tenant_id, payment_number, sale_id, customer_id, payment_method_id, amount, tip_amount,
             currency, status, processor_transaction_id, authorization_code, staff_id, external_reference)
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'USD', 'succeeded', $8, $9, $10, $11)
        `, [
          tenant, payNumber, saleId, input.customerId || null,
          pmt.paymentMethodId, pmt.amount, pmt.tipAmount || 0,
          pmt.processorTransactionId || null, pmt.authorizationCode || null,
          input.staffId || null,
          pmt.checkReference || pmt.giftCardNumber || null,
        ])

        // ---- GIFT CARD LEDGER ----
        // Deduct balance + log the transaction with balance_before/after.
        // The card must exist, be redeemable (active / partially_redeemed),
        // and cover the tender — the previous code silently clamped an
        // over-tender to a zero balance and ignored dead cards entirely,
        // recording a payment no instrument backed. Any failure aborts
        // the whole sale (transaction rollback).
        if (methodCode === "STORE_CREDIT" || pmt.giftCardNumber) {
          if (!pmt.giftCardNumber) {
            throw new Error("Store credit / gift card tender requires a card number — sale not completed")
          }
          const { rows: gcRows } = await client.query(`SELECT id, balance, status FROM public.commerce_gift_cards WHERE card_number = $1 AND tenant_id = $2 FOR UPDATE`, [pmt.giftCardNumber, tenant])
          if (gcRows.length === 0) {
            throw new Error(`Gift card ${pmt.giftCardNumber} not found — sale not completed`)
          }
          const gcId = gcRows[0].id
          const gcStatus = String(gcRows[0].status || "")
          if (gcStatus !== "active" && gcStatus !== "partially_redeemed") {
            throw new Error(`Gift card ${pmt.giftCardNumber} is ${gcStatus} and cannot be redeemed — sale not completed`)
          }
          const balanceBefore = Number(gcRows[0].balance) || 0
          if (pmt.amount > balanceBefore) {
            throw new Error(`Gift card ${pmt.giftCardNumber} balance $${balanceBefore.toFixed(2)} is less than the $${Number(pmt.amount).toFixed(2)} tendered — sale not completed`)
          }
          const balanceAfter = Math.round((balanceBefore - pmt.amount) * 100) / 100
          await client.query(
            `UPDATE public.commerce_gift_cards
                SET balance = $2, last_used_at = now(),
                    status = CASE WHEN $2 = 0 THEN 'redeemed' ELSE 'partially_redeemed' END
              WHERE id = $1`,
            [gcId, balanceAfter],
          )
          await client.query(`
            INSERT INTO public.commerce_gift_card_transactions
              (gift_card_id, sale_id, transaction_type, amount, balance_before, balance_after, created_by)
            VALUES ($1, $2, 'redemption', $3, $4, $5, $6)
          `, [gcId, saleId, pmt.amount, balanceBefore, balanceAfter, input.createdBy || null])
        }
      }

      // ---- 6b. DRAWER EXPECTED CASH ----
      // Cash sales move the drawer's expected cash; until now only manual
      // cash in/out movements did, so every close counted the day's cash
      // sales as a giant positive variance. Net cash kept = the cash
      // tendered up to what the sale still needed after other tenders
      // (change given back out is excluded, as is any tip overage —
      // counted at close like everywhere else).
      if (input.registerSessionId && cashTendered > 0) {
        const netCashKept = Math.min(cashTendered, Math.max(0, total - nonCashTendered))
        if (netCashKept > 0) {
          await client.query(
            `UPDATE public.commerce_register_sessions SET expected_cash = expected_cash + $2 WHERE id = $1 AND status = 'open'`,
            [input.registerSessionId, netCashKept],
          )
        }
      }

      // ---- 7. INSERT commerce_receipts ----
      // document_uri must RESOLVE: it points at the receipt route, which
      // renders this sale's receipt PDF from the stored sale/lines/payments
      // (and serves the email path). The old value `pos-receipt:<number>`
      // was a stub that resolved nowhere — any surface following the URI
      // (receipt history, reprint, customer copy) hit a dead string.
      // The ESC/POS raw text itself is returned to the client directly for
      // the thermal printer (never stored — binary escape codes).
      const receiptRaw = generateEscPosReceipt({
        saleNumber, receiptNumber,
        lines: input.lines.map(l => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice })),
        subtotal, discountTotal, taxTotal, total, paidTotal, changeDue,
        payments: input.payments.map(p => ({ amount: p.amount })),
        hasCashOrCheck,
      })
      await client.query(`
        INSERT INTO public.commerce_receipts (tenant_id, sale_id, receipt_number, receipt_type, delivery_method, document_uri)
        VALUES ($1, $2, $3, 'sale', 'print', $4)
      `, [tenant, saleId, receiptNumber, `/api/admin/pos/receipt?saleId=${saleId}`])

      // ---- 8. DEPOSIT (if applicable) ----
      // commerce_deposits has NO source_type/source_id/reference columns —
      // the live schema (verified) uses deposit_number + deposit_type +
      // status from fixed vocabularies: deposit_type ∈ booking|security|
      // package_prepay|no_show_hold|other and status ∈ held|applied|
      // released|forfeited|refunded. A register deposit is 'other'/'held',
      // numbered DEP-<base36> like every other deposit path, with the sale
      // linkage carried in notes JSON (the booking-deposit convention).
      // BOOKING DEPOSIT APPLICATION — when a booking is attached, the
      // deposit was collected earlier and is HELD (the GL 2300 liability,
      // plus a 'held' commerce_deposits row keyed by customer + amount).
      // Applying it flips that row to 'applied'; the GL movement posts as
      // the Dr 2300 line in the journal entry below. Best-effort
      // bookkeeping only — a miss here must never fail the sale.
      if (input.depositAmount && input.depositAmount > 0 && input.customerId && input.appointmentId) {
        try {
          await client.query(`
            UPDATE public.commerce_deposits
            SET status = 'applied', updated_at = now()
            WHERE id = (
              SELECT id FROM public.commerce_deposits
              WHERE tenant_id = $1 AND customer_id = $2 AND status = 'held' AND amount = $3
              ORDER BY created_at ASC LIMIT 1
            )
          `, [tenant, input.customerId, input.depositAmount])
        } catch (depErr) {
          console.warn(`[pos] sale ${saleNumber}: deposit application bookkeeping failed:`, depErr instanceof Error ? depErr.message : depErr)
        }
      }

      if (input.depositAmount && input.depositAmount > 0 && input.customerId && !input.appointmentId) {
        const depNum = `DEP-${Date.now().toString(36).toUpperCase()}`
        const depCreatedBy = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.createdBy || "")
          ? input.createdBy
          : null
        // Method = how the money was actually tendered: the largest
        // payment's method_type (cash/card/…), resolved like step 6 does.
        let depMethod = "other"
        const primaryPmt = [...input.payments].sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0))[0]
        if (primaryPmt?.paymentMethodId) {
          const { rows: pmRows } = await client.query(`SELECT method_type FROM public.commerce_payment_methods WHERE id = $1`, [primaryPmt.paymentMethodId])
          depMethod = pmRows[0]?.method_type || "other"
        }
        await client.query(`
          INSERT INTO public.commerce_deposits
            (id, tenant_id, deposit_number, customer_id, amount, currency,
             collected_at, method, status, deposit_type, notes, created_by)
          VALUES (gen_random_uuid(), $1, $2, $3, $4, 'USD', now(), $5, 'held', 'other', $6, $7)
        `, [tenant, depNum, input.customerId, input.depositAmount, depMethod,
            JSON.stringify({ saleId, saleNumber, source: "pos_sale" }), depCreatedBy])
      }

      // ---- 8b. INVENTORY DECREMENT + OVERSELL FLAGS ----
      // The register reads stock from erp_inventory_movements. The schema's
      // CHECK constraint requires quantity > 0 — direction is encoded in
      // movement_type, so sales are written as POSITIVE qty with
      // movement_type='sale', and every stock read subtracts the outbound
      // types ('sale','damage','scrap','ship') via a CASE expression.
      // Service/subscription lines have no inventory — skipped.
      // NEVER fail the sale for inventory: log and continue.
      //
      // Zero-stock policy (Sunny, 2026-10-13): the register WARNS but
      // never blocks. A line that sells past the proper stock at the
      // sale warehouse still completes — and leaves one durable
      // pos_stock_alerts row, which the admin's daily reporting reads.
      const oversoldLines: PosSaleResult["oversoldLines"] = []
      try {
        const { rows: whRows } = await client.query(`
          INSERT INTO public.erp_warehouses (tenant_id, code, name, warehouse_type, is_active)
          VALUES ($1, 'MAIN', 'Main Warehouse', 'warehouse', true)
          ON CONFLICT (tenant_id, code) DO UPDATE SET is_active = true
          RETURNING id
        `, [tenant])
        const warehouseId = whRows[0].id
        for (const [lineIdx, line] of input.lines.entries()) {
          if (line.itemType !== "product") continue
          try {
            let skuId: string | null = line.skuId || null
            if (!skuId && line.catalogItemId) {
              const { rows: ciRows } = await client.query(
                `SELECT sku_id FROM public.commerce_catalog_items WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
                [line.catalogItemId, tenant],
              )
              skuId = ciRows[0]?.sku_id || null
            }
            if (!skuId) {
              console.warn(`[pos] sale ${saleNumber}: no sku_id for product line "${line.description}" — skipping inventory decrement`)
              continue
            }
            const qty = Math.max(1, Math.round(Number(line.quantity) || 1))
            // Proper stock at the sale warehouse BEFORE this line lands
            // (own-transaction reads see earlier lines of this sale, so
            // duplicate lines of one SKU deplete sequentially).
            const { rows: availRows } = await client.query(
              `SELECT COALESCE(SUM(on_hand), 0)::float8 AS qty
                 FROM public.erp_stock_levels
                WHERE tenant_id = $1 AND sku_id = $2 AND warehouse_id = $3`,
              [tenant, skuId, warehouseId],
            )
            const available = Number(availRows[0]?.qty ?? 0) || 0
            // performed_by is a uuid column — only pass createdBy when it
            // actually looks like a uuid, otherwise the INSERT fails.
            const performedBy = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.createdBy || "")
              ? input.createdBy
              : null
            await client.query(`
              INSERT INTO public.erp_inventory_movements
                (tenant_id, movement_type, sku_id, warehouse_id, quantity, unit_cost,
                 source_type, source_id, reason, performed_by, occurred_at)
              VALUES ($1, 'sale', $2, $3, $4, $5, 'pos_sale', $6, $7, $8, now())
            `, [
              tenant, skuId, warehouseId, qty,
              line.costAmount || 0, saleId,
              `POS sale ${saleNumber} — ${line.description} x${qty}`,
              performedBy,
            ])
            // Keep the per-location projection cell current (best-effort).
            await client.query(
              `SELECT public.erp_rebuild_stock_balances($1::uuid, $2::uuid, $3::uuid)`,
              [tenant, skuId, warehouseId],
            ).catch(() => null)
            if (qty > available) {
              const quantityShort = qty - available
              const { rows: skuRows } = await client.query(
                `SELECT sku FROM public.erp_product_skus WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
                [skuId, tenant],
              ).catch(() => ({ rows: [] as { sku: string }[] }))
              const { rows: slRows } = await client.query(
                `SELECT id FROM public.commerce_sale_lines WHERE sale_id = $1 AND line_no = $2 LIMIT 1`,
                [saleId, lineIdx + 1],
              ).catch(() => ({ rows: [] as { id: string }[] }))
              await client.query(`
                INSERT INTO public.pos_stock_alerts
                  (tenant_id, sale_id, sale_line_id, sku_id, warehouse_id,
                   product_name, sku_code, quantity_sold, quantity_available, quantity_short)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
              `, [
                tenant, saleId, slRows[0]?.id ?? null, skuId, warehouseId,
                line.description, skuRows[0]?.sku ?? null,
                qty, available, quantityShort,
              ])
              oversoldLines.push({
                productName: line.description,
                skuCode: skuRows[0]?.sku ?? null,
                quantitySold: qty,
                quantityAvailable: available,
                quantityShort,
              })
            }
          } catch (invErr) {
            console.warn(`[pos] sale ${saleNumber}: inventory decrement failed for "${line.description}":`, invErr instanceof Error ? invErr.message : invErr)
          }
        }
      } catch (invErr) {
        console.warn(`[pos] sale ${saleNumber}: inventory decrement skipped:`, invErr instanceof Error ? invErr.message : invErr)
      }

      // ---- 8c. APPOINTMENT COMPLETION ----
      // Checking a booking out at the register completes the appointment:
      // its price is now fully settled (deposit applied + the amount
      // tendered here), so amount_paid becomes the booking total and
      // nothing remains outstanding.
      if (input.appointmentId) {
        await client.query(`
          UPDATE public.crm_appointments
          SET status = 'completed', completed_at = now(), updated_at = now(),
              amount_paid = total, outstanding_amount = 0
          WHERE id = $1 AND tenant_id = $2
        `, [input.appointmentId, tenant])
        // Commission accrual for the groomer (profile rate →
        // crm_commission_entries). Best-effort: a commission failure must
        // never abort a settled sale.
        try {
          await accrueCommissionsForAppointment(runnerFromClient(client), tenant, String(input.appointmentId), "pos_checkout")
        } catch (commErr) {
          console.warn(`[pos] sale ${saleNumber}: commission accrual failed:`, commErr instanceof Error ? commErr.message : commErr)
        }
      }

      // ---- 9. JOURNAL ENTRY (balanced) ----
      // The guardrail: Σ Debits − Σ Credits must == 0.
      // Debits: Cash/Checking/AR (the payment) + COGS + Discounts
      // Credits: Product/Service/Subscription Revenue + Sales Tax Payable + Inventory
      const journalEntryId = await postJournalEntry(client, tenant, saleId, saleNumber, {
        subtotal, discountTotal, taxTotal, total, totalCost,
        payments: input.payments,
        depositAmount: input.depositAmount || 0,
      })
      if (!journalEntryId) {
        // Journal didn't balance — abort the entire sale.
        throw new Error("JOURNAL_UNBALANCED: Σ Debits ≠ Σ Credits — sale aborted to protect GL integrity")
      }

      // ---- 10. IDEMPOTENCY CACHE (inside the transaction) ----
      const result: PosSaleResult = {
        saleId, saleNumber, receiptNumber,
        total, paidTotal, changeDue, receiptRaw, journalEntryId,
        oversoldLines,
      }
      const { receiptRaw: _rr, ...cacheableResult } = result
      await client.query(`
        INSERT INTO public.commerce_idempotency (tenant_id, idempotency_key, operation, request_hash, response_status, response_body, resource_type, resource_id, expires_at)
        VALUES ($1, $2, 'pos_sale', $3, 200, $4, 'sale', $5, now() + interval '24 hours')
      `, [tenant, input.idempotencyKey, JSON.stringify({ lines: input.lines.length, payments: input.payments.length }).slice(0, 500), JSON.stringify(cacheableResult), saleId])

      await client.query("COMMIT")

      return result
    } catch (err) {
      await client.query("ROLLBACK")
      throw err
    }
  })) ?? { error: "Database unavailable" }
}

// ============================================================================
// JOURNAL ENTRY — the balanced GL posting (the guardrail)
// ============================================================================

async function postJournalEntry(
  client: pg.Client,
  tenant: string,
  saleId: string,
  saleNumber: string,
  totals: {
    subtotal: number
    discountTotal: number
    taxTotal: number
    total: number
    totalCost: number
    payments: { paymentMethodId: string; amount: number; giftCardNumber?: string }[]
    depositAmount?: number
  },
): Promise<string | null> {
  // Get GL account IDs for the mapping
  const { rows: glAccounts } = await client.query(`
    SELECT id, code FROM public.acct_chart_of_accounts WHERE tenant_id = $1
  `, [tenant])
  const glByCode = new Map<string, string>(glAccounts.map((r: any): [string, string] => [String(r.code), String(r.id)]))

  // Get the entity + book (required FKs for journal_entries)
  const { rows: entities } = await client.query(`SELECT id FROM public.acct_entities WHERE tenant_id = $1 LIMIT 1`, [tenant])
  const entityId = entities[0]?.id
  if (!entityId) return null

  // Get or create a book
  let { rows: books } = await client.query(`SELECT id FROM public.acct_books WHERE tenant_id = $1 LIMIT 1`, [tenant])
  let bookId = books[0]?.id
  if (!bookId) {
    const { rows: newBook } = await client.query(`INSERT INTO public.acct_books (tenant_id, entity_id, code, name, book_type, accounting_basis, currency, is_primary, active) VALUES ($1, $2, 'MAIN', 'Main Book', 'general', 'accrual', 'USD', true, true) RETURNING id`, [tenant, entityId])
    bookId = newBook[0].id
  }

  // Get or create a period (requires a fiscal year first)
  let { rows: periods } = await client.query(`SELECT id FROM public.acct_periods WHERE tenant_id = $1 AND CURRENT_DATE BETWEEN start_date AND end_date LIMIT 1`, [tenant])
  let periodId = periods[0]?.id
  if (!periodId) {
    // Create fiscal year if missing
    let { rows: fy } = await client.query(`SELECT id FROM public.acct_fiscal_years WHERE tenant_id = $1 AND EXTRACT(YEAR FROM CURRENT_DATE) BETWEEN EXTRACT(YEAR FROM start_date) AND EXTRACT(YEAR FROM end_date) LIMIT 1`, [tenant])
    let fyId = fy[0]?.id
    if (!fyId) {
      const { rows: newFy } = await client.query(`
        INSERT INTO public.acct_fiscal_years (tenant_id, entity_id, fiscal_year, start_date, end_date, is_adjustment_year)
        VALUES ($1, $2, EXTRACT(YEAR FROM CURRENT_DATE)::int, date_trunc('year', CURRENT_DATE)::date, (date_trunc('year', CURRENT_DATE) + interval '1 year' - interval '1 day')::date, false)
        RETURNING id
      `, [tenant, entityId])
      fyId = newFy[0].id
    }
    const { rows: newPeriod } = await client.query(`
      INSERT INTO public.acct_periods (tenant_id, book_id, fiscal_year_id, period_no, name, start_date, end_date, status)
      VALUES ($1, $2, $3, EXTRACT(MONTH FROM CURRENT_DATE)::int, to_char(CURRENT_DATE, 'YYYY-MM'), date_trunc('month', CURRENT_DATE)::date, (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date, 'open')
      RETURNING id
    `, [tenant, bookId, fyId])
    periodId = newPeriod[0].id
  }

  // Build the journal lines
  // DEBITS:  Payment (cash/checking) + COGS + Discounts
  // CREDITS: Revenue + Sales Tax + Inventory
  type JournalLine = { accountId: string; debit: number; credit: number; memo: string }
  const lines: JournalLine[] = []
  let totalDebit = 0
  let totalCredit = 0

  // When a booking deposit is applied, the tender only has to settle
  // (total − deposit) — the deposit line below settles the rest. Every
  // method is capped at what's left of that target so a tip folded into
  // the tendered amount can't unbalance the entry.
  const depositApplied = totals.depositAmount || 0
  let tenderTarget: number | null = depositApplied > 0 ? Math.max(0, totals.total - depositApplied) : null

  // Debit: Payment method accounts (cash → Cash Drawer, card → Checking)
  // IMPORTANT: debit only the SALE TOTAL, not the tendered amount.
  // The change_due is a separate cash-out (the drawer gives back cash),
  // not part of the revenue entry. This keeps the journal balanced.
  for (const pmt of totals.payments) {
    const { rows: pmRows } = await client.query(`SELECT method_type FROM public.commerce_payment_methods WHERE id = $1`, [pmt.paymentMethodId])
    const mt = pmRows[0]?.method_type || "cash"
    // A gift-card tender does not bring cash in — it relieves the 2310
    // gift card liability. Booking it to checking (the old fall-through)
    // overstated the bank and left 2310 standing after redemption.
    const glCode = pmt.giftCardNumber ? "2310" : mt === "cash" ? "1000" : mt === "card" ? "1010" : mt === "check" ? "1000" : "1010"
    const acctId = glByCode.get(glCode) || glByCode.get("1000")
    if (acctId) {
      // Debit the payment amount, but if it's cash and there's change,
      // the net debit = min(amount, total) — the change goes back out.
      // total = subtotal - discountTotal + taxTotal, so this includes tax.
      const isCash = mt === "cash" || mt === "check"
      let debitAmount: number
      if (tenderTarget !== null) {
        debitAmount = Math.min(pmt.amount, tenderTarget)
        tenderTarget = Math.max(0, tenderTarget - debitAmount)
      } else {
        debitAmount = isCash ? Math.min(pmt.amount, totals.total) : pmt.amount
      }
      lines.push({ accountId: acctId, debit: debitAmount, credit: 0, memo: `Payment (${mt})` })
      totalDebit += debitAmount
    }
  }

  // Debit: Deposit applied — the booking deposit was collected earlier and
  // has been sitting in the 2300 customer-deposits liability. Applying it
  // to this sale relieves the liability against the revenue credited below
  // (Dr 2300 → Cr 4000). Without this line the entry is short by exactly
  // the deposit amount and the guardrail aborts the sale.
  if (depositApplied > 0 && glByCode.get("2300")) {
    lines.push({ accountId: glByCode.get("2300")!, debit: depositApplied, credit: 0, memo: "Booking deposit applied" })
    totalDebit += depositApplied
  }

  // Debit: COGS
  if (totals.totalCost > 0 && glByCode.get("5000")) {
    lines.push({ accountId: glByCode.get("5000")!, debit: totals.totalCost, credit: 0, memo: "COGS" })
    totalDebit += totals.totalCost
  }

  // Debit: Discounts
  if (totals.discountTotal > 0 && glByCode.get("4900")) {
    lines.push({ accountId: glByCode.get("4900")!, debit: totals.discountTotal, credit: 0, memo: "Sales discounts" })
    totalDebit += totals.discountTotal
  }

  // Credit: Revenue at GROSS subtotal — discounts are debited separately
  // to 4900 above, so net revenue = gross − discounts.
  const revenue = totals.subtotal
  if (revenue > 0 && glByCode.get("4000")) {
    lines.push({ accountId: glByCode.get("4000")!, debit: 0, credit: revenue, memo: "Product sales revenue" })
    totalCredit += revenue
  }

  // Credit: Sales Tax Payable
  if (totals.taxTotal > 0 && glByCode.get("2200")) {
    lines.push({ accountId: glByCode.get("2200")!, debit: 0, credit: totals.taxTotal, memo: "Sales tax payable" })
    totalCredit += totals.taxTotal
  }

  // Credit: Inventory (for COGS)
  if (totals.totalCost > 0 && glByCode.get("1400")) {
    lines.push({ accountId: glByCode.get("1400")!, debit: 0, credit: totals.totalCost, memo: "Inventory relieved" })
    totalCredit += totals.totalCost
  }

  // ---- THE GUARDRAIL: Σ Debits − Σ Credits must == 0 ----
  // Round to 2 decimal places to avoid floating-point drift
  const debitMinusCredit = Math.round((totalDebit - totalCredit) * 100) / 100
  if (debitMinusCredit !== 0) {
    console.error(`[POS JOURNAL GUARDRAIL] UNBALANCED: debits=${totalDebit} credits=${totalCredit} diff=${debitMinusCredit} — sale ${saleNumber} ABORTED`)
    return null
  }

  // Create a journal batch (required — batch_id is NOT NULL)
  const batchNo = `JB-${Date.now()}`
  const { rows: batchRows } = await client.query(`
    INSERT INTO public.acct_journal_batches (tenant_id, entity_id, book_id, batch_no, source, status, description, source_system)
    VALUES ($1, $2, $3, $4, 'integration', 'posted', 'POS sale batch', 'commerce')
    RETURNING id
  `, [tenant, entityId, bookId, batchNo])
  const batchId = batchRows[0].id

  // Insert the journal entry (entry_no is an identity/generated column)
  const { rows: jeRows } = await client.query(`
    INSERT INTO public.acct_journal_entries (tenant_id, entity_id, book_id, batch_id, period_id, entry_date, posting_date, source, source_id, reference, memo, currency, total_debit, total_credit, status)
    VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, CURRENT_DATE, 'system', $6, $7, $8, 'USD', $9, $10, 'posted')
    RETURNING id
  `, [tenant, entityId, bookId, batchId, periodId, saleId, saleNumber, `POS sale ${saleNumber}`, totalDebit, totalCredit])
  const journalEntryId = jeRows[0].id

  // Insert the journal lines
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    await client.query(`
      INSERT INTO public.acct_journal_lines (tenant_id, entity_id, journal_entry_id, line_no, account_id, description, debit, credit)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [tenant, entityId, journalEntryId, i + 1, line.accountId, line.memo, line.debit, line.credit])
  }

  // Link the journal entry back to the sale
  await client.query(`UPDATE public.commerce_sales SET metadata = metadata || $2 WHERE id = $1`, [saleId, JSON.stringify({ journalEntryId })])

  return journalEntryId
}

// ============================================================================
// ESC/POS RECEIPT GENERATOR
// ============================================================================

function generateEscPosReceipt(data: {
  saleNumber: string
  receiptNumber: string
  lines: { description: string; quantity: number; unitPrice: number }[]
  subtotal: number
  discountTotal: number
  taxTotal: number
  total: number
  paidTotal: number
  changeDue: number
  payments: { amount: number }[]
  hasCashOrCheck: boolean
}): string {
  const ESC = "\x1b"
  const INIT = ESC + "@"
  const BOLD_ON = ESC + "E\x01"
  const BOLD_OFF = ESC + "E\x00"
  const CENTER = ESC + "a\x01"
  const LEFT = ESC + "a\x00"
  const RIGHT = ESC + "a\x02"
  const CUT = "\x1d\x56\x00"
  // Cash drawer kick command (universal — opens RJ12-connected drawer)
  const DRAWER_KICK = "\x1b\x70\x00\x19\xfa"

  let raw = ""
  raw += INIT
  raw += CENTER + BOLD_ON + "All About Pawz\n" + BOLD_OFF
  raw += "699 Waring Rd\nMemphis, TN\n"
  raw += "901-722-1114\n"
  raw += LEFT + `${"-".repeat(42)}\n`
  raw += `Receipt: ${data.receiptNumber}\n`
  raw += `Sale:   ${data.saleNumber}\n`
  raw += `Date:   ${new Date().toLocaleString()}\n`
  raw += `${"-".repeat(42)}\n`

  for (const line of data.lines) {
    const lineTotal = line.unitPrice * line.quantity
    raw += `${line.quantity}x ${line.description.slice(0, 28).padEnd(28)}`
    raw += `$${lineTotal.toFixed(2).padStart(10)}\n`
  }

  raw += `${"-".repeat(42)}\n`
  raw += LEFT + `Subtotal${`$${data.subtotal.toFixed(2)}`.padStart(34)}\n`
  if (data.discountTotal > 0) {
    raw += `Discounts${`-$${data.discountTotal.toFixed(2)}`.padStart(33)}\n`
  }
  raw += `Tax${`$${data.taxTotal.toFixed(2)}`.padStart(39)}\n`
  raw += BOLD_ON + `TOTAL${`$${data.total.toFixed(2)}`.padStart(37)}` + BOLD_OFF + "\n"
  raw += `${"-".repeat(42)}\n`
  raw += `Tendered${`$${data.paidTotal.toFixed(2)}`.padStart(34)}\n`
  raw += `Change${`$${data.changeDue.toFixed(2)}`.padStart(36)}\n`
  raw += `${"-".repeat(42)}\n`
  raw += CENTER + "Thank you for shopping with us!\n"
  raw += "www.aapawz.com\n"
  raw += LEFT + `${"-".repeat(42)}\n`

  // Cash drawer kick — only for cash/check payments
  if (data.hasCashOrCheck) {
    raw += DRAWER_KICK
  }

  raw += CUT
  return raw
}

// ============================================================================
// RETURNS / REFUNDS — never UPDATE/DELETE, always create NEW negative rows
// ============================================================================

export type RefundInput = {
  originalSaleId: string
  refundMethod: string  // 'cash' | 'card' | 'check' | 'gift_card' | 'store_credit'
  amount: number
  reason: string
  lines?: { saleLineId: string; quantity: number; restock: boolean; amount?: number }[]
  createdBy?: string
  /** The business whose sale is being refunded (session-resolved by the
   *  POS route); omitted = the deployment's home tenant. The original
   *  sale is looked up under this tenant, so another business's sale
   *  simply isn't found. */
  tenantId?: string
}

export async function processRefund(input: RefundInput): Promise<{ refundId: string; refundNumber: string; reversalJournalEntryId: string | null } | { error: string }> {
  return (await withPg(async (client) => {
    const tenant = input.tenantId ?? DEFAULT_TENANT()

    // Load the original sale
    const { rows: saleRows } = await client.query(`
      SELECT id, sale_number, subtotal, discount_total, tax_total, total, customer_id, register_session_id
      FROM public.commerce_sales WHERE id = $1 AND tenant_id = $2
    `, [input.originalSaleId, tenant])
    if (saleRows.length === 0) return { error: "Original sale not found" }
    const original = saleRows[0]

    // Full-refund restock: when the caller refunds the ENTIRE sale without
    // naming lines (the register's refund control), every original line
    // comes back into stock — build the refund lines from the sale itself
    // so the return is recorded line-by-line like an explicit return.
    let refundLines = input.lines
    if (!refundLines?.length && Number(original.total) > 0 && Math.abs(input.amount - Number(original.total)) < 0.005) {
      const { rows: origLines } = await client.query(`
        SELECT id, quantity, line_total FROM public.commerce_sale_lines WHERE sale_id = $1 ORDER BY line_no
      `, [input.originalSaleId])
      if (origLines.length > 0) {
        refundLines = origLines.map((l: any) => ({
          saleLineId: l.id, quantity: Number(l.quantity) || 1, restock: true,
          amount: Number(l.line_total) || 0,
        }))
      }
    }

    // Check we haven't already refunded more than the original
    const { rows: existingRefunds } = await client.query(`
      SELECT COALESCE(SUM(amount), 0) AS refunded FROM public.commerce_refunds WHERE sale_id = $1 AND status = 'completed'
    `, [input.originalSaleId])
    const alreadyRefunded = Number(existingRefunds[0].refunded) || 0
    if (alreadyRefunded + input.amount > Number(original.total)) {
      return { error: `Refund exceeds original sale total (already refunded $${alreadyRefunded.toFixed(2)})` }
    }

    await client.query("BEGIN")
    try {
      const refundNumber = `REF-${Date.now().toString().slice(-10)}`

      // 1. Insert commerce_refunds (the reversal record)
      const { rows: refundRows } = await client.query(`
        INSERT INTO public.commerce_refunds
          (tenant_id, refund_number, sale_id, amount, reason, status, refund_method, processed_at, created_by)
        VALUES ($1, $2, $3, $4, $5, 'completed', $6, now(), $7)
        RETURNING id
      `, [tenant, refundNumber, input.originalSaleId, input.amount, input.reason, input.refundMethod, input.createdBy || null])
      const refundId = refundRows[0].id

      // 2. Insert refund lines (with restock flag)
      if (refundLines) {
        for (const rl of refundLines) {
          await client.query(`
            INSERT INTO public.commerce_refund_lines (refund_id, sale_line_id, quantity, amount, restock, disposition)
            VALUES ($1, $2, $3, $4, $5, 'returned')
          `, [refundId, rl.saleLineId, rl.quantity, rl.amount ?? input.amount / refundLines.length, rl.restock])
        }
      }

      // 3. Create a NEW commerce_sales row with NEGATIVE total (the reversal).
      // Subtotal/tax scale with the refunded share — a partial refund used
      // to reverse the FULL subtotal and tax against a partial total,
      // corrupting every report that sums the reversal rows.
      const refundRatio = Number(original.total) > 0 ? input.amount / Number(original.total) : 0
      const round2 = (n: number) => Math.round(n * 100) / 100
      const reversalSaleNumber = `POS-REV-${Date.now().toString().slice(-10)}`
      const { rows: reversalRows } = await client.query(`
        INSERT INTO public.commerce_sales
          (tenant_id, sale_number, customer_id, source, status, currency,
           subtotal, discount_total, tax_total, total, paid_total, change_due,
           sale_at, completed_at, created_by, metadata)
        VALUES ($1, $2, $3, 'pos_refund', 'completed', 'USD',
                $4, $5, $6, $7, $7, 0, now(), now(), $8, $9)
        RETURNING id
      `, [
        tenant, reversalSaleNumber, original.customer_id,
        -round2(Number(original.subtotal) * refundRatio),
        -round2(Number(original.discount_total) * refundRatio),
        -round2(Number(original.tax_total) * refundRatio),
        -input.amount,
        input.createdBy || null,
        JSON.stringify({ refundOf: input.originalSaleId, refundId, reason: input.reason }),
      ])
      const reversalSaleId = reversalRows[0].id

      // 4. Restock inventory (if any line has restock=true)
      if (refundLines) {
        for (const rl of refundLines) {
          if (rl.restock) {
            // Get the sku_id from the original sale line
            const { rows: slRows } = await client.query(`SELECT sku_id, description FROM public.commerce_sale_lines WHERE id = $1`, [rl.saleLineId])
            if (slRows[0]?.sku_id) {
              // Create a positive inventory movement (return to stock)
              const wh = await client.query(`SELECT id FROM public.erp_warehouses WHERE tenant_id = $1 AND code = 'MAIN' LIMIT 1`, [tenant])
              if (wh.rows[0]) {
                await client.query(`
                  INSERT INTO public.erp_inventory_movements
                    (tenant_id, movement_type, sku_id, warehouse_id, quantity, unit_cost, source_type, source_id, reason, occurred_at)
                  VALUES ($1, 'return', $2, $3, $4, 0, 'refund', $5, 'Customer return', now())
                `, [tenant, slRows[0].sku_id, wh.rows[0].id, rl.quantity, refundId])
              }
            }
          }
        }
      }

      // 5. Post the REVERSAL journal entry (invert the original)
      const reversalJournalEntryId = await postReversalJournalEntry(client, tenant, refundId, refundNumber, {
        amount: input.amount,
        refundMethod: input.refundMethod,
      })

      // 6. Cash refunds leave the drawer: drop the session's expected
      // cash by the refunded amount (only while that session is open).
      if (input.refundMethod === "cash" && original.register_session_id) {
        await client.query(
          `UPDATE public.commerce_register_sessions SET expected_cash = expected_cash - $2 WHERE id = $1 AND status = 'open'`,
          [original.register_session_id, input.amount],
        )
      }

      await client.query("COMMIT")
      return { refundId, refundNumber, reversalJournalEntryId }
    } catch (err) {
      await client.query("ROLLBACK")
      throw err
    }
  })) ?? { error: "Database unavailable" }
}

async function postReversalJournalEntry(
  client: pg.Client,
  tenant: string,
  refundId: string,
  refundNumber: string,
  data: { amount: number; refundMethod: string },
): Promise<string | null> {
  const { rows: glAccounts } = await client.query(`SELECT id, code FROM public.acct_chart_of_accounts WHERE tenant_id = $1`, [tenant])
  const glByCode = new Map(glAccounts.map((r: any) => [r.code, r.id]))
  const { rows: entities } = await client.query(`SELECT id FROM public.acct_entities WHERE tenant_id = $1 LIMIT 1`, [tenant])
  const entityId = entities[0]?.id
  let { rows: books } = await client.query(`SELECT id FROM public.acct_books WHERE tenant_id = $1 LIMIT 1`, [tenant])
  const bookId = books[0]?.id
  let { rows: periods } = await client.query(`SELECT id FROM public.acct_periods WHERE tenant_id = $1 AND CURRENT_DATE BETWEEN start_date AND end_date LIMIT 1`, [tenant])
  const periodId = periods[0]?.id
  if (!entityId || !bookId || !periodId) return null

  // INVERT the original: Debit Revenue, Credit Cash/Checking
  const glCode = data.refundMethod === "cash" || data.refundMethod === "check" ? "1000" : "1010"
  const debitAcct = glByCode.get("4000") // Revenue
  const creditAcct = glByCode.get(glCode) || glByCode.get("1000")

  const totalDebit = data.amount
  const totalCredit = data.amount

  // Guardrail
  if (Math.round((totalDebit - totalCredit) * 100) / 100 !== 0) return null

  // Create a batch for the refund journal entry first (batch_id is NOT NULL)
  const refundBatchNo = `JB-REF-${Date.now()}`
  const { rows: refundBatchRows } = await client.query(`
    INSERT INTO public.acct_journal_batches (tenant_id, entity_id, book_id, batch_no, source, status, description, source_system)
    VALUES ($1, $2, $3, $4, 'integration', 'posted', 'POS refund batch', 'commerce')
    RETURNING id
  `, [tenant, entityId, bookId, refundBatchNo])
  const refundBatchId = refundBatchRows[0].id

  const { rows: jeRows } = await client.query(`
    INSERT INTO public.acct_journal_entries (tenant_id, entity_id, book_id, batch_id, period_id, entry_date, posting_date, source, source_id, reference, memo, currency, total_debit, total_credit, status)
    VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, CURRENT_DATE, 'system', $6, $7, $8, 'USD', $9, $10, 'posted')
    RETURNING id
  `, [tenant, entityId, bookId, refundBatchId, periodId, refundId, refundNumber, `Refund ${refundNumber}`, totalDebit, totalCredit])

  const journalEntryId = jeRows[0].id

  await client.query(`INSERT INTO public.acct_journal_lines (tenant_id, entity_id, journal_entry_id, line_no, account_id, description, debit, credit) VALUES ($1, $2, $3, 1, $4, 'Refund - revenue reversal', $5, 0)`, [tenant, entityId, journalEntryId, debitAcct, totalDebit])
  await client.query(`INSERT INTO public.acct_journal_lines (tenant_id, entity_id, journal_entry_id, line_no, account_id, description, debit, credit) VALUES ($1, $2, $3, 2, $4, 'Refund - cash/check return', 0, $5)`, [tenant, entityId, journalEntryId, creditAcct, totalCredit])

  return journalEntryId
}

// ============================================================================
// WRITE — void a completed sale (distinct from a refund)
//
// A void cancels a sale that should never have settled (wrong ticket,
// duplicate ring) while its register session is still OPEN — after the
// session closes, money movement is the refund path's job, and this
// function refuses. Everything the sale did is unwound in one
// transaction:
//   · commerce_sales → status 'voided' + voided_at + void_reason
//   · commerce_payments → status 'voided'
//   · gift-card tenders → balances restored, 'void_reversal' ledger rows
//   · drawer → the session's expected_cash loses the net cash the sale
//     kept (the same netting completePosSale applied)
//   · GL → a reversing journal entry that mirrors the sale's original
//     entry line-for-line with debits/credits swapped (when the sale
//     carries a journal entry; a sale without one voids without a GL
//     leg rather than inventing accounts)
// ============================================================================

export async function voidPosSale(input: {
  saleId: string
  reason: string
  tenantId?: string
  voidedBy?: string | null
}): Promise<{ ok: true; saleNumber: string; reversalJournalEntryId: string | null } | { error: string }> {
  // Error contract mirrors processRefund: business refusals are
  // RETURNED as { error } (withPg swallows throws into null).
  const out = (await withPg(async (client) => {
    const tenant = input.tenantId ?? DEFAULT_TENANT()
    await client.query("BEGIN")
    try {
      const { rows: saleRows } = await client.query(
        `SELECT id, sale_number, status, total, register_session_id, metadata
           FROM public.commerce_sales
          WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [input.saleId, tenant],
      )
      const sale = saleRows[0]
      if (!sale) { await client.query("ROLLBACK").catch(() => {}); return { error: "Sale not found" } }
      if (sale.status === "voided") { await client.query("ROLLBACK").catch(() => {}); return { error: "This sale is already voided" } }
      if (sale.status !== "completed") { await client.query("ROLLBACK").catch(() => {}); return { error: `Only a completed sale can be voided (this one is ${sale.status}) — use Refund for settled sales` } }
      if (!sale.register_session_id) { await client.query("ROLLBACK").catch(() => {}); return { error: "This sale has no register session — it cannot be voided at the register" } }
      const { rows: sessRows } = await client.query(
        `SELECT id, status FROM public.commerce_register_sessions WHERE id = $1 AND tenant_id = $2`,
        [sale.register_session_id, tenant],
      )
      if (!sessRows[0] || sessRows[0].status !== "open") {
        await client.query("ROLLBACK").catch(() => {})
        return { error: "The register session for this sale is closed — a closed session's sales are settled through Refund, not Void" }
      }

      // Tenders: drawer netting + gift-card restoration.
      const { rows: pays } = await client.query(
        `SELECT p.id, p.amount, p.external_reference, pm.method_type, pm.code
           FROM public.commerce_payments p
           LEFT JOIN public.commerce_payment_methods pm ON pm.id = p.payment_method_id
          WHERE p.sale_id = $1 AND p.tenant_id = $2`,
        [sale.id, tenant],
      )
      let cashTendered = 0
      let nonCashTendered = 0
      for (const p of pays) {
        if (p.method_type === "cash") cashTendered += Number(p.amount) || 0
        else nonCashTendered += Number(p.amount) || 0
        if (p.code === "STORE_CREDIT" || p.external_reference) {
          const cardNumber = p.external_reference ? String(p.external_reference) : null
          if (cardNumber) {
            const { rows: gcRows } = await client.query(
              `SELECT id, balance, status FROM public.commerce_gift_cards WHERE card_number = $1 AND tenant_id = $2 FOR UPDATE`,
              [cardNumber, tenant],
            )
            if (gcRows[0]) {
              const before = Number(gcRows[0].balance) || 0
              const after = Math.round((before + Number(p.amount)) * 100) / 100
              await client.query(
                `UPDATE public.commerce_gift_cards
                    SET balance = $2, status = CASE WHEN status IN ('redeemed','partially_redeemed') THEN 'active' ELSE status END
                  WHERE id = $1`,
                [gcRows[0].id, after],
              )
              await client.query(
                `INSERT INTO public.commerce_gift_card_transactions
                   (gift_card_id, sale_id, transaction_type, amount, balance_before, balance_after, created_by)
                 VALUES ($1, $2, 'void_reversal', $3, $4, $5, $6)`,
                [gcRows[0].id, sale.id, Number(p.amount), before, after, input.voidedBy || null],
              )
            }
          }
        }
      }
      const netCashKept = Math.min(cashTendered, Math.max(0, Number(sale.total) - nonCashTendered))
      if (netCashKept > 0) {
        await client.query(
          `UPDATE public.commerce_register_sessions SET expected_cash = expected_cash - $2 WHERE id = $1`,
          [sale.register_session_id, netCashKept],
        )
      }

      await client.query(
        `UPDATE public.commerce_payments SET status = 'voided' WHERE sale_id = $1 AND tenant_id = $2`,
        [sale.id, tenant],
      )
      await client.query(
        `UPDATE public.commerce_sales
            SET status = 'voided', voided_at = now(), void_reason = $3
          WHERE id = $1 AND tenant_id = $2`,
        [sale.id, tenant, input.reason || "Voided at register"],
      )

      // GL reversal — mirror the original entry's lines, swapped.
      let reversalJournalEntryId: string | null = null
      const meta = (typeof sale.metadata === "string" ? JSON.parse(sale.metadata || "{}") : sale.metadata) || {}
      const originalEntryId = meta.journalEntryId ? String(meta.journalEntryId) : null
      if (originalEntryId) {
        const { rows: lines } = await client.query(
          `SELECT account_id, description, debit, credit FROM public.acct_journal_lines
            WHERE journal_entry_id = $1 ORDER BY line_no`,
          [originalEntryId],
        )
        if (lines.length > 0) {
          const { rows: entities } = await client.query(`SELECT id FROM public.acct_entities WHERE tenant_id = $1 LIMIT 1`, [tenant])
          const { rows: books } = await client.query(`SELECT id FROM public.acct_books WHERE tenant_id = $1 LIMIT 1`, [tenant])
          const { rows: periods } = await client.query(`SELECT id FROM public.acct_periods WHERE tenant_id = $1 AND CURRENT_DATE BETWEEN start_date AND end_date LIMIT 1`, [tenant])
          const entityId = entities[0]?.id
          const bookId = books[0]?.id
          const periodId = periods[0]?.id
          if (entityId && bookId && periodId) {
            const totalDebit = lines.reduce((s: number, l: any) => s + Number(l.credit || 0), 0)
            const totalCredit = lines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0)
            const { rows: batchRows } = await client.query(
              `INSERT INTO public.acct_journal_batches (tenant_id, entity_id, book_id, batch_no, source, status, description, source_system)
               VALUES ($1, $2, $3, $4, 'integration', 'posted', 'POS void batch', 'commerce') RETURNING id`,
              [tenant, entityId, bookId, `JB-VOID-${Date.now()}`],
            )
            const { rows: jeRows } = await client.query(
              `INSERT INTO public.acct_journal_entries (tenant_id, entity_id, book_id, batch_id, period_id, entry_date, posting_date, source, source_id, reference, memo, currency, total_debit, total_credit, status)
               VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, CURRENT_DATE, 'system', $6, $7, $8, 'USD', $9, $10, 'posted') RETURNING id`,
              [tenant, entityId, bookId, batchRows[0].id, periodId, sale.id, `VOID-${sale.sale_number}`, `Void of ${sale.sale_number}: ${input.reason || "register void"}`, totalDebit, totalCredit],
            )
            reversalJournalEntryId = jeRows[0].id
            for (let i = 0; i < lines.length; i++) {
              const l = lines[i]
              await client.query(
                `INSERT INTO public.acct_journal_lines (tenant_id, entity_id, journal_entry_id, line_no, account_id, description, debit, credit)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [tenant, entityId, reversalJournalEntryId, i + 1, l.account_id, `Void reversal — ${l.description || sale.sale_number}`, Number(l.credit || 0), Number(l.debit || 0)],
              )
            }
          }
        }
      }

      await client.query("COMMIT")
      return { ok: true as const, saleNumber: String(sale.sale_number), reversalJournalEntryId }
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {})
      return { error: e instanceof Error ? e.message : "Void failed" }
    }
  })) as
    | { ok: true; saleNumber: string; reversalJournalEntryId: string | null }
    | { error: string }
    | null
  return out ?? { error: "Database unavailable" }
}

// ============================================================================
// READ — today's sales summary
// ============================================================================

export async function getPosTodaySummary(tenantId?: string): Promise<{
  salesCount: number
  grossSales: number
  discounts: number
  tax: number
  netSales: number
  cashSales: number
  cardSales: number
} | null> {
  return (await withPg(async (client) => {
    // Sales aggregates and tender aggregates are computed separately:
    // joining payments directly multiplied every sale-level SUM (and the
    // count) by the number of payments on the sale — split tenders
    // inflated the day's sales count, gross, and net.
    const { rows } = await client.query(`
      WITH s AS (
        SELECT * FROM public.commerce_sales
        WHERE tenant_id = $1 AND source = 'pos' AND sale_at::date = CURRENT_DATE AND status = 'completed'
      )
      SELECT
        (SELECT count(*)::int FROM s) AS sales_count,
        (SELECT COALESCE(SUM(subtotal), 0)::numeric FROM s) AS gross_sales,
        (SELECT COALESCE(SUM(discount_total), 0)::numeric FROM s) AS discounts,
        (SELECT COALESCE(SUM(tax_total), 0)::numeric FROM s) AS tax,
        (SELECT COALESCE(SUM(total), 0)::numeric FROM s) AS net_sales,
        COALESCE(SUM(CASE WHEN pm.method_type = 'cash' THEN p.amount ELSE 0 END), 0)::numeric AS cash_sales,
        COALESCE(SUM(CASE WHEN pm.method_type = 'card' THEN p.amount ELSE 0 END), 0)::numeric AS card_sales
      FROM public.commerce_payments p
      JOIN public.commerce_payment_methods pm ON pm.id = p.payment_method_id
      WHERE p.sale_id IN (SELECT id FROM s)
    `, [tenantId ?? DEFAULT_TENANT()])
    const r = rows[0] || {}
    return {
      salesCount: Number(r.sales_count) || 0,
      grossSales: Number(r.gross_sales) || 0,
      discounts: Number(r.discounts) || 0,
      tax: Number(r.tax) || 0,
      netSales: Number(r.net_sales) || 0,
      cashSales: Number(r.cash_sales) || 0,
      cardSales: Number(r.card_sales) || 0,
    }
  })) ?? null
}

// ============================================================================
// READ — register log: today's transaction list + a session (shift) report.
// Backs the register's Today's Sales / Shift view: every row is a real
// commerce_sales / commerce_cash_movements record, tenders named from the
// sale's own payments.
// ============================================================================

export type PosTodaySale = {
  id: string
  saleNumber: string
  source: string
  status: string
  total: number
  paidTotal: number
  changeDue: number
  saleAt: string
  registerSessionId: string | null
  tenders: string
  receiptNumber: string | null
}

export async function getPosTodaySales(limit = 100, tenantId?: string): Promise<PosTodaySale[]> {
  return (await withPg(async (client) => {
    const { rows } = await client.query(`
      SELECT s.id, s.sale_number, s.source, s.status, s.total, s.paid_total, s.change_due,
             s.sale_at, s.register_session_id,
             COALESCE(string_agg(DISTINCT pm.name, ' + '), '') AS tenders,
             (SELECT receipt_number FROM public.commerce_receipts r WHERE r.sale_id = s.id LIMIT 1) AS receipt_number
      FROM public.commerce_sales s
      LEFT JOIN public.commerce_payments p ON p.sale_id = s.id
      LEFT JOIN public.commerce_payment_methods pm ON pm.id = p.payment_method_id
      WHERE s.tenant_id = $1 AND s.sale_at::date = CURRENT_DATE
      GROUP BY s.id
      ORDER BY s.sale_at DESC
      LIMIT $2
    `, [tenantId ?? DEFAULT_TENANT(), limit])
    return rows.map((r: any) => ({
      id: r.id, saleNumber: r.sale_number, source: r.source, status: r.status,
      total: Number(r.total) || 0, paidTotal: Number(r.paid_total) || 0,
      changeDue: Number(r.change_due) || 0, saleAt: r.sale_at,
      registerSessionId: r.register_session_id || null,
      tenders: r.tenders || "", receiptNumber: r.receipt_number || null,
    }))
  })) ?? []
}

export type PosSessionReport = {
  session: PosRegisterSession & { registerId: string }
  movements: { id: string; movementType: string; amount: number; reason: string | null; createdAt: string }[]
  salesCount: number
  salesTotal: number
  cashSales: number
  refundsTotal: number
}

export async function getRegisterSessionReport(sessionId: string, tenantId?: string): Promise<PosSessionReport | null> {
  return (await withPg(async (client) => {
    const tenant = tenantId ?? DEFAULT_TENANT()
    const { rows: sess } = await client.query(`
      SELECT id, register_id, status, opening_cash, expected_cash, counted_cash, variance, opened_at, closed_at, opened_by
      FROM public.commerce_register_sessions WHERE id = $1 AND tenant_id = $2
    `, [sessionId, tenant])
    if (sess.length === 0) return null
    const s = sess[0]
    const { rows: movements } = await client.query(`
      SELECT id, movement_type, amount, reason, created_at
      FROM public.commerce_cash_movements WHERE register_session_id = $1 ORDER BY created_at
    `, [sessionId])
    const { rows: agg } = await client.query(`
      SELECT
        (SELECT count(*)::int FROM public.commerce_sales WHERE register_session_id = $1 AND source = 'pos' AND status = 'completed') AS sales_count,
        (SELECT COALESCE(SUM(total), 0)::numeric FROM public.commerce_sales WHERE register_session_id = $1 AND source = 'pos' AND status = 'completed') AS sales_total,
        COALESCE(SUM(CASE WHEN pm.method_type = 'cash' THEN p.amount ELSE 0 END), 0)::numeric AS cash_sales,
        (SELECT COALESCE(SUM(amount), 0)::numeric FROM public.commerce_refunds rf
           JOIN public.commerce_sales os ON os.id = rf.sale_id
          WHERE os.register_session_id = $1 AND rf.status = 'completed') AS refunds_total
      FROM public.commerce_payments p
      JOIN public.commerce_payment_methods pm ON pm.id = p.payment_method_id
      JOIN public.commerce_sales sl ON sl.id = p.sale_id
      WHERE sl.register_session_id = $1 AND sl.source = 'pos'
    `, [sessionId])
    const a = agg[0] || {}
    return {
      session: {
        id: s.id, registerId: s.register_id, status: s.status,
        openingCash: Number(s.opening_cash) || 0,
        expectedCash: Number(s.expected_cash) || 0,
        countedCash: s.counted_cash != null ? Number(s.counted_cash) : null,
        variance: s.variance != null ? Number(s.variance) : null,
        openedAt: s.opened_at, closedAt: s.closed_at, openedBy: s.opened_by,
      },
      movements: movements.map((m: any) => ({
        id: m.id, movementType: m.movement_type, amount: Number(m.amount) || 0,
        reason: m.reason || null, createdAt: m.created_at,
      })),
      salesCount: Number(a.sales_count) || 0,
      salesTotal: Number(a.sales_total) || 0,
      cashSales: Number(a.cash_sales) || 0,
      refundsTotal: Number(a.refunds_total) || 0,
    }
  })) ?? null
}
