/**
 * Harvest breadth capture — Printful specs + mockup templates + variant
 * costs for the tee / mug / hoodie families beyond the 4 anchor products
 * that scripts/capture-printful-stage.mjs captured first.
 *
 * CHECKPOINT 1 (2026-10-30): DRY RUN ONLY in practice — the analysis
 * below is the deliverable. The --write path exists for a later
 * checkpoint but refuses to write any target whose canonical_products
 * row does not exist yet (CP1 creates NO canonical rows).
 *
 * Per target product, three Printful API v2 reads + one v1 read:
 *
 *   GET /v2/catalog-products/{id}/mockup-styles
 *     → supplier_print_specs row shapes, PLUS a collapse analysis:
 *       supplier_print_specs is UNIQUE on
 *       (canonical_product_id, supplier_name, placement_tag) with NO
 *       size discriminator, but Printful returns one style entry per
 *       SIZE GROUP under the same placement (e.g. a mug's "default"
 *       placement at 9×3.5in for 11 oz and 9×3.8in for 15 oz). An
 *       upsert on the current key silently keeps only one of them.
 *       This script groups entries by placement and reports every
 *       distinct print size that would collide.
 *
 *   GET /v2/catalog-products/{id}/mockup-templates?limit=100&offset=N
 *     → supplier_mockup_templates row shapes (same placement filter +
 *       dedupe rule as capture-printful-stage.mjs).
 *
 *   GET /v2/catalog-products/{id}/prices?limit=100&offset=N  (paged)
 *     → supplier_product_costs row shapes: one row per catalog
 *       variant, base_cost_usd = the discounted_price of the product's
 *       PRIMARY technique (the technique flagged is_default on the
 *       catalog product; fallback: the variant's first technique).
 *       NOTE: this is the variant technique price only — per-placement
 *       print fees (data.product.placements[].discounted_price) are a
 *       separate Printful charge and are NOT folded in here; that
 *       composition decision belongs to a later checkpoint.
 *       shipping_estimate_usd is written as 0 because Printful's
 *       catalog API does not expose shipping rates — shipping is
 *       calculated at order time. 0 here means "not captured", NEVER
 *       "free shipping".
 *
 *   GET /products/{id}   (v1, best-effort, evidence only)
 *     → variant id → size/color names, used to label the collapse
 *       evidence with real size names ("11 oz", "15 oz", …).
 *
 * Usage:
 *   node scripts/capture-printful-harvest.mjs                     # all targets, dry run
 *   node scripts/capture-printful-harvest.mjs --target 403        # one target (id or slug)
 *   node scripts/capture-printful-harvest.mjs --json-out out.json # + machine-readable analysis
 *   node scripts/capture-printful-harvest.mjs --write             # later checkpoint only;
 *                                                                   # skips targets with no canonical row
 *   node scripts/capture-printful-harvest.mjs --write --specs-only
 *                                                                 # CP2a-2: spec writes are a
 *                                                                   # SIZE-AWARE REPLACE-SET (delete the
 *                                                                   # product's spec rows, insert the fresh
 *                                                                   # set with size_tag per the CP1 contract);
 *                                                                   # --specs-only writes SPECS ONLY —
 *                                                                   # templates/costs are not written.
 *                                                                   # Without the flag, templates/costs
 *                                                                   # write behaviour is exactly as before.
 *
 * Keys come from the repo .env (PRINTFUL_API_KEY / PRINTFUL_BASE_URL,
 * SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) — the same source the
 * existing capture script uses. Nothing secret is printed. Supabase is
 * only ever READ in dry-run mode.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const KEEP_PLACEMENTS = new Set(["front", "back", "default", "sleeve_left", "sleeve_right"]);
const PAGE_LIMIT = 100;

/**
 * Breadth targets beyond the 4 anchors (anchors: 71 bella-canvas-3001,
 * 12 gildan-64000, 19 white-glossy-mug, 300 black-glossy-mug).
 * Printful ids + catalog names verified 2026-10-30 against
 * supplier_catalog_products (supplier Printful, external_id_type
 * printful_catalog_product). `proposedSlug` is the canonical_products
 * sku_slug these rows WOULD attach to — CP1 creates no canonical rows,
 * so every target without an existing row is reported as a GAP.
 */
