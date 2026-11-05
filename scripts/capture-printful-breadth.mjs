/**
 * Harvest CP2b — Printful BREADTH capture (code checkpoint; the lead
 * runs --write in a later checkpoint, after canonical seeding).
 *
 * What this script captures, per target:
 *
 *   8 BREADTH targets (full capture — specs + templates + costs):
 *     438  Gildan 5000            gildan-5000
 *     586  Comfort Colors 1717    comfort-colors-1717
 *     360  Bella + Canvas 6400    bella-canvas-6400
 *     356  Bella + Canvas 3501    bella-canvas-3501
 *     146  Gildan 18500           gildan-18500
 *     145  Gildan 18000           gildan-18000
 *     407  Enamel Mug             enamel-mug
 *     403  White Ceramic Mug      white-ceramic-mug-with-color-inside
 *          with Color Inside
 *     (Printful catalog ids + slugs exactly as mapped in the CP1
 *     dry-run, verify/harvest-cp1-dryrun.md, verified there against
 *     supplier_catalog_products.)
 *
 *   4 ANCHOR targets (COST BACKFILL ONLY — their specs/templates were
 *   already captured size-aware in CP2a-2; this script never touches
 *   anchor spec/template rows):
 *      71  Bella + Canvas 3001    bella-canvas-3001
 *      12  Gildan 64000           gildan-64000
 *      19  White Glossy Mug       white-glossy-mug
 *     300  Black Glossy Mug       black-glossy-mug
 *
 * Tables written (only with --write):
 *
 *   supplier_print_specs (breadth only)
 *     From GET /v2/catalog-products/{id}/mockup-styles. SIZE-AWARE,
 *     exactly the CP2a contract (migration 20261030213100; unique key
 *     (canonical_product_id, supplier_name, placement_tag, size_tag)):
 *       · style entry restricted to variants of ONE size → size_tag
 *         is that size name ('11 oz', '15 oz', '20 oz', …)
 *       · "Placeholder"-category style entry → size_tag 'placeholder'
 *         (captured, never filtered out)
 *       · otherwise (product-wide entry) → geometry tag
 *         '<w>x<h>in@<dpi>' (e.g. '12x16in@150', '3x1.13in@300')
 *     Exact-duplicate spec tuples dedupe at capture time (Printful
 *     repeats some label entries verbatim). Distinct tuples that
 *     still map to the same (placement_tag, size_tag) key keep the
 *     LAST entry with a printed warning — never a silent drop.
 *     Writes are the CP2a size-aware REPLACE-SET: delete the
 *     product+supplier's existing spec rows, insert the fresh set
 *     (capture-time dedupe guarantees no key repeats inside the set,
 *     so the insert satisfies the 4-column unique key above).
 *
 *   supplier_mockup_templates (breadth only)
 *     From GET /v2/catalog-products/{id}/mockup-templates (paged,
 *     limit 100 — the endpoint's placement filter is ignored, so we
 *     scan every page, keep placements front/back/default/
 *     sleeve_left/sleeve_right, and dedupe by (placement, image_url),
 *     the row covering the most catalog_variant_ids wins — same rule
 *     as capture-printful-stage.mjs). Writes are a replace-set.
 *
 *   supplier_product_costs (breadth + anchors)
 *     From GET /v2/catalog-products/{id}/prices (paged, limit 100):
 *     one row per variant, base_cost_usd = techniques[].discounted_price
 *     for the product's PRIMARY technique only (the technique flagged
 *     is_default on the catalog product). Conservative decisions,
 *     made by the lead — implemented here, not re-litigated:
 *       (a) PRIMARY-TECHNIQUE ONLY: a variant whose prices payload
 *           carries no entry for the primary technique is SKIPPED
 *           and counted in the output (no fallback to another
 *           technique's price). Per-placement print fees
 *           (data.product.placements[].discounted_price) are a
 *           separate Printful charge and are NOT folded in.
 *           LIVE-CATALOG VARIANTS ONLY: the prices endpoint can
 *           return variants that are not in the live catalog (CP1
 *           evidence: Comfort Colors 1717 → 420 priced vs 350
 *           catalog; Gildan 18000 → 233 priced vs 177 catalog). Only
 *           variants present in the product's live v1 variant list
 *           (GET /products/{id}) are kept; the rest are counted as
 *           filtered out, never written. An empty live variant set
 *           is a hard error, not an unfiltered fallback.
 *       (b) shipping_estimate_usd = 0 — see the in-code comment at
 *           the row shape: shipping is not exposed by the catalog
 *           API; calculated at order time — never free shipping.
 *       is_in_stock = !is_discontinued (the prices payload has no
 *       per-variant stock flag; the product-level flag is the
 *       closest signal).
 *     Writes upsert on the table's unique key via
 *     on_conflict=canonical_product_id,supplier_name,supplier_variant_id
 *     (same as capture-printful-harvest.mjs).
 *
 * CANONICAL GATE (lead decision (c)): every target must resolve
 * BEFORE anything is written for it —
 *   1. a supplier_catalog_products row with external_id = the
 *      Printful catalog id and external_id_type =
 *      'printful_catalog_product', and
 *   2. a canonical_products row whose sku_slug is the target's slug
 *      in this script's canonical map (the TARGETS tables below,
 *      mirroring PRINTFUL_BLUEPRINT_TO_CANONICAL_SLUG in
 *      src/lib/fabric/product-stage.ts, extended with the CP1
 *      breadth slugs).
 * If either row is missing the script FAILS LOUDLY for that target:
 * no silent seeding, no guessed slug, no skipped-in-silence.
 *   · --write: the gate is a PRE-FLIGHT over every selected target;
 *     if any target fails, the run aborts with the failures listed
 *     and writes NOTHING at all.
 *   · dry-run (default): the Printful reads still run so the would-be
 *     row counts are reported, each failing target is printed with a
 *     ✗ CANONICAL GATE FAILED line, the failures are repeated in the
 *     final summary, and the process exits 1.
 * (At CP2b time the 8 breadth slugs have NO canonical_products row —
 * seeding them is a separate, later checkpoint. A breadth dry-run
 * therefore reports counts AND gate failures; that is the honest
 * state, not a script bug.)
 *
 * Usage:
 *   node scripts/capture-printful-breadth.mjs                    # all 12 targets, DRY RUN (default)
 *   node scripts/capture-printful-breadth.mjs --dry-run          # same, explicit
 *   node scripts/capture-printful-breadth.mjs --list             # print the target list and exit
 *                                                                # (no API or DB calls)
 *   node scripts/capture-printful-breadth.mjs --breadth          # 8 breadth targets only
 *   node scripts/capture-printful-breadth.mjs --anchors          # 4 anchors only (cost backfill)
 *   node scripts/capture-printful-breadth.mjs --target 403       # one target (Printful id or slug;
 *   node scripts/capture-printful-breadth.mjs --target 71          repeatable)
 *   node scripts/capture-printful-breadth.mjs --json-out out.json  # + machine-readable report
 *   node scripts/capture-printful-breadth.mjs --write            # LATER CHECKPOINT ONLY: writes;
 *                                                                # aborts before writing if any
 *                                                                # selected target fails the
 *                                                                # canonical gate
 * --write and --dry-run together are an error (a run is one or the other).
 *
 * Keys come from the repo .env (PRINTFUL_API_KEY / PRINTFUL_BASE_URL,
 * SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) — the same credential
 * loading the existing capture scripts (capture-printful-stage.mjs,
 * capture-printful-harvest.mjs) use. Nothing secret is ever printed.
 * Dry-run mode performs Supabase READS only (the canonical gate) and
 * no database writes of any kind.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const KEEP_PLACEMENTS = new Set(["front", "back", "default", "sleeve_left", "sleeve_right"]);
const PAGE_LIMIT = 100;
const SUPPLIER = "printful";

// ── canonical map: Printful catalog id → canonical slug ──────
/**
 * The 8 breadth targets. Printful ids + catalog names verified
 * 2026-10-30 against supplier_catalog_products (CP1 dry-run,
 * verify/harvest-cp1-dryrun.md); `slug` is the canonical_products
 * sku_slug these rows attach to. This script seeds NOTHING — a slug
 * with no canonical_products row fails the canonical gate loudly.
 */
