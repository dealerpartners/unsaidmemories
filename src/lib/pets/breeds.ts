// ============================================================================
// pets/breeds.ts — the breed RECORD layer over public.breeds.
//
// public.breeds is the platform's breed catalogue: 738 rows synced from
// TheDogApi (631, species 'canine') and TheCatApi (107, species 'feline')
// carrying temperament, life span, weight/height ranges, breed group,
// origin, description, and energy/shedding/affection scores. Until now
// the only reader was a name-only autocomplete (/api/customer/breeds);
// no care surface ever saw the record behind the name.
//
// This module is the one reader every breed-aware surface shares:
//
//   searchBreeds()          — autocomplete/search returning full RECORDS
//                             (species-aware; prefix matches rank first)
//   getBreedRecordById()    — breeds.id, falling back to the legacy
//                             dog_breeds catalogue (dogs.breedId pointed
//                             there before the 738-row table existed)
//   getBreedRecordByName()  — name resolution for records that carry a
//                             breed name but no catalogue id
//   resolvePetBreedRecord() — id first, then name: the resolver the pet
//                             write paths and the Pawzsly context use
//   formatBreedContext()    — the record as context text: the facts a
//                             care answer reasons from (typical weight
//                             range in lb, life span, temperament,
//                             energy/shedding), never just the name
//
// REAL DATA ONLY: every fact below comes from the catalogue row itself.
// A field the row doesn't carry stays null and is omitted from context —
// nothing is estimated, filled in, or invented. Species is never
// assumed: callers pass the species they actually know, and an unknown
// species searches both catalogues.
// ============================================================================

import { pgQuery } from "@/lib/pg"

export type BreedSpecies = "dog" | "cat"

export interface BreedRecord {
  /** Catalogue id — public.breeds.id, or the legacy dog_breeds.id. */
  id: string
  name: string
  /** Normalized from the catalogue's 'canine' / 'feline'. */
  species: BreedSpecies
  temperament: string | null
  /** As catalogued, e.g. "9-12" (years). */
  lifeSpan: string | null
  lifeSpanYears: { min: number; max: number } | null
  /** As catalogued, e.g. "99 - 110" or "Male: 99-110; Female: 88-99". */
  weightImperial: string | null
  weightMetric: string | null
  /** Parsed from the catalogued range — the numbers reasoning uses. */
  weightRangeLbs: { min: number; max: number } | null
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
  source: "breeds" | "dog_breeds"
}

const clean = (v: unknown): string | null => {
  const s = v == null ? "" : String(v).trim()
  return s ? s : null
}

const cleanInt = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10)
  return Number.isFinite(n) ? n : null
}

