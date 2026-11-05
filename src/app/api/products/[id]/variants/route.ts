/**
 * GET /api/products/[id]/variants
 *
 * Public variant list for a product. Same resolution order as
 * /api/products/[id]: admin-curated first, supplier catalog fallback.
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

    const { data: product } = await supabase
      .from("products")
      .select("id")
      .eq("id", id)
      .eq("tenant_id", TENANT_ID)
      .eq("status", "published")
      .maybeSingle();

    if (product) {
      const { data: variants, error } = await supabase
        .from("product_variants")
        .select("id, sku, size, color, price, compare_at_price, is_active")
        .eq("product_id", id)
        .eq("tenant_id", TENANT_ID)
        .eq("is_active", true)
        .order("price", { ascending: true });
      if (error) throw error;
      return NextResponse.json({ variants: variants ?? [], total: variants?.length ?? 0 });
    }

    const { data: sv, error } = await supabase
      .from("supplier_catalog_variants")
      .select("id, external_id, name, size, color, price_snapshot")
      .eq("supplier_catalog_product_id", id)
      .order("price_snapshot", { ascending: true, nullsFirst: false });
    if (error) throw error;
    return NextResponse.json({
      variants: (sv ?? []).map((v) => ({
        id: v.id,
        sku: v.external_id,
        size: v.size,
        color: v.color,
        price: v.price_snapshot,
      })),
      total: sv?.length ?? 0,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to list variants" },
      { status: 500 }
    );
  }
}
