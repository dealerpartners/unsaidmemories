/**
 * PDP display helpers — ported from unsaidmemories `market-ui.tsx` so the
 * product page renders supplier names exactly the way the reference app
 * does: leading separator junk stripped, flattened-variant " - Default"
 * tails removed, doubled import names collapsed ("Aquarium Stand 60x…
 * Aquarium Stand 60x…" → one copy), and only when the suffix repeats the
 * base (the flattened-variant echo) — a legitimate "Name - Subtitle"
 * keeps its full name.
 */

function stripVariantTail(name: string): string {
  // "... - Base Variant" / "... - Default" import tails are never part
  // of a product's real name.
  return name
    .replace(/\s+-\s+(?:Base\s+)?(?:Default|Base)\s*$/i, "")
    .replace(/\s+-\s+[A-Za-z0-9]+\s+Variant\s*$/i, "")
    .trim();
}

/** A doubled import name collapses to one copy when both halves match. */
function dedupeDoubled(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  const mid = Math.floor(t.length / 2);
  for (let cut = Math.max(8, mid - 3); cut <= Math.min(t.length - 8, mid + 3); cut++) {
    const left = t.slice(0, cut).replace(/[-\s]+$/, "").trim();
    const right = t.slice(cut).replace(/^[-\s]+/, "").trim();
    if (left && left.toLowerCase() === right.toLowerCase()) return left;
  }
  return s;
}

export function displayTitle(raw: string | null | undefined): string {
  let n = (raw ?? "").trim();
  if (!n) return "";
  // Leading separator junk from brand-stripped imports (": Givepet Cat…").
  n = n.replace(/^[^A-Za-z0-9"]+/, "").trim();
  if (!n) return "";
  // Flattened-variant placeholder tail ("... - Default") is import junk.
  n = n.replace(/\s+-\s+Default\s*$/i, "").trim();
  n = dedupeDoubled(n);
  const i = n.indexOf(" - ");
  if (i >= 8) {
    const base = n.slice(0, i).trim();
    const rest = n.slice(i + 3).trim();
    // Only strip when the suffix repeats the base; a legitimate
    // "Name - Subtitle" keeps its full name.
    if (rest.toLowerCase().startsWith(base.toLowerCase())) {
      return stripVariantTail(base);
    }
  }
  return stripVariantTail(n);
}

/** Money for dollar prices (the catalog stores dollars, not cents). */
export function money(dollars: number | null | undefined): string {
  if (dollars == null || !Number.isFinite(dollars) || dollars <= 0) return "—";
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
