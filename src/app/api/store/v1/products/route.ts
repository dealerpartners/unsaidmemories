import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { verifyStoreApiKey } from "@/lib/integrations/keys";
import {
  authenticateLicensee,
  hasScope,
} from "@/lib/licensee/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Store API — read-only product feed for her other app (Kinnect).
 * Auth: header `x-store-api-key: usk_…` (created on the Connections
 * page; only its hash is stored) OR a Developer-portal licensee key
 * (`Authorization: Bearer lk_…` / `x-licensee-api-key`, scope
 * store:read; only its hash is stored). Returns the FULL finished
 * catalog (every visible supplier_catalog_products row — the same
 * catalog the store's product pages serve). FINISHED PRODUCTS ONLY:
 * no design happens on the licensee side; design lives in this
 * studio, and the licensee app only reads finished products.
 * `source` distinguishes studio-published products from raw
 * mirrored rows.
 *
 * GET /api/store/v1/products?limit=50&offset=0
 */
export async function GET(req: NextRequest) {
  const key = req.headers.get("x-store-api-key") ?? "";
  let authorized = await verifyStoreApiKey(key);
  if (!authorized) {
    // Developer-portal licensee key (Kinnect licensee engine, W5),
    // accepted via Authorization, x-licensee-api-key, or x-store-api-key.
    const licReq =
      key.startsWith("lk_") && !req.headers.get("x-licensee-api-key")
        ? new Request(req.url, { headers: { "x-licensee-api-key": key } })
        : req;
    const lic = await authenticateLicensee(licReq);
    authorized = Boolean(lic && hasScope(lic, "store:read"));
  }
  if (!authorized) {
    return NextResponse.json({ error: "Invalid or missing Store API key." }, { status: 401 });
  }
  const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 50) || 50));
  const offset = Math.max(0, Number(req.nextUrl.searchParams.get("offset") ?? 0) || 0);
  const db = createServerClient();
  const { count: total } = await db
    .from("supplier_catalog_products")
    .select("id", { count: "exact", head: true })
    .eq("is_hidden", false);
  const { data: products, error } = await db
    .from("supplier_catalog_products")
    .select("id, name, slug, brand_name, image_url, images, variant_count, created_at, category_id, supplier_id, external_id_type")
    .eq("is_hidden", false)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (products ?? []).map((p: any) => p.id);
  const priceByProduct = new Map<string, number>();
  if (ids.length) {
    const { data: variants } = await db
      .from("supplier_catalog_variants")
      .select("supplier_catalog_product_id, price_snapshot")
      .in("supplier_catalog_product_id", ids);
    for (const v of variants ?? []) {
      const price = Number((v as any).price_snapshot);
      if (!Number.isFinite(price)) continue;
      const cur = priceByProduct.get((v as any).supplier_catalog_product_id);
      if (cur === undefined || price < cur) priceByProduct.set((v as any).supplier_catalog_product_id, price);
    }
  }

  return NextResponse.json({
    products: (products ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      brand: p.brand_name,
      image: p.image_url,
      images: p.images ?? [],
      variantCount: p.variant_count,
      categoryId: p.category_id ?? null,
      supplierId: p.supplier_id ?? null,
      source: p.external_id_type ?? null,
      priceFrom: priceByProduct.get(p.id) ?? null,
      url: `/product/${p.id}`,
      updatedAt: p.created_at,
    })),
    total: total ?? null,
    limit,
    offset,
  });
}
