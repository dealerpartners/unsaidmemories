/**
 * Fabric studio — REAL product stage data (owner order 2026-10-30:
 * the editor must mock up on what suppliers actually deliver, not on
 * guessed silhouettes).
 *
 * Source of truth is OUR database, never a live supplier call:
 *
 *   canonical_products       — our normalized taxonomy (the physical
 *                              blank: 'bella-canvas-3001', 'ceramic-mug-11oz')
 *   supplier_print_specs     — per (canonical, supplier, placement):
 *                              print-file pixels + target DPI, captured
 *                              from the supplier (mockup-styles today)
 *   supplier_mockup_templates— per (canonical, supplier, placement):
 *                              the supplier's own mockup template frame —
 *                              template size, print-area rect (left/top/
 *                              width/height in template pixels), the
 *                              template ("ghost" shading) image URL and
 *                              the background (photo URL or color)
 *
 * Rows are harvested by scripts/capture-printful-stage.mjs (and future
 * per-supplier captures). This loader is server-side only (service
 * role, mirroring the template-registry resolver): the studio reaches
 * it through GET /api/admin/studio/product-stage.
 *
 * When a product has no captured stage, every loader here returns null
 * and the studio must fall back to its standard stage — a missing
 * capture must never break the editor.
 */

import { createServerClient } from "@/lib/supabase";
import {
  classifyKind,
  extractPlaceholderSpecs,
  parsePrintSpec,
} from "@/lib/fabric/templates";

export interface StagePrintSpec {
  placement: string;
  /**
   * Size discriminator from the capture (migration 20261030213100):
   * a real variant size ('11 oz', '15 oz', …), 'placeholder' for
   * Placeholder-category fallbacks, a geometry tag ('12x16in@150')
   * for product-wide specs, 'unsized' for pre-recapture rows, or
   * null when the row predates the column.
   */
  sizeTag: string | null;
  /** Print-file trim size in pixels at `targetDpi`. */
  printWidthPx: number;
  printHeightPx: number;
  targetDpi: number;
  offsetTopPercent: number;
  offsetLeftPercent: number;
  capturedAt: string;
}

export interface StageMockupTemplate {
  placement: string;
  technique: string | null;
  /** The supplier's template frame, in its own pixels. */
  templateWidth: number;
  templateHeight: number;
  /** Print-area rect inside the template frame, template pixels. */
  printAreaWidth: number;
  printAreaHeight: number;
  printAreaTop: number;
  printAreaLeft: number;
  /** Supplier CDN template ("ghost" shading) image. */
  imageUrl: string | null;
  /** Our stored copy of the template image, once ingested. */
  storedImagePath: string | null;
  backgroundUrl: string | null;
  backgroundColor: string | null;
  printfileId: number | null;
  catalogVariantIds: number[];
  capturedAt: string;
}

export interface ProductStage {
  canonical: { slug: string; name: string; category: string };
  supplier: string;
  /** The supplier-side product id the captures were taken from. */
  supplierBlueprintId: string | null;
  specs: StagePrintSpec[];
  templates: StageMockupTemplate[];
}

/**
 * The four anchor captures taken 2026-10-30. supplier_mockup_templates
 * .supplier_blueprint_id IS the Printful catalog product id, so this
 * map is only a fast path — resolveCanonicalSlug() falls back to the
 * templates table for any blueprint id captured later.
 */
export const PRINTFUL_BLUEPRINT_TO_CANONICAL_SLUG: Record<string, string> = {
  "71": "bella-canvas-3001", // Unisex Staple T-Shirt | Bella + Canvas 3001
  "12": "gildan-64000", // Unisex Basic Softstyle T-Shirt | Gildan 64000
  "19": "white-glossy-mug", // White Glossy Mug
  "300": "black-glossy-mug", // Black Glossy Mug
};

const SPEC_COLUMNS =
  "placement_tag, size_tag, print_width_px, print_height_px, target_dpi, offset_top_percent, offset_left_percent, captured_at";
const TEMPLATE_COLUMNS =
  "placement_tag, technique, template_width, template_height, print_area_width, print_area_height, print_area_top, print_area_left, image_url, stored_image_path, background_url, background_color, printfile_id, catalog_variant_ids, captured_at";

