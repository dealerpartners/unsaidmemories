/**
 * GET /api/recommendations?productId=xxx&category=xxx
 *
 * Returns up to 4 related `SupplierProduct` rows for the "Things you may
 * like" rail on a product detail page.
 *
 * Resolution order:
 *   1. Algolia (if `ALGOLIA_APP_ID` + `ALGOLIA_SEARCH_API_KEY` +
 *      `ALGOLIA_PRODUCTS_INDEX` are all set). Uses the REST `/query`
 *      endpoint directly — `algoliasearch` is not installed.
 *      On ANY error or empty result → falls back to step 2.
 *   2. Supabase fallback — `supplier_catalog_products` filtered by the
 *      same `category_id` as the current product (excluding the current
 *      product id), limit 4.
 *
 * Category resolution:
 *   - If `?category=<uuid>` is provided, it wins.
 *   - Else if `?productId=<uuid>` is provided, the product's own
 *     `category_id` is fetched and used.
 *   - Else: returns an empty list (nothing to anchor recommendations to).
 *
 * Server-only. The Algolia search key is read from `process.env` and never
 * sent to the browser.
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  createServerClient,
  type SupplierProduct,
} from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RECO_LIMIT = 4;

// ── Algolia (optional fast path) ────────────────────────────

interface AlgoliaHit {
  objectID: string;
  id?: string;
  name?: string;
  brand_name?: string | null;
  category_id?: string | null;
  image_url?: string | null;
  images?: string[] | null;
  variant_count?: number | null;
  external_id?: string;
  supplier_id?: string;
  external_id_type?: string | null;
  created_at?: string;
}

interface AlgoliaResponse {
  hits?: AlgoliaHit[];
  nbHits?: number;
  message?: string;
}

async function queryAlgolia(
  indexName: string,
  filters: string,
): Promise<SupplierProduct[] | null> {
  const appId = process.env.ALGOLIA_APP_ID;
  // Prefer the write key (the search key in .env is invalid/403). Server-side only.
  const apiKey = process.env.ALGOLIA_WRITE_API_KEY || process.env.ALGOLIA_SEARCH_API_KEY;
  if (!appId || !apiKey) return null;

  const url = `https://${appId}-dsn.algolia.net/1/indexes/${encodeURIComponent(
    indexName,
  )}/query`;

  // Ask Algolia for related products. We use a plain `hitsPerPage` query
  // with a facet filter; if the caller supplied a productId we also exclude
  // it via `NOT objectID:"..."`. Algolia will rank by its own relevance
  // score, which for a same-category browse is plenty.
  const body = {
    params: {
      hitsPerPage: RECO_LIMIT,
      filters,
      attributesToRetrieve: [
        "objectID",
        "id",
        "name",
        "brand_name",
        "category_id",
        "image_url",
        "images",
        "variant_count",
        "external_id",
        "supplier_id",
        "external_id_type",
        "created_at",
      ],
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-Algolia-Application-Id": appId,
        "X-Algolia-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      // Don't let a slow Algolia call block the page — cap it.
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as AlgoliaResponse;
    if (!data || !Array.isArray(data.hits) || data.hits.length === 0) {
      return null;
    }
    return data.hits.map((h) => ({
      id: h.id ?? h.objectID,
      supplier_id: h.supplier_id ?? "",
      external_id: h.external_id ?? "",
      external_id_type: h.external_id_type ?? null,
      name: h.name ?? "Untitled",
      brand_name: h.brand_name ?? null,
      category_id: h.category_id ?? null,
      variant_count: h.variant_count ?? null,
      image_url: h.image_url ?? null,
      images: h.images ?? null,
      created_at: h.created_at ?? new Date().toISOString(),
    }));
  } catch {
    // Network error, timeout, bad JSON — fall back to Supabase.
    return null;
  }
}

// ── Supabase fallback ───────────────────────────────────────

async function fetchRelatedFromSupabase(
  categoryId: string,
  excludeProductId?: string,
): Promise<SupplierProduct[]> {
  const supabase = createServerClient();
  let query = supabase
    .from("supplier_catalog_products")
    .select("*")
    .eq("is_hidden", false)
    .eq("category_id", categoryId);

  if (excludeProductId) {
    query = query.neq("id", excludeProductId);
  }

  // Prefer rows that actually have an image, then alphabetical — same
  // ordering convention used by `fetchSupplierProducts`.
  const { data, error } = await query
    .order("image_url", { ascending: false, nullsFirst: false })
    .order("name", { ascending: true })
    .limit(RECO_LIMIT);

  if (error || !data || data.length === 0) return [];
  return data as SupplierProduct[];
}

// ── Route handler ───────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const productId = searchParams.get("productId");
  const categoryParam = searchParams.get("category");

  // Resolve a category_id to anchor recommendations on.
  let categoryId: string | null = categoryParam;

  if (!categoryId && productId) {
    // Look up the product itself to read its `category_id`. We exclude the
    // productId from the final result set separately, so we don't need to
    // keep the full row around.
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("supplier_catalog_products")
      .select("category_id")
      .eq("id", productId)
      .single();
    if (!error && data) {
      const row = data as { category_id: string | null };
      categoryId = row.category_id;
    }
  }

  if (!categoryId) {
    // Nothing to anchor on — return an empty list rather than 4xx, so the
    // client always gets a 200 + `{ products: [] }` shape.
    return NextResponse.json({ products: [] });
  }

  // 1. Try Algolia (if configured).
  const indexName = process.env.ALGOLIA_PRODUCTS_INDEX;
  if (indexName) {
    let filter = `category_id:${JSON.stringify(categoryId)}`;
    if (productId) {
      filter += ` AND NOT objectID:${JSON.stringify(productId)}`;
    }
    const algoliaHits = await queryAlgolia(indexName, filter);
    if (algoliaHits && algoliaHits.length > 0) {
      return NextResponse.json({ products: algoliaHits });
    }
    // else fall through to Supabase.
  }

  // 2. Supabase fallback.
  const products = await fetchRelatedFromSupabase(
    categoryId,
    productId ?? undefined,
  );

  return NextResponse.json({ products });
}
