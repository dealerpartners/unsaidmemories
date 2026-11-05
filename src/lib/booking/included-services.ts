// The "ALL SERVICES INCLUDE" owner schedule — the services every grooming
// visit already includes at no extra charge. The display copy lives in the
// booking flow (INCLUDED_IN_EVERY_VISIT) and the service menu
// (ALL_SERVICES_INCLUDE); this module is its machine-readable mirror for
// catalog-truth enforcement.
//
// The rule: a service included in every visit can never also be SOLD as a
// booking add-on. service_items carries "Nail Trim" as a priced row because
// it is also a standalone walk-in service (its own NAIL & PAW CARE category
// on the services page, and the flow itself advertises walk-in nail trims) —
// but inside a booking it must not be offered, or charged, as an add-on:
// the same screen tells the customer it is already included.
//
// Consumers: the booking menu route (hides matching add-ons) and
// priceCart() (never charges for them). The standalone services listing
// reads the catalog directly and is deliberately unaffected — the walk-in
// price stays published there.
const INCLUDED_SERVICE_NAMES = new Set(
  [
    "Deep-cleaning shampoo",
    "Blow-dry",
    "15-min brush out",
    "Ear cleaning",
    "Nail trim",
    "Scented spritz",
  ].map((n) => n.trim().toLowerCase()),
)

export function isIncludedInEveryVisit(name: string | null | undefined): boolean {
  if (!name) return false
  return INCLUDED_SERVICE_NAMES.has(String(name).trim().toLowerCase())
}
