import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminActor } from "@/lib/admin/gate";
import { createServerClient } from "@/lib/supabase";
import { revalidateShop } from "@/lib/admin/revalidate-shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/erp/catalog/[id] — edit a supplier-catalog
 * product's display fields (name, brand). Prices live on the
 * variants and are not touched here. The catalog table is the
 * storefront's source, so the PDP is revalidated on change.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminActor();
  if ("error" in gate) return gate.error;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const patch: Record<string, unknown> = {};
  if (typeof body?.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (typeof body?.brand_name === "string") patch.brand_name = body.brand_name.trim() || null;
  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "nothing to update — send name and/or brand_name" }, { status: 400 });
  }
  const sb = createServerClient();
  const { data, error } = await sb
    .from("supplier_catalog_products")
    .update(patch)
    .eq("id", id)
    .select("id, name, brand_name")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "catalog product not found" }, { status: 404 });
  try { revalidatePath(`/product/${id}`); } catch { /* non-request context */ }
  revalidateShop();
  return NextResponse.json({ ok: true, product: data });
}
