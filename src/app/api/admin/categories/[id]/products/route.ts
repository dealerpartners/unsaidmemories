/**
 * POST /api/admin/categories/[id]/products
 *
 * Assign products to a category (bulk).
 * Body: { product_ids: string[] }
 * Sets products.category_id for each id (tenant-scoped).
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
    const productIds: string[] = Array.isArray(body?.product_ids)
      ? body.product_ids.filter(Boolean)
      : [];
    if (!productIds.length) {
      return NextResponse.json({ error: "product_ids is required" }, { status: 400 });
    }

    const { data: category } = await supabase
      .from("categories")
      .select("id")
      .eq("id", id)
      .or(`tenant_id.eq.${TENANT_ID},tenant_id.is.null`)
      .single();
    if (!category) return NextResponse.json({ error: "Category not found" }, { status: 404 });

    const { error, count } = await supabase
      .from("products")
      .update({ category_id: id }, { count: "exact" })
      .in("id", productIds)
      .eq("tenant_id", TENANT_ID);
    if (error) throw error;

    return NextResponse.json({ ok: true, assigned: count ?? 0, category_id: id });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to assign products" },
      { status: 500 }
    );
  }
}
