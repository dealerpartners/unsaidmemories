import { createServerClient } from "@/lib/supabase";
import { OCCASION_EXPANSIONS } from "@/lib/assistant/catalog-search";
import { MATERIALS, OCCASIONS, RECIPIENTS } from "@/lib/gift-finder-options";

/**
 * gift-finder — the REAL gift finder behind the box on /shop.
 *
 * Facets, and the real data behind each (nothing is faked):
 *  - Recipient / Occasion: keyword matching over the live catalogue,
 *    using the same approach and the same occasion expansions as the
 *    shopping assistant (src/lib/assistant/catalog-search.ts), so
 *    "occasion" means the same thing in both: name/brand matches per
 *    keyword, plus products in keyword-matched categories.
 *  - Personalisation: products published from the studio
 *    (supplier_catalog_products.external_id "studio-%") — the ones a
 *    shopper can make their own — vs ready-made.
 *  - Memory Link: the real "Memory Links" taxonomy subtree
 *    (QR & NFC cards, NFC stickers, prompt decks) + "Memory boxes".
 *  - Material: matched against the words in the product's own name
 *    (ceramic, cotton, canvas, metal, wood, glass) — the catalogue
 *    carries no structured material field, so the facet is only
 *    offered for materials that actually occur in product names.
 *  - Price range: the lowest live variant price per product
 *    (supplier_catalog_variants.price_snapshot).
 *  - Fulfilment: the supplier that makes the product.
 *  - "Ships in": NOT offered — no supplier lead-time / production
 *    data exists anywhere in the catalogue, and we do not invent it.
 *
 * Only products with a priced variant are returned (they are the
 * ones that resolve on the PDP and can be bought). The result count
 * is the true size of the returned match set; when the candidate cap
 * is hit the count is flagged as capped.
 */

/** The shop card's product shape (components/catalog-card.tsx). */
export interface GiftProduct {
  id: string;
  name: string;
  brand: string | null;
  image: string | null;
  images: string[] | null;
  variantCount: number;
  minPrice: number;
  sizes: string[];
  colors: string[];
}

export interface GiftFinderResult {
  products: GiftProduct[];
  total: number;
  capped: boolean;
}

export interface GiftFinderFilters {
  recipient?: string;
  occasion?: string;
  personalization?: string; // "custom" | "ready"
  memoryLink?: boolean;
  material?: string;
  priceMax?: number;
  supplierSlug?: string;
  /** Page offset into the match set (results are paged, PAGE_SIZE per page). */
  offset?: number;
}

const CANDIDATE_CAP = 600;
const PAGE_SIZE = 60;
const ROW_COLS =
  "id, name, image_url, images, brand_name, supplier_id, category_id, external_id, variant_count";

type ProductRow = {
  id: string;
  name: string;
  image_url: string | null;
  images: string[] | null;
  brand_name: string | null;
  supplier_id: string | null;
  category_id: string | null;
  external_id: string | null;
  variant_count: number | null;
};

/** Exact live catalogue size, for the box header ("the whole store"). */
export async function getCatalogTotal(): Promise<number> {
  const sb = createServerClient();
  const { count } = await sb
    .from("supplier_catalog_products")
    .select("id", { count: "exact", head: true })
    .eq("is_hidden", false);
  return count ?? 0;
}

async function fetchMinPrices(sb: ReturnType<typeof createServerClient>, ids: string[]) {
  const min = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data } = await sb
      .from("supplier_catalog_variants")
      .select("supplier_catalog_product_id, price_snapshot")
      .in("supplier_catalog_product_id", chunk)
      .not("price_snapshot", "is", null);
    for (const v of data ?? []) {
      const p = Number(v.price_snapshot);
      if (!Number.isFinite(p) || p <= 0) continue;
      const key = v.supplier_catalog_product_id as string;
      const cur = min.get(key);
      if (cur === undefined || p < cur) min.set(key, p);
    }
  }
  return min;
}

/** Expand category ids to their full subtrees (parent_id chains). */
async function expandSubtree(
  sb: ReturnType<typeof createServerClient>,
  rootIds: Set<string>,
): Promise<Set<string>> {
  if (!rootIds.size) return rootIds;
  const { data: all } = await sb.from("categories").select("id, parent_id");
  const childrenOf = new Map<string, string[]>();
  for (const c of all ?? []) {
    if (c.parent_id) {
      const arr = childrenOf.get(c.parent_id as string) ?? [];
      arr.push(c.id as string);
      childrenOf.set(c.parent_id as string, arr);
    }
  }
  const out = new Set(rootIds);
  const queue = [...rootIds];
  while (queue.length) {
    const cur = queue.pop()!;
    for (const kid of childrenOf.get(cur) ?? []) {
      if (!out.has(kid)) {
        out.add(kid);
        queue.push(kid);
      }
    }
  }
  return out;
}

/** Category ids in the Memory Links + Memory boxes subtrees. */
async function memoryCategoryIds(sb: ReturnType<typeof createServerClient>) {
  const { data: roots } = await sb
    .from("categories")
    .select("id")
    .in("slug", ["digital-and-memory-memory-links", "memory-boxes"]);
  return expandSubtree(sb, new Set((roots ?? []).map((r) => r.id as string)));
}