const TARGETS = [
  { printfulId: 438, proposedSlug: "gildan-5000", family: "tee", catalogName: "Unisex Classic Tee | Gildan 5000" },
  { printfulId: 586, proposedSlug: "comfort-colors-1717", family: "tee", catalogName: "Unisex Garment-Dyed Heavyweight T-Shirt | Comfort Colors 1717" },
  { printfulId: 360, proposedSlug: "bella-canvas-6400", family: "tee", catalogName: "Women's Relaxed T-Shirt | Bella + Canvas 6400" },
  { printfulId: 356, proposedSlug: "bella-canvas-3501", family: "tee", catalogName: "Unisex Long Sleeve Tee | Bella + Canvas 3501" },
  { printfulId: 146, proposedSlug: "gildan-18500", family: "hoodie", catalogName: "Unisex Heavy Blend Hoodie | Gildan 18500" },
  { printfulId: 145, proposedSlug: "gildan-18000", family: "hoodie/sweatshirt", catalogName: "Unisex Crew Neck Sweatshirt | Gildan 18000" },
  { printfulId: 407, proposedSlug: "enamel-mug", family: "mug", catalogName: "Enamel Mug" },
  { printfulId: 403, proposedSlug: "white-ceramic-mug-with-color-inside", family: "mug", catalogName: "White Ceramic Mug with Color Inside" },
];

// ── args ─────────────────────────────────────────────────────
const args = process.argv.slice(2);
function argValues(name) {
  const out = [];
  for (let i = 0; i < args.length; i++) if (args[i] === name && args[i + 1]) out.push(args[i + 1]);
  return out;
}
const write = args.includes("--write");
const specsOnly = args.includes("--specs-only");
const jsonOut = argValues("--json-out")[0] ?? null;
const targetFilter = new Set(argValues("--target"));
const targets = targetFilter.size
  ? TARGETS.filter((t) => targetFilter.has(String(t.printfulId)) || targetFilter.has(t.proposedSlug))
  : TARGETS;
