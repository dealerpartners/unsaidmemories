/**
 * POST /api/admin/products/[id]/publish
 *
 * Publishes a product to the storefront (status=draft|archived -> published).
 * Publishing steps (Kim's question):
 *   1. Product exists in `products` with status=draft (created via
 *      POST /api/admin/products, designed in the studio).
 *   2. POST here -> status=published.
 *   3. Storefront reads published products via GET /api/products and
 *      /shop/[[...slug]] — the product appears immediately, no deploy.
 * Returns the storefront URL for the product.
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
      .update({ status: "published" })
      .eq("id", id)
      .eq("tenant_id", TENANT_ID)
      .select("id, name, slug, status")
      .single();
    if (error || !data) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      product: data,
      url: `/products/${data.slug}`,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to publish product" },
      { status: 500 }
    );
  }
}