function normalizeSupplier(supplier: string): string {
  return supplier.trim().toLowerCase();
}

/**
 * Resolve a supplier-side product id (e.g. a Printful catalog id) to
 * the canonical slug its stage was captured under. Returns null when
 * nothing was captured for that blueprint.
 */
export async function resolveCanonicalSlug(
  supplier: string,
  supplierBlueprintId: string,
): Promise<string | null> {
  const sup = normalizeSupplier(supplier);
  const blueprintId = String(supplierBlueprintId).trim();
  if (!blueprintId) return null;

  if (sup === "printful") {
    const mapped = PRINTFUL_BLUEPRINT_TO_CANONICAL_SLUG[blueprintId];
    if (mapped) return mapped;
  }

  const db = createServerClient();
  const { data: tpl } = await db
    .from("supplier_mockup_templates")
    .select("canonical_product_id")
    .eq("supplier_name", sup)
    .eq("supplier_blueprint_id", blueprintId)
    .limit(1)
    .maybeSingle();
  if (!tpl?.canonical_product_id) return null;

  const { data: canon } = await db
    .from("canonical_products")
    .select("sku_slug")
    .eq("id", tpl.canonical_product_id)
    .maybeSingle();
  return canon?.sku_slug ?? null;
}

/**
 * Load the full stage for a canonical product + supplier.
 * Null when the canonical product is unknown or no capture exists.
 */
export async function loadProductStage(
  canonicalSlug: string,
  supplier: string,
): Promise<ProductStage | null> {
  const sup = normalizeSupplier(supplier);
  const db = createServerClient();

  const { data: canon } = await db
    .from("canonical_products")
    .select("id, sku_slug, name, category")
    .eq("sku_slug", canonicalSlug.trim())
    .maybeSingle();
  if (!canon) return null;

  const [{ data: specRows }, { data: tplRows }] = await Promise.all([
    db
      .from("supplier_print_specs")
      .select(SPEC_COLUMNS)
      .eq("canonical_product_id", canon.id)
      .eq("supplier_name", sup)
      .order("placement_tag"),
    db
      .from("supplier_mockup_templates")
      .select(TEMPLATE_COLUMNS)
      .eq("canonical_product_id", canon.id)
      .eq("supplier_name", sup)
      .order("placement_tag"),
  ]);

  const specs = (specRows ?? []).map((r: any) => ({
    placement: r.placement_tag,
    sizeTag: (r.size_tag ?? null) as string | null,
    printWidthPx: r.print_width_px,
    printHeightPx: r.print_height_px,
    targetDpi: r.target_dpi,
    offsetTopPercent: Number(r.offset_top_percent ?? 0),
    offsetLeftPercent: Number(r.offset_left_percent ?? 0),
    capturedAt: r.captured_at,
  }));
  const templates = (tplRows ?? []).map((r: any) => ({
    placement: r.placement_tag,
    technique: r.technique ?? null,
    templateWidth: r.template_width,
    templateHeight: r.template_height,
    printAreaWidth: r.print_area_width,
    printAreaHeight: r.print_area_height,
    printAreaTop: r.print_area_top,
    printAreaLeft: r.print_area_left,
    imageUrl: r.image_url ?? null,
    storedImagePath: r.stored_image_path ?? null,
    backgroundUrl: r.background_url ?? null,
    backgroundColor: r.background_color ?? null,
    printfileId: r.printfile_id ?? null,
    catalogVariantIds: (r.catalog_variant_ids ?? []) as number[],
    capturedAt: r.captured_at,
  }));

  if (specs.length === 0 && templates.length === 0) return null;

  // The blueprint the captures came from (same for every row today).
  const { data: anyRow } = await db
    .from("supplier_mockup_templates")
    .select("supplier_blueprint_id")
    .eq("canonical_product_id", canon.id)
    .eq("supplier_name", sup)
    .limit(1)
    .maybeSingle();

  return {
    canonical: { slug: canon.sku_slug, name: canon.name, category: canon.category },
    supplier: sup,
    supplierBlueprintId: anyRow?.supplier_blueprint_id ?? null,
    specs,
    templates,
  };
}

