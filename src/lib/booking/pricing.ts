import { repo } from "@/lib/repo"
import { withPg, TENANT_ID } from "@/lib/crm/enterprise"
import { getServicesRatePct } from "@/lib/tax/headline-rate"
import { bookingTaxCents } from "@/lib/booking/tax-math"
import { isIncludedInEveryVisit } from "@/lib/booking/included-services"

// ---------------------------------------------------------------------------
// Booking pricing — the SERVER is the only pricing authority.
//
// The client's cart is a list of {id, qty} pairs plus the pet's size tier.
// Everything money-related is recomposed here from the live service_items
// table and the salon's configured tax rate — the amounts the customer saw
// are re-verified before a booking is ever created or charged.
// ---------------------------------------------------------------------------

export type SizeTier = "SMALL" | "MEDIUM" | "LARGE" | "XLARGE"

export type CartLineInput = { id: string; qty: number }

export type PricedLine = {
  id: string
  name: string
  category: string
  isPackage: boolean
  isTreatment: boolean
  /** true for XL treatments — priced at the salon, $0 online */
  customQuote: boolean
  unitCents: number
  qty: number
  lineCents: number
}

export type PricedCart = {
  lines: PricedLine[]
  packageLine: PricedLine | null
  addonLines: PricedLine[]
  treatmentLine: PricedLine | null
  subtotalCents: number
  taxCents: number
  totalCents: number
  taxRatePercent: number
  sizeTier: SizeTier
}

// Weight (lbs) → size tier — the pounds menu from the pet step. The salon's
// packages price by these four tiers.
export function sizeTierFromWeight(weightLbs: number): SizeTier {
  if (weightLbs <= 20) return "SMALL"
  if (weightLbs <= 40) return "MEDIUM"
  if (weightLbs <= 60) return "LARGE"
  return "XLARGE"
}

export function weightRangeLabel(tier: SizeTier): string {
  switch (tier) {
    case "SMALL": return "0–20 lbs"
    case "MEDIUM": return "21–40 lbs"
    case "LARGE": return "41–60 lbs"
    case "XLARGE": return "61+ lbs"
  }
}

// The salon's tax rate comes from the SAME source the register prices
// from: the tenant's acct_tax_rules (Settings → Business Profile edits
// the headline rate there; jurisdiction detail lives in Settings →
// Taxes). Bookings are services, so this is the services rate — the
// sum of the tenant's active auto-calc rules that are not goods-only,
// exactly the split getPosTaxRates applies at the register. A tenant
// with no tax rules charges no tax (0) — there is no hardcoded rate.
let taxCache: { value: number; at: number } | null = null
export async function getTaxRatePercent(): Promise<number> {
  if (taxCache && Date.now() - taxCache.at < 60_000) return taxCache.value
  let pct = 0
  try {
    const servicesRate = await withPg((client) => getServicesRatePct(client, TENANT_ID()))
    if (servicesRate !== null && Number.isFinite(servicesRate) && servicesRate >= 0 && servicesRate < 50) {
      pct = servicesRate
    }
  } catch { /* tax-rules read is best-effort; no rules → no tax */ }
  taxCache = { value: pct, at: Date.now() }
  return pct
}

type ServiceItemRow = {
  id: string
  category: string | null
  name: string
  price: string | null
  smallPrice: string | null
  mediumPrice: string | null
  largePrice: string | null
  xlargePrice: string | null
  isPackage: boolean | null
  isTreatment: boolean | null
  treatmentNote: string | null
  memberPrice: string | null
  memberSmallPrice: string | null
  memberMediumPrice: string | null
  memberLargePrice: string | null
  memberXlargePrice: string | null
  visible: boolean | null
}

// "$15 – $35" / "$115" / "115" → cents (takes the FIRST number in the string;
// range-priced add-ons book at their entry price, confirmed in person).
export function priceStringToCents(p: string | null | undefined): number | null {
  if (!p) return null
  const m = String(p).replace(/,/g, "").match(/(\d+(?:\.\d+)?)/)
  if (!m) return null
  const v = parseFloat(m[1])
  if (!Number.isFinite(v) || v <= 0) return null
  return Math.round(v * 100)
}

export function centsToDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export async function listBookableServiceItems(): Promise<ServiceItemRow[]> {
  const rows = (await repo.list("serviceItems")) as ServiceItemRow[]
  return (rows || [])
    .filter((r) => r && r.id && r.name && r.visible !== false)
    .map((r) => ({ ...r, isPackage: !!r.isPackage }))
}

