/**
 * /api/admin/catalog-listing/[id] — the owner's edit of one catalog
 * listing, where [id] is the supplier_catalog_products id.
 *
 * PATCH  — save her name / description / price / shelf (category) for the
 *          listing. Stored in catalog_listing_overrides (NEVER on the
 *          supplier mirror row — a supplier re-sync rewrites the mirror
 *          and would erase her work). The joined catalog read
 *          (lib/supabase.ts) prefers these values on the storefront feed
 *          and in the admin catalog alike.
 *          Body: { name?, description?, price?, categoryId? } — a field
 *          set to null clears just that field back to the supplier value.
 * DELETE — remove her edit entirely; the listing goes back to exactly
 *          what the supplier sends.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAdminApi } from "@/lib/admin/gate";
import { revalidateShop } from "@/lib/admin/revalidate-shop";
import {
  deleteListingOverride,
  fetchListingOverride,
  upsertListingOverride,
} from "@/lib/catalog-overrides";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "A JSON body is required" }, { status: 400 });
    }

    const db = createServerClient();
    const { data: catalogRow } = await db
      .from("supplier_catalog_products")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (!catalogRow) {
      return NextResponse.json({ error: "Catalog product not found" }, { status: 404 });
    }

    const name = body.name === undefined ? undefined : body.name === null ? null : String(body.name).trim();
    if (name !== undefined && name !== null && !name) {
      return NextResponse.json({ error: "The listing name cannot be empty" }, { status: 400 });
    }
    const description =
      body.description === undefined ? undefined : body.description === null ? null : String(body.description);

    let price: number | null | undefined = undefined;
    if (body.price !== undefined) {
      if (body.price === null || body.price === "") price = null;
      else {
        price = Number(body.price);
        if (!Number.isFinite(price) || price < 0) {
          return NextResponse.json({ error: "Price must be a number, 0 or more" }, { status: 400 });
        }
      }
    }

    let categoryId: string | null | undefined = undefined;
    if (body.categoryId !== undefined) {
      categoryId = body.categoryId === null ? null : String(body.categoryId);
      if (categoryId) {
        const { data: cat } = await db.from("categories").select("id").eq("id", categoryId).maybeSingle();
        if (!cat) return NextResponse.json({ error: "That category does not exist" }, { status: 400 });
      }
    }

    if (name === undefined && description === undefined && price === undefined && categoryId === undefined) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    // Merge onto any existing edit so saving one field never wipes another.
    const existing = await fetchListingOverride(id);
    const saved = await upsertListingOverride({
      catalogProductId: id,
      name: name === undefined ? (existing?.name ?? null) : name,
      description: description === undefined ? (existing?.description ?? null) : description,
      price: price === undefined ? (existing?.price ?? null) : price,
      categoryId: categoryId === undefined ? (existing?.category_id ?? null) : categoryId,
    });
    revalidateShop();
    return NextResponse.json({ ok: true, override: saved });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save the listing edit" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  try {
    const { id } = await ctx.params;
    await deleteListingOverride(id);
    revalidateShop();
    return NextResponse.json({ ok: true, reset: true });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to reset the listing" },
      { status: 500 },
    );
  }
}