if (targets.length === 0) {
  console.error("No targets matched --target filter.");
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
if (!SB_URL || !SB_KEY) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required (read-only canonical lookup)");

// ── Printful reads ───────────────────────────────────────────
async function pfGet(pathname) {
  const r = await fetch(`${PF_BASE}${pathname}`, {
    headers: { Authorization: `Bearer ${PF_KEY}` },
  });
  if (!r.ok) throw new Error(`Printful ${pathname} → HTTP ${r.status}`);
  return r.json();
}

/** Catalog product detail: default technique, sizes, discontinued flag. */
async function fetchProduct(productId) {
  const j = await pfGet(`/v2/catalog-products/${productId}`);
  const d = j.data ?? {};
  const primaryTechnique =
    (d.techniques ?? []).find((t) => t.is_default)?.key ??
    (d.techniques ?? [])[0]?.key ??
    null;
  return {
    name: d.name ?? null,
    sizes: d.sizes ?? [],
    isDiscontinued: Boolean(d.is_discontinued),
    primaryTechnique,
    variantCount: d.variant_count ?? null,
  };
}

/** v1 variant id → "size / color" labels (evidence only, best-effort). */
async function fetchVariantLabels(productId) {
  try {
    const j = await pfGet(`/products/${productId}`);
    const map = new Map();
    for (const v of j.result?.variants ?? []) {
      map.set(v.id, [v.size, v.color].filter(Boolean).join(" / "));
    }
    return map;
  } catch {
    return new Map();
  }
}

/** v1 variant id → size name only ('11 oz', 'S', …), for size_tag. */
async function fetchVariantSizes(productId) {
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
 * size_tag per the CP1 contract (migration 20261030213100):
 * Placeholder-category → 'placeholder'; entry restricted to
 * variants of ONE size → that size name; otherwise the geometry
 * tag '<w>x<h>in@<dpi>'.
 */
function computeSizeTag(entry) {
  if (entry.is_placeholder_style) return "placeholder";
  if (entry.variant_ids.length > 0 && entry.variant_sizes_pure.length === 1) {
    return entry.variant_sizes_pure[0];
  }
  return `${fmtNum(entry.print_area_width_in)}x${fmtNum(entry.print_area_height_in)}in@${entry.target_dpi}`;
}

/** mockup-styles → spec entries (exact duplicates removed) + collapse analysis. */
async function fetchSpecs(productId, variantLabels, variantSizes) {
  const j = await pfGet(`/v2/catalog-products/${productId}/mockup-styles`);
  const raw = (j.data ?? []).map((s) => {
    const dpi = s.dpi || 300;
    const styles = s.mockup_styles ?? [];
    const restricted = styles.flatMap((m) => m.restricted_to_variants ?? []);
    const variantIds = [...new Set(restricted)];
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
      variant_sizes: [...new Set(variantIds.map((id) => variantLabels.get(id)).filter(Boolean))],
      variant_sizes_pure: [...new Set(variantIds.map((id) => variantSizes.get(id)).filter(Boolean))],
      // Printful marks generic fallback styles category_name
      // "Placeholder" (seen on mugs, restricted_to_variants null).
      // Apparel entries with null restriction are NOT placeholders —
      // they apply product-wide.
      is_placeholder_style:
        styles.length > 0 && styles.every((m) => m.category_name === "Placeholder"),
      raw_payload: s,
    };
  });

  // size_tag per the CP1 contract (CP2a-2) — computed for every
  // entry before dedupe so both dedupe stages see it.
  for (const e of raw) e.size_tag = computeSizeTag(e);

  // Exact duplicates exist in the wild (e.g. Gildan 5000 label_inside
  // 3×3in @150 "color_group" appears twice, identical in every spec
  // field). Deduping them loses nothing; only DISTINCT tuples matter
  // for the collapse analysis.
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

  // Key dedupe: the size-aware unique key (migration 20261030213100)
  // holds one row per (placement_tag, size_tag). Distinct tuples can
  // still collide there (a mug's two Placeholder geometries, both
  // 'placeholder') — LAST wins, recorded here, never silent.
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

  // Collapse analysis (CP1, pre-migration key): the old unique key
  // had no size discriminator, so within one placement every
  // DISTINCT size tuple competed for a single row. Group by
  // placement → distinct (w,h,dpi) tuples. Built from `deduped`
  // (exact duplicates removed, size-key dedupe NOT yet applied) so
  // the geometry census stays the CP1 one.
  const byPlacement = new Map();
  for (const e of deduped) {
    if (!byPlacement.has(e.placement_tag)) byPlacement.set(e.placement_tag, new Map());
    const key = `${e.print_width_px}x${e.print_height_px}@${e.target_dpi}`;
    const group = byPlacement.get(e.placement_tag);
    if (!group.has(key)) group.set(key, []);
    group.get(key).push(e);
  }
  const collisions = [];
  for (const [placement, groups] of byPlacement) {
    if (groups.size > 1) {
      collisions.push({
        placement_tag: placement,
        distinct_sizes: [...groups.entries()].map(([sizeKey, es]) => ({
          size: sizeKey,
          inches: [...new Set(es.map((e) => `${e.print_area_width_in}×${e.print_area_height_in}`))],
          print_area_types: [...new Set(es.map((e) => e.print_area_type))],
          variant_sizes: [...new Set(es.flatMap((e) => e.variant_sizes))],
          variant_ids: [...new Set(es.flatMap((e) => e.variant_ids))],
          placeholder_style: es.every((e) => e.is_placeholder_style),
        })),
      });
    }
  }
  // Distinct spec rows a size-aware key would store = sum over
  // placements of distinct size tuples.
  const distinctSpecRows = [...byPlacement.values()].reduce((n, g) => n + g.size, 0);
  return {
    entries,
    rawEntryCount: raw.length,
    exactDuplicates,
    entryCount: entries.length,
    distinctSpecRows,
    // Rows an upsert on the pre-migration unique key would have
    // left behind (CP1 collapse analysis, kept for comparison):
    survivingRowCount: byPlacement.size,
    distinctSpecsLost: distinctSpecRows - byPlacement.size,
    collisions,
    // Rows the size-aware replace-set actually stores:
    sizeAwareRowCount: entries.length,
    keyCollisions,
  };
}

/** Paged mockup-templates scan → deduped rows (same rule as the anchor script). */
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

/** Paged prices → supplier_product_costs row shapes. */
async function fetchCosts(productId, primaryTechnique, isDiscontinued) {
  const rows = [];
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const j = await pfGet(
      `/v2/catalog-products/${productId}/prices?limit=${PAGE_LIMIT}&offset=${offset}`,
    );
    const variants = j.data?.variants ?? [];
    total = j.paging?.total ?? offset + variants.length;
    for (const v of variants) {
      const tech =
        (v.techniques ?? []).find((t) => t.technique_key === primaryTechnique) ??
        (v.techniques ?? [])[0];
      if (!tech) continue;
      rows.push({
        supplier_name: "printful",
        supplier_variant_id: String(v.id),
        // Base cost = the primary technique's discounted price for
        // this variant, exactly as Printful's catalog price payload
        // reports it (per-placement print fees not folded in — see
        // header note).
        base_cost_usd: Number(tech.discounted_price),
        // Printful's catalog API does not expose shipping rates;
        // shipping is calculated at order time. 0 means "not
        // captured", never "free shipping".
        shipping_estimate_usd: 0,
        // The catalog prices payload carries no per-variant stock
        // flag; the closest product-level signal is is_discontinued.
        is_in_stock: !isDiscontinued,
        technique_key: tech.technique_key,
      });
    }
    offset += PAGE_LIMIT;
    if (variants.length === 0) break;
  }
  return rows;
}