const BREADTH_TARGETS = [
  { printfulId: 438, slug: "gildan-5000", family: "tee", catalogName: "Unisex Classic Tee | Gildan 5000" },
  { printfulId: 586, slug: "comfort-colors-1717", family: "tee", catalogName: "Unisex Garment-Dyed Heavyweight T-Shirt | Comfort Colors 1717" },
  { printfulId: 360, slug: "bella-canvas-6400", family: "tee", catalogName: "Women's Relaxed T-Shirt | Bella + Canvas 6400" },
  { printfulId: 356, slug: "bella-canvas-3501", family: "tee", catalogName: "Unisex Long Sleeve Tee | Bella + Canvas 3501" },
  { printfulId: 146, slug: "gildan-18500", family: "hoodie", catalogName: "Unisex Heavy Blend Hoodie | Gildan 18500" },
  { printfulId: 145, slug: "gildan-18000", family: "hoodie/sweatshirt", catalogName: "Unisex Crew Neck Sweatshirt | Gildan 18000" },
  { printfulId: 407, slug: "enamel-mug", family: "mug", catalogName: "Enamel Mug" },
  { printfulId: 403, slug: "white-ceramic-mug-with-color-inside", family: "mug", catalogName: "White Ceramic Mug with Color Inside" },
];

/**
 * The 4 anchors — COST BACKFILL ONLY. Specs/templates were captured
 * size-aware in CP2a-2 and are not re-captured or re-written here.
 * Ids + slugs are PRINTFUL_BLUEPRINT_TO_CANONICAL_SLUG in
 * src/lib/fabric/product-stage.ts.
 */
