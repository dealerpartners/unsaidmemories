// ---------------------------------------------------------------------------
// catalog-text — the supplier-text normalizer (owner directive 2026-10-22:
// supplier product text — names, descriptions, variants — "must be parsed
// into plain English").
//
// Supplier feeds (CJ-style, long drawn-out marketplace English) arrive with
// keyword-stuffed names, prose polluted with fulfillment boilerplate and
// empty section scaffolding, and variant values welded into flat strings
// ("Cashmere Vest Yellow M"). This module is the ONE parser that turns that
// text into storefront English:
//
//   normalizeProductName(raw)        — a short, plain product name. Built ON
//                                      product-clean's echo rules (the
//                                      canonical base dedupe), then strips
//                                      marketplace stuffing: cross-border /
//                                      wholesale bait, "- Default"
//                                      placeholders, feature-list tails.
//   normalizeProductDescription(raw) — readable prose, or null when the
//                                      stored text is only the name echo.
//                                      Removes fulfillment boilerplate
//                                      ("Sold in Qty of: 1"), broken tag
//                                      residue ("br/>"), and empty section
//                                      scaffolding ("Ingredients: Flavor(s):
//                                      Featured Bullets:").
//   parseVariantAttributes(raw)      — a flat variant string → named
//                                      attributes with values:
//                                      Color / Size / Dimensions / Count /
//                                      Style, plus a composed display label.
//
// HARD LIMITS (canonical commerce rules): these are pure TEXT functions.
// They never touch a price, a quantity of record, or a stored row. Write
// paths call them BEFORE a record exists (import translation); read paths
// call them for display composition only. A record flagged manual_override
// is the owner's hand-edited record — isManualOverrideRecord() is the guard
// every write path must check before normalizing stored text.
// ---------------------------------------------------------------------------

import {
  cleanProductDescription,
  cleanProductTitle,
  splitFlattenedName,
  variantSuffix,
} from "./product-clean"
import { cleanText } from "./clean-text"

/** The manual-override guard: true when a record carries the owner's
 *  hand-edit flag (metadata.manual_override === true). Write paths must
 *  skip normalization for such records — their text is deliberate. */
export function isManualOverrideRecord(record: {
  metadata?: Record<string, unknown> | null
}): boolean {
  return record?.metadata?.manual_override === true
}

// ===========================================================================
// NAMES
// ===========================================================================

/** Marketplace stuffing that prefixes supplier titles. */
const LEADING_STUFFING: RegExp[] = [
  /^cross[-\s]?border\b[\s,]*/i,
  /^hot\s*sale\b[\s,]*/i,
  /^new\s+products?\b[\s,]*/i,
  /^new\s+arrivals?\b[\s,]*/i,
  /^wholesale\b[\s,]*/i,
  /^factory\s+(direct|price)\b[\s,]*/i,
]

/** Marketplace stuffing that trails supplier titles (whole-phrase, at the
 *  end, optionally behind a "-" or "," separator). Applied in a loop. */
const TRAILING_STUFFING: RegExp[] = [
  /[\s,\-–—]+pet\s+supplies\s+wholesale$/i,
  /[\s,\-–—]+manufacturer\s+customization$/i,
  /[\s,\-–—]+customization$/i,
  /[\s,\-–—]+pet\s+supplies$/i,
  /[\s,\-–—]+wholesale$/i,
  /[\s,\-–—]+factory\s+direct$/i,
  /[\s,\-–—]+free\s+shipping$/i,
  /[\s,\-–—]+hot\s*sale$/i,
  /[\s,\-–—]+dropshipping$/i,
  /[\s,\-–—]+drop\s+shipping$/i,
]

/** The plain-English product name: product-clean's echo rules first (the
 *  canonical dedupe — never fight displayTitle), then stuffing removal.
 *  Never returns empty for a non-empty input. */