/** "9-12" / "12 - 20" / "14" → {min,max}. Anything else → null. */
export function parseYearRange(raw: string | null): { min: number; max: number } | null {
  if (!raw) return null
  const nums = (raw.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter((n) => n > 0)
  if (!nums.length) return null
  return { min: Math.min(...nums), max: Math.max(...nums) }
}

/** Parse a catalogued weight range into pounds. Imperial text wins
 *  ("99 - 110", "Male: 99-110; Female: 88-99" → the breed-wide 88–110);
 *  metric-only rows convert kg → lb. No parseable numbers → null. */
export function parseWeightRangeLbs(
  imperial: string | null,
  metric: string | null,
): { min: number; max: number } | null {
  const from = (raw: string | null, factor: number) => {
    if (!raw) return null
    const nums = (raw.match(/\d+(?:\.\d+)?/g) || []).map((n) => Number(n) * factor).filter((n) => n > 0)
    if (!nums.length) return null
    return { min: Math.round(Math.min(...nums)), max: Math.round(Math.max(...nums)) }
  }
  return from(imperial, 1) ?? from(metric, 2.20462)
}

/** Shape a public.breeds row into the record every surface consumes. */
export function breedRecordFromRow(r: Record<string, any>): BreedRecord {
  const weightImperial = clean(r.weight_imperial)
  const weightMetric = clean(r.weight_metric)
  const lifeSpan = clean(r.life_span)
  return {
    id: String(r.id),
    name: String(r.name || ""),
    species: String(r.species || "").toLowerCase() === "feline" ? "cat" : "dog",
    temperament: clean(r.temperament),
    lifeSpan,
    lifeSpanYears: parseYearRange(lifeSpan),
    weightImperial,
    weightMetric,
    weightRangeLbs: parseWeightRangeLbs(weightImperial, weightMetric),
    heightImperial: clean(r.height_imperial),
    heightMetric: clean(r.height_metric),
    breedGroup: clean(r.breed_group),
    origin: clean(r.origin),
    description: clean(r.description),
    energyLevel: cleanInt(r.energy_level),
    sheddingLevel: cleanInt(r.shedding_level),
    affectionLevel: cleanInt(r.affection_level),
    intelligence: cleanInt(r.intelligence),
    imageUrl: clean(r.image_url),
    source: "breeds",
  }
}

/** The legacy dog_breeds catalogue mapped into the same shape — it
 *  carries group/coat/shedding text but no temperament, life span, or
 *  weight range, so those stay null rather than being invented. */
export function dogBreedsRecordFromRow(r: Record<string, any>): BreedRecord {
  return {
    id: String(r.id),
    name: String(r.name || ""),
    species: "dog",
    temperament: null,
    lifeSpan: null,
    lifeSpanYears: null,
    weightImperial: null,
    weightMetric: null,
    weightRangeLbs: null,
    heightImperial: null,
    heightMetric: null,
    breedGroup: clean(r.akcGroup) || clean(r.sizeCategory),
    origin: null,
    description: null,
    energyLevel: null,
    sheddingLevel: null,
    affectionLevel: null,
    intelligence: null,
    imageUrl: null,
    source: "dog_breeds",
  }
}

const RECORD_COLUMNS = `id::text AS id, name, species, temperament, life_span,
  weight_imperial, weight_metric, height_imperial, height_metric,
  breed_group, origin, description, energy_level, shedding_level,
  affection_level, intelligence, image_url`

const catalogueSpecies = (s: BreedSpecies) => (s === "cat" ? "feline" : "canine")

/** Escape ILIKE pattern metacharacters in caller-supplied text — a
 *  query containing % or _ must match literally, not as a wildcard. */
const escapeIlike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

/** Search the catalogue by name — full records, prefix matches first.
 *  Species scopes the search when the caller knows it; an empty query
 *  returns the first page alphabetically so menus can browse. */
export async function searchBreeds(args: {
  q: string
  species?: BreedSpecies | null
  limit?: number
}): Promise<BreedRecord[]> {
  const q = String(args.q || "").trim().slice(0, 60)
  const limit = Math.min(Math.max(args.limit ?? 20, 1), 50)
  const params: unknown[] = []
  const where: string[] = []
  if (args.species) {
    params.push(catalogueSpecies(args.species))
    where.push(`species = $${params.length}`)
  }
  if (q) {
    params.push(escapeIlike(q))
    where.push(`name ILIKE '%' || $${params.length} || '%'`)
  }
  params.push(limit)
  const rank = q
    ? `ORDER BY (lower(name) LIKE lower($${params.length - 1}) || '%') DESC, name ASC`
    : `ORDER BY name ASC`
  const rows = await pgQuery<Record<string, any>>(
    `SELECT ${RECORD_COLUMNS} FROM public.breeds
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ${rank} LIMIT $${params.length}`,
    params,
  )
  return rows.map(breedRecordFromRow)
}

/** Resolve a stored breed reference. dogs.breedId historically points
 *  at dog_breeds; new captures store public.breeds ids. The 738-row
 *  catalogue wins when the id exists there; the legacy catalogue is the
 *  fallback so every existing pet record still resolves. */
export async function getBreedRecordById(id: string | null | undefined): Promise<BreedRecord | null> {
  const cleanId = String(id || "").trim()
  if (!cleanId) return null
  const rows = await pgQuery<Record<string, any>>(
    `SELECT ${RECORD_COLUMNS} FROM public.breeds WHERE id::text = $1 LIMIT 1`,
    [cleanId],
  )
  if (rows.length) return breedRecordFromRow(rows[0])
  const legacy = await pgQuery<Record<string, any>>(
    `SELECT id, name, "sizeCategory", "akcGroup" FROM public.dog_breeds WHERE id = $1 LIMIT 1`,
    [cleanId],
  )
  return legacy.length ? dogBreedsRecordFromRow(legacy[0]) : null
}

/** Resolve by name — exact (case-insensitive) first, then the closest
 *  prefix match. Species scopes when known; never assumed. */
export async function getBreedRecordByName(
  name: string | null | undefined,
  species?: BreedSpecies | null,
): Promise<BreedRecord | null> {
  const cleanName = String(name || "").trim()
  if (cleanName.length < 2) return null
  const params: unknown[] = [cleanName]
  const speciesClause = species ? ` AND species = $2` : ""
  if (species) params.push(catalogueSpecies(species))
  const exact = await pgQuery<Record<string, any>>(
    `SELECT ${RECORD_COLUMNS} FROM public.breeds WHERE lower(name) = lower($1)${speciesClause} LIMIT 1`,
    params,
  )
  if (exact.length) return breedRecordFromRow(exact[0])
  const prefix = await pgQuery<Record<string, any>>(
    `SELECT ${RECORD_COLUMNS} FROM public.breeds WHERE name ILIKE $1 || '%'${speciesClause} ORDER BY name ASC LIMIT 1`,
    [escapeIlike(cleanName), ...params.slice(1)],
  )
  if (prefix.length) return breedRecordFromRow(prefix[0])
  // Legacy catalogue by name (pre-738 pet records whose breedId is gone
  // but whose name matches a dog_breeds row) — dogs only, by its nature.
  if (!species || species === "dog") {
    const legacy = await pgQuery<Record<string, any>>(
      `SELECT id, name, "sizeCategory", "akcGroup" FROM public.dog_breeds WHERE lower(name) = lower($1) LIMIT 1`,
      [cleanName],
    )
    if (legacy.length) return dogBreedsRecordFromRow(legacy[0])
  }
  return null
}

/** The pet-level resolver: stored reference first, breed name second. */
export async function resolvePetBreedRecord(pet: {
  breedId?: string | null
  breedName?: string | null
  species?: BreedSpecies | null
}): Promise<BreedRecord | null> {
  if (pet.breedId) {
    const byId = await getBreedRecordById(pet.breedId)
    if (byId) return byId
  }
  if (pet.breedName) return getBreedRecordByName(pet.breedName, pet.species ?? null)
  return null
}

/** The record as care context — the facts an answer can reason from:
 *  typical adult weight range, life span (and, against the pet's birth
 *  date, life stage), temperament, energy and shedding. Only facts the
 *  catalogue row actually carries are stated. */
export function formatBreedContext(rec: BreedRecord): string {
  const bits: string[] = []
  if (rec.weightRangeLbs) {
    bits.push(
      rec.weightRangeLbs.min === rec.weightRangeLbs.max
        ? `typical adult weight about ${rec.weightRangeLbs.max} lb`
        : `typical adult weight ${rec.weightRangeLbs.min}–${rec.weightRangeLbs.max} lb`,
    )
  } else if (rec.weightImperial) {
    bits.push(`typical adult weight ${rec.weightImperial} lb`)
  }
  if (rec.lifeSpan) bits.push(`life span ${rec.lifeSpan} years`)
  if (rec.breedGroup) bits.push(`${rec.breedGroup} group`)
  if (rec.temperament) bits.push(`temperament: ${rec.temperament}`)
  if (rec.energyLevel != null) bits.push(`energy ${rec.energyLevel}/5`)
  if (rec.sheddingLevel != null) bits.push(`shedding ${rec.sheddingLevel}/5`)
  if (!bits.length) return ""
  return `Breed record (${rec.name}, ${rec.species}): ${bits.join("; ")}.`
}
