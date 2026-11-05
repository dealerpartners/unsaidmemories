// ============================================================================
// pets/breed-enrichment.ts — server-side enrichment from The Dog API /
// The Cat API (framework I-6 breed leg), read-through cached in
// public.breed_enrichment_cache (migration 20261081).
//
// HONESTY RULES
//   - Enrichment is ATTRIBUTED, never ours: every returned object carries
//     its source ('The Dog API' | 'The Cat API'), and callers merge it
//     UNDER the platform's own public.breeds record (owned data first).
//   - No key configured (process.env.THE_DOG_API / THE_CAT_API) → null.
//     The breed surfaces work from the catalogue alone; enrichment is an
//     additive layer, never a dependency, and key values are never
//     logged or printed anywhere in this module.
//   - Only an API entry whose name matches the requested breed (after
//     case/whitespace/plural normalization) is used. A search hit for a
//     DIFFERENT breed is not enrichment for this one — no fuzzy picks.
//   - Any failure (network, HTTP, missing cache table, malformed body)
//     resolves to the stale cache entry when one exists, else null.
// ============================================================================

import { pgExec, pgQuery } from "@/lib/pg"

export type BreedEnrichmentSource = "The Dog API" | "The Cat API"

export interface BreedEnrichment {
  temperament?: string
  /** The API's own breed description text, verbatim, attributed. */
  careNotes?: string
  imageUrl?: string
  source: BreedEnrichmentSource
}

type EnrichmentSpecies = "dog" | "cat"

const API_BASE: Record<EnrichmentSpecies, string> = {
  dog: "https://api.thedogapi.com/v1/breeds/search",
  cat: "https://api.thecatapi.com/v1/breeds/search",
}
const API_SOURCE: Record<EnrichmentSpecies, BreedEnrichmentSource> = {
  dog: "The Dog API",
  cat: "The Cat API",
}
const FRESH_MS = 30 * 24 * 60 * 60 * 1000 // 30-day freshness window

function apiKeyFor(species: EnrichmentSpecies): string | null {
  const raw = species === "dog" ? process.env.THE_DOG_API : process.env.THE_CAT_API
  const key = String(raw || "").trim()
  return key ? key : null
}

/** Cache/match key: lowercase, whitespace-collapsed, trailing plural 's'
 *  stripped from the final word ("Labrador  Retrievers" → "labrador
 *  retriever"). Deterministic normalization only — never fuzzy. */
export function normalizeBreedKey(name: string): string {
  const words = String(name || "").trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return ""
  const last = words[words.length - 1]
  if (last.length > 3 && last.endsWith("s") && !last.endsWith("ss")) {
    words[words.length - 1] = last.slice(0, -1)
  }
  return words.join(" ")
}

/** Map one raw API breed entry into the attributed enrichment shape.
 *  Fields the entry does not carry are omitted, never invented. */
export function enrichmentFromApiEntry(
  entry: Record<string, any>,
  species: EnrichmentSpecies,
): BreedEnrichment {
  const out: BreedEnrichment = { source: API_SOURCE[species] }
  const temperament = String(entry?.temperament || "").trim()
  if (temperament) out.temperament = temperament
  const description = String(entry?.description || "").trim()
  if (description) out.careNotes = description
  const imageUrl = String(entry?.image?.url || "").trim()
  if (imageUrl) out.imageUrl = imageUrl
  return out
}

interface CacheRow {
  payload: Record<string, any>
  source: string
  fetched_at: string
}

async function readCache(
  species: EnrichmentSpecies,
  breedKey: string,
): Promise<CacheRow | null> {
  // pgQuery never throws (returns [] on failure / missing table), so a
  // not-yet-applied migration degrades to a plain cache miss.
  const rows = await pgQuery<CacheRow>(
    `SELECT payload, source, fetched_at FROM public.breed_enrichment_cache
      WHERE species = $1 AND breed_key = $2 LIMIT 1`,
    [species, breedKey],
  )
  return rows.length ? rows[0] : null
}

async function writeCache(
  species: EnrichmentSpecies,
  breedKey: string,
  entry: Record<string, any>,
): Promise<void> {
  await pgExec(
    `INSERT INTO public.breed_enrichment_cache (species, breed_key, payload, source, fetched_at)
     VALUES ($1, $2, $3::jsonb, $4, now())
     ON CONFLICT (species, breed_key)
     DO UPDATE SET payload = EXCLUDED.payload, source = EXCLUDED.source, fetched_at = now()`,
    [species, breedKey, JSON.stringify(entry), API_SOURCE[species]],
  )
}

async function fetchApiEntry(
  species: EnrichmentSpecies,
  breedName: string,
  apiKey: string,
): Promise<Record<string, any> | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(
      `${API_BASE[species]}?q=${encodeURIComponent(breedName)}`,
      {
        headers: { "x-api-key": apiKey },
        signal: controller.signal,
        cache: "no-store",
      },
    )
    if (!res.ok) return null
    const body: unknown = await res.json()
    if (!Array.isArray(body)) return null
    const wanted = normalizeBreedKey(breedName)
    const exact = body.find(
      (e) => e && typeof e === "object" && normalizeBreedKey(String((e as any).name || "")) === wanted,
    )
    return (exact as Record<string, any>) ?? null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Enrichment for one breed, or null when unavailable (no key, no exact
 * API match, no cache). Fresh cache (<30d) wins without a network call;
 * a stale entry is refreshed when the API answers and served as-is when
 * it does not — it is real, attributed API data either way.
 */
export async function getBreedEnrichment(
  species: EnrichmentSpecies,
  breedName: string,
): Promise<BreedEnrichment | null> {
  const breedKey = normalizeBreedKey(breedName)
  if (!breedKey) return null

  const cached = await readCache(species, breedKey)
  if (cached) {
    const age = Date.now() - new Date(cached.fetched_at).getTime()
    if (Number.isFinite(age) && age < FRESH_MS) {
      return enrichmentFromApiEntry(cached.payload, species)
    }
  }

  const apiKey = apiKeyFor(species)
  if (!apiKey) {
    // No key: a stale cache row is still honest attributed data; with no
    // cache there is simply no enrichment (the catalogue stands alone).
    return cached ? enrichmentFromApiEntry(cached.payload, species) : null
  }

  const entry = await fetchApiEntry(species, breedName, apiKey)
  if (!entry) {
    return cached ? enrichmentFromApiEntry(cached.payload, species) : null
  }
  await writeCache(species, breedKey, entry).catch(() => undefined)
  return enrichmentFromApiEntry(entry, species)
}