export function normalizeProductName(raw: string | null | undefined): string {
  const input = (raw ?? "").trim()
  if (!input) return ""
  let name = cleanProductTitle(input)
  // The feed's placeholder variant is not a name ("... Spray - Default",
  // welded " - Default" survives the echo rules when there is no echo).
  name = name.replace(/[\s,\-–—]+default$/i, "").trim()
  for (const re of LEADING_STUFFING) name = name.replace(re, "").trim()
  // A leading "New" is a launch flag, not a name — strip it only when a
  // real name (2+ words) survives behind it.
  if (/^new\s+/i.test(name) && name.replace(/^new\s+/i, "").split(/\s+/).length >= 2) {
    name = name.replace(/^new\s+/i, "").trim()
  }
  let prev = ""
  while (prev !== name) {
    prev = name
    for (const re of TRAILING_STUFFING) name = name.replace(re, "").trim()
  }
  // Stacked-alternate tail: "Name, Alternate Name, Feature List, ..." —
  // with two or more commas the head before the first comma IS the name
  // and the rest is the feed stacking alternates and features behind it.
  const commas = name.split(", ").length - 1
  if (commas >= 2) {
    const head = name.slice(0, name.indexOf(", ")).trim()
    if (head.length >= 10) name = head
  }
  // Feature-list tail: "Name, Anti-Scratch, Anti-Lick, ..." — when the
  // whole string runs long and the head before the first comma is itself
  // a complete name, the commas carry features, not the name.
  if (name.length > 88) {
    const comma = name.indexOf(", ")
    if (comma >= 25) name = name.slice(0, comma).trim()
  }
  // Consecutive duplicate words ("Dog Dog Leash") are feed stutter.
  name = name.replace(/\b(\w+)(\s+\1\b)+/gi, "$1")
  name = name.replace(/\s{2,}/g, " ").replace(/[,\s;:\-–—]+$/, "").trim()
  return name || cleanProductTitle(input) || input
}

// ===========================================================================
// DESCRIPTIONS
// ===========================================================================

/** Section labels supplier templates scaffold into prose. A label left
 *  holding nothing (followed by another label, or by the end of the text)
 *  is scaffolding, not content, and is removed. */
const SCAFFOLD_LABELS = [
  "Ingredients",
  "Directions",
  "Flavor(s)",
  "Flavors",
  "Flavor",
  "Featured Bullets",
  "Specifications",
  "Guaranteed Analysis",
  "Feeding Instructions",
  "Warnings",
  "Materials",
  "Size",
  "Color",
]

/** Strip broken-tag residue that survives as literal text in supplier
 *  copy. cleanText decodes entities once and strips WELL-FORMED tags;
 *  what reaches here is the orphaned tail of a tag whose "<" was lost
 *  in the feed — observed live on PDPs as "br/&gt;" (a <br/> reduced to
 *  its tail, ">" still entity-encoded), "br/>" attached mid-token to the
 *  previous word or punctuation, and lone "/>" fragments. Mechanical
 *  cleanup only: fragments are removed or their entity decoded — lost
 *  characters (the "?" mojibake in e.g. "won?t") are NOT reconstructed;
 *  that damage belongs to the data layer, not the render. */
export function stripTagResidue(s: string): string {
  let out = s
  // "br/&gt;" exactly as observed — before the generic entity pass turns
  // it into a second form to chase.
  out = out.replace(/\bbr\s*\/?&gt;/gi, " ")
  // Double-encoded leftovers cleanText's single decode pass can't reach
  // ("&amp;gt;" decodes once to a literal "&gt;"). The output is React
  // text, escaped at render — decoding here can never create live markup.
  out = out.replace(/&gt;/gi, ">").replace(/&lt;/gi, "<")
  // Orphaned "br/>" tails: at a boundary (the original rule) and
  // mid-token ("warm.br/>Safe", "warm<br/>" with the "<" already gone).
  out = out.replace(/(^|\s)br\s*\/?>/gi, "$1 ")
  out = out.replace(/([^\s])br\s*\/?>/gi, "$1 ")
  // Lone "/>" fragments.
  out = out.replace(/\s\/>/g, " ")
  out = out.replace(/([A-Za-z0-9])\/>/g, "$1")
  return out
}

/** Readable plain-English description prose, or null when the stored text
 *  carries no real prose (empty, or only the product-name echo — the
 *  product-clean gate decides that). Built on cleanText for entity/tag
 *  hygiene; adds the supplier-boilerplate layer cleanText does not know. */
