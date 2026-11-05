/**
 * Capture a Printful product's REAL stage into our database
 * (owner order 2026-10-30: the studio mocks up on what suppliers
 * actually deliver — captured once into Supabase, never called live
 * from the editor).
 *
 * Two Printful API v2 reads per product:
 *
 *   GET /v2/catalog-products/{id}/mockup-styles
 *     → supplier_print_specs rows: per placement, print area in
 *       inches × the placement's DPI = print-file pixels + target DPI.
 *
 *   GET /v2/catalog-products/{id}/mockup-templates?limit=100&offset=N
 *     → supplier_mockup_templates rows: the template frame + print-
 *       area rect + template/background images, per variant group.
 *       The endpoint paginates (2,158 rows for product 71) and its
 *       placement filter is ignored, so we scan every page, keep
 *       placements front/back/default/sleeve_left/sleeve_right, and
 *       dedupe by (placement, image_url) — the row covering the most
 *       catalog_variant_ids wins.
 *
 * Writes (only with --write):
 *   - specs: SIZE-AWARE REPLACE-SET per (canonical, supplier) —
 *     delete the product's existing supplier_print_specs rows, then
 *     insert the full fresh set with size_tag computed per the CP1
 *     contract (migration 20261030213100, UNIQUE key is now
 *     (canonical_product_id, supplier_name, placement_tag, size_tag)):
 *       · mockup-style entry restricted to variants of ONE size →
 *         that size name ('11 oz', '15 oz', '20 oz', …)
 *       · "Placeholder"-category entry → 'placeholder' (captured,
 *         never filtered out)
 *       · otherwise (product-wide entry) → geometry tag
 *         '<w>x<h>in@<dpi>' (e.g. '12x16in@150', '3x1.13in@300')
 *     Exact-duplicate spec tuples dedupe at capture time (Printful
 *     repeats some label entries verbatim). The 4-column key can
 *     hold only ONE row per (placement, size_tag): when distinct
 *     tuples still map to the same key (observed: a mug's two
 *     Placeholder geometries, both 'placeholder'), the LAST entry
 *     wins and a warning is printed — never a silent drop.
 *   - templates: replace-set — delete the product+supplier's existing
 *     rows, insert the fresh deduped set.
 *
 * --specs-only scopes a run to SPECS ONLY: templates are neither
 * fetched nor written (harvest CP2a-2 anchor recapture uses this —
 * templates/costs behaviour is otherwise exactly as before).
 *
 * Usage:
 *   node scripts/capture-printful-stage.mjs --product 71 --slug bella-canvas-3001            # dry run (default)
 *   node scripts/capture-printful-stage.mjs --product 71 --slug bella-canvas-3001 --write    # write to Supabase
 *   node scripts/capture-printful-stage.mjs --product 19 --slug white-glossy-mug --specs-only --write
 *
 * Keys come from the repo .env (PRINTFUL_API_KEY / PRINTFUL_BASE_URL,
 * SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) — the same source the app
 * and the other scripts use. Nothing secret is printed.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

const KEEP_PLACEMENTS = new Set(["front", "back", "default", "sleeve_left", "sleeve_right"]);
const PAGE_LIMIT = 100;

// ── args ─────────────────────────────────────────────────────
const args = process.argv.slice(2);
function argValue(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}
const productId = argValue("--product");
const slug = argValue("--slug");
const write = args.includes("--write");
const specsOnly = args.includes("--specs-only");
if (!productId || !slug) {
  console.error("Usage: node scripts/capture-printful-stage.mjs --product <printfulCatalogId> --slug <canonical-slug> [--write]");
  process.exit(1);
}

// ── env ──────────────────────────────────────────────────────
const env = {};
try {
  const envText = readFileSync(path.join(process.cwd(), ".env"), "utf8");
  for (const l of envText.split("\n")) {
    const m = l.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
} catch { /* handled by the checks below */ }

const PF_KEY = env.PRINTFUL_API_KEY;
// .env's PRINTFUL_BASE_URL already ends in /v2 — strip any version
// suffix so the /v2/… paths below resolve against the API root.
const PF_BASE = (env.PRINTFUL_BASE_URL || "https://api.printful.com")
  .replace(/\/$/, "")
  .replace(/\/(v1|v2)$/, "");
if (!PF_KEY) throw new Error("PRINTFUL_API_KEY not found in .env");

const SB_URL = env.SUPABASE_URL;
const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (write && (!SB_URL || !SB_KEY)) {
  throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required for --write");
}

// ── Printful reads ───────────────────────────────────────────
async function pfGet(pathname) {
  const r = await fetch(`${PF_BASE}${pathname}`, {
    headers: { Authorization: `Bearer ${PF_KEY}` },
  });
  if (!r.ok) throw new Error(`Printful ${pathname} → HTTP ${r.status}`);
  return r.json();
}