// The unit price for one service item at a size tier (packages and premium
// treatments tier-price; add-ons are flat).
export function unitCentsFor(item: ServiceItemRow, tier: SizeTier): number | null {
  if (item.isPackage || item.isTreatment) {
    switch (tier) {
      case "SMALL": return priceStringToCents(item.smallPrice) ?? priceStringToCents(item.price)
      case "MEDIUM": return priceStringToCents(item.mediumPrice) ?? priceStringToCents(item.price)
      case "LARGE": return priceStringToCents(item.largePrice) ?? priceStringToCents(item.price)
      case "XLARGE": return priceStringToCents(item.xlargePrice) ?? priceStringToCents(item.price)
    }
  }
  return priceStringToCents(item.price)
}

// The PAWfection Bath Club member unit price at a size tier. NULL when the
// catalog row carries no member price — the caller hides the member line.
export function memberUnitCentsFor(item: ServiceItemRow, tier: SizeTier): number | null {
  if (item.isPackage || item.isTreatment) {
    switch (tier) {
      case "SMALL": return priceStringToCents(item.memberSmallPrice) ?? priceStringToCents(item.memberPrice)
      case "MEDIUM": return priceStringToCents(item.memberMediumPrice) ?? priceStringToCents(item.memberPrice)
      case "LARGE": return priceStringToCents(item.memberLargePrice) ?? priceStringToCents(item.memberPrice)
      case "XLARGE": return priceStringToCents(item.memberXlargePrice) ?? priceStringToCents(item.memberPrice)
    }
  }
  return priceStringToCents(item.memberPrice)
}

// Re-price a client-submitted cart from the live catalog. Returns null lines
// for ids that no longer exist / aren't priced — the caller rejects the
// checkout if a required package is missing.
//
// `member` prices the cart at the PAWfection Bath Club member ladder when
// the booker holds an ACTIVE membership — the same catalog columns the
// service menu shows, applied at the register.
export async function priceCart(
  cart: CartLineInput[],
  weightLbs: number,
  opts: { member?: boolean } = {},
): Promise<{ cart: PricedCart; unknownIds: string[] }> {
  const [items, taxRatePercent] = await Promise.all([listBookableServiceItems(), getTaxRatePercent()])
  const byId = new Map(items.map((i) => [i.id, i]))
  const sizeTier = sizeTierFromWeight(weightLbs)
  const priceOf = opts.member
    ? (item: ServiceItemRow) => memberUnitCentsFor(item, sizeTier) ?? unitCentsFor(item, sizeTier)
    : (item: ServiceItemRow) => unitCentsFor(item, sizeTier)

  const lines: PricedLine[] = []
  const unknownIds: string[] = []
  let treatmentCount = 0

  for (const input of cart) {
    const item = byId.get(String(input.id))
    if (!item) { unknownIds.push(String(input.id)); continue }
    const isTreatment = !!item.isTreatment
    // Included in every visit (owner schedule — see included-services.ts):
    // never a chargeable add-on line, even if a client submits its id.
    // Skipped like the unpriced header rows below; the standalone walk-in
    // listing is a different surface and keeps its price.
    if (!item.isPackage && !isTreatment && isIncludedInEveryVisit(item.name)) continue
    // Premium Treatments: at most ONE per booking.
    if (isTreatment) {
      if (treatmentCount >= 1) continue
      treatmentCount++
    }
    let unit = priceOf(item)
    // XL treatments carry no online price — custom quote, $0 toward the
    // online total, priced and confirmed at the salon.
    const customQuote = isTreatment && unit == null
    if (customQuote) unit = 0
    if (unit == null) continue // header rows (Haircuts, Styling) are never bookable
    const qty = Math.max(1, Math.min(10, Math.floor(input.qty || 1)))
    lines.push({
      id: item.id,
      name: item.name,
      category: item.category || "Services",
      isPackage: !!item.isPackage,
      isTreatment,
      customQuote,
      unitCents: unit,
      qty,
      lineCents: customQuote ? 0 : unit * qty,
    })
  }

  // Exactly one package may be selected; treatments ride on top (max 1,
  // enforced above); add-ons are open.
  const packageLine = lines.find((l) => l.isPackage) || null
  const addonLines = lines.filter((l) => !l.isPackage && !l.isTreatment)
  const treatmentLine = lines.find((l) => l.isTreatment) || null

  const subtotalCents = lines.reduce((sum, l) => sum + l.lineCents, 0)
  // The one tax formula (tax-math.ts) — identical to the charge the
  // checkout route computes and the estimate the wizard displays.
  const taxCents = bookingTaxCents(subtotalCents, taxRatePercent)
  const totalCents = subtotalCents + taxCents

  return {
    cart: {
      lines,
      packageLine,
      addonLines,
      treatmentLine,
      subtotalCents,
      taxCents,
      totalCents,
      taxRatePercent,
      sizeTier,
    },
    unknownIds,
  }
}
