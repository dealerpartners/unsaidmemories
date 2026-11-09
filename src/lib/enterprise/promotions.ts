import "server-only"
import { revalidatePath, revalidateTag } from "next/cache"
import { TENANT_ID, withPg } from "@/lib/crm/enterprise"

// ============================================================================
// enterprise/promotions.ts — the read/write layer for commerce_promotions +
// commerce_coupons.
//
// GROUND RULE (owner's directive): the schema is ground truth. Promotions are
// the discount TEMPLATE (percent_off / amount_off / bogo + caps + rules +
// actions). Coupons are the REDEEMABLE CODE that points at a promotion (or
// stands alone for one-off codes). A coupon validates against its promotion's
// value/type/minimum_subtotal/maximum_discount to compute a discount.
//
// Every function uses withPg + TENANT_ID() (the default tenant is
// b2a3b20c-9816-5518-92db-f9395c063acd). No PostgREST repo — the promotions
// schema needs proper SQL.
// ============================================================================

export const DEFAULT_TENANT = TENANT_ID

export type PromotionType = "percent_off" | "amount_off" | "bogo" | "set_price"

// A promotion's scope is a SET of targets in any mix (Sunny 2026-10-13):
// catalog products and/or taxonomy nodes at any level (a node covers its
// whole subtree). An empty target set means the promotion is cart-wide.
// Fulfillment type (stocked vs dropship) is never a scope dimension.
export type PromotionTarget = {
  kind: "product" | "taxonomy"
  id: string
  label: string | null
}

export type Promotion = {
  id: string
  tenantId: string
  code: string
  name: string
  promotionType: string
  value: number | null
  minimumSubtotal: number | null
  maximumDiscount: number | null
  startAt: string | null
  endAt: string | null
  usageLimit: number | null
  usageCount: number
  active: boolean
  // Claim model: a promotion is claimed by a code (a commerce_coupons row
  // pointing at it) OR applies automatically when isAutomatic is true.
  isAutomatic: boolean
  targets: PromotionTarget[]
  rules: Record<string, any>
  actions: Record<string, any>
  couponCount: number
}

export type Coupon = {
  id: string
  tenantId: string
  promotionId: string | null
  code: string
  customerId: string | null
  usageLimit: number | null
  usageCount: number
  status: string
  validFrom: string | null
  validTo: string | null
  promotion: {
    id: string
    name: string
    code: string
    promotionType: string
    value: number | null
  } | null
}

export type PromotionInput = {
  code: string
  name: string
  promotionType: PromotionType | string
  value?: number | null
  minimumSubtotal?: number | null
  maximumDiscount?: number | null
  startAt?: string | null
  endAt?: string | null
  usageLimit?: number | null
  active?: boolean
  isAutomatic?: boolean
  targets?: PromotionTarget[]
  rules?: Record<string, any>
  actions?: Record<string, any>
}

export type CouponInput = {
  code: string
  promotionId?: string | null
  customerId?: string | null
  usageLimit?: number | null
  validFrom?: string | null
  validTo?: string | null
  status?: string
}

export type CouponValidation = {
  valid: boolean
  discount: number
  message?: string
  promotion: Promotion | null
  coupon: Coupon | null
}

// ============================================================================
// READ — list all promotions (with coupon count joined)
// ============================================================================

export async function listPromotions(): Promise<Promotion[]> {
  return (await withPg(async (client) => {
    const { rows } = await client.query(
      `
      SELECT
        p.id,
        p.tenant_id AS "tenantId",
        p.code,
        p.name,
        p.promotion_type AS "promotionType",
        p.value,
        p.minimum_subtotal AS "minimumSubtotal",
        p.maximum_discount AS "maximumDiscount",
        p.start_at AS "startAt",
        p.end_at AS "endAt",
        p.usage_limit AS "usageLimit",
        p.usage_count AS "usageCount",
        p.active,
        p.is_automatic AS "isAutomatic",
        p.rules,
        p.actions,
        COALESCE(c.cnt, 0) AS "couponCount"
      FROM public.commerce_promotions p
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS cnt
        FROM public.commerce_coupons
        WHERE promotion_id = p.id
      ) c ON true
      WHERE p.tenant_id = $1
      ORDER BY p.start_at DESC NULLS LAST, p.name ASC, p.code ASC
      `,
      [DEFAULT_TENANT()],
    )
    await attachTargets(client, rows)
    return rows.map(rowToPromotion)
  })) ?? []
}

