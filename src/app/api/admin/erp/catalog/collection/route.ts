import { NextRequest, NextResponse } from "next/server";
import { requireAdminActor } from "@/lib/admin/gate";
import { createServerClient } from "@/lib/supabase";
import { PLATFORM_TENANT_ID } from "@/lib/admin/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Collection membership for supplier-catalog products.
 *
 * product_collections links the `products` id space (that is what
 * collection pages and the collections builder read). A pure
 * supplier-catalog product has no products row, so assigning one
 * first creates its products shell UNDER THE SAME ID — the mirror
 * pattern the studio publish flow already uses (one id, both
 * tables) — then links it. Nothing about the catalog row changes.
 *
 * POST   { catalogProductId, collectionId } — assign (idempotent)
 * DELETE { catalogProductId, collectionId } — unassign
 */
async function readBody(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const catalogProductId = body?.catalogProductId as string | undefined;
  const collectionId = body?.collectionId as string | undefined;
  if (!catalogProductId || !collectionId) return null;
  return { catalogProductId, collectionId };
}

export async function POST(req: NextRequest) {
  const gate = await requireAdminActor();
  if ("error" in gate) return gate.error;
  const input = await readBody(req);
  if (!input) return NextResponse.json({ error: "catalogProductId and collectionId are required" }, { status: 400 });
  const sb = createServerClient();

  const { data: cat } = await sb
    .from("supplier_catalog_products")
    .select("id, name, slug, category_id")
    .eq("id", input.catalogProductId)
    .maybeSingle();
  if (!cat) return NextResponse.json({ error: "catalog product not found" }, { status: 404 });
  const { data: collection } = await sb.from("collections").select("id, name").eq("id", input.collectionId).maybeSingle();
  if (!collection) return NextResponse.json({ error: "collection not found" }, { status: 404 });

  // Mirror shell in the products id space (same id), if absent.
  const { data: shell } = await sb.from("products").select("id").eq("id", cat.id).maybeSingle();
  if (!shell) {
    const { error } = await sb.from("products").insert({
      id: cat.id,
      tenant_id: PLATFORM_TENANT_ID,
      name: cat.name,
      slug: cat.slug || `catalog-${String(cat.id).slice(0, 8)}`,
      category_id: cat.category_id ?? null,
      status: "published",
    });
    if (error) return NextResponse.json({ error: "mirror shell failed: " + error.message }, { status: 500 });
  }

  const { error } = await sb
    .from("product_collections")
    .upsert(
      { product_id: cat.id, tenant_id: PLATFORM_TENANT_ID, collection_id: collection.id },
      { onConflict: "product_id,collection_id", ignoreDuplicates: true },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, collection: collection.name });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireAdminActor();
  if ("error" in gate) return gate.error;
  const input = await readBody(req);
  if (!input) return NextResponse.json({ error: "catalogProductId and collectionId are required" }, { status: 400 });
  const sb = createServerClient();
  const { error } = await sb
    .from("product_collections")
    .delete()
    .eq("product_id", input.catalogProductId)
    .eq("collection_id", input.collectionId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
