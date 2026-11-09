/**
 * /product/[id] — premium, Amazon-quality product detail page.
 *
 * FAST-RENDER ARCHITECTURE (the reference repo's exact pdp.ts pattern,
 * ported after the 2026-10 multi-minute-load incident):
 *
 *   1. Static, not per-view DB: the route renders on-demand on first
 *      request, then the cached HTML serves until the product's own
 *      write busts this exact path. The database is OUT of the per-view
 *      path. (Was `revalidate = 86400` until 2026-11-06 — the daily
 *      timer rewrote every crawled product page every day.)
 *   2. Build-time PDP pre-render stays OFF (`generateStaticParams → []`):
 *      the reference repo's bounded top-200 experiment saturated the
 *      Supabase session pooler (EMAXCONN, 200-connection limit) and killed
 *      the build at page 1224/1310. On-demand ISR is the mechanism. The
 *      previous 48 pre-renders also made every deploy pay the full query
 *      chain 48 times.
 *   3. ONE shared cached load per product: generateMetadata and the page
 *      both call the same `unstable_cache`d loader — one DB load per slug
 *      per 5 minutes (per-request memoization makes the metadata twin a
 *      cache hit, not a second load — the old code ran the product query
 *      twice per cold render).
 *   4. CONCURRENT legs: every leg below the product row (variants,
 *      category, reviews, recommendations, picks) depends only on the
 *      product row, so they all run in one Promise.all. The old shape
 *      awaited them strictly in sequence, stacking every round trip onto
 *      the cold-render critical path.
 *   5. NO retry loops: the old "retry the variants fetch once" doubled the
 *      worst case — the reference repo's own comment: "the old retry loop
 *      re-ran the whole load up to four times with growing backoff…
 *      multiplying a slow spell into a minute-long hang." A failed leg
 *      degrades honestly (empty rail / price-at-checkout) or throws
 *      (product row — an errored render is never cached, so the next
 *      visit retries clean).
 *   6. Bounded ceilings: the reference repo bounds statement costs at the
 *      pg layer; this app talks to PostgREST, so each leg is raced
 *      against a ceiling. Slow ≠ failed — the verdict must come from the
 *      load actually finishing — but a wedged statement can never hold
 *      the render for minutes either.
 *
 * Root cause of the incident (measured 2026-10): the 177k-row
 * supplier_catalog_variants table had NO index on
 * supplier_catalog_product_id — a single `.eq()` count measured 8.9s, and
 * the old PDP paid that scan 3-5 times sequentially (variants → retry →
 * batch fallback → recommendations enrichment → picks enrichment).
 * /api/admin/ensure-indexes provisions the index; this loader's shape
 * keeps the page fast even before/without it.
 */

import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import {
  createServerClient,
  fetchMinPricesBatch,
  fetchVariantsForProduct,
  type SupplierProduct,
  type SupplierVariant,
} from "@/lib/supabase";
import { getCachedRecommendations, getPdpPicks } from "@/lib/catalog-cache";
import { hasUgcCatalogColumn, applyLiveDisplayNames } from "@/lib/ugc";
import { fetchListingOverride } from "@/lib/catalog-overrides";
import {
  ProductDetail,
  type PdpCustomizerData,
  type PdpRecord,
  type PdpSet,
} from "./product-detail";
import { resolveTemplate } from "@/lib/fabric/templates";
import { parseProductId, productSlug } from "@/lib/product-slug";
import { displayTitle } from "@/lib/pdp-display";
import { LicenseeAdSlot } from "@/components/ads/licensee-ad-slot";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://unsaid-leashed.vercel.app";

// ── Route caching (the reference repo's exact exports) ───────

/** Static: render on-demand on first request, then serve from cache until
 * the product's own write busts this exact path (erp/catalog routes and the
 * design review route revalidate `/product/<id>`). No time-based expiry:
 * a daily timer rewrote every crawled product page every day. */
export const dynamicParams = true;

/** Build ZERO product pages (see header comment §2). */
export async function generateStaticParams() {
  return [];
}

// ── Types passed down to the client ─────────────────────────

/** A single materials/ spec row, e.g. { label: "Fabric weight", value: "180 g/m²" }. */
export type SpecEntry = { label: string; value: string };

/** Structured materials info extracted from variant `print_specs`. */
export type MaterialsInfo = {
  /** Ordered list of { label, value } pairs, preferred keys first. */
  entries: SpecEntry[];
  /** The best material/fabric string we found — used in the description. */
  material: string | null;
  /** The best print-method string we found — used in the features list. */
  printMethod: string | null;
  /** True if at least one spec field was extracted. */
  hasAny: boolean;
};

