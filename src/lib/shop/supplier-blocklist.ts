// Shared supplier blocklist — R5: supplier names NEVER appear in public UI.
// Previously duplicated in pdp-recs.tsx, product-detail.tsx, pdp-owner-design.tsx;
// this is the single source of truth. Import it anywhere a brand, vendor, or
// eyebrow label is rendered publicly.

const SUPPLIER_BLOCKLIST = [
  "cj dropshipping",
  "cj",
  "cjdropshipping",
  "aliexpress",
  "alibaba",
  "dhgate",
  "supplier",
  "dropship",
]

/** True if the value is (or contains) a known supplier/fulfillment name. Case-insensitive. */
export function isSupplierName(value: string | null | undefined): boolean {
  if (!value) return false
  const v = value.toLowerCase().trim()
  return SUPPLIER_BLOCKLIST.some((s) => v === s || v.includes(s))
}

/**
 * Return the brand for public display, or null if it's a supplier name.
 * Use wherever a brand/vendor/eyebrow label is rendered.
 */
export function displayBrand(brand: string | null | undefined): string | null {
  if (!brand || isSupplierName(brand)) return null
  return brand
}
