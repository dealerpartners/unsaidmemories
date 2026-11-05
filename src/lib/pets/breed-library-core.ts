// ============================================================================
// pets/breed-library-core.ts — the PURE core of the public Breed Library
// (/learn/breeds). No DB, no Next runtime: slug derivation, the total
// slug assignment over the catalogue, search/filter, pagination, facet
// options, related breeds, and the SEO builders (titles, descriptions,
// JSON-LD). The data service (lib/pets/breed-library.ts) feeds it rows;
// scripts/breed-library.test.mjs exercises it directly.
//
// SLUGS: derived from the breed name only (NFD transliteration, so
// "Alano Español" → "alano-espanol", "Braque d'Auvergne" →
// "braque-dauvergne", "Poodle (Miniature)" → "poodle-miniature").
// The route carries the species segment (/learn/breeds/dog/<slug>), so
// cross-species name twins never collide. WITHIN a species the APIs do
// list the same display name twice (two distinct entries, e.g. the two
// "Caucasian Shepherd Dog" rows) — assignment is deterministic (base
// slug, then -2, -3 … in external-id order) so EVERY catalogue row is
// reachable and the mapping never depends on fetch order.
// ============================================================================

export type BreedLibrarySpecies = "dog" | "cat"

/** The plain catalogue facts one library entry carries — the shaped
 *  public.breeds row (lib/pets/breeds' BreedRecord fields) plus the two
 *  source_data facts the dictionary renders when present. */
export interface BreedEntryData {
  id: string
  externalId: string | null
  name: string
  species: BreedLibrarySpecies
  temperament: string | null
  lifeSpan: string | null
  weightImperial: string | null
  weightMetric: string | null
  heightImperial: string | null
  heightMetric: string | null
  breedGroup: string | null
  origin: string | null
  description: string | null
  energyLevel: number | null
  sheddingLevel: number | null
  affectionLevel: number | null
  intelligence: number | null
  imageUrl: string | null
  history: string | null
  bredFor: string | null
}

export interface BreedEntry extends BreedEntryData {
  /** URL slug, unique within the species. */
  slug: string
  /** Canonical path: /learn/breeds/<dog|cat>/<slug>. */
  path: string
}

// ---------------------------------------------------------------------------
// Slugs
// ---------------------------------------------------------------------------

/** Name → URL slug. Diacritics fold to their base letters (NFD + strip
 *  combining marks); apostrophes vanish ("d'Auvergne" → "dauvergne");
 *  every other non-alphanumeric run becomes one hyphen. */
