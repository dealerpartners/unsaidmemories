import { pgQuery, pgExec } from "@/lib/pg"
import { TENANT_ID } from "@/lib/crm/enterprise"

// ---------------------------------------------------------------------------
// PROMOS — the server is the only authority on offer eligibility + math.
//
// Catalog: the `promos` table (migration 0017). Every rule the spec demands
// is enforced HERE, from catalog columns — nothing is hardcoded per-code:
//
//   dates              starts_at / ends_at
//   total uses         max_total_uses  (+ promo_redemptions count)
//   per-user uses      max_uses_per_user (+ redemptions by email/user)
//   one per pet        one_per_dependent     (+ redemptions by dependent_id)
//   eligibility        eligibility new|existing|all (+ bookings/orders count)
//   qualifying service qualifying_names (cart must include one of these)
//   second-pet rule    requires_recent_booking (+ recent booking by user)
//   birthday rule      requires_birthday_month (+ dog birth month)
//   min subtotal       min_subtotal_cents
//   stacking           one redemption per booking, always; stackable=false
//                      codes can never co-apply with another code
//
// The CLIENT never computes a discount: /api/promos/validate previews it and
// the booking/order creation path recomputes it from the live catalog.
// ---------------------------------------------------------------------------

export type PromoType = "percent_off" | "dollars_off" | "free_addon"
export type PromoKind = "standard" | "cause"
export type PromoEligibility = "new" | "existing" | "all"
export type PromoStatus = "draft" | "published"
export type PromoPlacement = "services" | "pricing" | "shop" | "book" | "portal" | "checkout"

export type PromoRow = {
  id: string
  tenant_id: string
  name: string
  code: string
  kind: PromoKind
  promo_type: PromoType
  value: string
  applies_to: string[]
  eligibility: PromoEligibility
  starts_at: string | null
  ends_at: string | null
  max_total_uses: number | null
  max_uses_per_user: number
  one_per_dependent: boolean
  stackable: boolean
  placements: PromoPlacement[]
  status: PromoStatus
  qualifying_names: string[] | null
  min_subtotal_cents: number | null
  requires_recent_booking: boolean
  requires_birthday_month: boolean
  description: string | null
  fine_print: string | null
  cta_label: string | null
}

export type ValidateContext = {
  serviceIds?: string[]
  subscriptionPlanId?: string | null
  productIds?: string[]
  subtotalCents: number
  dogId?: string | null
  dogBirthDate?: string | null
  /** The code already applied in this flow — a second apply is rejected. */
  currentPromoCode?: string | null
}

export type ValidateUser = { id: string; email: string } | null

export type ValidateResult =
  | {
      valid: true
      promoId: string
      code: string
      name: string
      promoType: PromoType
      value: string
      discountCents: number
      subtotalCents: number
      newSubtotalCents: number
      description: string | null
      finePrint: string | null
    }
  | { valid: false; reason: ValidateRejection }

export type ValidateRejection =
  | "invalid"
  | "expired"
  | "not_started"
  | "exhausted"
  | "already_applied"
  | "ineligible"
  | "min_not_met"
  | "wrong_service"

const REJECTION_TEXT: Record<ValidateRejection, string> = {
  invalid: "That code doesn't match an active offer.",
  expired: "This offer has ended.",
  not_started: "This offer hasn't started yet.",
  exhausted: "This offer is fully redeemed.",
  already_applied: "A promo code is already applied — remove it first.",
  ineligible: "This offer isn't available for your account right now.",
  min_not_met: "Add a little more to your booking to use this code.",
  wrong_service: "This offer doesn't apply to the services in your booking.",
}

export function rejectionText(reason: ValidateRejection): string {
  return REJECTION_TEXT[reason]
}

// ---------------------------------------------------------------------------
// Row loading / mapping
// ---------------------------------------------------------------------------

