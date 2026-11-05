/**
 * GET /api/products/[id]
 *
 * Public product detail. Resolves in order:
 *   1. `products` (admin-curated) + `product_variants` — only if published.
 *   2. `supplier_catalog_products` + `supplier_catalog_variants` fallback.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TENANT_ID = getTenantId();

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const supabase = createServerClient();

    // 1. Admin-curated product (must be published to be public).
    const { data: product } = await supabase
      .from("products")
      .select("id, name, slug, description, status, category_id, brand_id")
      .eq("id", id)
      .eq("tenant_id", TENANT_ID)
      .eq("status", "published")
      .maybeSingle();

    if (product) {
      const { data: variants } = await supabase
        .from("product_variants")
        .select("id, sku, size, color, price, compare_at_price, is_active")
        .eq("product_id", id)
        .eq("tenant_id", TENANT_ID)
        .eq("is_active", true)
        .order("price", { ascending: true });
      return NextResponse.json({
        source: "catalog",
        product,
        variants: variants ?? [],
      });
    }

    // 2. Supplier catalog fallback.
    const { data: sp } = await supabase
      .from("supplier_catalog_products")
      .select("id, supplier_id, external_id, name, brand_name, category_id, image_url, images")
      .eq("is_hidden", false)
      .eq("id", id)
      .maybeSingle();
    if (!sp) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    const { data: sv } = await supabase
      .from("supplier_catalog_variants")
      .select("id, external_id, name, size, color, price_snapshot")
      .eq("supplier_catalog_product_id", id)
      .order("price_snapshot", { ascending: true, nullsFirst: false });

    return NextResponse.json({
      source: "supplier",
      product: sp,
      variants: (sv ?? []).map((v) => ({
        id: v.id,
        sku: v.external_id,
        size: v.size,
        color: v.color,
        price: v.price_snapshot,
      })),
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load product" },
      { status: 500 }
    );
  }
}