export async function getPromotion(id: string): Promise<Promotion | null> {
  return (await withPg(async (client) => {
    const { rows } = await client.query(
      `
      SELECT
        p.id,
        p.tenant_id AS "tenantId",
        p.code,
        p.name,
        p.promotion_type AS "promotionType",
        p.value,
        p.minimum_subtotal AS "minimumSubtotal",
        p.maximum_discount AS "maximumDiscount",
        p.start_at AS "startAt",
        p.end_at AS "endAt",
        p.usage_limit AS "usageLimit",
        p.usage_count AS "usageCount",
        p.active,
        p.is_automatic AS "isAutomatic",
        p.rules,
        p.actions,
        COALESCE(c.cnt, 0) AS "couponCount"
      FROM public.commerce_promotions p
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS cnt
        FROM public.commerce_coupons
        WHERE promotion_id = p.id
      ) c ON true
      WHERE p.id = $1 AND p.tenant_id = $2
      LIMIT 1
      `,
      [id, DEFAULT_TENANT()],
    )
    await attachTargets(client, rows)
    return rows[0] ? rowToPromotion(rows[0]) : null
  })) ?? null
}

// ============================================================================
// WRITE — create a promotion
// ============================================================================

export async function createPromotion(input: PromotionInput): Promise<Promotion | null> {
  return (await withPg(async (client) => {
    const tenant = DEFAULT_TENANT()
    const { rows } = await client.query(
      `
      INSERT INTO public.commerce_promotions
        (tenant_id, code, name, promotion_type, value, minimum_subtotal,
         maximum_discount, start_at, end_at, usage_limit, active, is_automatic, rules, actions)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id
      `,
      [
        tenant,
        String(input.code || "").trim(),
        String(input.name || "").trim(),
        String(input.promotionType || "percent_off"),
        input.value ?? null,
        input.minimumSubtotal ?? null,
        input.maximumDiscount ?? null,
        input.startAt || null,
        input.endAt || null,
        input.usageLimit ?? null,
        input.active !== false,
        input.isAutomatic === true,
        JSON.stringify(input.rules ?? {}),
        JSON.stringify(input.actions ?? {}),
      ],
    )
    if (input.targets) await replaceTargets(client, tenant, rows[0].id, input.targets)
    revalidateShopPaths()
    return await getPromotion(rows[0].id)
  })) ?? null
}

// ============================================================================
// WRITE — update a promotion
// ============================================================================

export async function updatePromotion(
  id: string,
  patch: Partial<PromotionInput>,
): Promise<Promotion | null> {
  return (await withPg(async (client) => {
    const tenant = DEFAULT_TENANT()
    await client.query(
      `
      UPDATE public.commerce_promotions SET
        code = COALESCE($2, code),
        name = COALESCE($3, name),
        promotion_type = COALESCE($4, promotion_type),
        value = CASE WHEN $5::numeric IS NULL THEN value ELSE $5 END,
        minimum_subtotal = CASE WHEN $6::numeric IS NULL THEN minimum_subtotal ELSE $6 END,
        maximum_discount = CASE WHEN $7::numeric IS NULL THEN maximum_discount ELSE $7 END,
        start_at = CASE WHEN $8::timestamptz IS NULL THEN start_at ELSE $8 END,
        end_at = CASE WHEN $9::timestamptz IS NULL THEN end_at ELSE $9 END,
        usage_limit = CASE WHEN $10::int IS NULL THEN usage_limit ELSE $10 END,
        active = COALESCE($11, active),
        rules = COALESCE($12, rules),
        actions = COALESCE($13, actions),
        is_automatic = COALESCE($15, is_automatic)
      WHERE id = $1 AND tenant_id = $14
      `,
      [
        id,
        patch.code != null ? String(patch.code).trim() : null,
        patch.name != null ? String(patch.name).trim() : null,
        patch.promotionType ?? null,
        patch.value ?? null,
        patch.minimumSubtotal ?? null,
        patch.maximumDiscount ?? null,
        patch.startAt ?? null,
        patch.endAt ?? null,
        patch.usageLimit ?? null,
        patch.active ?? null,
        patch.rules != null ? JSON.stringify(patch.rules) : null,
        patch.actions != null ? JSON.stringify(patch.actions) : null,
        tenant,
        patch.isAutomatic ?? null,
      ],
    )
    if (patch.targets !== undefined) await replaceTargets(client, tenant, id, patch.targets)
    revalidateShopPaths()
    return await getPromotion(id)
  })) ?? null
}