const ANCHOR_TARGETS = [
  { printfulId: 71, slug: "bella-canvas-3001", family: "tee", catalogName: "Unisex Staple T-Shirt | Bella + Canvas 3001" },
  { printfulId: 12, slug: "gildan-64000", family: "tee", catalogName: "Unisex Basic Softstyle T-Shirt | Gildan 64000" },
  { printfulId: 19, slug: "white-glossy-mug", family: "mug", catalogName: "White Glossy Mug" },
  { printfulId: 300, slug: "black-glossy-mug", family: "mug", catalogName: "Black Glossy Mug" },
];

const ALL_TARGETS = [
  ...BREADTH_TARGETS.map((t) => ({ ...t, scope: "breadth" })),
  ...ANCHOR_TARGETS.map((t) => ({ ...t, scope: "anchor-costs" })),
];

// ── args ─────────────────────────────────────────────────────
const args = process.argv.slice(2);
function argValues(name) {
  const out = [];
  for (let i = 0; i < args.length; i++) if (args[i] === name && args[i + 1]) out.push(args[i + 1]);
  return out;
}
const write = args.includes("--write");
const explicitDryRun = args.includes("--dry-run");
const dryRun = !write;
const jsonOut = argValues("--json-out")[0] ?? null;

// --list: print the target list and exit BEFORE any env load, API
// call, or DB read — safe to run anywhere, proves nothing was captured.
if (args.includes("--list")) {
  console.log("Printful breadth capture — target list (CP2b):");
  console.log("\nBreadth targets (specs + templates + costs):");
  for (const t of BREADTH_TARGETS) console.log(`  ${String(t.printfulId).padStart(4)}  ${t.slug.padEnd(38)} [${t.family}] ${t.catalogName}`);
  console.log("\nAnchor targets (cost backfill ONLY — specs/templates untouched):");
  for (const t of ANCHOR_TARGETS) console.log(`  ${String(t.printfulId).padStart(4)}  ${t.slug.padEnd(38)} [${t.family}] ${t.catalogName}`);
  console.log(`\nTotal: ${ALL_TARGETS.length} targets (${BREADTH_TARGETS.length} breadth + ${ANCHOR_TARGETS.length} anchors).`);
  process.exit(0);
}
if (write && explicitDryRun) {
  console.error("--write and --dry-run are mutually exclusive: a run is one or the other.");
  process.exit(1);
}