// ── Bounded ceilings (the pg-layer statement timeout stand-in) ──

/** Supabase service-role connections have NO server-side statement
 *  timeout — a wedged full-scan query can hold a render for minutes
 *  (the 3-minute PDP loads). Races give every leg a hard ceiling;
 *  degradable legs degrade, the product row throws (never cached). */
function withCeiling<T>(p: PromiseLike<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    Promise.resolve(p),
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`[pdp] ${label} exceeded the ${ms}ms ceiling`)),
        ms,
      );
      // Don't hold the event loop open for the losing racer.
      (timer as unknown as { unref?: () => void }).unref?.();
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

// ── Materials extraction ────────────────────────────────────

/** Display order for the well-known spec keys. Anything else appends after. */
const PREFERRED_KEYS = [
  "Material",
  "Fabric",
  "Fabric weight",
  "Print method",
  "Print area",
  "Care instructions",
];

/**
 * Map raw `print_specs` keys (in any casing / separator style) to a stable
 * display label. Keys are matched after lowercasing + collapsing separators
 * to underscores, so "Fabric Weight", "fabric_weight", "fabricWeight", and
 * "fabric-weight" all resolve to "Fabric weight".
 */
const KEY_ALIASES: Record<string, string> = {
  material: "Material",
  materials: "Material",
  fabric: "Fabric",
  fabric_material: "Material",
  composition: "Material",
  blend: "Material",
  fabric_weight: "Fabric weight",
  fabricweight: "Fabric weight",
  weight: "Fabric weight",
  gsm: "Fabric weight",
  fabric_gsm: "Fabric weight",
  material_weight: "Fabric weight",
  print_method: "Print method",
  printmethod: "Print method",
  printing: "Print method",
  print_technique: "Print method",
  printtechnique: "Print method",
  print_type: "Print method",
  print_area: "Print area",
  printarea: "Print area",
  printable_area: "Print area",
  care: "Care instructions",
  care_instructions: "Care instructions",
  careinstructions: "Care instructions",
  wash: "Care instructions",
  washing: "Care instructions",
  washing_instructions: "Care instructions",
  laundry: "Care instructions",
  finish: "Finish",
  finishing: "Finish",
  origin: "Origin",
  country_of_origin: "Origin",
  made_in: "Origin",
  sizing: "Sizing",
  size_chart: "Sizing",
  fit: "Fit",
  cut: "Fit",
  dimensions: "Dimensions",
  specs: "Specifications",
  notes: "Notes",
};

/** Normalize a raw key for alias lookup: lowercase, separators → "_". */
function normalizeKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

/** Title-case a raw key for display when no alias matches. */
function prettifyKey(key: string): string {
  const cleaned = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Stringify any spec value (string / number / bool / array / object). */
function stringifySpecValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) {
    return v
      .map(stringifySpecValue)
      .filter(Boolean)
      .join(", ");
  }
  if (typeof v === "object") {
    // Nested object → "key: value; key: value"
    return Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => {
        const s = stringifySpecValue(val);
        return s ? `${prettifyKey(k)}: ${s}` : "";
      })
      .filter(Boolean)
      .join("; ");
  }
  return "";
}

/**
 * Walk every variant's `print_specs`, aggregate the first non-empty value
 * per display label, and return an ordered list. Identical values across
 * variants are not duplicated; genuinely different values are joined.
 */