// ============================================================================
// WRITE — delete a promotion
// commerce_coupons.promotion_id FK is ON DELETE NO ACTION, so we must clear
// the FK on the coupons first (null them out — keeps coupon history intact
// for analytics) before deleting the promotion row.
// ============================================================================

export async function deletePromotion(id: string): Promise<boolean> {
  return (await withPg(async (client) => {
    const tenant = DEFAULT_TENANT()
    await client.query("BEGIN")
    try {
      await client.query(
        `UPDATE public.commerce_coupons SET promotion_id = NULL WHERE promotion_id = $1 AND tenant_id = $2`,
        [id, tenant],
      )
      const { rowCount } = await client.query(
        `DELETE FROM public.commerce_promotions WHERE id = $1 AND tenant_id = $2`,
        [id, tenant],
      )
      await client.query("COMMIT")
      if ((rowCount ?? 0) > 0) revalidateShopPaths()
      return (rowCount ?? 0) > 0
    } catch (err) {
      await client.query("ROLLBACK")
      throw err
    }
  })) ?? false
}

// ============================================================================
// READ — list coupons (optionally filtered by promotion_id)
// ============================================================================

export async function listCoupons(promotionId?: string): Promise<Coupon[]> {
  return (await withPg(async (client) => {
    const tenant = DEFAULT_TENANT()
    const params: any[] = [tenant]
    let filter = `WHERE c.tenant_id = $1`
    if (promotionId) {
      params.push(promotionId)
      filter += ` AND c.promotion_id = $2`
    }
    const { rows } = await client.query(
      `
      SELECT
        c.id,
        c.tenant_id AS "tenantId",
        c.promotion_id AS "promotionId",
        c.code,
        c.customer_id AS "customerId",
        c.usage_limit AS "usageLimit",
        c.usage_count AS "usageCount",
        c.status,
        c.valid_from AS "validFrom",
        c.valid_to AS "validTo",
        ROW_TO_JSON(promo) AS promotion
      FROM public.commerce_coupons c
      LEFT JOIN LATERAL (
        SELECT
          p.id, p.name, p.code,
          p.promotion_type AS "promotionType",
          p.value
        FROM public.commerce_promotions p
        WHERE p.id = c.promotion_id
      ) promo ON true
      ${filter}
      ORDER BY c.valid_from DESC NULLS LAST, c.code ASC
      `,
      params,
    )
    return rows.map(rowToCoupon)
  })) ?? []
}

export async function getCoupon(id: string): Promise<Coupon | null> {
  return (await withPg(async (client) => {
    const tenant = DEFAULT_TENANT()
    const { rows } = await client.query(
      `
      SELECT
        c.id,
        c.tenant_id AS "tenantId",
        c.promotion_id AS "promotionId",
        c.code,
        c.customer_id AS "customerId",
        c.usage_limit AS "usageLimit",
        c.usage_count AS "usageCount",
        c.status,
        c.valid_from AS "validFrom",
        c.valid_to AS "validTo",
        ROW_TO_JSON(promo) AS promotion
      FROM public.commerce_coupons c
      LEFT JOIN LATERAL (
        SELECT
          p.id, p.name, p.code,
          p.promotion_type AS "promotionType",
          p.value
        FROM public.commerce_promotions p
        WHERE p.id = c.promotion_id
      ) promo ON true
      WHERE c.id = $1 AND c.tenant_id = $2
      LIMIT 1
      `,
      [id, tenant],
    )
    return rows[0] ? rowToCoupon(rows[0]) : null
  })) ?? null
}