const targetFilter = new Set(argValues("--target"));
let targets;
if (targetFilter.size) {
  targets = ALL_TARGETS.filter((t) => targetFilter.has(String(t.printfulId)) || targetFilter.has(t.slug));
} else if (args.includes("--anchors")) {
  targets = ALL_TARGETS.filter((t) => t.scope === "anchor-costs");
} else if (args.includes("--breadth")) {
  targets = ALL_TARGETS.filter((t) => t.scope === "breadth");
} else {
  targets = ALL_TARGETS;
}
if (targets.length === 0) {
  console.error("No targets matched the selection / --target filter.");
  process.exit(1);
}

// ── env (same loading as the existing capture scripts) ───────
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
if (!SB_URL || !SB_KEY) {
  throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required (canonical gate reads; writes only with --write)");
}
const SB_HEADERS = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  "Content-Type": "application/json",
};

// ── Printful reads ───────────────────────────────────────────
async function pfGet(pathname) {
  const r = await fetch(`${PF_BASE}${pathname}`, {
    headers: { Authorization: `Bearer ${PF_KEY}` },
  });
  if (!r.ok) throw new Error(`Printful ${pathname} → HTTP ${r.status}`);
  return r.json();
}

/** Catalog product detail: primary (is_default) technique + discontinued flag. */
async function fetchProduct(productId) {
  const j = await pfGet(`/v2/catalog-products/${productId}`);
  const d = j.data ?? {};
  const primaryTechnique =
    (d.techniques ?? []).find((t) => t.is_default)?.key ??
    (d.techniques ?? [])[0]?.key ??
    null;
  if (!primaryTechnique) {
    throw new Error(`Printful ${productId}: catalog product carries no technique — cannot price costs.`);
  }
  return {
    name: d.name ?? null,
    isDiscontinued: Boolean(d.is_discontinued),
    primaryTechnique,
    variantCount: d.variant_count ?? null,
  };
}

/**
 * v1 variant list for a product — ONE fetch serving three needs:
 * id → "size / color" labels (evidence), id → size name (size_tag),
 * and the live-catalog variant id set (the cost filter). NOT
 * best-effort: the cost filter is meaningless without the live set,
 * so a failure here is a hard error for the target.
 */
async function fetchVariants(productId) {
  const j = await pfGet(`/products/${productId}`);
  const labels = new Map();
  const sizes = new Map();
  const ids = new Set();
  for (const v of j.result?.variants ?? []) {
    ids.add(String(v.id));
    labels.set(v.id, [v.size, v.color].filter(Boolean).join(" / "));
    if (v.size) sizes.set(v.id, v.size);
  }
  if (ids.size === 0) {
    throw new Error(`Printful ${productId}: live v1 variant list is empty — refusing to capture unfiltered prices.`);
  }
  return { labels, sizes, ids };
}

/** Geometry tag component: trim float noise ('10.2367', '3.5', '12'). */
function fmtNum(n) {
  return String(Number(Number(n).toFixed(4)));
}

/**
 * size_tag per the CP2a contract (migration 20261030213100). Order
 * matters: Placeholder-category first (its entries carry no variant
 * restriction), then single-size restriction, then geometry.
 */
function computeSizeTag(entry) {
  if (entry.is_placeholder_style) return "placeholder";
  if (entry.variant_ids.length > 0 && entry.variant_sizes_pure.length === 1) {
    return entry.variant_sizes_pure[0];
  }
  return `${fmtNum(entry.print_area_width_in)}x${fmtNum(entry.print_area_height_in)}in@${entry.target_dpi}`;
}

