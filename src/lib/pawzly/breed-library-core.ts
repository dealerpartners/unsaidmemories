// ============================================================================
// pawzly/breed-library-core.ts — the PURE core of Pawzsly's breed-library
// grounding (import-free so it is unit-testable without the DB or the
// Next runtime).
//
// WHY THIS EXISTS (defect record, 2026-10-25): the breed library was
// never the gap — public.breeds is live (631 canine + 107 feline rows),
// lib/pawzly/breeds reads it, and the get_breed_info tool was registered
// in the operator loop. The tool still never fired: the chat route runs
// the triage engine FIRST for every Shop message, and any non-empty
// triage message suppresses the tool loop (`!triageMsg` in the loop's
// gate) — so breed questions were answered by the triage classifier's
// own wording, from model memory, with figures that contradict the
// library (a live probe: Irish Water Spaniel answered as lifespan
// 10–13 yrs / 53–70 lbs; the library's row says 12-14 / Male 55-68,
// Female 45-58). ai_invocations holds ZERO pawzsly_tool rows across all
// history while pawzsly_triage / pawzsly_grounding rows abound.
//
// THE FIX, in the route: when a message NAMES a catalogued breed, the
// route executes get_breed_info deterministically through the intent
// router (the same audited execution a model-chosen call takes) and
// hands the library entry to every wording path as grounding. This
// module owns the three pure decisions that takes:
//   matchBreedInText()        — is a catalogued breed named here?
//   isBreedFactQuestion()     — is the shopper asking for breed facts?
//   formatBreedProfileAnswer()— the library entry as a standalone answer
//                               (used when the triage wording would
//                               otherwise stand unrevised).
//
// NORMALIZATION: containment matching lowercases, strips punctuation,
// and singularizes each word (trailing 's' dropped under the same rule
// normalizeBreedKey uses in lib/pets/breed-enrichment — that function
// remains the ONE canonical breed-name key; this is a text matcher over
// sentences, applied identically to both sides, and the matched NAME is
// always the catalogue's own, which downstream lookups resolve exactly).
// ============================================================================

export type BreedSpeciesName = "dog" | "cat"

export interface BreedCandidate {
  name: string
  species: BreedSpeciesName
}

function singularize(word: string): string {
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) {
    return word.slice(0, -1)
  }
  return word
}

/** A text as match tokens: lowercase alphanumerics, singularized. */
export function matchTokens(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(singularize)
}

function containsSequence(haystack: string[], needle: string[]): boolean {
  if (!needle.length || needle.length > haystack.length) return false
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    let ok = true
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        ok = false
        break
      }
    }
    if (ok) return true
  }
  return false
}

/**
 * The catalogued breed NAMED in a message, or null. A breed matches when
 * its full name appears as a contiguous phrase (after normalization —
 * case, punctuation and plurals forgiven). The longest name wins, so
 * "Labrador Retriever" beats "Labrador"; no partial or fuzzy matches —
 * a breed the message doesn't actually name is never grounded.
 */
export function matchBreedInText(
  text: string,
  candidates: BreedCandidate[],
): BreedCandidate | null {
  const haystack = matchTokens(text)
  if (!haystack.length) return null
  let best: BreedCandidate | null = null
  let bestLen = 0
  let bestChars = 0
  for (const c of candidates) {
    const needle = matchTokens(c.name)
    if (!needle.length || needle.length > haystack.length) continue
    if (!containsSequence(haystack, needle)) continue
    if (needle.length > bestLen || (needle.length === bestLen && c.name.length > bestChars)) {
      best = c
      bestLen = needle.length
      bestChars = c.name.length
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// Is the shopper asking for breed FACTS (vs shopping for a breed, naming
// a breed in passing, or reporting a symptom)? A deterministic keyword
// screen over the message — the same style as the route's other
// deterministic backstops (price ceiling, product nouns).
// ---------------------------------------------------------------------------

const BREED_FACT_PATTERNS: RegExp[] = [
  /\btell me about\b/i,
  /\bwhat (?:is|are) (?:a|an|the)\b/i,
  /\blife ?span\b/i,
  /\bhow long (?:do|does|will|can)\b.*\blive\b/i,
  /\bhow (?:big|large|heavy|tall)\b/i,
  /\bhow much do(?:es)? (?:they|it) weigh\b/i,
  /\bweigh(?:t|ed|s)?\b/i,
  /\btemperament\b/i,
  /\bpersonality\b/i,
  /\bgrooming\b/i,
  /\bshedding\b/i,
  /\bexercise\b/i,
  /\benergy level\b/i,
  /\bgood with (?:kids|children|other)\b/i,
  /\bbreed (?:facts|info|information|profile)\b/i,
  /\babout the breed\b/i,
]

export function isBreedFactQuestion(text: string): boolean {
  const t = String(text || "")
  if (!t.trim()) return false
  return BREED_FACT_PATTERNS.some((re) => re.test(t))
}

// ---------------------------------------------------------------------------
// The library entry as a standalone answer — every figure verbatim from
// the catalogue record; a field the record doesn't carry is omitted,
// never filled in. Enrichment keeps its source attribution (the
// breed-enrichment honesty rule).
// ---------------------------------------------------------------------------

export interface BreedProfileFacts {
  name: string
  species: BreedSpeciesName
  temperament: string | null
  lifeSpan: string | null
  weightImperial: string | null
  heightImperial: string | null
  group: string | null
  origin: string | null
  enrichment: {
    temperament?: string
    careNotes?: string
    source: string
  } | null
}

export function formatBreedProfileAnswer(p: BreedProfileFacts): string {
  const lines: string[] = []
  const head = p.group ? `${p.name} (${p.group})` : p.name
  lines.push(`Here's what our breed library says about the ${head}:`)
  if (p.lifeSpan) lines.push(`Life span: ${p.lifeSpan} years.`)
  if (p.weightImperial) lines.push(`Typical weight: ${p.weightImperial} lb.`)
  if (p.heightImperial) lines.push(`Typical height: ${p.heightImperial} in.`)
  const temperament = p.temperament || p.enrichment?.temperament || null
  if (temperament) lines.push(`Temperament: ${temperament}.`)
  if (p.origin) lines.push(`Origin: ${p.origin}.`)
  if (p.enrichment?.careNotes) {
    lines.push(`${p.enrichment.careNotes} (care notes: ${p.enrichment.source})`)
  }
  return lines.join("\n")
}