// ============================================================================
// WRITE — create a coupon
// ============================================================================

export async function createCoupon(input: CouponInput): Promise<Coupon | null> {
  return (await withPg(async (client) => {
    const tenant = DEFAULT_TENANT()
    const { rows } = await client.query(
      `
      INSERT INTO public.commerce_coupons
        (tenant_id, promotion_id, code, customer_id, usage_limit,
         status, valid_from, valid_to)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
      `,
      [
        tenant,
        input.promotionId || null,
        String(input.code || "").trim(),
        input.customerId || null,
        input.usageLimit ?? null,
        input.status || "active",
        input.validFrom || null,
        input.validTo || null,
      ],
    )
    revalidateShopPaths()
    return await getCoupon(rows[0].id)
  })) ?? null
}

// ============================================================================
// WRITE — update a coupon
// ============================================================================

export async function updateCoupon(
  id: string,
  patch: Partial<CouponInput>,
): Promise<Coupon | null> {
  return (await withPg(async (client) => {
    const tenant = DEFAULT_TENANT()
    await client.query(
      `
      UPDATE public.commerce_coupons SET
        promotion_id = CASE WHEN $2::uuid IS NULL THEN promotion_id ELSE $2 END,
        code = COALESCE($3, code),
        customer_id = CASE WHEN $4::uuid IS NULL THEN customer_id ELSE $4 END,
        usage_limit = CASE WHEN $5::int IS NULL THEN usage_limit ELSE $5 END,
        status = COALESCE($6, status),
        valid_from = CASE WHEN $7::timestamptz IS NULL THEN valid_from ELSE $7 END,
        valid_to = CASE WHEN $8::timestamptz IS NULL THEN valid_to ELSE $8 END
      WHERE id = $1 AND tenant_id = $9
      `,
      [
        id,
        patch.promotionId ?? null,
        patch.code != null ? String(patch.code).trim() : null,
        patch.customerId ?? null,
        patch.usageLimit ?? null,
        patch.status ?? null,
        patch.validFrom ?? null,
        patch.validTo ?? null,
        tenant,
      ],
    )
    revalidateShopPaths()
    return await getCoupon(id)
  })) ?? null
}

// ============================================================================
// WRITE — delete a coupon
// ============================================================================

export async function deleteCoupon(id: string): Promise<boolean> {
  return (await withPg(async (client) => {
    const tenant = DEFAULT_TENANT()
    const { rowCount } = await client.query(
      `DELETE FROM public.commerce_coupons WHERE id = $1 AND tenant_id = $2`,
      [id, tenant],
    )
    if ((rowCount ?? 0) > 0) revalidateShopPaths()
    return (rowCount ?? 0) > 0
  })) ?? false
}

// ============================================================================
// SCOPE + MATH — shared by validateCoupon and the checkout pre-check
// (the pre-check and the charged amount can never drift apart).
//
// A cart line is { catalogItemId, quantity, unitPrice }. Services and
// subscription lines carry no catalogItemId and are only eligible for
// cart-wide promotions (no targets).
// ============================================================================

export type PromoLine = {
  catalogItemId?: string | null
  quantity: number
  unitPrice: number
}