/** mockup-styles → supplier_print_specs row shapes (size-aware, deduped). */
async function fetchSpecs(productId, variants) {
  const j = await pfGet(`/v2/catalog-products/${productId}/mockup-styles`);
  const raw = (j.data ?? []).map((s) => {
    const dpi = s.dpi || 300;
    const styles = s.mockup_styles ?? [];
    const variantIds = [...new Set(styles.flatMap((m) => m.restricted_to_variants ?? []))];
    return {
      placement_tag: s.placement,
      technique: s.technique ?? null,
      print_area_type: s.print_area_type ?? null,
      print_area_width_in: s.print_area_width || 0,
      print_area_height_in: s.print_area_height || 0,
      print_width_px: Math.round((s.print_area_width || 0) * dpi),
      print_height_px: Math.round((s.print_area_height || 0) * dpi),
      target_dpi: dpi,
      variant_ids: variantIds,
      variant_sizes_pure: [...new Set(variantIds.map((id) => variants.sizes.get(id)).filter(Boolean))],
      // Printful marks generic fallback styles category_name
      // "Placeholder" (seen on mugs, restricted_to_variants null).
      // Apparel entries with null restriction are NOT placeholders —
      // they apply product-wide.
      is_placeholder_style:
        styles.length > 0 && styles.every((m) => m.category_name === "Placeholder"),
      raw_payload: s,
    };
  });
  for (const e of raw) e.size_tag = computeSizeTag(e);

  // Exact-duplicate spec tuples dedupe at capture time (CP1 finding:
  // Printful repeats some label entries verbatim).
  const seen = new Set();
  const deduped = [];
  let exactDuplicates = 0;
  for (const e of raw) {
    const key = [
      e.placement_tag, e.size_tag, e.technique, e.print_area_type,
      e.print_width_px, e.print_height_px, e.target_dpi,
      e.variant_ids.join(","),
    ].join("|");
    if (seen.has(key)) { exactDuplicates++; continue; }
    seen.add(key);
    deduped.push(e);
  }

  // Key dedupe: the size-aware unique key holds one row per
  // (placement_tag, size_tag). Distinct tuples can still collide
  // there (a mug's two Placeholder geometries, both 'placeholder')
  // — LAST wins, recorded here, never silent.
  const bySizeKey = new Map();
  const keyCollisions = [];
  for (const e of deduped) {
    const key = `${e.placement_tag}|${e.size_tag}`;
    if (bySizeKey.has(key)) {
      const prev = bySizeKey.get(key);
      keyCollisions.push(
        `${e.placement_tag} [${e.size_tag}]: ${prev.print_width_px}×${prev.print_height_px}px superseded by ${e.print_width_px}×${e.print_height_px}px (unique key holds one)`,
      );
    }
    bySizeKey.set(key, e);
  }
  const entries = [...bySizeKey.values()];
  const specs = entries.map((e) => ({
    supplier_name: SUPPLIER,
    supplier_blueprint_id: String(productId),
    placement_tag: e.placement_tag,
    size_tag: e.size_tag,
    print_width_px: e.print_width_px,
    print_height_px: e.print_height_px,
    target_dpi: e.target_dpi,
    offset_top_percent: 0,
    offset_left_percent: 0,
    raw_payload: e.raw_payload,
  }));
  return { specs, rawEntryCount: raw.length, exactDuplicates, keyCollisions };
}

/** Paged mockup-templates scan → deduped supplier_mockup_templates row shapes. */
async function fetchTemplates(productId) {
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
        supplier_name: SUPPLIER,
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

/**
 * Paged prices → supplier_product_costs row shapes.
 * Lead decisions (a)+(b), see header: PRIMARY technique's
 * discounted_price only, LIVE-CATALOG variants only.
 */
async function fetchCosts(productId, primaryTechnique, isDiscontinued, catalogVariantIds) {
  const rows = [];
  let pricesSeen = 0;
  let filteredOut = 0;
  let missingPrimaryTechnique = 0;
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const j = await pfGet(
      `/v2/catalog-products/${productId}/prices?limit=${PAGE_LIMIT}&offset=${offset}`,
    );
    const variants = j.data?.variants ?? [];
    total = j.paging?.total ?? offset + variants.length;
    for (const v of variants) {
      pricesSeen++;
      // Live-catalog filter: prices can carry discontinued/legacy
      // variant ids the live catalog no longer holds (CP1: 586 →
      // 420 priced vs 350 catalog). Those are never written.
      if (!catalogVariantIds.has(String(v.id))) { filteredOut++; continue; }
      // Primary technique ONLY — no fallback to another technique.
      const tech = (v.techniques ?? []).find((t) => t.technique_key === primaryTechnique);
      if (!tech) { missingPrimaryTechnique++; continue; }
      rows.push({
        supplier_name: SUPPLIER,
        supplier_variant_id: String(v.id),
        // Base cost = the primary technique's discounted_price for
        // this variant, exactly as the prices payload reports it
        // (per-placement print fees not folded in — see header).
        base_cost_usd: Number(tech.discounted_price),
        // shipping_estimate_usd = 0: shipping is not exposed by the
        // catalog API; calculated at order time — never free shipping.
        shipping_estimate_usd: 0,
        // The prices payload carries no per-variant stock flag; the
        // closest product-level signal is is_discontinued.
        is_in_stock: !isDiscontinued,
        technique_key: tech.technique_key, // analysis only — not a table column
      });
    }
    offset += PAGE_LIMIT;
    if (variants.length === 0) break;
  }
  return { rows, pricesSeen, filteredOut, missingPrimaryTechnique, catalogVariantCount: catalogVariantIds.size };
}

