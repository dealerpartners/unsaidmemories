/**
 * POST /api/admin/products/[id]/unpublish
 *
 * Hides a product from the storefront (status -> archived).
 * The row is kept — nothing is destroyed.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";
import { requireAdminApi } from "@/lib/admin/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TENANT_ID = getTenantId();

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  try {
    const { id } = await ctx.params;
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("products")
      .update({ status: "archived" })
      .eq("id", id)
      .eq("tenant_id", TENANT_ID)
      .select("id, name, slug, status")
      .single();
    if (error || !data) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, product: data });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to unpublish product" },
      { status: 500 }
    );
  }
}