type QueryClient = {
  query: (sql: string, params?: any[]) => Promise<{ rows: any[] }>
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function loadPromotionTargets(
  client: QueryClient,
  tenant: string,
  promotionId: string,
): Promise<PromotionTarget[]> {
  const { rows } = await client.query(
    `SELECT target_kind, target_id, target_label FROM public.commerce_promotion_targets
     WHERE tenant_id = $1 AND promotion_id = $2 ORDER BY target_kind, target_label`,
    [tenant, promotionId],
  )
  return rows.map((r: any) => ({
    kind: r.target_kind === "taxonomy" ? "taxonomy" : "product",
    id: String(r.target_id),
    label: r.target_label ?? null,
  })) as PromotionTarget[]
}

// Resolve which cart lines a promotion's target set covers. Taxonomy
// targets cover their whole subtree (taxonomy_nodes.parent_id walk — the
// same recursive pattern the storefront grid uses); a product's nodes
// come from commerce_catalog_items.metadata.taxonomy_node_ids.
export async function resolveEligibleLines(
  client: QueryClient,
  tenant: string,
  targets: PromotionTarget[],
  lines: PromoLine[],
): Promise<PromoLine[]> {
  if (!targets.length) return lines
  const productIds = new Set(targets.filter((t) => t.kind === "product").map((t) => t.id))
  const taxIds = targets.filter((t) => t.kind === "taxonomy").map((t) => t.id).filter((id) => UUID_RE.test(id))
  let subtree = new Set<string>()
  if (taxIds.length) {
    const { rows } = await client.query(
      `WITH RECURSIVE scope AS (
         SELECT id FROM public.taxonomy_nodes WHERE id = ANY($1::uuid[])
         UNION ALL
         SELECT tn.id FROM public.taxonomy_nodes tn JOIN scope s ON tn.parent_id = s.id
       ) SELECT id::text AS id FROM scope`,
      [taxIds],
    )
    subtree = new Set(rows.map((r: any) => String(r.id)))
  }
  const itemIds = [...new Set(lines.map((l) => l.catalogItemId).filter((x): x is string => !!x && UUID_RE.test(x)))]
  const itemNodes = new Map<string, string[]>()
  if (itemIds.length) {
    const { rows } = await client.query(
      `SELECT id::text AS id, COALESCE(metadata->'taxonomy_node_ids', '[]'::jsonb) AS nodes
       FROM public.commerce_catalog_items WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
      [tenant, itemIds],
    )
    for (const r of rows) {
      itemNodes.set(String(r.id), Array.isArray(r.nodes) ? r.nodes.map(String) : [])
    }
  }
  return lines.filter((l) => {
    if (!l.catalogItemId) return false
    if (productIds.has(l.catalogItemId)) return true
    const nodes = itemNodes.get(l.catalogItemId) || []
    return nodes.some((n) => subtree.has(n))
  })
}

// The three price mechanics the checkout honors. eligibleSubtotal is the
// gross of the eligible lines; set_price works per line (each eligible
// unit is repriced to `value`). maximum_discount caps the total.
export function computePromotionDiscount(
  p: { promotionType: string; value: number | null; maximumDiscount: number | null },
  eligibleSubtotal: number,
  eligibleLines: PromoLine[],
): number {
  const value = Number(p.value || 0)
  const t = String(p.promotionType || "").toLowerCase()
  let d = 0
  if (t === "percent_off" || t === "percentage") {
    d = (eligibleSubtotal * value) / 100
  } else if (t === "amount_off" || t === "fixed" || t === "fixed_amount") {
    d = Math.min(value, eligibleSubtotal)
  } else if (t === "set_price") {
    d = eligibleLines.reduce((s, l) => s + Math.max(0, l.unitPrice - value) * l.quantity, 0)
  }
  if (p.maximumDiscount != null && d > 0) {
    const max = Number(p.maximumDiscount)
    if (Number.isFinite(max) && d > max) d = max
  }
  return Math.max(0, Math.round(d * 100) / 100)
}

// Automatic promotions (claim = automatic, no code): the single best
// discount among active, in-window, under-cap automatic promotions for
// the given cart lines. Returns null when none yields a discount.
export async function findAutomaticPromotion(
  lines: PromoLine[],
): Promise<{ promotion: Promotion; discount: number } | null> {
  const ids = (await withPg(async (client) => {
    const tenant = DEFAULT_TENANT()
    const { rows } = await client.query(
      `SELECT id FROM public.commerce_promotions
       WHERE tenant_id = $1 AND active = true AND is_automatic = true
         AND (start_at IS NULL OR start_at <= now())
         AND (end_at IS NULL OR end_at >= now())
         AND (usage_limit IS NULL OR usage_count < usage_limit)
       ORDER BY created_at ASC`,
      [tenant],
    )
    return rows.map((r: any) => String(r.id))
  })) ?? []
  let best: { promotion: Promotion; discount: number } | null = null
  for (const id of ids) {
    const promo = await getPromotion(id)
    if (!promo) continue
    const scoped = (await withPg(async (client) => {
      const tenant = DEFAULT_TENANT()
      return resolveEligibleLines(client, tenant, promo.targets, lines)
    })) ?? []
    const basis = scoped.reduce((s, l) => s + l.unitPrice * l.quantity, 0)
    if (promo.minimumSubtotal != null && Number(promo.minimumSubtotal) > 0 && basis < Number(promo.minimumSubtotal)) continue
    const discount = computePromotionDiscount(promo, basis, scoped)
    if (discount > 0 && (!best || discount > best.discount)) best = { promotion: promo, discount }
  }
  return best
}

// ============================================================================
// VALIDATE — the canonical coupon validator.
//
// Looks up commerce_coupons by UPPER(code) + tenant_id, then validates:
//   • status === 'active'
//   • valid_from (null | <= now)
//   • valid_to   (null | >= now)
//   • usage_limit (null | usage_count < limit)
// Then joins commerce_promotions for the discount math:
//   • percent_off → subtotal * (value / 100)
//   • amount_off  → min(value, subtotal)
//   • bogo        → no automatic discount (caller must apply buy-one-get-one
//                  logic in the cart layer; we surface it as discount: 0 here
//                  with a clear message)
// Also respects:
//   • promotion.active === true
//   • promotion.start_at (null | <= now)
//   • promotion.end_at   (null | >= now)
//   • promotion.usage_limit (null | promotion.usage_count < limit)
//   • promotion.minimum_subtotal (subtotal must be >= this or no discount)
//   • promotion.maximum_discount (caps the discount to this value)
// Returns { valid, discount, message, promotion, coupon }.
// ============================================================================

export async function validateCoupon(
  code: string,
  subtotal: number,
  lines?: PromoLine[],
): Promise<CouponValidation> {
  const result: CouponValidation = { valid: false, discount: 0, promotion: null, coupon: null }
  const trimmed = String(code || "").trim()
  if (!trimmed) {
    result.message = "No coupon code provided."
    return result
  }

  const coupon = (await withPg(async (client) => {
    const tenant = DEFAULT_TENANT()
    const { rows } = await client.query(
      `
      SELECT
        c.id,
        c.tenant_id AS "tenantId",
        c.promotion_id AS "promotionId",
        c.code,
        c.customer_id AS "customerId",
        c.usage_limit AS "usageLimit",
        c.usage_count AS "usageCount",
        c.status,
        c.valid_from AS "validFrom",
        c.valid_to AS "validTo",
        ROW_TO_JSON(promo) AS promotion
      FROM public.commerce_coupons c
      LEFT JOIN LATERAL (
        SELECT
          p.id, p.name, p.code,
          p.promotion_type AS "promotionType",
          p.value,
          p.minimum_subtotal AS "minimumSubtotal",
          p.maximum_discount AS "maximumDiscount",
          p.start_at AS "startAt",
          p.end_at AS "endAt",
          p.usage_limit AS "usageLimit",
          p.usage_count AS "usageCount",
          p.active
        FROM public.commerce_promotions p
        WHERE p.id = c.promotion_id
      ) promo ON true
      WHERE c.tenant_id = $1 AND UPPER(c.code) = UPPER($2)
      LIMIT 1
      `,
      [tenant, trimmed],
    )
    return rows[0] ? rowToCoupon(rows[0]) : null
  }))

  if (!coupon) {
    result.message = "Coupon not found."
    return result
  }
  result.coupon = coupon

  const now = Date.now()
  const validFromOk = !coupon.validFrom || new Date(coupon.validFrom).getTime() <= now
  const validToOk = !coupon.validTo || new Date(coupon.validTo).getTime() >= now
  const usageOk = !coupon.usageLimit || Number(coupon.usageCount || 0) < Number(coupon.usageLimit)
  const statusOk = coupon.status === "active"

  if (!statusOk) {
    result.message = "Coupon is no longer active."
    return result
  }
  if (!validFromOk) {
    result.message = "Coupon is not yet valid."
    return result
  }
  if (!validToOk) {
    result.message = "Coupon has expired."
    return result
  }
  if (!usageOk) {
    result.message = "Coupon usage limit reached."
    return result
  }

  // If the coupon has no promotion, it can't compute a discount.
  const promo = coupon.promotion
  if (!promo || !promo.id) {
    // Surface valid=true but discount=0 — caller can decide what to do with
    // a stand-alone code (typically only used as a tracking stub).
    result.valid = true
    result.discount = 0
    result.message = "Coupon is valid but no promotion is attached."
    return result
  }

  // The promotion object embedded in the Coupon is the slim version. Load the
  // full promotion row so we can return it as part of the result.
  const promotion = await getPromotion(promo.id)
  result.promotion = promotion
  if (!promotion) {
    result.message = "Promotion not found."
    return result
  }

  // Promotion-level gating.
  if (!promotion.active) {
    result.message = "Promotion is no longer active."
    return result
  }
  if (promotion.startAt && new Date(promotion.startAt).getTime() > now) {
    result.message = "Promotion has not started yet."
    return result
  }
  if (promotion.endAt && new Date(promotion.endAt).getTime() < now) {
    result.message = "Promotion has ended."
    return result
  }
  if (
    promotion.usageLimit != null &&
    Number(promotion.usageCount || 0) >= Number(promotion.usageLimit)
  ) {
    result.message = "Promotion usage limit reached."
    return result
  }
  // Scope: when the caller supplies cart lines, the discount basis is the
  // ELIGIBLE lines only (targets resolved against the taxonomy tree) and
  // the minimum is checked against that basis. Without lines the legacy
  // whole-subtotal basis stands.
  let basis = subtotal
  let eligibleLines: PromoLine[] = lines ?? []
  if (lines && lines.length > 0) {
    const scoped = await withPg(async (client) => {
      const tenant = DEFAULT_TENANT()
      return resolveEligibleLines(client, tenant, promotion.targets, lines)
    })
    if (scoped) {
      eligibleLines = scoped
      basis = scoped.reduce((s, l) => s + l.unitPrice * l.quantity, 0)
    }
  }

  if (
    promotion.minimumSubtotal != null &&
    Number(promotion.minimumSubtotal) > 0 &&
    basis < Number(promotion.minimumSubtotal)
  ) {
    result.message = `Coupon requires a $${Number(promotion.minimumSubtotal).toFixed(2)} minimum subtotal.`
    return result
  }

  // Discount math (shared with the checkout via computePromotionDiscount).
  const ptype = String(promotion.promotionType || "").toLowerCase()
  if (ptype === "bogo") {
    result.valid = true
    result.discount = 0
    result.message = "Buy-one-get-one coupon applied — discount computed at checkout."
    return result
  }
  if (ptype === "set_price" && (!lines || lines.length === 0)) {
    result.valid = true
    result.discount = 0
    result.message = "Set-price promotion — priced per item at the checkout."
    return result
  }

  const discount = computePromotionDiscount(promotion, basis, eligibleLines)

  if (discount <= 0) {
    result.valid = true
    result.discount = 0
    result.message = "Coupon applied but no discount could be computed."
    return result
  }

  result.valid = true
  result.discount = Math.max(0, discount)
  return result
}

// ============================================================================
// helpers
// ============================================================================

async function attachTargets(client: QueryClient, rows: any[]): Promise<void> {
  const ids = rows.map((r) => r.id).filter(Boolean)
  if (!ids.length) return
  const t = await client.query(
    `SELECT promotion_id, target_kind, target_id, target_label FROM public.commerce_promotion_targets
     WHERE promotion_id = ANY($1::uuid[]) ORDER BY target_kind, target_label`,
    [ids],
  )
  const byPromo = new Map<string, PromotionTarget[]>()
  for (const row of t.rows) {
    const arr = byPromo.get(String(row.promotion_id)) || []
    arr.push({
      kind: row.target_kind === "taxonomy" ? "taxonomy" : "product",
      id: String(row.target_id),
      label: row.target_label ?? null,
    })
    byPromo.set(String(row.promotion_id), arr)
  }
  for (const r of rows) r.targets = byPromo.get(String(r.id)) || []
}

async function replaceTargets(
  client: QueryClient,
  tenant: string,
  promotionId: string,
  targets: PromotionTarget[],
): Promise<void> {
  await client.query(
    `DELETE FROM public.commerce_promotion_targets WHERE promotion_id = $1 AND tenant_id = $2`,
    [promotionId, tenant],
  )
  const seen = new Set<string>()
  for (const t of targets) {
    const kind = t.kind === "taxonomy" ? "taxonomy" : "product"
    const id = String(t.id || "").trim()
    if (!id) continue
    const key = `${kind}:${id}`
    if (seen.has(key)) continue
    seen.add(key)
    await client.query(
      `INSERT INTO public.commerce_promotion_targets (tenant_id, promotion_id, target_kind, target_id, target_label)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenant, promotionId, kind, id, t.label ?? null],
    )
  }
}