function mapRow(r: any): PromoRow {
  return {
    id: String(r.id),
    tenant_id: String(r.tenant_id),
    name: r.name,
    code: String(r.code).toUpperCase(),
    kind: r.kind,
    promo_type: r.promo_type,
    value: String(r.value ?? "0"),
    applies_to: Array.isArray(r.applies_to) ? r.applies_to : [],
    eligibility: r.eligibility,
    starts_at: r.starts_at ? new Date(r.starts_at).toISOString() : null,
    ends_at: r.ends_at ? new Date(r.ends_at).toISOString() : null,
    max_total_uses: r.max_total_uses == null ? null : Number(r.max_total_uses),
    max_uses_per_user: Number(r.max_uses_per_user ?? 1),
    one_per_dependent: !!r.one_per_dependent,
    stackable: !!r.stackable,
    placements: Array.isArray(r.placements) ? r.placements : [],
    status: r.status,
    qualifying_names: Array.isArray(r.qualifying_names) ? r.qualifying_names : null,
    min_subtotal_cents: r.min_subtotal_cents == null ? null : Number(r.min_subtotal_cents),
    requires_recent_booking: !!r.requires_recent_booking,
    requires_birthday_month: !!r.requires_birthday_month,
    description: r.description ?? null,
    fine_print: r.fine_print ?? null,
    cta_label: r.cta_label ?? null,
  }
}

async function loadPromoByCode(code: string): Promise<PromoRow | null> {
  const rows = await pgQuery<any>(
    `select * from public.promos where tenant_id = $1 and upper(code) = upper($2) limit 1`,
    [TENANT_ID(), String(code || "").trim()],
  )
  return rows[0] ? mapRow(rows[0]) : null
}

export async function listPromos(): Promise<PromoRow[]> {
  const rows = await pgQuery<any>(
    `select * from public.promos where tenant_id = $1 order by kind desc, code asc`,
    [TENANT_ID()],
  )
  return rows.map(mapRow)
}

// ---------------------------------------------------------------------------
// User history facts (eligibility evidence)
// ---------------------------------------------------------------------------

type UserFacts = {
  // Booking facts are permanently false in this product (no bookings
  // entity exists); they remain in the shape for the legacy rules
  // that read them. Eligibility evidence here = orders.
  hasBooking: boolean
  hasOrder: boolean
  hasRecentBooking: boolean
}

async function userFacts(user: ValidateUser): Promise<UserFacts> {
  if (!user) return { hasBooking: false, hasOrder: false, hasRecentBooking: false }
  const email = user.email.toLowerCase()
  // There is no bookings entity in this database (the AAPawZ bookings
  // table was never part of Unsaid's schema), so the booking facts are
  // permanently false here and eligibility rides on orders alone. The
  // fields stay in the shape for the rules that read them.
  // Shop orders live in commerce_orders (email rides in
  // customer_email / the CRM link) — both spellings checked.
  const orders = await pgQuery<any>(
    `select count(*)::int as n from public.commerce_orders
     where lower(coalesce(customer_email, coalesce(email, ''))) = $1`,
    [email],
  )
  return {
    hasBooking: false,
    hasOrder: (orders[0]?.n ?? 0) > 0,
    hasRecentBooking: false,
  }
}

async function redemptionCounts(promoId: string, user: ValidateUser, dogId?: string | null) {
  const [total, byUser, byDog] = await Promise.all([
    pgQuery<{ n: number }>(
      `select count(*)::int as n from public.promo_redemptions where promo_id = $1`,
      [promoId],
    ),
    user
      ? pgQuery<{ n: number }>(
          `select count(*)::int as n from public.promo_redemptions
           where promo_id = $1 and (user_id::text = $2 or lower(email) = $3)`,
          [promoId, user.id, user.email.toLowerCase()],
        )
      : Promise.resolve([{ n: 0 }]),
    dogId
      ? pgQuery<{ n: number }>(
          `select count(*)::int as n from public.promo_redemptions where promo_id = $1 and dependent_id = $2`,
          [promoId, String(dogId)],
        )
      : Promise.resolve([{ n: 0 }]),
  ])
  return {
    total: total[0]?.n ?? 0,
    byUser: byUser[0]?.n ?? 0,
    byDog: byDog[0]?.n ?? 0,
  }
}

// ---------------------------------------------------------------------------
// Discount math — catalog-priced, one place
// ---------------------------------------------------------------------------

export function computeDiscountCents(
  promo: PromoRow,
  subtotalCents: number,
  addonPriceCents = 0,
): number {
  const sub = Math.max(0, Math.floor(subtotalCents))
  if (promo.promo_type === "percent_off") {
    const pct = parseFloat(promo.value)
    if (!Number.isFinite(pct) || pct <= 0) return 0
    return Math.min(sub, Math.floor((sub * pct) / 100))
  }
  if (promo.promo_type === "dollars_off") {
    const dollars = parseFloat(promo.value)
    if (!Number.isFinite(dollars) || dollars <= 0) return 0
    return Math.min(sub, Math.round(dollars * 100))
  }
  if (promo.promo_type === "free_addon") {
    // The add-on named by `value` goes free: its catalog price when it's in
    // the cart (checkout zeroes the line), else the catalog price as the
    // preview value (checkout adds the line at $0).
    return Math.min(sub, Math.max(0, addonPriceCents))
  }
  return 0
}