// ── canonical gate (Supabase READS only) ─────────────────────
/**
 * Resolve a target through supplier_catalog_products + the canonical
 * map (this script's TARGETS tables) into canonical_products.
 * Returns { catalogRow, canonicalId, failures[] } — failures is a
 * list of human-readable reasons; non-empty means FAIL LOUDLY.
 */
async function resolveCanonical(target) {
  const failures = [];

  const catRes = await fetch(
    `${SB_URL}/rest/v1/supplier_catalog_products?select=id,name,external_id` +
      `&external_id=eq.${encodeURIComponent(String(target.printfulId))}` +
      `&external_id_type=eq.printful_catalog_product`,
    { headers: SB_HEADERS },
  );
  const catRows = await catRes.json();
  const catalogRow = Array.isArray(catRows) && catRows.length > 0 ? catRows[0] : null;
  if (!catRes.ok) {
    failures.push(`supplier_catalog_products lookup failed (HTTP ${catRes.status})`);
  } else if (!catalogRow) {
    failures.push(
      `no supplier_catalog_products row for external_id '${target.printfulId}' (external_id_type 'printful_catalog_product')`,
    );
  }

  const canRes = await fetch(
    `${SB_URL}/rest/v1/canonical_products?select=id&sku_slug=eq.${encodeURIComponent(target.slug)}`,
    { headers: SB_HEADERS },
  );
  const canRows = await canRes.json();
  const canonicalId = Array.isArray(canRows) && canRows.length > 0 ? canRows[0].id : null;
  if (!canRes.ok) {
    failures.push(`canonical_products lookup failed (HTTP ${canRes.status})`);
  } else if (!canonicalId) {
    failures.push(
      `no canonical_products row for slug '${target.slug}' (canonical map: Printful ${target.printfulId} → '${target.slug}') — seed it in a separate checkpoint; this script never seeds`,
    );
  }

  return { catalogRow, canonicalId, failures };
}

// ── Supabase writes (--write only; reached only after the ────
//    pre-flight gate passes for EVERY selected target) ───────
async function writeSpecsReplaceSet(canonicalId, target, specs) {
  const del = await fetch(
    `${SB_URL}/rest/v1/supplier_print_specs?canonical_product_id=eq.${canonicalId}&supplier_name=eq.${SUPPLIER}`,
    { method: "DELETE", headers: { ...SB_HEADERS, Prefer: "return=minimal" } },
  );
  if (!del.ok) throw new Error(`specs delete → HTTP ${del.status}: ${await del.text()}`);
  const specRows = specs.map((s) => ({ ...s, canonical_product_id: canonicalId }));
  const r = await fetch(`${SB_URL}/rest/v1/supplier_print_specs`, {
    method: "POST",
    headers: { ...SB_HEADERS, Prefer: "return=minimal" },
    body: JSON.stringify(specRows),
  });
  if (!r.ok) throw new Error(`specs insert → HTTP ${r.status}: ${await r.text()}`);
}

async function writeTemplatesReplaceSet(canonicalId, target, templates) {
  const del = await fetch(
    `${SB_URL}/rest/v1/supplier_mockup_templates?canonical_product_id=eq.${canonicalId}&supplier_name=eq.${SUPPLIER}`,
    { method: "DELETE", headers: { ...SB_HEADERS, Prefer: "return=minimal" } },
  );
  if (!del.ok) throw new Error(`templates delete → HTTP ${del.status}: ${await del.text()}`);
  const tplRows = templates.map((t) => ({ ...t, canonical_product_id: canonicalId }));
  const r = await fetch(`${SB_URL}/rest/v1/supplier_mockup_templates`, {
    method: "POST",
    headers: { ...SB_HEADERS, Prefer: "return=minimal" },
    body: JSON.stringify(tplRows),
  });
  if (!r.ok) throw new Error(`templates insert → HTTP ${r.status}: ${await r.text()}`);
}

