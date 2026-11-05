// ---------------------------------------------------------------------------
// clean-text — the frontend end of the description normalization pipeline.
//
// The feed's translation layer (DB trigger + feed-sync v2) strips tags and
// writes plain-text short_description / details / specifications, but the
// source HTML entities survive in the data (1,527+ shorts and 2,829+ details
// still contain "&amp;", "&quot;", numeric entities, etc.). Rendering those
// raw shows literal "&amp;" on cards — so every surface that renders copy
// runs it through cleanText() first: numeric + named entity decode, stray-tag
// strip (defensive), whitespace collapse. Plain string in, clean text out —
// no HTML ever reaches the DOM as markup.
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201C",
  rdquo: "\u201D",
  hellip: "\u2026",
  mdash: "\u2014",
  ndash: "\u2013",
  bull: "\u2022",
  deg: "\u00B0",
  trade: "\u2122",
  reg: "\u00AE",
  copy: "\u00A9",
  times: "\u00D7",
  frac12: "\u00BD",
  frac14: "\u00BC",
  frac34: "\u00BE",
  eacute: "\u00E9",
  egrave: "\u00E8",
  uuml: "\u00FC",
  ouml: "\u00F6",
  auml: "\u00E4",
  // amp LAST in application order — decode it last so "&amp;lt;" can't
  // double-decode into "<".
  amp: "&",
}

/** Decode HTML entities / strip stray tags / collapse whitespace from
 *  catalog copy. Safe to call on any string; null/undefined → "". */
export function cleanText(input: string | null | undefined): string {
  if (!input) return ""
  let s = String(input)

  // 1 — numeric + hex entities first ("&#39;", "&#x27;", "&#8217;").
  s = s.replace(/&#x([0-9a-f]+);/gi, (_, h: string) => {
    const code = parseInt(h, 16)
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ""
  })
  s = s.replace(/&#(\d+);/g, (_, d: string) => {
    const code = Number(d)
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ""
  })

  // 2 — named entities (unknown ones left untouched).
  s = s.replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (raw, name: string) => {
    const mapped = NAMED_ENTITIES[name.toLowerCase()]
    return mapped ?? raw
  })

  // 3 — defensive: the trigger should have removed tags, but a stray one
  //     must never leak onto a card.
  s = s.replace(/<[^>]*>/g, " ")

  // 4 — collapse runs of spaces/tabs, trim line edges, drop leading/trailing
  //     blank space. Keeps \n (PDP "The Details" renders whitespace-pre-line).
  s = s
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  return s
}