function rowToPromotion(r: any): Promotion {
  return {
    id: r.id,
    tenantId: r.tenantId,
    code: r.code,
    name: r.name,
    promotionType: r.promotionType,
    value: r.value != null ? Number(r.value) : null,
    minimumSubtotal: r.minimumSubtotal != null ? Number(r.minimumSubtotal) : null,
    maximumDiscount: r.maximumDiscount != null ? Number(r.maximumDiscount) : null,
    startAt: r.startAt,
    endAt: r.endAt,
    usageLimit: r.usageLimit != null ? Number(r.usageLimit) : null,
    usageCount: Number(r.usageCount || 0),
    active: r.active === true,
    isAutomatic: r.isAutomatic === true,
    targets: Array.isArray(r.targets) ? r.targets : [],
    rules: typeof r.rules === "string" ? safeJson(r.rules) : (r.rules || {}),
    actions: typeof r.actions === "string" ? safeJson(r.actions) : (r.actions || {}),
    couponCount: Number(r.couponCount || 0),
  }
}

function rowToCoupon(r: any): Coupon {
  return {
    id: r.id,
    tenantId: r.tenantId,
    promotionId: r.promotionId || null,
    code: r.code,
    customerId: r.customerId || null,
    usageLimit: r.usageLimit != null ? Number(r.usageLimit) : null,
    usageCount: Number(r.usageCount || 0),
    status: r.status,
    validFrom: r.validFrom,
    validTo: r.validTo,
    promotion: r.promotion
      ? {
          id: r.promotion.id,
          name: r.promotion.name,
          code: r.promotion.code,
          promotionType: r.promotion.promotionType,
          value: r.promotion.value != null ? Number(r.promotion.value) : null,
        }
      : null,
  }
}

function safeJson(s: string): any {
  try {
    return JSON.parse(s)
  } catch {
    return {}
  }
}

function revalidateShopPaths() {
  try {
    revalidatePath("/shop", "page")
    revalidatePath("/shop/[...slug]", "page")
    revalidatePath("/shop/bag", "page")
    revalidatePath("/offers", "page")
    revalidateTag("catalog", { expire: 0 })
    revalidatePath("/product/[id]", "page")
    revalidatePath("/seller/[slug]", "page")
    revalidatePath("/", "page")
  } catch {
    /* non-fatal during build */
  }
}