async function writeCostsUpsert(canonicalId, costs) {
  const costRows = costs.map((c) => ({
    canonical_product_id: canonicalId,
    supplier_name: c.supplier_name,
    supplier_variant_id: c.supplier_variant_id,
    base_cost_usd: c.base_cost_usd,
    shipping_estimate_usd: c.shipping_estimate_usd,
    is_in_stock: c.is_in_stock,
    last_checked_at: new Date().toISOString(),
  }));
  const r = await fetch(
    `${SB_URL}/rest/v1/supplier_product_costs?on_conflict=canonical_product_id,supplier_name,supplier_variant_id`,
    {
      method: "POST",
      headers: { ...SB_HEADERS, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(costRows),
    },
  );
  if (!r.ok) throw new Error(`costs upsert → HTTP ${r.status}: ${await r.text()}`);
}

// ── run ──────────────────────────────────────────────────────
console.log(
  `Printful breadth capture (CP2b) — ${targets.length} targets, ${write ? "WRITE" : "DRY RUN — no database writes"}`,
);

// Canonical gate FIRST for every selected target (reads only).
const gate = new Map(); // printfulId -> resolveCanonical result
for (const target of targets) {
  gate.set(target.printfulId, await resolveCanonical(target));
}
const gateFailures = targets.filter((t) => gate.get(t.printfulId).failures.length > 0);

if (write && gateFailures.length > 0) {
  console.error("\n✗ CANONICAL GATE FAILED — --write aborted, NOTHING was written:");
  for (const t of gateFailures) {
    for (const f of gate.get(t.printfulId).failures) {
      console.error(`  ✗ Printful ${t.printfulId} (${t.slug}): ${f}`);
    }
  }
  console.error("Seed the missing rows in a separate checkpoint, then re-run. This script never seeds and never guesses.");
  process.exit(1);
}

const report = [];
const totals = { specs: 0, templates: 0, costs: 0 };
for (const target of targets) {
  const g = gate.get(target.printfulId);
  const isBreadth = target.scope === "breadth";
  const product = await fetchProduct(target.printfulId);
  const variants = await fetchVariants(target.printfulId);

  // Anchors: cost backfill only — specs/templates are not fetched.
  const specResult = isBreadth
    ? await fetchSpecs(target.printfulId, variants)
    : { specs: [], rawEntryCount: 0, exactDuplicates: 0, keyCollisions: [] };
  const tplResult = isBreadth
    ? await fetchTemplates(target.printfulId)
    : { templates: [], scanned: 0, total: 0 };
  const costs = await fetchCosts(
    target.printfulId, product.primaryTechnique, product.isDiscontinued, variants.ids,
  );

  totals.specs += specResult.specs.length;
  totals.templates += tplResult.templates.length;
  totals.costs += costs.rows.length;

  const entry = {
    target: { printful_id: target.printfulId, slug: target.slug, family: target.family, scope: target.scope },
    canonical: {
      supplier_catalog_product_id: g.catalogRow?.id ?? null,
      canonical_product_id: g.canonicalId,
      gate_failures: g.failures,
    },
    specs: isBreadth
      ? {
          api_entries_raw: specResult.rawEntryCount,
          exact_duplicate_entries: specResult.exactDuplicates,
          size_aware_rows: specResult.specs.length,
          key_collisions: specResult.keyCollisions,
          rows: specResult.specs.map(({ raw_payload, ...rest }) => rest),
        }
      : "skipped — anchor cost backfill only",
    templates: isBreadth
      ? { scanned: tplResult.scanned, total: tplResult.total, rows: tplResult.templates.length, by_placement: countBy(tplResult.templates, "placement_tag") }
      : "skipped — anchor cost backfill only",
    costs: {
      rows: costs.rows.length,
      prices_rows_seen: costs.pricesSeen,
      filtered_out_non_catalog_variants: costs.filteredOut,
      skipped_no_primary_technique: costs.missingPrimaryTechnique,
      catalog_variant_count: costs.catalogVariantCount,
      primary_technique: product.primaryTechnique,
      min_usd: costs.rows.length ? Math.min(...costs.rows.map((c) => c.base_cost_usd)) : null,
      max_usd: costs.rows.length ? Math.max(...costs.rows.map((c) => c.base_cost_usd)) : null,
    },
    would_be_rows: {
      supplier_print_specs: specResult.specs.length,
      supplier_mockup_templates: tplResult.templates.length,
      supplier_product_costs: costs.rows.length,
    },
  };
  report.push(entry);

  console.log(
    `\n■ Printful ${target.printfulId} — ${target.catalogName}  [${target.family}, ${target.scope}]  (${write ? "WRITE" : "DRY RUN"})`,
  );
  if (g.failures.length > 0) {
    for (const f of g.failures) console.log(`  ✗ CANONICAL GATE FAILED: ${f}`);
  } else {
    console.log(
      `  canonical '${target.slug}': FOUND ${g.canonicalId} (via supplier_catalog_products ${g.catalogRow.id})`,
    );
  }
  if (isBreadth) {
    console.log(
      `  specs: ${specResult.rawEntryCount} API entries (${specResult.exactDuplicates} exact duplicates deduped) → ${specResult.specs.length} size-aware rows would be written`,
    );
    for (const kc of specResult.keyCollisions) console.log(`      ⚠ size-key collision: ${kc}`);
    console.log(
      `  templates: scanned ${tplResult.scanned}/${tplResult.total}, ${tplResult.templates.length} rows would be written ${JSON.stringify(entry.templates.by_placement)}`,
    );
  } else {
    console.log("  specs/templates: SKIPPED — anchor cost backfill only (CP2a-2 rows untouched)");
  }
  console.log(
    `  costs: ${costs.rows.length} variant rows would be written (prices endpoint returned ${costs.pricesSeen}; ${costs.filteredOut} filtered out as not in the live catalog of ${costs.catalogVariantCount} variants; ${costs.missingPrimaryTechnique} skipped — no primary technique '${product.primaryTechnique}'), base $${entry.costs.min_usd}–$${entry.costs.max_usd}`,
  );
  console.log(
    `  would-be rows: supplier_print_specs=${entry.would_be_rows.supplier_print_specs} supplier_mockup_templates=${entry.would_be_rows.supplier_mockup_templates} supplier_product_costs=${entry.would_be_rows.supplier_product_costs}`,
  );

  if (write) {
    // Gate pre-flight already passed for every selected target.
    if (isBreadth) {
      await writeSpecsReplaceSet(g.canonicalId, target, specResult.specs);
      await writeTemplatesReplaceSet(g.canonicalId, target, tplResult.templates);
    }
    await writeCostsUpsert(g.canonicalId, costs.rows);
    console.log(
      isBreadth
        ? `  Written for canonical ${g.canonicalId}: ${specResult.specs.length} spec rows replace-set, ${tplResult.templates.length} template rows replace-set, ${costs.rows.length} cost rows upserted.`
        : `  Written for canonical ${g.canonicalId}: ${costs.rows.length} cost rows upserted (specs/templates untouched).`,
    );
  }
}

function countBy(rows, key) {
  const out = {};
  for (const r of rows) out[r[key]] = (out[r[key]] ?? 0) + 1;
  return out;
}

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify(report, null, 2));
  console.log(`\nAnalysis JSON written to ${jsonOut}`);
}
console.log(
  `\nWould-be row totals across ${report.length} targets: supplier_print_specs=${totals.specs} supplier_mockup_templates=${totals.templates} supplier_product_costs=${totals.costs}`,
);
if (gateFailures.length > 0) {
  console.log(`\n✗ CANONICAL GATE FAILURES (${gateFailures.length} target${gateFailures.length === 1 ? "" : "s"}):`);
  for (const t of gateFailures) {
    for (const f of gate.get(t.printfulId).failures) {
      console.log(`  ✗ Printful ${t.printfulId} (${t.slug}): ${f}`);
    }
  }
  console.log("These targets CANNOT be written until the missing rows are seeded in a separate checkpoint.");
}
console.log(
  `\nDone: ${report.length} targets, ${write ? "WRITE mode" : "DRY RUN — no database writes made"}.`,
);
if (gateFailures.length > 0) process.exit(1);
