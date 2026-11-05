// ============================================================================
// pets/breed-library.ts — the data service behind the public Breed
// Library (/learn/breeds). One cached read of the whole catalogue
// (738 rows — small enough to hold whole, and the index filters in
// memory so search/species/group/trait all stay server-rendered and
// crawlable without a query per keystroke).
//
// READS: pgQueryStrict — a failed read throws (Next keeps the last
// good ISR page) instead of caching an empty library. The slug
// assignment (breed-library-core) runs over the same rows the sitemap
// enumerates, so the URLs the index links, the detail routes resolve,
// and the sitemap advertises are one mapping.
// ============================================================================

import { unstable_cache } from "next/cache"
import { pgQueryStrict } from "@/lib/pg"
import { breedRecordFromRow } from "@/lib/pets/breeds"
import {
  assignBreedSlugs,
  parseBreedSpeciesSegment,
  type BreedEntry,
  type BreedEntryData,
  type BreedLibrarySpecies,
} from "@/lib/pets/breed-library-core"

const LIBRARY_COLUMNS = `id::text AS id, external_id, name, species, temperament, life_span,
  weight_imperial, weight_metric, height_imperial, height_metric,
  breed_group, origin, description, energy_level, shedding_level,
  affection_level, intelligence, image_url,
  NULLIF(source_data->>'bred_for', '') AS bred_for,
  NULLIF(source_data->>'history', '') AS history`

function entryDataFromRow(r: Record<string, any>): BreedEntryData {
  const rec = breedRecordFromRow(r)
  const clean = (v: unknown): string | null => {
    const s = v == null ? "" : String(v).trim()
    return s ? s : null
  }
  return {
    id: rec.id,
    externalId: clean(r.external_id),
    name: rec.name,
    species: rec.species,
    temperament: rec.temperament,
    lifeSpan: rec.lifeSpan,
    weightImperial: rec.weightImperial,
    weightMetric: rec.weightMetric,
    heightImperial: rec.heightImperial,
    heightMetric: rec.heightMetric,
    breedGroup: rec.breedGroup,
    origin: rec.origin,
    description: rec.description,
    energyLevel: rec.energyLevel,
    sheddingLevel: rec.sheddingLevel,
    affectionLevel: rec.affectionLevel,
    intelligence: rec.intelligence,
    imageUrl: rec.imageUrl,
    history: clean(r.history),
    bredFor: clean(r.bred_for),
  }
}

const fetchBreedEntries = unstable_cache(
  async (): Promise<BreedEntry[]> => {
    const rows = await pgQueryStrict<Record<string, any>>(
      `SELECT ${LIBRARY_COLUMNS} FROM public.breeds ORDER BY species ASC, name ASC`,
    )
    return assignBreedSlugs(rows.map(entryDataFromRow))
  },
  ["breed-library:catalogue:v1"],
  { revalidate: 86400 },
)

/** The whole library: every catalogue row with its assigned slug. */
export async function loadBreedEntries(): Promise<BreedEntry[]> {
  return fetchBreedEntries()
}

/** One entry by route params, or null when the species segment or the
 *  slug names nothing in the catalogue (the page serves the search
 *  home for it — never a 404). */
export async function getBreedEntry(
  speciesSegment: string | null | undefined,
  slug: string | null | undefined,
): Promise<BreedEntry | null> {
  const species = parseBreedSpeciesSegment(speciesSegment)
  if (!species) return null
  const wanted = String(slug || "").trim().toLowerCase()
  if (!wanted) return null
  const entries = await loadBreedEntries()
  return entries.find((e) => e.species === species && e.slug === wanted) ?? null
}

/** Minimal rows for the sitemap: the same assignment inputs, read
 *  directly (the sitemap route carries its own cache). */
export async function loadBreedSlugRows(): Promise<
  { id: string; externalId: string | null; name: string; species: BreedLibrarySpecies }[]
> {
  const rows = await pgQueryStrict<{ id: string; external_id: string | null; name: string; species: string }>(
    `SELECT id::text AS id, external_id, name, species FROM public.breeds ORDER BY species ASC, name ASC`,
  )
  return rows.map((r) => ({
    id: String(r.id),
    externalId: r.external_id ? String(r.external_id) : null,
    name: String(r.name || ""),
    species: (String(r.species || "").toLowerCase() === "feline" ? "cat" : "dog") as BreedLibrarySpecies,
  }))
}