export async function findGifts(filters: GiftFinderFilters): Promise<GiftFinderResult> {
  const sb = createServerClient();

  // Facet values are validated against the option lists — nothing
  // free-form reaches a query string.
  const material = MATERIALS.some((m) => m.value === filters.material)
    ? filters.material
    : undefined;

  // Keyword set from the keyword facets (same expansions as the
  // shopping assistant).
  const keywords: string[] = [];
  const recipient = RECIPIENTS.find((r) => r.value === filters.recipient);
  if (recipient) keywords.push(...recipient.keywords);
  const occasion = OCCASIONS.find((o) => o.value === filters.occasion);
  if (occasion) {
    const expansion = OCCASION_EXPANSIONS.find((e) => e.key === occasion.expansionKey);
    if (expansion) keywords.push(...expansion.keywords);
  }
  if (material) keywords.push(material);
  const uniqueKeywords = [...new Set(keywords)].slice(0, 10);

  let rows: ProductRow[] = [];
  let capped = false;
  if (uniqueKeywords.length) {
    const byId = new Map<string, ProductRow>();
    const add = (data: unknown) => {
      for (const r of (data ?? []) as ProductRow[]) {
        if (!byId.has(r.id)) byId.set(r.id, r);
      }
    };
    // Name / brand matches per keyword.
    for (const kw of uniqueKeywords) {
      const { data } = await sb
        .from("supplier_catalog_products")
        .select(ROW_COLS)
        .eq("is_hidden", false)
        .or(`name.ilike.%${kw}%,brand_name.ilike.%${kw}%`)
        .limit(150);
      add(data);
      if (byId.size >= CANDIDATE_CAP) break;
    }
    // Category matches (a "sympathy" category beats a random name
    // hit) — matched categories expand to their whole subtrees.
    if (byId.size < CANDIDATE_CAP) {
      const { data: cats } = await sb
        .from("categories")
        .select("id")
        .or(uniqueKeywords.map((kw) => `name.ilike.%${kw}%`).join(","))
        .limit(12);
      if (cats?.length) {
        const subtree = await expandSubtree(
          sb,
          new Set(cats.map((c) => c.id as string)),
        );
        const { data } = await sb
          .from("supplier_catalog_products")
          .select(ROW_COLS)
          .eq("is_hidden", false)
          .in("category_id", [...subtree])
          .limit(400);
        add(data);
      }
    }
    rows = [...byId.values()];
    capped = rows.length >= CANDIDATE_CAP;
  } else {
    // No keyword facets: browse the newest slice of the catalogue and
    // keep the priced ones after enrichment.
    const { data, error } = await sb
      .from("supplier_catalog_products")
      .select(ROW_COLS)
      .eq("is_hidden", false)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error(`catalogue browse failed: ${error.message}`);
    rows = (data ?? []) as ProductRow[];
    capped = rows.length >= 1000;
  }

  // Memory Link facet: pull its subtree's products directly into
  // the candidate set — a small, specific corner of the catalogue
  // that keyword search and newest-first browsing can both miss.
  const memoryIds = filters.memoryLink ? await memoryCategoryIds(sb) : null;
  if (memoryIds && memoryIds.size) {
    const { data } = await sb
      .from("supplier_catalog_products")
      .select(ROW_COLS)
      .eq("is_hidden", false)
      .in("category_id", [...memoryIds])
      .limit(600);
    const seen = new Set(rows.map((r) => r.id));
    for (const r of (data ?? []) as ProductRow[]) {
      if (!seen.has(r.id)) rows.push(r);
    }
  }

  // Structured facets.
  let supplierId: string | null = null;
  if (filters.supplierSlug) {
    const { data } = await sb
      .from("suppliers")
      .select("id")
      .eq("slug", filters.supplierSlug)
      .maybeSingle();
    supplierId = (data?.id as string) ?? null;
  }
  rows = rows.filter((r) => {
    if (supplierId && r.supplier_id !== supplierId) return false;
    if (memoryIds && !(r.category_id && memoryIds.has(r.category_id))) return false;
    const isStudio = String(r.external_id ?? "").startsWith("studio-");
    if (filters.personalization === "custom" && !isStudio) return false;
    if (filters.personalization === "ready" && isStudio) return false;
    if (material && !r.name.toLowerCase().includes(material)) return false;
    return true;
  });

  // Price enrichment — only priced products can be bought.
  const prices = await fetchMinPrices(sb, rows.map((r) => r.id));
  let products: GiftProduct[] = rows
    .filter((r) => prices.has(r.id))
    .map((r) => ({
      id: r.id,
      name: r.name,
      brand: r.brand_name,
      image: r.image_url,
      images: r.images,
      variantCount: r.variant_count ?? 0,
      minPrice: prices.get(r.id)!,
      sizes: [],
      colors: [],
    }));
  if (filters.priceMax !== undefined) {
    products = products.filter((p) => p.minPrice <= filters.priceMax!);
  }

  const start = Math.max(0, Math.floor(filters.offset ?? 0));
  return { products: products.slice(start, start + PAGE_SIZE), total: products.length, capped };
}
