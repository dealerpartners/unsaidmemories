// ---------------------------------------------------------------------------
// THE booking tax formula — one definition, used by every surface that
// computes or previews a booking's tax:
//
//   · src/lib/booking/pricing.ts (priceCart — the server's priced cart)
//   · src/app/api/bookings/checkout (the charge itself, incl. the
//     points-reconciliation recompute)
//   · the booking wizard's summaries (the "Estimated tax" the customer
//     sees from the Service step onward)
//
// Tax is charged on the (discounted) subtotal and ADDED on top — the
// opposite of the shop's tax-inclusive model; the two never mix. The
// rate itself comes from pricing.ts's getTaxRatePercent (the tenant's
// acct_tax_rules services rate — the same rate the register uses);
// this module owns only the arithmetic so the wizard's estimate and
// the amount Stripe charges can never drift by a rounding rule.
//
// Pure and import-free on purpose: client components import it without
// pulling server modules into the browser bundle.
// ---------------------------------------------------------------------------

export function bookingTaxCents(subtotalCents: number, taxRatePercent: number): number {
  return Math.round((subtotalCents * taxRatePercent) / 100)
}