function extractMaterials(variants: SupplierVariant[]): MaterialsInfo {
  const seen = new Map<string, string>();
  const insertionOrder: string[] = [];

  for (const v of variants) {
    const specs = v.print_specs;
    if (!specs || typeof specs !== "object") continue;
    for (const [rawKey, rawVal] of Object.entries(specs)) {
      const norm = normalizeKey(rawKey);
      // ONLY include keys that map to a known customer-facing label via
      // KEY_ALIASES. Skip unknown/internal keys (hex codes, supplier variant
      // IDs, placement codes, etc.) so the materials section never dumps raw
      // backend data.
      const label = KEY_ALIASES[norm];
      if (!label) continue;
      const value = stringifySpecValue(rawVal);
      if (!value) continue;
      // Skip values that look like raw hex colors or pure numeric IDs.
      if (/^#[0-9a-f]{3,8}$/i.test(value)) continue;
      if (/^\d{5,}$/.test(value)) continue;
      const existing = seen.get(label);
      if (existing === undefined) {
        seen.set(label, value);
        insertionOrder.push(label);
      } else if (
        !existing.toLowerCase().includes(value.toLowerCase()) &&
        !value.toLowerCase().includes(existing.toLowerCase())
      ) {
        // Two genuinely different values for the same label — keep both.
        seen.set(label, `${existing}, ${value}`);
      }
    }
  }

  // Preferred keys first (in their defined order), then the rest in
  // insertion order.
  const entries: SpecEntry[] = [];
  for (const label of PREFERRED_KEYS) {
    const value = seen.get(label);
    if (value) entries.push({ label, value });
  }
  for (const label of insertionOrder) {
    if (PREFERRED_KEYS.includes(label)) continue;
    const value = seen.get(label);
    if (value) entries.push({ label, value });
  }

  const material = seen.get("Material") ?? seen.get("Fabric") ?? null;
  const printMethod = seen.get("Print method") ?? null;

  return { entries, material, printMethod, hasAny: entries.length > 0 };
}

// ── Description + features derivation ───────────────────────

/** Join a list into "a, b and c". */
function listify(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function buildDescription(
  product: SupplierProduct,
  brand: string,
  categoryName: string | null,
  sizes: string[],
  colors: string[],
  material: string | null,
): string {
  const parts: string[] = [];

  // Lead with the brand + name, anchored by the category if we have it.
  const catClause = categoryName ? ` — part of our ${categoryName} edit` : "";
  parts.push(`The ${product.name} by ${brand}${catClause}.`);

  if (sizes.length > 0) {
    const upTo = sizes.length > 5 ? sizes.slice(0, 5).join(", ") + " and more" : listify(sizes);
    parts.push(`Available in ${sizes.length} ${sizes.length === 1 ? "size" : "sizes"}: ${upTo}.`);
  } else if (product.variant_count && product.variant_count > 1) {
    parts.push("Available in multiple variants.");
  }

  if (colors.length > 1) {
    parts.push(
      `Offered in ${colors.length} colorways, from ${colors[0]} to ${colors[colors.length - 1]}.`,
    );
  } else if (colors.length === 1) {
    parts.push(`Offered in ${colors[0]}.`);
  }

  if (material) {
    parts.push(`Crafted from ${material}.`);
  }

  parts.push(
    "Cut and printed to order for a true-to-you fit, with a finish that holds its colour and shape wash after wash.",
  );

  return parts.join(" ");
}

// ── The ONE PDP load ────────────────────────────────────────

/** Loader verdict: "missing" is a DETERMINED absence (row not found) — it
 *  caches and serves notFound(). Any DB failure throws out of the loader —
 *  unstable_cache never stores rejections, so an errored render is never
 *  cached as the page (the cached-404 regression the reference repo's
 *  tracked loader exists to prevent). */
export type PdpLoad =
  | { status: "missing" }
  | {
      status: "ok";
      record: PdpRecord;
      /** Clean display title (metadata + JSON-LD name). */
      title: string;
      /** Brand (metadata description). */
      brand: string;
    };

async function buildPdpLoadUncached(id: string): Promise<PdpLoad> {
  // Product row — the one load-bearing query. PK probe: fast by
  // construction, but still ceilinged so a wedged DB errors the render
  // honestly instead of hanging the request for the platform limit.
  const supabase = createServerClient();
  const { data: product, error } = await withCeiling(
    supabase.from("supplier_catalog_products").select("*").eq("id", id).single(),
    20_000,
    "product row",
  );
  if (error || !product) return { status: "missing" };
  // Staff-hidden catalog products are not shoppable (admin catalog
  // publish/hide writes supplier_catalog_products.is_hidden).
  if ((product as any).is_hidden) return { status: "missing" };
  // The owner's listing edits win on the product page too — her name and
  // her shelf replace the mirrored supplier values before every leg
  // below reads them (the same catalog_listing_overrides the joined
  // catalog read applies; her description is swapped in further down).
  const listingOverride = await fetchListingOverride(id).catch(() => null);
  const typedProduct = (listingOverride
    ? {
        ...(product as SupplierProduct),
        name: listingOverride.name ?? (product as SupplierProduct).name,
        category_id: listingOverride.category_id ?? (product as SupplierProduct).category_id,
      }
    : product) as SupplierProduct;

  // EVERY leg below depends only on the product row — run them all
  // concurrently. Sequential awaits are what multiplied a slow spell
  // (§4 in the header).
  const [variantsLeg, categoryInfo, reviewRows, questionRows, recommendations, picksRaw, customizer, supplierSets] = await Promise.all([
    // Variants — ONE attempt, ONE bounded fallback, never a retry loop.
    (async (): Promise<{
      variants: SupplierVariant[];
      fallback: { minPrice: number | null; sizes: string[]; colors: string[] } | null;
    }> => {
      try {
        const variants = await withCeiling(
          fetchVariantsForProduct(id),
          15_000,
          "variants",
        );
        if (variants.length) return { variants, fallback: null };
      } catch (err) {
        console.error("[pdp] variants leg failed:", err instanceof Error ? err.message : err);
      }
      // The same query the shop grid uses, for price/sizes/colors when the
      // full variant rows timed out. Only the print_specs materials are
      // lost on this path — never the buy box's real price and options.
      try {
        const batch = await withCeiling(fetchMinPricesBatch([id]), 15_000, "variant fallback");
        const p = batch.get(id) ?? null;
        return { variants: [], fallback: p };
      } catch (err) {
        console.error("[pdp] variant fallback failed:", err instanceof Error ? err.message : err);
        return { variants: [], fallback: null };
      }
    })(),

    // Category name + slug for the description and breadcrumb (degrades
    // to null — a missing crumb is honest, a failed render is not needed).
    (async (): Promise<{ name: string; slug: string } | null> => {
      if (!typedProduct.category_id) return null;
      try {
        const { data: cat } = await withCeiling(
          supabase
            .from("categories")
            .select("name, slug")
            .eq("id", typedProduct.category_id)
            .single(),
          10_000,
          "category",
        );
        return cat ? { name: String(cat.name), slug: String(cat.slug) } : null;
      } catch (err) {
        console.error("[pdp] category leg failed:", err instanceof Error ? err.message : err);
        return null;
      }
    })(),

    // REAL published reviews — the canonical ugc_posts, status
    // "published" (reviews go live immediately; there is no moderation
    // queue). Published catalog products are mirrored into native
    // `products` under the same id, so most reviews link via
    // product_id today; unmirrored catalog items link via
    // supplier_catalog_product_id once that column is applied. The leg
    // merges both and degrades to empty on failure — an unrated
    // product omits the aggregateRating block.
    (async (): Promise<Record<string, unknown>[]> => {
      try {
        const cols = "id, customer_id, author_display_name, rating, title, body, is_verified_purchase, created_at";
        const { data } = await withCeiling(
          supabase
            .from("ugc_posts")
            .select(cols)
            .eq("product_id", id)
            .eq("status", "published")
            .order("created_at", { ascending: false })
            .limit(8),
          10_000,
          "reviews",
        );
        let rows = (data ?? []) as Record<string, unknown>[];
        if (await hasUgcCatalogColumn(supabase)) {
          const { data: extra } = await supabase
            .from("ugc_posts")
            .select(cols)
            .eq("supplier_catalog_product_id", id)
            .eq("status", "published")
            .order("created_at", { ascending: false })
            .limit(8);
          if (extra?.length) {
            const seen = new Set(rows.map((r) => String(r.id)));
            rows = [...rows, ...(extra as Record<string, unknown>[]).filter((r) => !seen.has(String(r.id)))]
              .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
              .slice(0, 8);
          }
        }
        await applyLiveDisplayNames(supabase, rows);
        return rows;
      } catch (err) {
        console.error("[pdp] reviews leg failed:", err instanceof Error ? err.message : err);
        return [];
      }
    })(),

    // Published questions with their answers (ugc_comments,
    // kind = "question"; answers thread via parent_id). Same dual
    // linkage as the reviews leg.
    (async (): Promise<Record<string, unknown>[]> => {
      try {
        const cols = "id, customer_id, author_display_name, body, created_at";
        const base = () =>
          supabase
            .from("ugc_comments")
            .select(cols)
            .eq("kind", "question")
            .eq("status", "published")
            .order("created_at", { ascending: false })
            .limit(8);
        const { data: qs } = await withCeiling(base().eq("product_id", id), 10_000, "questions");
        let questions = (qs ?? []) as Record<string, unknown>[];
        if (await hasUgcCatalogColumn(supabase)) {
          const { data: extra } = await base().eq("supplier_catalog_product_id", id);
          if (extra?.length) {
            const seen = new Set(questions.map((q) => String(q.id)));
            questions = [...questions, ...(extra as Record<string, unknown>[]).filter((q) => !seen.has(String(q.id)))]
              .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
              .slice(0, 8);
          }
        }
        if (!questions.length) return [];
        const { data: ans } = await supabase
          .from("ugc_comments")
          .select("id, parent_id, customer_id, author_display_name, author_role, body, created_at")
          .in("parent_id", questions.map((q) => String(q.id)))
          .eq("status", "published")
          .order("created_at", { ascending: true });
        await applyLiveDisplayNames(supabase, questions);
        await applyLiveDisplayNames(supabase, (ans ?? []) as Record<string, any>[]);
        const byParent = new Map<string, Record<string, unknown>[]>();
        for (const a of (ans ?? []) as Record<string, unknown>[]) {
          const key = String(a.parent_id);
          byParent.set(key, [...(byParent.get(key) ?? []), a]);
        }
        return questions.map((q) => ({
          ...q,
          answers: byParent.get(String(q.id)) ?? [],
        }));
      } catch (err) {
        console.error("[pdp] questions leg failed:", err instanceof Error ? err.message : err);
        return [];
      }
    })(),

    // Related rail — same-category products (unstable_cache 5-min).
    getCachedRecommendations(id, typedProduct.category_id).catch(() => []),

    // UnSaid Picks — other-department products (unstable_cache 5-min).
    // excludeIds is empty: picks exclude the same category by construction,
    // so they cannot collide with the same-category related rail; the
    // no-category edge case is deduped after both resolve.
    getPdpPicks(id, typedProduct.category_id, []).catch(() => []),

    // PDP customizer — present only when this product is a design base
    // (published designs target it) or a published design's own product
    // (its mirror). Artworks = the published designs on that base, with
    // their Front-surface nodes for the live mockup preview; the print
    // grid + trim come from the same template resolution the studio
    // uses. Degrades to null — most catalog products have no designs.
    (async (): Promise<PdpCustomizerData | null> => {
      try {
        const { data: rel } = await withCeiling(
          supabase
            .from("designs")
            .select("id, supplier_catalog_product_id, published_product_id")
            .eq("status", "published")
            .or(`supplier_catalog_product_id.eq.${id},published_product_id.eq.${id}`),
          10_000,
          "customizer relations",
        );
        if (!rel?.length) return null;
        const own = rel.find((r) => r.published_product_id === id);
        const baseId = (own?.supplier_catalog_product_id as string) ?? id;

        const [{ data: designs }, { data: baseProd }, { data: baseSpecs }] =
          await Promise.all([
            withCeiling(
              supabase
                .from("designs")
                .select("id, name, product_title, canvas_state, garment_color")
                .eq("status", "published")
                .eq("supplier_catalog_product_id", baseId),
              10_000,
              "customizer designs",
            ),
            withCeiling(
              supabase
                .from("supplier_catalog_products")
                .select("name, image_url")
                .eq("id", baseId)
                .single(),
              10_000,
              "customizer base product",
            ),
            withCeiling(
              supabase
                .from("supplier_catalog_variants")
                .select("print_specs")
                .eq("supplier_catalog_product_id", baseId)
                .limit(24),
              10_000,
              "customizer base specs",
            ),
          ]);
        if (!designs?.length || !baseProd) return null;
        const template = resolveTemplate(
          baseProd as { name: string; image_url: string | null },
          (baseSpecs ?? []) as { print_specs: unknown }[],
        );
        const ownIds = new Set(
          rel.filter((r) => r.published_product_id === id).map((r) => r.id as string),
        );
        const artworks = designs
          .map((d) => {
            const cs: Record<string, unknown> = (d.canvas_state as Record<string, unknown>) ?? {};
            // Shopper customizations are private derivatives of a
            // published artwork (they carry a `customization` block) —
            // never offer them as artworks to the next shopper.
            if (cs.customization) return null;
            const surfaces = cs.surfaces as Record<string, unknown[]> | undefined;
            const frontNodes =
              cs.version === 2 && surfaces
                ? (surfaces.Front ?? [])
                : Array.isArray(cs.nodes)
                  ? (cs.nodes as unknown[])
                  : [];
            return {
              id: d.id as string,
              name: (d.product_title as string) || (d.name as string),
              frontNodes,
              garmentColor: (d.garment_color as string | null) ?? null,
              isOwn: ownIds.has(d.id as string),
            };
          })
          .filter((a): a is NonNullable<typeof a> => !!a && a.frontNodes.length > 0);
        if (!artworks.length) return null;
        return {
          baseProductId: baseId,
          trim: template.stage.trim,
          spec: {
            widthPx: template.spec.widthPx,
            heightPx: template.spec.heightPx,
            dpi: template.spec.dpi,
          },
          kind: template.kind,
          artworks,
        };
      } catch (err) {
        console.error("[pdp] customizer leg failed:", err instanceof Error ? err.message : err);
        return null;
      }
    })(),

    // Supplier sets — the SAME product carried by another supplier.
    // Grouping: the canonical link when this product has one, else
    // the brand + name match. Photos belong to the product (some
    // suppliers publish none — their set inherits the product's
    // photo set at assembly); what a set really swaps is the
    // variant pool and the price: that supplier's own options.
    // One set per supplier. Suppliers are never named — the client
    // identifies a set by its cover photo.
    (async (): Promise<PdpSet[]> => {
      try {
        const canonId = typedProduct.canonical_product_id ?? null;
        let q = supabase
          .from("supplier_catalog_products")
          .select("id, supplier_id, image_url, images")
          .eq("is_hidden", false)
          .neq("id", id)
          .limit(8);
        if (canonId) {
          q = q.eq("canonical_product_id", canonId);
        } else if (typedProduct.brand_name) {
          q = q.eq("brand_name", typedProduct.brand_name).eq("name", typedProduct.name);
        } else {
          return [];
        }
        const { data: sibs } = await withCeiling(q, 10_000, "supplier sets");
        if (!sibs?.length) return [];
        const seenSup = new Set<string>([String(typedProduct.supplier_id ?? "")]);
        const kept: { productId: string; urls: string[] }[] = [];
        for (const s of sibs as { id: string; supplier_id: string; image_url: string | null; images: string[] | null }[]) {
          const urls = [...new Set([s.image_url, ...((s.images as string[] | null) ?? [])].filter(Boolean) as string[])].slice(0, 8);
          const sup = String(s.supplier_id ?? "");
          if (seenSup.has(sup)) continue;
          seenSup.add(sup);
          kept.push({ productId: String(s.id), urls });
          if (kept.length >= 3) break;
        }
        const sets: PdpSet[] = [];
        for (const k of kept) {
          const vs = await withCeiling(fetchVariantsForProduct(k.productId), 10_000, "set variants").catch(
            () => [] as SupplierVariant[],
          );
          const prices = vs
            .map((v) => v.price_snapshot)
            .filter((p): p is number => p !== null && p > 0);
          const ss: string[] = [];
          const cc: string[] = [];
          const sSeen = new Set<string>();
          const cSeen = new Set<string>();
          for (const v of vs) {
            if (v.size && v.size.trim() && !sSeen.has(v.size)) {
              sSeen.add(v.size);
              ss.push(v.size);
            }
            if (v.color && v.color.trim() && !cSeen.has(v.color)) {
              cSeen.add(v.color);
              cc.push(v.color);
            }
          }
          const RANK = ["XXS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL"];
          ss.sort((a, b) => {
            const ra = RANK.indexOf(a.toUpperCase());
            const rb = RANK.indexOf(b.toUpperCase());
            if (ra !== -1 && rb !== -1) return ra - rb;
            if (ra !== -1) return -1;
            if (rb !== -1) return 1;
            return a.localeCompare(b);
          });
          sets.push({
            productId: k.productId,
            images: k.urls.map((url) => ({ url, alt: typedProduct.name })),
            variants: vs.map((v) => ({ id: v.id, size: v.size, color: v.color, price: v.price_snapshot })),
            options: (ss.length > 0 ? ss : cc).slice(0, 8).map((label) => ({ label, inStock: true })),
            optionKind: ss.length > 0 ? "size" : "color",
            price: prices.length ? Math.min(...prices) : null,
          });
        }
        return sets;
      } catch (err) {
        console.error("[pdp] supplier sets leg failed:", err instanceof Error ? err.message : err);
        return [];
      }
    })(),
  ]);

  const variants = variantsLeg.variants;
  const fallbackPricing = variantsLeg.fallback;

  // Price from positive variant prices (the cheapest real variant), or the
  // batch fallback when the full variant rows timed out.
  const prices = variants
    .map((v) => v.price_snapshot)
    .filter((p): p is number => p !== null && p > 0);
  const minPrice =
    fallbackPricing?.minPrice ?? (prices.length ? Math.min(...prices) : null);

  // Distinct sizes / colors (in variant order — variants are already
  // ordered by ascending price, so the first occurrence of each size/color
  // is the cheapest one).
  const sizes: string[] = [];
  const colors: string[] = [];
  const seenSize = new Set<string>();
  const seenColor = new Set<string>();
  for (const v of variants) {
    if (v.size && v.size.trim() && !seenSize.has(v.size)) {
      seenSize.add(v.size);
      sizes.push(v.size);
    }
    if (v.color && v.color.trim() && !seenColor.has(v.color)) {
      seenColor.add(v.color);
      colors.push(v.color);
    }
  }
  // Sizes present in size order, never in price/insertion order —
  // a jumbled size run (XS, L, M, S) reads as broken to a shopper.
  const SIZE_RANK = ["XXS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL"];
  const bySizeRank = (a: string, b: string) => {
    const ra = SIZE_RANK.indexOf(a.toUpperCase());
    const rb = SIZE_RANK.indexOf(b.toUpperCase());
    if (ra !== -1 && rb !== -1) return ra - rb;
    if (ra !== -1) return -1;
    if (rb !== -1) return 1;
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  };
  if (!variants.length && fallbackPricing) {
    sizes.push(...fallbackPricing.sizes);
    colors.push(...fallbackPricing.colors);
  }
  sizes.sort(bySizeRank);

  // Materials — aggregate across all variants' print_specs (empty on the
  // fallback path: honest absence, never invented entries).
  const materials = variants.length
    ? extractMaterials(variants)
    : { entries: [], material: null, printMethod: null, hasAny: false };

  const categoryName = categoryInfo?.name ?? null;
  const categorySlug = categoryInfo?.slug ?? null;
  const brand = typedProduct.brand_name ?? "UnSaid";
  const title = displayTitle(typedProduct.name);
  const description =
    listingOverride?.description ??
    buildDescription(
      typedProduct,
      brand,
      categoryName,
      sizes,
      colors,
      materials.material,
    );

  const reviews = reviewRows.map((r) => ({
    id: String(r.id),
    author: String(r.author_display_name ?? "Unsaid customer"),
    rating: Number(r.rating ?? 5),
    title: (r.title as string | null) ?? null,
    body: (r.body as string | null) ?? null,
    createdAt: (r.created_at as string | null) ?? null,
    verified: Boolean(r.is_verified_purchase),
  }));
  const questions = questionRows.map((q) => ({
    id: String(q.id),
    author: String(q.author_display_name ?? "Unsaid customer"),
    body: (q.body as string | null) ?? "",
    createdAt: (q.created_at as string | null) ?? null,
    answers: ((q.answers as Record<string, unknown>[] | undefined) ?? []).map((a) => ({
      id: String(a.id),
      author: String(a.author_display_name ?? "Unsaid customer"),
      role: String(a.author_role ?? "customer"),
      body: (a.body as string | null) ?? "",
      createdAt: (a.created_at as string | null) ?? null,
    })),
  }));
  const ratingCount = reviews.length;
  const ratingAvg =
    ratingCount > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / ratingCount : null;

  const toRelated = (r: (typeof recommendations)[number]) => ({
    id: r.id,
    slug: productSlug(r.name, r.id),
    name: r.name,
    brand: r.brand,
    image: r.image,
    price: r.minPrice,
    kind: r.brand ?? "UnSaid edit",
  });
  const related = recommendations.map(toRelated);
  // Picks dedup — only reachable in the no-category edge (picks are
  // cross-department by construction, see above).
  const relatedIds = new Set(related.map((r) => r.id));
  const picks = picksRaw
    .filter((p) => p.id !== id && !relatedIds.has(p.id))
    .map(toRelated);

  // Real media — the product's own image rows, primary first.
  const mediaUrls = (
    typedProduct.images?.length
      ? typedProduct.images
      : typedProduct.image_url
        ? [typedProduct.image_url]
        : []
  ).filter(Boolean) as string[];

  // Spec entries split the way the reference PDP's accordions read:
  // "Product details" carries what it's made of and how it's sized;
  // "Materials & care" carries care + print info.
  const SPEC_KEYS = ["Material", "Fabric", "Fabric weight", "Dimensions", "Fit", "Sizing", "Origin"];
  const CARE_KEYS = ["Care instructions", "Print method", "Print area", "Finish"];
  const specifications =
    materials.entries
      .filter((e) => SPEC_KEYS.includes(e.label))
      .map((e) => `${e.label}: ${e.value}`)
      .join(" · ") || null;
  const care =
    materials.entries
      .filter((e) => CARE_KEYS.includes(e.label))
      .map((e) => `${e.label}: ${e.value}`)
      .join(" · ") || null;

  const breadcrumb: { name: string; path: string }[] = [
    { name: "Shop", path: "/shop" },
    ...(categoryName && categorySlug
      ? [{ name: categoryName, path: `/shop/${categorySlug}` }]
      : []),
  ];

  // Set 0 — this page's own product as a supplier set, so the
  // client's gallery/buy-box reads one shape for every set.
  const set0: PdpSet = {
    productId: id,
    images: [...new Set(mediaUrls)].slice(0, 8).map((url) => ({ url, alt: title })),
    variants: variants.map((v) => ({
      id: v.id,
      size: v.size,
      color: v.color,
      price: v.price_snapshot,
    })),
    options: (sizes.length > 0 ? sizes : colors)
      .slice(0, 8)
      .map((label) => ({ label, inStock: true })),
    optionKind: sizes.length > 0 ? "size" : "color",
    price: minPrice,
  };

  const record: PdpRecord = {
    slug: productSlug(typedProduct.name, id),
    id,
    rawName: typedProduct.name,
    brand: typedProduct.brand_name ?? null,
    categoryLabel: categoryName,
    badge: null,
    price: minPrice,
    compareAtPrice: null,
    description,
    specifications,
    care,
    media: set0.images,
    breadcrumb,
    ratingAvg,
    ratingCount,
    reviews,
    questions,
    inStock: true,
    options: set0.options,
    optionKind: set0.optionKind,
    sellerName: "UnSaid",
    sellerHref: "/shop",
    related,
    picks,
    variants: set0.variants,
    // A supplier set with neither photos nor variants has nothing
    // to switch to — drop it. A set with variants but no photos of
    // its own shows the product's photo set (same garment) while
    // its own options and price drive the buy box.
    sets: [
      set0,
      ...supplierSets
        .filter((s) => s.images.length > 0 || s.variants.length > 0)
        .map((s) => (s.images.length > 0 ? s : { ...s, images: set0.images })),
    ],
    customizer,
  };

  return { status: "ok", record, title, brand };
}

/**
 * THE shared cached load — one DB pass per product id, cached with no
 * time-based expiry (product data does not change; supplier offers hang
 * underneath the canonical product) and invalidated on write through the
 * "catalog" tag and the /product/[id] path busts, and
 * per-request memoization makes generateMetadata's call a cache hit for
 * the page's call in the same render (the old code ran the product query
 * twice per cold render). unstable_cache does not store rejections, so a
 * failed load surfaces as a thrown error and the next visit retries clean.
 */
const loadPdp = unstable_cache(
  buildPdpLoadUncached,
  ["pdp-load-v5"],
  { tags: ["catalog"] },
);

// ── SEO metadata ───────────────────────────────────────────
// Same shared load as the page body — no second DB pass.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: slug } = await params;
  const id = parseProductId(slug);
  const load = await loadPdp(id);
  if (load.status !== "ok") return { title: "Product — UnSaid" };
  return {
    title: `${load.title} — UnSaid`,
    description: (load.record.description ?? `${load.brand} · ${load.title}`).slice(0, 300),
    alternates: { canonical: `${SITE_URL}/product/${load.record.slug}` },
    openGraph: {
      title: `${load.title} — UnSaid`,
      description: (load.record.description ?? `${load.brand} · ${load.title}`).slice(0, 300),
      ...(load.record.media[0]?.url
        ? { images: [{ url: load.record.media[0].url }] }
        : {}),
    },
  };
}

// ── Page ────────────────────────────────────────────────────

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: slug } = await params;
  const id = parseProductId(slug);
  const load = await loadPdp(id);
  // "missing" is a DETERMINED verdict (the load succeeded; no such
  // product). DB failures threw above — an errored render is never cached.
  if (load.status === "missing") notFound();

  const { record, title } = load;
  const minPrice = record.price;
  const brand = record.brand ?? "UnSaid";
  const ratingAvg = record.ratingAvg;
  const ratingCount = record.ratingCount;
  const description = record.description;

  // JSON-LD — Product schema with the CLEAN name, real price, real ratings
  // (unrated products omit the aggregateRating block entirely).
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: title,
    image: record.media.slice(0, 4).map((m) => m.url),
    description: description ?? undefined,
    sku: id,
    brand: { "@type": "Brand", name: brand },
    ...(minPrice != null && minPrice > 0
      ? {
          offers: {
            "@type": "Offer",
            url: `${SITE_URL}/product/${record.slug}`,
            priceCurrency: "USD",
            price: minPrice.toFixed(2),
            availability: "https://schema.org/InStock",
          },
        }
      : {}),
    ...(ratingAvg != null && ratingCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: ratingAvg.toFixed(1),
            reviewCount: ratingCount,
          },
        }
      : {}),
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      ...record.breadcrumb.map((b, i) => ({
        "@type": "ListItem",
        position: i + 2,
        name: b.name,
        item: `${SITE_URL}${b.path}`,
      })),
      {
        "@type": "ListItem",
        position: record.breadcrumb.length + 2,
        name: title,
        item: `${SITE_URL}/product/${record.slug}`,
      },
    ],
  };

  return (
    <>
      <ProductDetail record={record} />
      {/* Licensee ad slot (W5): renders nothing when no ad serves. */}
      <LicenseeAdSlot placement="pdp_below_gallery" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
    </>
  );
}