/** Load a stage starting from the supplier-side product id. */
export async function loadProductStageByBlueprint(
  supplier: string,
  supplierBlueprintId: string,
): Promise<ProductStage | null> {
  const slug = await resolveCanonicalSlug(supplier, supplierBlueprintId);
  if (!slug) return null;
  return loadProductStage(slug, supplier);
}

/* ------------------------------------------------------------------ */
/* Supplier options for one catalog product (New Design wizard,       */
/* Step 4). Same resolution path as the stage loaders above — the     */
/* catalog row's external_id + supplier resolve the canonical blank   */
/* through resolveCanonicalSlug(); the options are then every         */
/* supplier with captured rows for that blank in supplier_print_specs */
/* / supplier_mockup_templates / supplier_product_costs, plus the     */
/* catalog product's own supplier (always an option: it is the        */
/* listing the canvas can actually bind). Costs come from             */
/* supplier_product_costs when a captured row exists; otherwise the   */
/* own supplier's cost derives from the catalog product's own variant */
/* price snapshots (owner ruling 2026-11-02 — the product's own data  */
/* is the basis, never a guess).                                      */
/* ------------------------------------------------------------------ */

export interface SupplierCostSummary {
  /** Cheapest captured variant cost for this supplier + blank. */
  minBaseCostUsd: number;
  /** Standard US first-item shipping for the cheapest variant, when a
   *  captured estimate or a harvested rate card provides it. The price
   *  step needs it: shipping is part of the product's cost, so the
   *  recommended price is computed on blank + shipping (owner ruling
   *  2026-11-03). Null when no source has captured it yet. */
  shippingEstimateUsd: number | null;
  variantCount: number;
  anyInStock: boolean;
  /** Most recent capture across this supplier's cost rows. */
  lastCheckedAt: string;
}

export interface SupplierOption {
  /** supplier_name as stored (the supplier slug, e.g. "printful"). */
  supplier: string;
  displayName: string;
  /** The supplier of the catalog product the wizard started from —
   *  the one whose listing the studio can bind today. */
  isOwnSupplier: boolean;
  specs: StagePrintSpec[];
  hasTemplate: boolean;
  templateCount: number;
  cost: SupplierCostSummary | null;
  /** The catalog product this option represents — the chosen product
   *  itself for its own supplier; for another supplier, the closest
   *  same-blank listing in that supplier's catalog (same brand / same
   *  model number, preferring one with a photo). Lets the wizard SHOW
   *  the garment for each option, not just name the supplier. */
  product: {
    id: string;
    name: string;
    imageUrl: string | null;
    variantCount: number | null;
  } | null;
}

/** One catalog listing of the same blank from another supplier —
 *  the visual comparison group for the wizard's supplier step. */
export interface SupplierGroupProduct {
  id: string;
  name: string;
  brandName: string | null;
  supplier: string;
  supplierName: string | null;
  imageUrl: string | null;
  variantCount: number | null;
  minPrice: number | null;
  categoryId: string | null;
}

export interface SupplierOptions {
  canonical: { slug: string; name: string } | null;
  ownSupplier: string;
  ownSupplierName: string | null;
  options: SupplierOption[];
  group: SupplierGroupProduct[];
}

