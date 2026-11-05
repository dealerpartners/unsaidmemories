// ---------------------------------------------------------------------------
// product-clean — the ONE canonical parser for the supplier feed's flattened
// "Base - Base Variant" name disease (owner directive 2026-10-21, "the
// mangled feed").
//
// The CJ/Kole importers stored each listing's name with the variant title
// flattened onto it, and the variant title itself repeats the product name:
//   "Pet Clothes … Cashmere - Pet Clothes … Cashmere Vest Yellow M"
// The slug and the media alt_text were derived from that same string, so all
// three carry the echo:
//   slug: pet-clothes-…-cashmere-pet-clothes-…-cashmere-vest-yellow-m
//   alt:  "Pet Clothes … Cashmere - Pet Clothes … Cashmere Vest Yellow M"
//
// Every surface (PDP h1, browser title, card titles, alts, slugs, variant
// chips, sitemap URLs) cleans through THESE functions so the rule exists in
// exactly one place. Pure string functions — safe on the server AND client.
//
// NOTE: market-ui.tsx displayTitle() implements the same base-dedupe rule
// for the shared card; this module is the data-layer twin (kept separate so
// client components never import server data modules for it).
// ---------------------------------------------------------------------------

/** Split a flattened supplier name into { base, variant }.
 *  Returns null when the name does NOT carry the duplicated-segment echo
 *  (a legitimate "Name - Subtitle" passes through untouched everywhere). */
export function splitFlattenedName(
  raw: string | null | undefined,
): { base: string; variant: string } | null {
  const n = (raw ?? "").trim()
  if (!n) return null
  const i = n.indexOf(" - ")
  if (i < 8) return null // too short to be a real "Base - " split
  const base = n.slice(0, i).trim()
  const rest = n.slice(i + 3).trim()
  if (!base || !rest) return null
  // Only the flattened echo qualifies: the suffix repeats the base.
  if (!rest.toLowerCase().startsWith(base.toLowerCase())) return null
  const variant = rest.slice(base.length).replace(/^[\s\-–—:,]+/, "").trim()
  return { base, variant }
}

/** The feed ALSO welds the variant onto the name with NO separator:
 *  "Parrot Baby Diapers Large And Medium Size Pet Bird Clothes" — the
 *  product is "Parrot Baby Diapers". Mirrors market-ui stripVariantTail
 *  (the ONE rule, data-layer twin). Conservative: cuts only a trailing
 *  size/qty cluster, only when the base is a real name (≥ 2 words, ≥ 8
 *  chars) and the tail actually contains a size word. */
export function stripVariantTail(n: string): string {
  if (!n) return n
  const words = n.split(/\s+/)
  const isMarker = (w: string) =>
    /^(?:large|medium|small|size|one|xs|s|m|l|xl|xxl|xxxl|big|pcs|pack|set)$/i.test(w) ||
    /^\d+pcs?$/i.test(w)
  for (let i = 2; i < words.length; i++) {
    if (isMarker(words[i])) {
      const tail = words.slice(i).join(" ")
      if (/\b(?:large|medium|small|size|xs|xl|xxl|xxxl)\b|\d+\s*pcs?/i.test(tail)) {
        const base = words.slice(0, i).join(" ").trim()
        if (base.length >= 8) return base
      }
    }
  }
  return n
}

/** The CLEAN display title — the product name only, never the echo and
 *  never the welded variant tail. h1, card titles, browser titles and
 *  JSON-LD names all use this. */
export function cleanProductTitle(raw: string | null | undefined): string {
  const f = splitFlattenedName(raw)
  if (f) return stripVariantTail(f.base)
  return stripVariantTail((raw ?? "").trim())
}

/** The variant suffix ("Vest Yellow M") — belongs in the variant selector,
 *  MAY append once to a browser title, NEVER duplicated into the h1. */
export function variantSuffix(raw: string | null | undefined): string {
  const f = splitFlattenedName(raw)
  return f ? f.variant : ""
}

/** The clean full listing name — base + variant ONCE. What a clean slug is
 *  built from, so family members stay distinct ("…-vest-yellow-m" vs
 *  "…-vest-blue-s") without the name segment repeated. */
export function cleanListingName(raw: string | null | undefined): string {
  const f = splitFlattenedName(raw)
  if (!f) return (raw ?? "").trim()
  return f.variant ? `${f.base} ${f.variant}` : f.base
}

/** Standard URL slug. */
export function slugify(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** The clean slug for a listing, derived from its NAME (the stored slug was
 *  built from the mangled name and embeds the name twice). */
export function cleanProductSlugFromName(raw: string | null | undefined): string {
  return slugify(cleanListingName(raw))
}

/** alt = clean name, with the variant at most once — never the echo. */
export function cleanProductAlt(raw: string | null | undefined): string {
  const f = splitFlattenedName(raw)
  if (!f) return (raw ?? "").trim()
  return f.variant ? `${f.base} - ${f.variant}` : f.base
}

/** The REAL description, or nothing. Supplier rows echo the (mangled) name
 *  into the description column; rendering that produces a duplicated-title
 *  mess. Returns null unless the text is genuinely different prose. */
export function cleanProductDescription(
  desc: string | null | undefined,
  rawName: string | null | undefined,
): string | null {
  const d = (desc ?? "").trim()
  if (!d || d.length < 3) return null
  const names = [rawName, cleanProductTitle(rawName), cleanListingName(rawName)]
    .filter(Boolean) as string[]
  const flat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
  const dFlat = flat(d)
  for (const n of names) {
    const nFlat = flat(n)
    if (!nFlat) continue
    if (dFlat === nFlat) return null
    // "Name — a few more words" is an echo, not prose.
    if (dFlat.startsWith(nFlat)) {
      const tail = dFlat.slice(nFlat.length).trim()
      if (tail.split(" ").filter(Boolean).length < 5) return null
    }
    // The flattened echo also appears as "Base - Base Variant" — the DB
    // stored description == the full mangled name for thousands of rows.
    if (dFlat === flat(`${n} - ${n}`)) return null
  }
  return d
}
