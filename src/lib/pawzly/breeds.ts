// ============================================================================
// pawzly/breeds.ts — the Pawzsly breed-intelligence reader (framework I-6).
//
// getBreedProfile() resolves a breed name against the platform's OWN
// catalogue (public.breeds, 738 rows, read through the repo pg path via
// lib/pets/breeds' row shaping) and merges attributed enrichment from
// The Dog API / The Cat API (lib/pets/breed-enrichment) UNDER it — owned
// data first, enrichment only fills fields the merge type exposes as
// enrichment, and every enrichment value keeps its source attribution.
//
// MATCHING: exact (case-insensitive) first, then a normalized comparison
// (case / whitespace / trailing-plural) over the species' catalogue
// rows. No fuzzy matching, no partial-name guesses: a name that matches
// nothing returns null, and callers present the honest empty state.
//
// breedFactsForPet() is the computation layer other code calls: life
// stage from the pet's birth date (or stated age) and the pet's weight
// against its breed's typical adult range — arithmetic over real
// inputs only; anything unknown stays null.
// ============================================================================

import { pgQuery } from "@/lib/pg"
import {
  matchBreedInText,
  type BreedCandidate,
} from "@/lib/pawzly/breed-library-core"

export {
  formatBreedProfileAnswer,
  isBreedFactQuestion,
} from "@/lib/pawzly/breed-library-core"
import {
  breedRecordFromRow,
  type BreedRecord,
  type BreedSpecies,
} from "@/lib/pets/breeds"
import {
  getBreedEnrichment,
  normalizeBreedKey,
  type BreedEnrichment,
} from "@/lib/pets/breed-enrichment"

export type { BreedEnrichment }

export interface BreedProfile {
  name: string
  species: BreedSpecies
  temperament: string | null
  /** As catalogued, e.g. "10 - 12" (years). */
  lifeSpan: string | null
  weightMinLbs: number | null
  weightMaxLbs: number | null
  /** As catalogued, e.g. "Male: 55-68; Female: 45-58" (lb) — the raw
   *  string, kept because the parsed range loses the sex split the
   *  library itself publishes. */
  weightImperial: string | null
  /** As catalogued, e.g. "Male: 22.5-24.5; Female: 21.5-23.5" (in). */
  heightImperial: string | null
  group: string | null
  origin: string | null
  energy: number | null
  shedding: number | null
  source: "catalog"
  enrichment: BreedEnrichment | null
}

const PROFILE_COLUMNS = `id::text AS id, name, species, temperament, life_span,
  weight_imperial, weight_metric, height_imperial, height_metric,
  breed_group, origin, description, energy_level, shedding_level,
  affection_level, intelligence, image_url`

const catalogueSpecies = (s: BreedSpecies) => (s === "cat" ? "feline" : "canine")

function normalizeSpecies(raw: unknown): BreedSpecies | null {
  const s = String(raw || "").trim().toLowerCase()
  if (s === "dog" || s === "canine") return "dog"
  if (s === "cat" || s === "feline") return "cat"
  return null
}

function profileFromRecord(rec: BreedRecord, enrichment: BreedEnrichment | null): BreedProfile {
  return {
    name: rec.name,
    species: rec.species,
    temperament: rec.temperament,
    lifeSpan: rec.lifeSpan,
    weightMinLbs: rec.weightRangeLbs?.min ?? null,
    weightMaxLbs: rec.weightRangeLbs?.max ?? null,
    weightImperial: rec.weightImperial,
    heightImperial: rec.heightImperial,
    group: rec.breedGroup,
    origin: rec.origin,
    energy: rec.energyLevel,
    shedding: rec.sheddingLevel,
    source: "catalog",
    enrichment,
  }
}

async function exactLookup(
  species: BreedSpecies,
  breedName: string,
): Promise<BreedRecord | null> {
  const rows = await pgQuery<Record<string, any>>(
    `SELECT ${PROFILE_COLUMNS} FROM public.breeds
      WHERE lower(name) = lower($1) AND species = $2 LIMIT 1`,
    [breedName, catalogueSpecies(species)],
  )
  return rows.length ? breedRecordFromRow(rows[0]) : null
}

async function normalizedLookup(
  species: BreedSpecies,
  breedName: string,
): Promise<BreedRecord | null> {
  const wanted = normalizeBreedKey(breedName)
  if (!wanted) return null
  const rows = await pgQuery<Record<string, any>>(
    `SELECT ${PROFILE_COLUMNS} FROM public.breeds WHERE species = $1`,
    [catalogueSpecies(species)],
  )
  const hit = rows.find((r) => normalizeBreedKey(String(r.name || "")) === wanted)
  return hit ? breedRecordFromRow(hit) : null
}

/**
 * The breed profile for (species, breedName): the catalogue record with
 * attributed API enrichment merged when available, or null when the
 * breed is not in the catalogue. An unknown species searches both
 * catalogues (dog first) rather than assuming one.
 */
export async function getBreedProfile(
  species: BreedSpecies | string | null | undefined,
  breedName: string | null | undefined,
): Promise<BreedProfile | null> {
  const name = String(breedName || "").trim()
  if (name.length < 2) return null
  const known = normalizeSpecies(species)
  const candidates: BreedSpecies[] = known ? [known] : ["dog", "cat"]
  for (const sp of candidates) {
    const rec = (await exactLookup(sp, name)) ?? (await normalizedLookup(sp, name))
    if (!rec) continue
    const enrichment = await getBreedEnrichment(sp, rec.name)
    return profileFromRecord(rec, enrichment)
  }
  return null
}