export function normalizeProductDescription(
  raw: string | null | undefined,
  rawName?: string | null,
): string | null {
  const gated = cleanProductDescription(raw, rawName ?? null)
  if (!gated) return null
  let s = cleanText(gated)
  // Fulfillment boilerplate: "Sold in Qty of: 1", "Sold In Quantity of: 1."
  s = s.replace(/\s*Sold\s+in\s+(?:Qty|Quantity)\s+of:?\s*\d+\.?\s*/gi, " ")
  // Broken tag residue that survives as literal text ("br/>", "br/&gt;", "/>").
  s = stripTagResidue(s)
  // Empty scaffolding labels, in a loop (labels chain: "Ingredients:
  // Flavor(s): Featured Bullets:" — each is followed by the next label).
  const labelAlt = SCAFFOLD_LABELS.map((l) => l.replace(/[()]/g, "\\$&")).join("|")
  const emptyLabel = new RegExp(`\\b(?:${labelAlt}):\\s*(?=(?:${labelAlt}):|$)`, "gi")
  let prev = ""
  while (prev !== s) {
    prev = s
    s = s.replace(emptyLabel, "")
  }
  s = s.replace(/\s{2,}/g, " ").replace(/\s+([.,;:!?])/g, "$1").trim()
  if (s.length < 3) return null
  return s
}

// ===========================================================================
// VARIANTS
// ===========================================================================

export type VariantAttribute = { name: string; value: string }
export type ParsedVariant = { attributes: VariantAttribute[]; label: string }

/** Color lexicon — single words and the feed's compound colorways. Values
 *  are display forms; keys are matched case-insensitively. Print colorways
 *  (Strawberry, Avocado, Whale) live here because the feeds file them on
 *  the color axis. */
const COLOR_LEXICON: Record<string, string> = {}
for (const c of [
  "Dark Gray", "Dark Grey", "Light Gray", "Light Grey", "Sea Blue", "Sky Blue",
  "Navy Blue", "Royal Blue", "Light Blue", "Baby Blue", "Hot Pink", "Baby Pink",
  "Candy Pink", "Rose Red", "Wine Red", "Mint Green", "Army Green",
  "Olive Green", "Forest Green", "Coffee Brown",
  "Black", "White", "Red", "Blue", "Green", "Pink", "Purple", "Yellow",
  "Orange", "Brown", "Gray", "Grey", "Gold", "Silver", "Tan", "Cream",
  "Ivory", "Coral", "Teal", "Turquoise", "Lavender", "Peach", "Mint",
  "Chocolate", "Violet", "Magenta", "Burgundy", "Navy", "Olive", "Khaki",
  "Beige", "Apricot", "Rose", "Lilac", "Cyan", "Indigo", "Maroon",
  "Fuchsia", "Salmon", "Plum", "Rust", "Copper", "Bronze", "Charcoal",
  "Pearl", "Leopard", "Camo", "Camouflage", "Strawberry", "Avocado", "Whale",
  "Coffee", "Multicolor", "Colorful", "Transparent", "Clear",
]) {
  COLOR_LEXICON[c.toLowerCase()] = c
}
const COLOR_KEYS = Object.keys(COLOR_LEXICON).sort((a, b) => b.length - a.length)

const SIZE_WORDS: Record<string, string> = {
  xxs: "XXS", xs: "XS", s: "S", m: "M", l: "L", xl: "XL", xxl: "XXL",
  xxxl: "XXXL", "2xl": "2XL", "3xl": "3XL",
  small: "Small", medium: "Medium", large: "Large",
  "x-small": "X-Small", "x-large": "X-Large",
  mini: "Mini", jumbo: "Jumbo",
}

/** Resolve a possibly TRUNCATED final token. Supplier names were stored
 *  under a length cap that cut variant tails mid-word ("Whit", "Stra",
 *  "Cand"): a trailing token that is a strict prefix of exactly one
 *  lexicon entry resolves to that entry. Ambiguity resolves to nothing —
 *  the parser never guesses between two words. */
function resolveTruncated(token: string, entries: string[]): string | null {
  if (token.length < 3) return null
  const hits = entries.filter((e) => e.startsWith(token.toLowerCase()))
  return hits.length === 1 ? hits[0] : null
}

/** Parse a flat supplier variant string into named attributes + a composed
 *  display label. Accepts a bare variant tail ("Cashmere Vest Yellow M"),
 *  a separator-joined option string ("Blue / XL / 3PCS"), or a full
 *  flattened product name (its variant suffix is parsed). A placeholder
 *  ("Default") or empty input parses to NO variant. Extraction order —
 *  dimensions, count, size, color — matters: each pass removes what it
 *  claims so later passes see only the residue, which becomes Style. */