export function slugifyBreedName(name: string): string {
  return String(name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function breedSpeciesSegment(species: BreedLibrarySpecies): string {
  return species
}

/** Route segment → species. Anything else is not a breed-library
 *  species (the page serves the search home for it). */
export function parseBreedSpeciesSegment(raw: string | null | undefined): BreedLibrarySpecies | null {
  const s = String(raw || "").trim().toLowerCase()
  if (s === "dog" || s === "dogs" || s === "canine") return "dog"
  if (s === "cat" || s === "cats" || s === "feline") return "cat"
  return null
}

export function breedDetailPath(species: BreedLibrarySpecies, slug: string): string {
  return `/learn/breeds/${species}/${slug}`
}

/**
 * Assign a unique slug to every row. Deterministic order within a
 * species: base slug, then external id (nulls last), then row id — so
 * re-running over the same catalogue always yields the same mapping,
 * and a disambiguation suffix can never steal another breed's natural
 * slug (the used-set check skips taken candidates).
 */
export function assignBreedSlugs<T extends Pick<BreedEntryData, "id" | "externalId" | "name" | "species">>(
  rows: readonly T[],
): (T & { slug: string; path: string })[] {
  const sorted = [...rows].sort((a, b) => {
    if (a.species !== b.species) return a.species < b.species ? -1 : 1
    const sa = slugifyBreedName(a.name)
    const sb = slugifyBreedName(b.name)
    if (sa !== sb) return sa < sb ? -1 : 1
    const ea = a.externalId ?? ""
    const eb = b.externalId ?? ""
    if (ea !== eb) return ea < eb ? -1 : 1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
  const used = new Set<string>()
  return sorted.map((row) => {
    const base = slugifyBreedName(row.name) || "breed"
    let slug = base
    let n = 2
    while (used.has(`${row.species}:${slug}`)) {
      slug = `${base}-${n}`
      n += 1
    }
    used.add(`${row.species}:${slug}`)
    return { ...row, slug, path: breedDetailPath(row.species, slug) }
  })
}

// ---------------------------------------------------------------------------
// Search / filter / facets
// ---------------------------------------------------------------------------

export interface BreedFilter {
  q?: string | null
  species?: BreedLibrarySpecies | null
  group?: string | null
  trait?: string | null
}

/** The individual temperament terms a record carries ("Intelligent,
 *  Friendly" → ["Intelligent", "Friendly"]). */
export function temperamentTerms(entry: BreedEntryData): string[] {
  if (!entry.temperament) return []
  return entry.temperament
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
}

export function filterBreedEntries<T extends BreedEntryData>(entries: readonly T[], filter: BreedFilter): T[] {
  const q = String(filter.q || "").trim().toLowerCase()
  const group = String(filter.group || "").trim().toLowerCase()
  const trait = String(filter.trait || "").trim().toLowerCase()
  return entries.filter((e) => {
    if (filter.species && e.species !== filter.species) return false
    if (q && !e.name.toLowerCase().includes(q)) return false
    if (group && (e.breedGroup || "").trim().toLowerCase() !== group) return false
    if (trait && !temperamentTerms(e).some((t) => t.toLowerCase() === trait)) return false
    return true
  })
}

/** Breed groups present in a set (as catalogued — never merged or
 *  renamed), alphabetical, with counts. */
export function breedGroupOptions(entries: readonly BreedEntryData[]): { group: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const e of entries) {
    const g = (e.breedGroup || "").trim()
    if (g) counts.set(g, (counts.get(g) || 0) + 1)
  }
  return [...counts.entries()]
    .map(([group, count]) => ({ group, count }))
    .sort((a, b) => a.group.localeCompare(b.group))
}

/** Temperament terms worth offering as a filter: catalogued terms that
 *  at least two breeds carry, most frequent first (ties alphabetical),
 *  capped so the select stays usable. */
export function temperamentOptions(
  entries: readonly BreedEntryData[],
  cap = 30,
): { trait: string; count: number }[] {
  const counts = new Map<string, { trait: string; count: number }>()
  for (const e of entries) {
    for (const term of temperamentTerms(e)) {
      const key = term.toLowerCase()
      const cur = counts.get(key)
      if (cur) cur.count += 1
      else counts.set(key, { trait: term, count: 1 })
    }
  }
  return [...counts.values()]
    .filter((o) => o.count >= 2)
    .sort((a, b) => b.count - a.count || a.trait.localeCompare(b.trait))
    .slice(0, cap)
}

export function paginateEntries<T>(entries: readonly T[], page: number, perPage: number): {
  items: T[]
  page: number
  perPage: number
  total: number
  totalPages: number
} {
  const total = entries.length
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  const clamped = Math.min(Math.max(Math.trunc(page) || 1, 1), totalPages)
  const start = (clamped - 1) * perPage
  return { items: entries.slice(start, start + perPage), page: clamped, perPage, total, totalPages }
}

/** Related breeds: same species, same group (as catalogued), excluding
 *  the breed itself, alphabetical. A breed with no group has no
 *  same-group rail — the honest empty list. */
export function relatedBreedEntries<T extends BreedEntry>(entries: readonly T[], entry: T, limit = 8): T[] {
  if (!entry.breedGroup) return []
  return entries
    .filter((e) => e.id !== entry.id && e.species === entry.species && e.breedGroup === entry.breedGroup)
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, limit)
}

// ---------------------------------------------------------------------------
// SEO text
// ---------------------------------------------------------------------------

/** Clean truncation at a word boundary for meta descriptions. */
export function truncateText(text: string, max = 160): string {
  const clean = String(text || "").replace(/\s+/g, " ").trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(" ")
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim()}…`
}

export function breedPageTitle(entry: BreedEntryData): string {
  return `${entry.name} — Breed Profile, Temperament, Care | All About Pawz`
}

export function breedMetaDescription(entry: BreedEntryData): string {
  if (entry.description) return truncateText(entry.description, 160)
  const bits: string[] = []
  if (entry.breedGroup) bits.push(`${entry.breedGroup} group`)
  if (entry.origin) bits.push(`from ${entry.origin}`)
  if (entry.lifeSpan) bits.push(`life span ${entry.lifeSpan} years`)
  if (entry.temperament) bits.push(`temperament: ${entry.temperament}`)
  const speciesWord = entry.species === "cat" ? "cat" : "dog"
  return truncateText(
    `${entry.name} breed profile — ${bits.length ? bits.join("; ") : `the ${speciesWord} breed`} — temperament, care and facts in the All About Pawz Breed Library.`,
    160,
  )
}

/** One-line card summary: the first temperament terms, or the group's
 *  plain label when no temperament is catalogued. */
export function breedCardLine(entry: BreedEntryData): string {
  const terms = temperamentTerms(entry).slice(0, 3)
  if (terms.length) return terms.join(", ")
  if (entry.breedGroup) return `${entry.breedGroup} group`
  return entry.species === "cat" ? "Cat breed" : "Dog breed"
}

// ---------------------------------------------------------------------------
// JSON-LD (the education surfaces' Article/BreadcrumbList idiom, with
// DefinedTerm for the dictionary framing of a breed entry)
// ---------------------------------------------------------------------------

export function breedBreadcrumbJsonLd(
  entry: BreedEntry,
  urls: { site: string; index: string; speciesIndex: string },
): Record<string, unknown> {
  const speciesLabel = entry.species === "cat" ? "Cat Breeds" : "Dog Breeds"
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: urls.site },
      { "@type": "ListItem", position: 2, name: "Learn", item: `${urls.site}/learn` },
      { "@type": "ListItem", position: 3, name: "Breed Library", item: urls.index },
      { "@type": "ListItem", position: 4, name: speciesLabel, item: urls.speciesIndex },
      { "@type": "ListItem", position: 5, name: entry.name, item: `${urls.site}${entry.path}` },
    ],
  }
}

export function breedDefinedTermJsonLd(
  entry: BreedEntry,
  urls: { site: string; index: string },
): Record<string, unknown> {
  const canonical = `${urls.site}${entry.path}`
  const term: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    name: entry.name,
    description: breedMetaDescription(entry),
    url: canonical,
    inDefinedTermSet: {
      "@type": "DefinedTermSet",
      name: "All About Pawz Breed Library",
      url: urls.index,
    },
  }
  if (entry.imageUrl) term.image = entry.imageUrl
  return term
}