// ---------------------------------------------------------------------------
// breedFactsForPet — computations over a pet + its breed profile.
// ---------------------------------------------------------------------------

export interface PetBreedInput {
  breedName?: string | null
  species?: BreedSpecies | string | null
  /** ISO date (YYYY-MM-DD…) the pet was born, when known. */
  birthDate?: string | null
  /** Stated age in years when no birth date is carried. */
  ageYears?: number | null
  weightLbs?: number | string | null
}

export type LifeStage = "puppy" | "kitten" | "adult" | "senior"

export interface BreedFacts {
  profile: BreedProfile | null
  /** Whole years, from birthDate (preferred) or the stated age. */
  ageYears: number | null
  lifeStage: LifeStage | null
  weightLbs: number | null
  /** The pet's weight against the breed's typical adult range. */
  weightPosition: "below_typical_range" | "within_typical_range" | "above_typical_range" | null
}

function ageFromBirthDate(birthDate: string, now: Date): number | null {
  const born = new Date(birthDate)
  if (Number.isNaN(born.getTime()) || born.getTime() > now.getTime()) return null
  let years = now.getUTCFullYear() - born.getUTCFullYear()
  const m = now.getUTCMonth() - born.getUTCMonth()
  if (m < 0 || (m === 0 && now.getUTCDate() < born.getUTCDate())) years -= 1
  return years >= 0 ? years : null
}

function lifeStageFor(species: BreedSpecies | null, ageYears: number | null): LifeStage | null {
  if (ageYears == null) return null
  if (ageYears < 1) return species === "cat" ? "kitten" : "puppy"
  if (ageYears >= 7) return "senior"
  return "adult"
}

/**
 * Life stage + weight-vs-breed-range for one pet. The profile is
 * resolved through getBreedProfile (owned catalogue first); without a
 * resolvable breed, weightPosition stays null while life stage still
 * computes from the pet's own dates.
 */
export async function breedFactsForPet(
  pet: PetBreedInput,
  now: Date = new Date(),
): Promise<BreedFacts> {
  const species = normalizeSpecies(pet.species)
  const profile = pet.breedName
    ? await getBreedProfile(species, pet.breedName)
    : null

  let ageYears: number | null = null
  if (pet.birthDate) ageYears = ageFromBirthDate(String(pet.birthDate), now)
  if (ageYears == null && pet.ageYears != null) {
    const stated = Number(pet.ageYears)
    ageYears = Number.isFinite(stated) && stated >= 0 ? Math.floor(stated) : null
  }

  const weight = pet.weightLbs == null ? NaN : Number(pet.weightLbs)
  const weightLbs = Number.isFinite(weight) && weight > 0 ? weight : null

  let weightPosition: BreedFacts["weightPosition"] = null
  if (weightLbs != null && profile?.weightMinLbs != null && profile?.weightMaxLbs != null) {
    weightPosition =
      weightLbs < profile.weightMinLbs
        ? "below_typical_range"
        : weightLbs > profile.weightMaxLbs
          ? "above_typical_range"
          : "within_typical_range"
  }

  return {
    profile,
    ageYears,
    lifeStage: lifeStageFor(profile?.species ?? species, ageYears),
    weightLbs,
    weightPosition,
  }
}

// ---------------------------------------------------------------------------
// findBreedInMessage — is a catalogued breed NAMED in this message?
//
// The chat route's deterministic breed step (2026-10-25 fix): the
// get_breed_info TOOL existed but never fired, because the route's
// triage-first pipeline suppresses the tool loop whenever the triage
// engine words a reply — so breed questions were answered from model
// memory. The route now detects a named breed here, executes the tool
// itself through the intent router (the audited path), and grounds the
// wording on the result. The candidate list is the catalogue's own
// names, cached in-process like the RAG grounding cache; a failed read
// degrades to no match and the conversation proceeds exactly as before.
// ---------------------------------------------------------------------------

let candidatesCache: { at: number; list: BreedCandidate[] } | null = null
const CANDIDATES_TTL_MS = 10 * 60 * 1000

async function listBreedCandidates(): Promise<BreedCandidate[]> {
  if (candidatesCache && Date.now() - candidatesCache.at < CANDIDATES_TTL_MS) {
    return candidatesCache.list
  }
  const rows = await pgQuery<{ name: string; species: string }>(
    `SELECT name, species FROM public.breeds`,
  ).catch(() => [] as { name: string; species: string }[])
  const list: BreedCandidate[] = rows
    .map((r) => ({
      name: String(r.name || "").trim(),
      species: (String(r.species || "") === "feline" ? "cat" : "dog") as BreedSpecies,
    }))
    .filter((c) => c.name.length >= 2)
  if (list.length) candidatesCache = { at: Date.now(), list }
  return list
}

export async function findBreedInMessage(
  message: string,
): Promise<BreedCandidate | null> {
  const text = String(message || "").trim()
  if (text.length < 3) return null
  const candidates = await listBreedCandidates()
  if (!candidates.length) return null
  return matchBreedInText(text, candidates)
}
