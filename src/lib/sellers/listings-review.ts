// ---------------------------------------------------------------------------
// sellers/listings-review.ts — the shared B1/B2 vocabulary.
//
// B2 Suppressions' causes are the admin tree's five leaves, verbatim
// (admin-portal-tree §B2): Policy violations · IP complaints · Safety
// recalls · Restricted products · Counterfeit flags. A suppression
// written from either admin seat (the listings queue or catalog review)
// stamps the chosen cause — plus the reviewer's detail when given —
// into the record's reason field, because the data graph's contract is
// that the seller SEES the reason while the customer sees the listing
// hidden.
// ---------------------------------------------------------------------------

export const SUPPRESSION_CATEGORIES = [
  "Policy violation",
  "IP complaint",
  "Safety recall",
  "Restricted product",
  "Counterfeit flag",
] as const

export type SuppressionCategory = (typeof SUPPRESSION_CATEGORIES)[number]

export function isSuppressionCategory(v: string): v is SuppressionCategory {
  return (SUPPRESSION_CATEGORIES as readonly string[]).includes(v)
}

/** The stored reason: the tree's cause, with the reviewer's detail appended. */
export function composeSuppressionReason(category: string, detail: string): string {
  return detail ? `${category} — ${detail}` : category
}