/** v1 variant id → size name only ('11 oz', 'S', …), for size_tag. */
async function fetchVariantSizes() {
  try {
    const j = await pfGet(`/products/${productId}`);
    const map = new Map();
    for (const v of j.result?.variants ?? []) {
      if (v.size) map.set(v.id, v.size);
    }
    return map;
  } catch {
    return new Map();
  }
}

/** Geometry tag component: trim float noise ('10.2367', '3.5', '12'). */
function fmtNum(n) {
  return String(Number(Number(n).toFixed(4)));
}

/**
 * size_tag per the CP1 contract (see header). Order matters:
 * Placeholder-category first (its entries carry no variant
 * restriction), then single-size restriction, then geometry.
 */
function computeSizeTag(s, dpi, variantSizes) {
  const styles = s.mockup_styles ?? [];
  if (styles.length > 0 && styles.every((m) => m.category_name === "Placeholder")) {
    return "placeholder";
  }
  const restricted = [...new Set(styles.flatMap((m) => m.restricted_to_variants ?? []))];
  const sizes = [...new Set(restricted.map((id) => variantSizes.get(id)).filter(Boolean))];
  if (restricted.length > 0 && sizes.length === 1) return sizes[0];
  return `${fmtNum(s.print_area_width || 0)}x${fmtNum(s.print_area_height || 0)}in@${dpi}`;
}

/** mockup-styles → supplier_print_specs row shapes (size-aware, deduped). */
async function fetchSpecs() {
  const variantSizes = await fetchVariantSizes();
  const j = await pfGet(`/v2/catalog-products/${productId}/mockup-styles`);
  const raw = (j.data ?? []).map((s) => {
    const dpi = s.dpi || 300;
    return {
      supplier_name: "printful",
      supplier_blueprint_id: String(productId),
      placement_tag: s.placement,
      size_tag: computeSizeTag(s, dpi, variantSizes),
      print_width_px: Math.round((s.print_area_width || 0) * dpi),
      print_height_px: Math.round((s.print_area_height || 0) * dpi),
      target_dpi: dpi,
      offset_top_percent: 0,
      offset_left_percent: 0,
      raw_payload: s,
    };
  });

  // Exact-duplicate spec tuples dedupe at capture time (CP1 finding:
  // Printful repeats some label entries verbatim).
  const seen = new Set();
  const deduped = [];
  for (const e of raw) {
    const styles = e.raw_payload.mockup_styles ?? [];
    const key = [
      e.placement_tag, e.size_tag, e.raw_payload.technique ?? "",
      e.raw_payload.print_area_type ?? "", e.print_width_px, e.print_height_px,
      e.target_dpi,
      [...new Set(styles.flatMap((m) => m.restricted_to_variants ?? []))].join(","),
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(e);
  }

  // Key dedupe: the 4-column unique key holds one row per
  // (placement_tag, size_tag). Distinct tuples can still collide
  // there (a mug's two Placeholder geometries) — LAST wins, warned.
  const byKey = new Map();
  const keyCollisions = [];
  for (const e of deduped) {
    const key = `${e.placement_tag}|${e.size_tag}`;
    if (byKey.has(key)) {
      const prev = byKey.get(key);
      keyCollisions.push(
        `${e.placement_tag} [${e.size_tag}]: ${prev.print_width_px}×${prev.print_height_px}px superseded by ${e.print_width_px}×${e.print_height_px}px (unique key holds one)`,
      );
    }
    byKey.set(key, e);
  }
  return { specs: [...byKey.values()], rawCount: raw.length, keyCollisions };
}

/** Paged mockup-templates scan → deduped supplier_mockup_templates row shapes. */
async function fetchTemplates() {
  const byKey = new Map(); // `${placement}|${image_url}` -> row
  let offset = 0;
  let total = Infinity;
  let scanned = 0;
  while (offset < total) {
    const j = await pfGet(
      `/v2/catalog-products/${productId}/mockup-templates?limit=${PAGE_LIMIT}&offset=${offset}`,
    );
    const rows = j.data ?? [];
    total = j.paging?.total ?? rows.length;
    scanned += rows.length;
    for (const t of rows) {
      if (!KEEP_PLACEMENTS.has(t.placement)) continue;
      const row = {
        supplier_name: "printful",
        supplier_blueprint_id: String(productId),
        placement_tag: t.placement,
        technique: t.technique ?? null,
        catalog_variant_ids: t.catalog_variant_ids ?? [],
        template_width: t.template_width,
        template_height: t.template_height,
        print_area_width: t.print_area_width,
        print_area_height: t.print_area_height,
        print_area_top: t.print_area_top,
        print_area_left: t.print_area_left,
        image_url: t.image_url ?? null,
        background_url: t.background_url ?? null,
        background_color: t.background_color ?? null,
        printfile_id: t.printfile_id ?? null,
        raw_payload: t,
      };
      const key = `${row.placement_tag}|${row.image_url}`;
      const prev = byKey.get(key);
      if (!prev || row.catalog_variant_ids.length > prev.catalog_variant_ids.length) {
        byKey.set(key, row);
      }
    }
    offset += PAGE_LIMIT;
    if (rows.length === 0) break;
  }
  return { templates: [...byKey.values()], scanned, total };
}

// ── Supabase writes (only with --write) ──────────────────────
const SB_HEADERS = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  "Content-Type": "application/json",
};