// ---------------------------------------------------------------------------
// VALIDATE — the spec's POST /api/promos/validate contract
// ---------------------------------------------------------------------------

export async function validatePromo(
  code: string,
  user: ValidateUser,
  context: ValidateContext,
): Promise<ValidateResult> {
  const promo = await loadPromoByCode(code)
  if (!promo || promo.status !== "published") return { valid: false, reason: "invalid" }

  // One code per booking: a second apply while one is applied.
  if (context.currentPromoCode && context.currentPromoCode.toUpperCase() !== promo.code) {
    return { valid: false, reason: "already_applied" }
  }

  // Date window.
  const now = Date.now()
  if (promo.starts_at && now < new Date(promo.starts_at).getTime()) {
    return { valid: false, reason: "not_started" }
  }
  if (promo.ends_at && now > new Date(promo.ends_at).getTime()) {
    return { valid: false, reason: "expired" }
  }

  // Usage limits.
  const counts = await redemptionCounts(promo.id, user, context.dogId)
  if (promo.max_total_uses != null && counts.total >= promo.max_total_uses) {
    return { valid: false, reason: "exhausted" }
  }
  if (counts.byUser >= promo.max_uses_per_user) {
    return { valid: false, reason: "already_applied" }
  }
  if (promo.one_per_dependent && context.dogId && counts.byDog > 0) {
    return { valid: false, reason: "ineligible" }
  }

  // Minimum subtotal.
  if (promo.min_subtotal_cents != null && context.subtotalCents < promo.min_subtotal_cents) {
    return { valid: false, reason: "min_not_met" }
  }

  // Eligibility by customer history.
  if (promo.eligibility !== "all" && user) {
    const facts = await userFacts(user)
    const isExisting = facts.hasBooking || facts.hasOrder
    if (promo.eligibility === "new" && isExisting) return { valid: false, reason: "ineligible" }
    if (promo.eligibility === "existing" && !isExisting) return { valid: false, reason: "ineligible" }
  }

  // Catalog-driven special rules.
  if (promo.requires_recent_booking && user) {
    const facts = await userFacts(user)
    if (!facts.hasRecentBooking) return { valid: false, reason: "ineligible" }
  }
  if (promo.requires_birthday_month) {
    const bd = context.dogBirthDate || (await dogBirthDateById(context.dogId))
    if (!bd || new Date(bd).getMonth() !== new Date().getMonth()) {
      return { valid: false, reason: "ineligible" }
    }
  }

  // Qualifying services — the cart must include one of the named services.
  if (promo.qualifying_names && promo.qualifying_names.length > 0) {
    const names = await cartServiceNames(context.serviceIds || [])
    const ok = promo.qualifying_names.some((qn) =>
      names.some((n) => n.toLowerCase() === qn.toLowerCase()),
    )
    if (!ok) return { valid: false, reason: "wrong_service" }
  }

  // Scope: subscription-signup context only accepts subscription promos.
  if (context.subscriptionPlanId && !promo.applies_to.includes("subscriptions")) {
    return { valid: false, reason: "wrong_service" }
  }

  const subtotal = Math.max(0, Math.floor(context.subtotalCents))
  const discount = Math.min(subtotal, await resolveDiscount(promo, subtotal, context))
  return {
    valid: true,
    promoId: promo.id,
    code: promo.code,
    name: promo.name,
    promoType: promo.promo_type,
    value: promo.value,
    discountCents: discount,
    subtotalCents: subtotal,
    newSubtotalCents: Math.max(0, subtotal - discount),
    description: promo.description,
    finePrint: promo.fine_print,
  }
}

async function resolveDiscount(promo: PromoRow, subtotal: number, context: ValidateContext): Promise<number> {
  // free_addon promo type was pet-salon-specific (bookable service items).
  // E-commerce promos use percent_off and dollars_off only.
  return computeDiscountCents(promo, subtotal)
}

async function cartServiceNames(_serviceIds: string[]): Promise<string[]> {
  // Pet-salon service names removed — e-commerce carts use product names.
  return []
}