// ── Supabase reads (canonical lookup only) ───────────────────
const SB_HEADERS = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  "Content-Type": "application/json",
};

async function resolveCanonicalId(slug) {
  const r = await fetch(
    `${SB_URL}/rest/v1/canonical_products?select=id&sku_slug=eq.${encodeURIComponent(slug)}`,
    { headers: SB_HEADERS },
  );
  const rows = await r.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0].id : null;
}

// ── Supabase writes (later checkpoint only; never run in CP1) ─
async function writeAll(canonicalId, target, specs, templates, costs, specsOnlyFlag = false) {
  // Specs: SIZE-AWARE REPLACE-SET (CP2a-2) — delete this
  // product+supplier's existing spec rows, then insert the full
  // fresh set with size_tag. Plain insert: capture-time dedupe
  // guarantees no (placement_tag, size_tag) key repeats in the set.
  const specRows = specs.entries.map((e) => ({
    canonical_product_id: canonicalId,
    supplier_name: "printful",
    supplier_blueprint_id: String(target.printfulId),
    placement_tag: e.placement_tag,
    size_tag: e.size_tag,
    print_width_px: e.print_width_px,
    print_height_px: e.print_height_px,
    target_dpi: e.target_dpi,
    offset_top_percent: 0,
    offset_left_percent: 0,
    raw_payload: e.raw_payload,
  }));
  const delSpecs = await fetch(
    `${SB_URL}/rest/v1/supplier_print_specs?canonical_product_id=eq.${canonicalId}&supplier_name=eq.printful`,
    { method: "DELETE", headers: { ...SB_HEADERS, Prefer: "return=minimal" } },
  );
  if (!delSpecs.ok) throw new Error(`specs delete → HTTP ${delSpecs.status}: ${await delSpecs.text()}`);
  const r1 = await fetch(`${SB_URL}/rest/v1/supplier_print_specs`, {
    method: "POST",
    headers: { ...SB_HEADERS, Prefer: "return=minimal" },
    body: JSON.stringify(specRows),
  });
  if (!r1.ok) throw new Error(`specs insert → HTTP ${r1.status}: ${await r1.text()}`);

  // --specs-only (CP2a-2): templates and costs are NOT written.
  if (specsOnlyFlag) return;

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

  const costRows = costs.map((c) => ({
    canonical_product_id: canonicalId,
    supplier_name: c.supplier_name,
    supplier_variant_id: c.supplier_variant_id,
    base_cost_usd: c.base_cost_usd,
    shipping_estimate_usd: c.shipping_estimate_usd,
    is_in_stock: c.is_in_stock,
    last_checked_at: new Date().toISOString(),
  }));
  const r3 = await fetch(
    `${SB_URL}/rest/v1/supplier_product_costs?on_conflict=canonical_product_id,supplier_name,supplier_variant_id`,
    {
      method: "POST",
      headers: { ...SB_HEADERS, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(costRows),
    },
  );
  if (!r3.ok) throw new Error(`costs upsert → HTTP ${r3.status}: ${await r3.text()}`);
}

// ── run ──────────────────────────────────────────────────────
const report = [];
for (const target of targets) {
  const product = await fetchProduct(target.printfulId);
  const variantLabels = await fetchVariantLabels(target.printfulId);
  const variantSizes = await fetchVariantSizes(target.printfulId);
  const specs = await fetchSpecs(target.printfulId, variantLabels, variantSizes);
  const { templates, scanned, total } = await fetchTemplates(target.printfulId);
  const costs = await fetchCosts(target.printfulId, product.primaryTechnique, product.isDiscontinued);
  const canonicalId = await resolveCanonicalId(target.proposedSlug);

  const entry = {
    target,
    catalog_product: product,
    canonical_id: canonicalId,
    canonical_gap: canonicalId === null,
    specs: {
      api_entries_raw: specs.rawEntryCount,
      exact_duplicate_entries: specs.exactDuplicates,
      distinct_spec_rows: specs.distinctSpecRows,
      rows_under_current_unique_key: specs.survivingRowCount,
      distinct_specs_lost_to_collapse: specs.distinctSpecsLost,
      collisions: specs.collisions,
      size_aware_rows: specs.sizeAwareRowCount,
      key_collisions: specs.keyCollisions,
      entries: specs.entries.map(({ raw_payload, ...rest }) => rest),
    },
    templates: { scanned, total, rows: templates.length, by_placement: countBy(templates, "placement_tag") },
    costs: {
      rows: costs.length,
      primary_technique: product.primaryTechnique,
      min_usd: costs.length ? Math.min(...costs.map((c) => c.base_cost_usd)) : null,
      max_usd: costs.length ? Math.max(...costs.map((c) => c.base_cost_usd)) : null,
    },
    _write_payload: write ? { specs, templates, costs } : null,
  };
  report.push(entry);

  console.log(
    `\n■ Printful ${target.printfulId} — ${target.catalogName}  [${target.family}]  (${write ? "WRITE" : "DRY RUN"}${specsOnly ? ", SPECS ONLY" : ""})`,
  );
  console.log(
    `  canonical '${target.proposedSlug}': ${canonicalId ? `FOUND ${canonicalId}` : "GAP — no canonical_products row (CP1 creates none)"}`,
  );
  console.log(
    `  specs: ${specs.rawEntryCount} API entries (${specs.exactDuplicates} exact duplicates deduped) → ${specs.distinctSpecRows} distinct spec rows size-aware, but only ${specs.survivingRowCount} rows under current unique key` +
      (specs.collisions.length
        ? `  ⚠ COLLAPSE on ${specs.collisions.map((c) => c.placement_tag).join(", ")}: ${specs.distinctSpecsLost} distinct specs would be lost`
        : "  (no placement carries multiple sizes)"),
  );
  for (const c of specs.collisions) {
    for (const s of c.distinct_sizes) {
      console.log(
        `      ${c.placement_tag}: ${s.size} (${s.inches.join("/")} in) sizes=[${s.variant_sizes.join("; ") || "—"}] variants=${s.variant_ids.length}${s.placeholder_style ? " PLACEHOLDER style" : ""}`,
      );
    }
  }
  console.log(
    `  size-aware replace-set: ${specs.sizeAwareRowCount} spec rows would be stored (size_tag per entry in the analysis JSON)`,
  );
  for (const kc of specs.keyCollisions) {
    console.log(`      ⚠ size-key collision: ${kc}`);
  }
  console.log(
    `  templates: scanned ${scanned}/${total}, ${templates.length} rows would be written ${JSON.stringify(entry.templates.by_placement)}`,
  );
  console.log(
    `  costs: ${costs.length} variant rows would be written, primary technique ${product.primaryTechnique}, base $${entry.costs.min_usd}–$${entry.costs.max_usd}`,
  );

  if (write) {
    if (!canonicalId) {
      console.log("  --write SKIPPED for this target: no canonical row (seed it in a later checkpoint first).");
    } else {
      await writeAll(canonicalId, target, specs, templates, costs, specsOnly);
      console.log(
        specsOnly
          ? `  Written (specs only) for canonical ${canonicalId}: ${specs.sizeAwareRowCount} spec rows replace-set; templates/costs untouched.`
          : `  Written for canonical ${canonicalId}.`,
      );
    }
  }
}

function countBy(rows, key) {
  const out = {};
  for (const r of rows) out[r[key]] = (out[r[key]] ?? 0) + 1;
  return out;
}

if (jsonOut) {
  const clean = report.map(({ _write_payload, ...rest }) => rest);
  writeFileSync(jsonOut, JSON.stringify(clean, null, 2));
  console.log(`\nAnalysis JSON written to ${jsonOut}`);
}
console.log(
  `\nDone: ${report.length} targets, ${write ? "WRITE mode" : "DRY RUN — no database writes made"}.`,
);