function displayNameFor(slug: string, ownSlug: string, ownName: string | null): string {
  if (slug === ownSlug && ownName) return ownName;
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Supplier options for a supplier_catalog_products row id. Null when
 * the catalog product (or its supplier) does not exist. When the
 * product's blank has no canonical resolution yet, the result carries
 * canonical: null and a single option — the product's own supplier,
 * with no specs and no cost (nothing captured, nothing invented).
 */
export async function loadSupplierOptionsForCatalogProduct(
  catalogProductId: string,
): Promise<SupplierOptions | null> {
  const db = createServerClient();
  const { data: product } = await db
    .from("supplier_catalog_products")
    .select("external_id, supplier_id, name, image_url, brand_name")
    .eq("id", catalogProductId)
    .maybeSingle();
  if (!product?.supplier_id) return null;

  const { data: supplierRow } = await db
    .from("suppliers")
    .select("slug, name")
    .eq("id", product.supplier_id)
    .maybeSingle();
  if (!supplierRow?.slug) return null;
  const ownSupplier = normalizeSupplier(supplierRow.slug);
  const ownSupplierName: string | null = supplierRow.name ?? null;

  const specsBySupplier = new Map<string, StagePrintSpec[]>();
  const templatesBySupplier = new Map<string, number>();
  const costsBySupplier = new Map<string, SupplierCostSummary>();
  let canonical: SupplierOptions["canonical"] = null;

  const canonicalSlug = product.external_id
    ? await resolveCanonicalSlug(ownSupplier, product.external_id)
    : null;
  if (canonicalSlug) {
    const { data: canon } = await db
      .from("canonical_products")
      .select("id, sku_slug, name")
      .eq("sku_slug", canonicalSlug)
      .maybeSingle();
    if (canon) {
      canonical = { slug: canon.sku_slug, name: canon.name };
      const [{ data: specRows }, { data: tplRows }, { data: costRows }] = await Promise.all([
        db
          .from("supplier_print_specs")
          .select(`supplier_name, ${SPEC_COLUMNS}`)
          .eq("canonical_product_id", canon.id)
          .order("placement_tag"),
        db
          .from("supplier_mockup_templates")
          .select("supplier_name")
          .eq("canonical_product_id", canon.id),
        db
          .from("supplier_product_costs")
          .select("supplier_name, base_cost_usd, shipping_estimate_usd, is_in_stock, last_checked_at")
          .eq("canonical_product_id", canon.id),
      ]);
      for (const r of specRows ?? []) {
        const key = normalizeSupplier(r.supplier_name ?? "");
        if (!key) continue;
        const list = specsBySupplier.get(key) ?? [];
        list.push({
          placement: r.placement_tag,
          sizeTag: (r.size_tag ?? null) as string | null,
          printWidthPx: r.print_width_px,
          printHeightPx: r.print_height_px,
          targetDpi: r.target_dpi,
          offsetTopPercent: Number(r.offset_top_percent ?? 0),
          offsetLeftPercent: Number(r.offset_left_percent ?? 0),
          capturedAt: r.captured_at,
        });
        specsBySupplier.set(key, list);
      }
      for (const r of tplRows ?? []) {
        const key = normalizeSupplier(r.supplier_name ?? "");
        if (!key) continue;
        templatesBySupplier.set(key, (templatesBySupplier.get(key) ?? 0) + 1);
      }
      for (const r of costRows ?? []) {
        const key = normalizeSupplier(r.supplier_name ?? "");
        if (!key) continue;
        const cost = Number(r.base_cost_usd);
        if (!Number.isFinite(cost)) continue;
        const ship = Number((r as { shipping_estimate_usd?: unknown }).shipping_estimate_usd);
        const shipOrNull = Number.isFinite(ship) && ship > 0 ? ship : null;
        const prev = costsBySupplier.get(key);
        if (!prev) {
          costsBySupplier.set(key, {
            minBaseCostUsd: cost,
            shippingEstimateUsd: shipOrNull,
            variantCount: 1,
            anyInStock: Boolean(r.is_in_stock),
            lastCheckedAt: r.last_checked_at,
          });
        } else {
          // The shipping that pairs with the cheapest blank is the
          // shipping the "from" price must carry.
          if (cost < prev.minBaseCostUsd) prev.shippingEstimateUsd = shipOrNull;
          prev.minBaseCostUsd = Math.min(prev.minBaseCostUsd, cost);
          prev.variantCount += 1;
          prev.anyInStock = prev.anyInStock || Boolean(r.is_in_stock);
          if (String(r.last_checked_at) > String(prev.lastCheckedAt)) {
            prev.lastCheckedAt = r.last_checked_at;
          }
        }
      }
    }
  }

  /* Owner ruling 2026-11-02: a catalog product is printable by its
   * supplier — the supplier's own data for the product IS the basis;
   * captures only enrich it. When the capture tables hold no specs or
   * cost for the product's own supplier, derive both from the catalog
   * product itself: print geometry from its variants' print_specs
   * (placeholders[] or flat keys) and cost from its variants' price
   * snapshots. Nothing is invented — every number below is read from
   * the product's own rows. */
  if (
    !(specsBySupplier.get(ownSupplier)?.length) ||
    !costsBySupplier.has(ownSupplier)
  ) {
    const { data: variants } = await db
      .from("supplier_catalog_variants")
      .select("print_specs, price_snapshot, created_at")
      .eq("supplier_catalog_product_id", catalogProductId)
      .limit(50);
    const rows = variants ?? [];
    if (rows.length) {
      const stamp =
        rows
          .map((v: any) => String(v.created_at ?? ""))
          .sort()
          .slice(-1)[0] ?? new Date(0).toISOString();
      if (!specsBySupplier.get(ownSupplier)?.length) {
        const blobs = rows.map((v: any) => v.print_specs);
        const phs = extractPlaceholderSpecs(blobs);
        if (phs.length) {
          specsBySupplier.set(
            ownSupplier,
            phs.map((p) => ({
              placement: p.placement,
              sizeTag: null,
              printWidthPx: p.widthPx,
              printHeightPx: p.heightPx,
              targetDpi: 300,
              offsetTopPercent: 0,
              offsetLeftPercent: 0,
              capturedAt: stamp,
            })),
          );
        } else if (product.name) {
          const parsed = parsePrintSpec(blobs, classifyKind(product.name));
          if (parsed.source === "supplier") {
            specsBySupplier.set(ownSupplier, [
              {
                placement: "front",
                sizeTag: null,
                printWidthPx: parsed.widthPx,
                printHeightPx: parsed.heightPx,
                targetDpi: parsed.dpi,
                offsetTopPercent: 0,
                offsetLeftPercent: 0,
                capturedAt: stamp,
              },
            ]);
          }
        }
      }
      if (!costsBySupplier.has(ownSupplier)) {
        const prices = rows
          .map((v: any) => Number(v.price_snapshot))
          .filter((n: number) => Number.isFinite(n) && n > 0);
        if (prices.length) {
          costsBySupplier.set(ownSupplier, {
            minBaseCostUsd: Math.min(...prices),
            shippingEstimateUsd: null,
            variantCount: rows.length,
            anyInStock: true,
            lastCheckedAt: stamp,
          });
        }
      }
      // Shipping for the own supplier, when no captured estimate paired
      // it: the harvested US Standard rate card for the product's own
      // (blueprint, provider) pair. A real card or nothing — never a
      // family average presented as this product's shipping.
      const ownCost = costsBySupplier.get(ownSupplier);
      if (ownCost && ownCost.shippingEstimateUsd == null) {
        const specRow = rows.find(
          (v: any) => v.print_specs?.blueprint_id && v.print_specs?.provider_id,
        );
        const bp = specRow?.print_specs?.blueprint_id;
        const prov = specRow?.print_specs?.provider_id;
        if (bp && prov) {
          const { data: card } = await db
            .from("shipping_profiles")
            .select("first_item_cost")
            .eq("profile_name", `PFY-${bp}-${prov}-US`)
            .eq("method_name", "Standard")
            .limit(1);
          const rate = Number(card?.[0]?.first_item_cost);
          if (Number.isFinite(rate) && rate > 0) ownCost.shippingEstimateUsd = rate;
        }
      }
    }
  }

  const keys = new Set<string>([
    ownSupplier,
    ...specsBySupplier.keys(),
    ...templatesBySupplier.keys(),
    ...costsBySupplier.keys(),
  ]);
  /* Representative products (owner's Step-4 ruling, 2026-11-02): the
   * wizard shows the garment for each option — the chosen product
   * itself for its own supplier; for another supplier, that supplier's
   * closest same-blank listing (same brand and model number when the
   * data carries them), preferring a listing with a photo. */
  const repBySupplier = new Map<string, SupplierOption["product"]>();
  const { count: ownVariantCount } = await db
    .from("supplier_catalog_variants")
    .select("id", { count: "exact", head: true })
    .eq("supplier_catalog_product_id", catalogProductId);
  repBySupplier.set(ownSupplier, {
    id: catalogProductId,
    name: String(product.name ?? ""),
    imageUrl: product.image_url ?? null,
    /* The catalog listing's own variant count — the same number the
     * wizard's product cards show. (The cost summary's count is the
     * cost capture's SKU grain and stays on the cost line only.) */
    variantCount: ownVariantCount ?? costsBySupplier.get(ownSupplier)?.variantCount ?? null,
  });
  const modelToken =
    String(canonical?.name ?? product.name ?? "").match(/\d{3,}/)?.[0] ?? null;
  const brand = product.brand_name ? String(product.brand_name) : null;
  /* Same-blank matching: brand column when the listing carries one,
   * else the brand phrase written in the name itself ("Bella +
   * Canvas 3001", "Bella+Canvas 3001") — tried in both spellings. */
  const phraseFromName = (name: string): string | null => {
    if (!modelToken) return null;
    const idx = name.indexOf(modelToken);
    if (idx < 0) return null;
    const segment = name.slice(0, idx).split(/[|·—–-]/).pop() ?? "";
    const words = segment.trim().split(/\s+/).filter(Boolean).slice(-3);
    return words.length ? words.join(" ") : null;
  };
  const blankPhrase = brand ?? phraseFromName(String(product.name ?? ""));
  const phraseVariants = blankPhrase
    ? [...new Set([
        blankPhrase,
        blankPhrase.replace(/\s*\+\s*/g, "+"),
        blankPhrase.replace(/\s*\+\s*/g, " + "),
      ])].map((v) => v.replace(/,/g, " ").trim()).filter(Boolean)
    : [];
  const applyBlankFilter = (q: any, tokenRequired = false) => {
    const ors: string[] = [];
    if (brand && modelToken) ors.push(`and(brand_name.eq."${brand}",name.ilike.%${modelToken}%)`);
    else if (brand && !tokenRequired) ors.push(`brand_name.eq."${brand}"`);
    for (const v of phraseVariants) {
      if (modelToken) ors.push(`and(name.ilike.%${v}%,name.ilike.%${modelToken}%)`);
      else if (!tokenRequired) ors.push(`name.ilike.%${v}%`);
    }
    if (!ors.length && modelToken) ors.push(`name.ilike.%${modelToken}%`);
    return ors.length ? q.or(ors.join(",")) : q;
  };
  for (const key of keys) {
    if (key === ownSupplier) continue;
    if (!brand && !modelToken) break;
    const { data: supRow } = await db
      .from("suppliers")
      .select("id")
      .eq("slug", key)
      .maybeSingle();
    if (!supRow?.id) continue;
    const q = applyBlankFilter(
      db
        .from("supplier_catalog_products")
        .select("id, name, image_url")
        .eq("supplier_id", supRow.id)
        .eq("is_hidden", false)
        .not("image_url", "is", null),
    );
    const { data: reps } = await q.limit(1);
    const rep = reps?.[0];
    if (!rep) continue;
    const { count } = await db
      .from("supplier_catalog_variants")
      .select("id", { count: "exact", head: true })
      .eq("supplier_catalog_product_id", rep.id);
    repBySupplier.set(key, {
      id: rep.id,
      name: rep.name,
      imageUrl: rep.image_url ?? null,
      variantCount: count ?? null,
    });
  }

  const options: SupplierOption[] = [...keys].map((key) => {
    const cost = costsBySupplier.get(key);
    return {
      supplier: key,
      displayName: displayNameFor(key, ownSupplier, ownSupplierName),
      isOwnSupplier: key === ownSupplier,
      specs: specsBySupplier.get(key) ?? [],
      hasTemplate: (templatesBySupplier.get(key) ?? 0) > 0,
      templateCount: templatesBySupplier.get(key) ?? 0,
      product: repBySupplier.get(key) ?? null,
      cost: cost
        ? {
            minBaseCostUsd: cost.minBaseCostUsd,
            shippingEstimateUsd: cost.shippingEstimateUsd,
            variantCount: cost.variantCount,
            anyInStock: cost.anyInStock,
            lastCheckedAt: cost.lastCheckedAt,
          }
        : null,
    };
  });

  // Rank: captured cost first, cheapest first (the architecture's
  // picker order); suppliers without a captured cost after them —
  // the product's own supplier first among those, then by name.
  options.sort((a, b) => {
    if (a.cost && b.cost) return a.cost.minBaseCostUsd - b.cost.minBaseCostUsd;
    if (a.cost) return -1;
    if (b.cost) return 1;
    if (a.isOwnSupplier !== b.isOwnSupplier) return a.isOwnSupplier ? -1 : 1;
    return a.displayName.localeCompare(b.displayName);
  });

  /* Similar blanks (owner's Step-4 ruling, 2026-11-02): catalog
   *  listings matching this product's brand + model number — the
   *  same blank family from other suppliers AND sibling cuts from
   *  its own — the visual group the pick is made against. Listings
   *  with photos first (some suppliers serve none; those listings
   *  still belong to the group and say so on their card). Up to
   *  four listings per supplier, twelve in total. */
  const group: SupplierGroupProduct[] = [];
  if (modelToken) {
    const gq = applyBlankFilter(
      db
        .from("supplier_catalog_products")
        .select("id, name, brand_name, image_url, supplier_id, category_id")
        .eq("is_hidden", false)
        .neq("id", catalogProductId),
      true,
    );
    const { data: grows } = await gq.limit(40);
    const rows = (grows ?? []).sort((a, b) =>
      (b.image_url ? 1 : 0) - (a.image_url ? 1 : 0),
    );
    if (rows.length) {
      const { data: vars } = await db
        .from("supplier_catalog_variants")
        .select("supplier_catalog_product_id, price_snapshot")
        .in("supplier_catalog_product_id", rows.map((r) => r.id));
      const agg = new Map<string, { count: number; min: number | null }>();
      for (const v of vars ?? []) {
        const cur = agg.get(v.supplier_catalog_product_id) ?? { count: 0, min: null };
        cur.count += 1;
        const p = Number(v.price_snapshot);
        if (Number.isFinite(p) && p > 0) cur.min = cur.min == null ? p : Math.min(cur.min, p);
        agg.set(v.supplier_catalog_product_id, cur);
      }
      const { data: sups } = await db
        .from("suppliers")
        .select("id, slug, name")
        .in("id", [...new Set(rows.map((r) => r.supplier_id))]);
      const supById = new Map((sups ?? []).map((s) => [s.id, s]));
      const perSupplier = new Map<string, number>();
      const seenNames = new Set<string>();
      for (const row of rows) {
        const sup = supById.get(row.supplier_id);
        if (!sup) continue;
        const slug = normalizeSupplier(sup.slug);
        const nameKey = `${slug}:${row.name}`;
        if (seenNames.has(nameKey)) continue;
        seenNames.add(nameKey);
        const n = perSupplier.get(slug) ?? 0;
        if (n >= 4) continue;
        perSupplier.set(slug, n + 1);
        const a = agg.get(row.id);
        group.push({
          id: row.id,
          name: row.name,
          brandName: row.brand_name ?? null,
          supplier: slug,
          supplierName: sup.name ?? null,
          imageUrl: row.image_url ?? null,
          variantCount: a?.count ?? null,
          minPrice: a?.min ?? null,
          categoryId: row.category_id ?? null,
        });
        if (group.length >= 12) break;
      }
    }
  }

  return { canonical, ownSupplier, ownSupplierName, options, group };
}

/**
 * Load a stage starting from the studio's own catalog binding: a
 * supplier_catalog_products row id (the id designs carry as
 * supplier_catalog_product_id). Resolves the row's external_id (the
 * supplier-side product id) and its supplier slug, then follows the
 * blueprint path. Null when the product or its stage is unknown.
 */
export async function loadProductStageForCatalogProduct(
  catalogProductId: string,
): Promise<ProductStage | null> {
  const db = createServerClient();
  const { data: product } = await db
    .from("supplier_catalog_products")
    .select("external_id, supplier_id")
    .eq("id", catalogProductId)
    .maybeSingle();
  if (!product?.external_id || !product?.supplier_id) return null;

  const { data: supplierRow } = await db
    .from("suppliers")
    .select("slug")
    .eq("id", product.supplier_id)
    .maybeSingle();
  if (!supplierRow?.slug) return null;

  return loadProductStageByBlueprint(supplierRow.slug, product.external_id);
}