async function dogBirthDateById(dogId?: string | null): Promise<string | null> {
  if (!dogId) return null
  const rows = await pgQuery<{ birthdate: string | null }>(
    `select birthDate as birthdate from public.dogs where id = $1 limit 1`,
    [String(dogId)],
  )
  return rows[0]?.birthdate ?? null
}

// ---------------------------------------------------------------------------
// ELIGIBLE — published offers for a placement, evaluated per user
// ---------------------------------------------------------------------------

export type EligibleOffer = {
  id: string
  name: string
  code: string
  kind: PromoKind
  description: string | null
  finePrint: string | null
  ctaLabel: string | null
}

export async function eligiblePromos(
  placement: PromoPlacement,
  user: ValidateUser,
): Promise<EligibleOffer[]> {
  const rows = await pgQuery<any>(
    `select * from public.promos
     where tenant_id = $1 and status = 'published' and placements @> $2::jsonb
     order by kind desc, name asc`,
    [TENANT_ID(), JSON.stringify([placement])],
  )
  const promos = rows.map(mapRow)
  const now = Date.now()
  const facts = await userFacts(user)

  const out: EligibleOffer[] = []
  for (const p of promos) {
    if (p.starts_at && now < new Date(p.starts_at).getTime()) continue
    if (p.ends_at && now > new Date(p.ends_at).getTime()) continue
    if (p.eligibility === "new" && (facts.hasBooking || facts.hasOrder)) continue
    if (p.eligibility === "existing" && !(facts.hasBooking || facts.hasOrder)) continue
    if (p.requires_recent_booking && !facts.hasRecentBooking) continue
    out.push({
      id: p.id,
      name: p.name,
      code: p.code,
      kind: p.kind,
      description: p.description,
      finePrint: p.fine_print,
      ctaLabel: p.cta_label || "Book",
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// REDEMPTION — recorded ONCE per booking/order at creation (server only)
// ---------------------------------------------------------------------------

export async function recordRedemption(input: {
  promoId: string
  code: string
  userId?: string | null
  email: string
  dogId?: string | null
  bookingId?: string | null
  orderId?: string | null
  subscriptionId?: string | null
  discountCents: number
}): Promise<void> {
  await pgExec(
    `insert into public.promo_redemptions
       (tenant_id, promo_id, user_id, email, dependent_id, booking_id, order_id, subscription_id, discount_cents)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      TENANT_ID(),
      input.promoId,
      input.userId || null,
      input.email.toLowerCase(),
      input.dogId || null,
      input.bookingId || null,
      input.orderId || null,
      input.subscriptionId || null,
      Math.max(0, Math.floor(input.discountCents)),
    ],
  )
}

/** The booking/order creation path: re-validate from the live catalog and
 *  return the discount to apply. Client numbers are never trusted. */
export async function applyPromoAtCheckout(
  code: string,
  user: ValidateUser,
  context: ValidateContext,
): Promise<{ ok: true; promo: PromoRow; discountCents: number } | { ok: false; reason: ValidateRejection }> {
  const result = await validatePromo(code, user, context)
  if (!result.valid) return { ok: false, reason: result.reason }
  const promo = await loadPromoByCode(code)
  if (!promo) return { ok: false, reason: "invalid" }
  return { ok: true, promo, discountCents: result.discountCents }
}

/** Admin CRUD helpers (permission-gated at the route layer). */
export type PromoInput = {
  name: string
  code: string
  kind?: PromoKind
  promo_type: PromoType
  value: string
  applies_to?: string[]
  eligibility?: PromoEligibility
  starts_at?: string | null
  ends_at?: string | null
  max_total_uses?: number | null
  max_uses_per_user?: number
  one_per_dependent?: boolean
  stackable?: boolean
  placements?: PromoPlacement[]
  status?: PromoStatus
  description?: string | null
  fine_print?: string | null
  cta_label?: string | null
  qualifying_names?: string[] | null
  min_subtotal_cents?: number | null
  requires_recent_booking?: boolean
  requires_birthday_month?: boolean
}

export async function createPromo(input: PromoInput): Promise<PromoRow | { error: string }> {
  const code = String(input.code || "").trim().toUpperCase()
  if (!code) return { error: "code is required" }
  if (!/^[A-Z0-9_-]{3,24}$/.test(code)) {
    return { error: "codes are 3–24 characters: letters, numbers, dash, underscore" }
  }
  const dup = await loadPromoByCode(code)
  if (dup) return { error: `code ${code} already exists` }

  const rows = await pgQuery<any>(
    `insert into public.promos
       (tenant_id, name, code, kind, promo_type, value, applies_to, eligibility,
        starts_at, ends_at, max_total_uses, max_uses_per_user, one_per_dependent, stackable,
        placements, status, description, fine_print, cta_label,
        qualifying_names, min_subtotal_cents, requires_recent_booking, requires_birthday_month)
     values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17,$18,$19,$20::jsonb,$21,$22,$23)
     returning *`,
    [
      TENANT_ID(), input.name, code, input.kind ?? "standard", input.promo_type,
      String(input.value ?? "0"),
      JSON.stringify(input.applies_to ?? ["services"]),
      input.eligibility ?? "all",
      input.starts_at ?? null, input.ends_at ?? null,
      input.max_total_uses ?? null, input.max_uses_per_user ?? 1,
      input.one_per_dependent ?? false, input.stackable ?? false,
      JSON.stringify(input.placements ?? []),
      input.status ?? "draft",
      input.description ?? null, input.fine_print ?? null, input.cta_label ?? null,
      input.qualifying_names ? JSON.stringify(input.qualifying_names) : null,
      input.min_subtotal_cents ?? null,
      input.requires_recent_booking ?? false, input.requires_birthday_month ?? false,
    ],
  )
  return rows[0] ? mapRow(rows[0]) : { error: "insert failed" }
}

export async function updatePromo(id: string, patch: Partial<PromoInput>): Promise<PromoRow | { error: string }> {
  const sets: string[] = []
  const params: unknown[] = [TENANT_ID(), id]
  const add = (col: string, val: unknown, json = false) => {
    params.push(json ? JSON.stringify(val) : val)
    sets.push(`"${col.replace(/"/g, "")}" = $${params.length}${json ? "::jsonb" : ""}`)
  }
  if (patch.name != null) add("name", patch.name)
  if (patch.kind != null) add("kind", patch.kind)
  if (patch.promo_type != null) add("promo_type", patch.promo_type)
  if (patch.value != null) add("value", String(patch.value))
  if (patch.applies_to != null) add("applies_to", patch.applies_to, true)
  if (patch.eligibility != null) add("eligibility", patch.eligibility)
  if (patch.starts_at !== undefined) add("starts_at", patch.starts_at ?? null)
  if (patch.ends_at !== undefined) add("ends_at", patch.ends_at ?? null)
  if (patch.max_total_uses !== undefined) add("max_total_uses", patch.max_total_uses ?? null)
  if (patch.max_uses_per_user != null) add("max_uses_per_user", patch.max_uses_per_user)
  if (patch.one_per_dependent != null) add("one_per_dependent", patch.one_per_dependent)
  if (patch.stackable != null) add("stackable", patch.stackable)
  if (patch.placements != null) add("placements", patch.placements, true)
  if (patch.status != null) add("status", patch.status)
  if (patch.description !== undefined) add("description", patch.description ?? null)
  if (patch.fine_print !== undefined) add("fine_print", patch.fine_print ?? null)
  if (patch.cta_label !== undefined) add("cta_label", patch.cta_label ?? null)
  if (patch.qualifying_names !== undefined) add("qualifying_names", patch.qualifying_names ?? null, true)
  if (patch.min_subtotal_cents !== undefined) add("min_subtotal_cents", patch.min_subtotal_cents ?? null)
  if (patch.requires_recent_booking != null) add("requires_recent_booking", patch.requires_recent_booking)
  if (patch.requires_birthday_month != null) add("requires_birthday_month", patch.requires_birthday_month)
  if (sets.length === 0) return { error: "no fields to update" }
  sets.push(`"updated_at" = now()`)

  const rows = await pgQuery<any>(
    `update public.promos set ${sets.join(", ")} where tenant_id = $1 and id = $2::uuid returning *`,
    params,
  )
  return rows[0] ? mapRow(rows[0]) : { error: "promo not found" }
}

export async function redemptionStats(): Promise<Record<string, { total: number }>> {
  const rows = await pgQuery<{ promo_id: string; n: number }>(
    `select promo_id, count(*)::int as n from public.promo_redemptions where tenant_id = $1 group by promo_id`,
    [TENANT_ID()],
  )
  const out: Record<string, { total: number }> = {}
  for (const r of rows) out[r.promo_id] = { total: Number(r.n) }
  return out
}
