/**
 * POST /api/admin/products/[id]/variants
 *
 * Add a variant to an admin product.
 * Body: { sku, size?, color?, price, compare_at_price?, is_active? }
 * price is required — a variant without a price can't be sold.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";
import { requireAdminApi } from "@/lib/admin/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TENANT_ID = getTenantId();

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  try {
    const { id } = await ctx.params;
    const supabase = createServerClient();
    const body = await req.json().catch(() => ({}));

    const sku: string = (body?.sku ?? "").trim();
    const price = Number(body?.price);
    if (!sku) return NextResponse.json({ error: "sku is required" }, { status: 400 });
    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json({ error: "price must be a non-negative number" }, { status: 400 });
    }

    // Product must exist and belong to this tenant.
    const { data: product } = await supabase
      .from("products")
      .select("id")
      .eq("id", id)
      .eq("tenant_id", TENANT_ID)
      .single();
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    const { data: variant, error } = await supabase
      .from("product_variants")
      .insert({
        id: crypto.randomUUID(),
        tenant_id: TENANT_ID,
        product_id: id,
        sku,
        size: body?.size ?? null,
        color: body?.color ?? null,
        price,
        compare_at_price: body?.compare_at_price ?? null,
        is_active: body?.is_active ?? true,
      })
      .select("id, sku, size, color, price, compare_at_price, is_active, created_at")
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, variant }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to add variant" },
      { status: 500 }
    );
  }
}