async function resolveCanonicalId() {
  const r = await fetch(
    `${SB_URL}/rest/v1/canonical_products?select=id&sku_slug=eq.${encodeURIComponent(slug)}`,
    { headers: SB_HEADERS },
  );
  const rows = await r.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`canonical_products has no row for slug '${slug}' — seed it first.`);
  }
  return rows[0].id;
}

/** Specs: SIZE-AWARE REPLACE-SET — delete this product+supplier's
 *  existing spec rows, then insert the full fresh set (size_tag
 *  included). Plain insert: capture-time dedupe guarantees no
 *  (placement_tag, size_tag) key repeats inside the set. */
async function writeSpecsReplaceSet(canonicalId, specs) {
  const del = await fetch(
    `${SB_URL}/rest/v1/supplier_print_specs?canonical_product_id=eq.${canonicalId}&supplier_name=eq.printful`,
    { method: "DELETE", headers: { ...SB_HEADERS, Prefer: "return=minimal" } },
  );
  if (!del.ok) throw new Error(`specs delete → HTTP ${del.status}: ${await del.text()}`);
  const specRows = specs.map((s) => ({ ...s, canonical_product_id: canonicalId }));
  const r1 = await fetch(`${SB_URL}/rest/v1/supplier_print_specs`, {
    method: "POST",
    headers: { ...SB_HEADERS, Prefer: "return=minimal" },
    body: JSON.stringify(specRows),
  });
  if (!r1.ok) throw new Error(`specs insert → HTTP ${r1.status}: ${await r1.text()}`);
}

async function writeAll(canonicalId, specs, templates) {
  await writeSpecsReplaceSet(canonicalId, specs);

  // Templates: replace-set for this canonical product + supplier.
  const del = await fetch(
    `${SB_URL}/rest/v1/supplier_mockup_templates?canonical_product_id=eq.${canonicalId}&supplier_name=eq.printful`,
    { method: "DELETE", headers: { ...SB_HEADERS, Prefer: "return=minimal" } },
  );
  if (!del.ok) throw new Error(`templates delete → HTTP ${del.status}: ${await del.text()}`);
  const tplRows = templates.map((t) => ({ ...t, canonical_product_id: canonicalId }));
  const r2 = await fetch(`${SB_URL}/rest/v1/supplier_mockup_templates`, {
    method: "POST",
    headers: { ...SB_HEADERS, Prefer: "return=minimal" },
    body: JSON.stringify(tplRows),
  });
  if (!r2.ok) throw new Error(`templates insert → HTTP ${r2.status}: ${await r2.text()}`);
}

// ── run ──────────────────────────────────────────────────────
const { specs, rawCount, keyCollisions } = await fetchSpecs();
const { templates, scanned, total } = specsOnly
  ? { templates: [], scanned: 0, total: 0 }
  : await fetchTemplates();

console.log(`\nPrintful product ${productId} → canonical '${slug}'  (${write ? "WRITE" : "DRY RUN — no database writes"}${specsOnly ? ", SPECS ONLY" : ""})`);
console.log(`\nSpecs (mockup-styles) — ${rawCount} API entries → ${specs.length} rows in the size-aware replace-set for supplier_print_specs:`);
for (const s of specs) {
  console.log(`  ${s.placement_tag.padEnd(24)} [${s.size_tag}]  ${s.print_width_px}×${s.print_height_px}px @ ${s.target_dpi} DPI`);
}
for (const c of keyCollisions) {
  console.log(`  ⚠ size-key collision: ${c}`);
}
if (specsOnly) {
  console.log(`\nTemplates: SKIPPED (--specs-only) — templates are neither fetched nor written in this run.`);
} else {
  console.log(`\nTemplates (mockup-templates) — scanned ${scanned}/${total} rows, kept ${templates.length} after placement filter + dedupe:`);
  for (const t of templates) {
    console.log(
      `  ${t.placement_tag.padEnd(14)} frame ${t.template_width}×${t.template_height}  area ${t.print_area_width}×${t.print_area_height} @ left ${t.print_area_left}, top ${t.print_area_top}  variants ${t.catalog_variant_ids.length}  img …${(t.image_url ?? "").slice(-36)}`,
    );
  }
}

if (write) {
  const canonicalId = await resolveCanonicalId();
  if (specsOnly) {
    await writeSpecsReplaceSet(canonicalId, specs);
    console.log(`\nWritten (specs only): ${specs.length} spec rows replace-set for canonical ${canonicalId}; templates untouched.`);
  } else {
    await writeAll(canonicalId, specs, templates);
    console.log(`\nWritten: ${specs.length} spec rows replace-set, ${templates.length} template rows replaced for canonical ${canonicalId}.`);
  }
} else {
  console.log("\nDry run only. Re-run with --write to store these rows.");
}