export function parseVariantAttributes(raw: string | null | undefined): ParsedVariant {
  let s = (raw ?? "").trim()
  if (!s || /^default$/i.test(s)) return { attributes: [], label: "" }
  // A full flattened name reduces to its variant suffix first.
  const suffix = variantSuffix(s)
  if (suffix) s = suffix
  else if (splitFlattenedName(s)) s = s // legitimate "Base - Sub" — parse whole
  // A trailing placeholder segment ("Title - Default") is no variant.
  s = s.replace(/[\s,\-–—]+default$/i, "").trim()
  if (!s) return { attributes: [], label: "" }

  const found: Partial<Record<"Color" | "Size" | "Dimensions" | "Count" | "Style", string>> = {}

  // 1 — Dimensions: "27X12CM", "30x35x30cm", "12 x 8 in".
  const dim = s.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)(?:\s*[x×]\s*(\d+(?:\.\d+)?))?\s*(cm|mm|in|inch|inches)?/i)
  if (dim) {
    const unit = dim[4] ? ` ${dim[4].toLowerCase().replace(/^inches$/, "in").replace(/^inch$/, "in")}` : ""
    found.Dimensions = [dim[1], dim[2], dim[3]].filter(Boolean).join(" × ") + unit
    s = s.replace(dim[0], " ")
  }

  // 2 — Count / pack quantity: "3PCS", "12 pieces", "Pack of 4", "4-Pack".
  const count =
    s.match(/(\d+)\s*(?:pcs|pieces|pc)\b/i) ??
    s.match(/pack\s+of\s+(\d+)/i) ??
    s.match(/(\d+)\s*-?\s*pack\b/i) ??
    s.match(/(\d+)\s*count\b/i)
  if (count) {
    found.Count = `${count[1]}-pack`
    s = s.replace(count[0], " ")
  }

  // Token residue for the word-level passes.
  let tokens = s.split(/[\s,/·|]+/).filter(Boolean)

  // 3 — Size: an exact size token, else a measurement ("13oz", "1 Quart",
  // "23.6 in"), else a truncated trailing size word.
  const sizeIdx = tokens.findIndex((t) => SIZE_WORDS[t.toLowerCase()] != null)
  if (sizeIdx >= 0) {
    found.Size = SIZE_WORDS[tokens[sizeIdx].toLowerCase()]
    tokens.splice(sizeIdx, 1)
  } else {
    const meas = tokens.join(" ").match(/(\d+(?:\.\d+)?)\s*(fl\s*oz|oz|lb|lbs|kg|g|ml|qt|quart|quarts|l)\b/i)
    if (meas) {
      found.Size = `${meas[1]} ${meas[2].toLowerCase()}`
      const rest = tokens.join(" ").replace(meas[0], " ")
      tokens = rest.split(/[\s,/·|]+/).filter(Boolean)
    } else if (tokens.length > 0) {
      const resolved = resolveTruncated(tokens[tokens.length - 1], Object.keys(SIZE_WORDS))
      if (resolved) {
        found.Size = SIZE_WORDS[resolved]
        tokens.pop()
      }
    }
  }

  // 4 — Color: longest lexicon match over the remaining token sequence;
  // failing that, a truncated final token resolving to exactly one color.
  if (tokens.length > 0) {
    const joined = tokens.join(" ").toLowerCase()
    let matched: string | null = null
    for (const key of COLOR_KEYS) {
      const at = joined.indexOf(key)
      if (at >= 0 && (at === 0 || joined[at - 1] === " ") && (at + key.length === joined.length || joined[at + key.length] === " ")) {
        matched = key
        break
      }
    }
    if (matched) {
      found.Color = COLOR_LEXICON[matched]
      const words = matched.split(" ").length
      const at = tokens.findIndex((_, i) =>
        tokens.slice(i, i + words).join(" ").toLowerCase() === matched,
      )
      if (at >= 0) tokens.splice(at, words)
    } else {
      const resolved = resolveTruncated(tokens[tokens.length - 1], COLOR_KEYS)
      if (resolved) {
        found.Color = COLOR_LEXICON[resolved]
        tokens.pop()
      }
    }
  }

  // 5 — The residue, if any, is the style/print descriptor, verbatim.
  // Bounded at 48 chars (the PDP family-label rule's own bound): a longer
  // residue means the input was a product title, not a variant string,
  // and titles do not become styles.
  const residue = tokens.join(" ").replace(/\s{2,}/g, " ").trim()
  if (residue && residue.length <= 48) found.Style = residue

  const attributes: VariantAttribute[] = (
    ["Style", "Color", "Size", "Dimensions", "Count"] as const
  )
    .filter((k) => found[k])
    .map((k) => ({ name: k, value: found[k] as string }))
  const label =
    attributes.map((a) => a.value).join(" · ") ||
    (raw ?? "").trim()
  return { attributes, label }
}
