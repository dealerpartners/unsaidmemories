import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin/gate";
import {
  MultiSupplierConflict,
  publishCollection,
} from "@/lib/fabric/publish";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/collections/[id]/publish — publish every design filed
 * in this collection folder as one storefront collection.
 *
 * Each design goes through the real publish pipeline (product +
 * variants mapped from its supplier catalog product + design
 * publications), then products link to the collection. The
 * mixed-supplier rule applies: a folder whose designs ship from more
 * than one supplier is refused (409) unless forceMultiSupplier is set.
 *
 * Body: { forceMultiSupplier?: boolean }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const db = createServerClient();

    const { data: collection, error: cErr } = await db
      .from("collections")
      .select("id, name")
      .eq("id", id)
      .single();
    if (cErr || !collection) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }

    const { data: designs, error: dErr } = await db
      .from("designs")
      .select("id")
      .eq("collection_id", id)
      .neq("status", "archived");
    if (dErr) throw dErr;
    if (!designs?.length) {
      return NextResponse.json(
        { error: "This collection has no designs to publish" },
        { status: 400 },
      );
    }

    const result = await publishCollection(db, {
      collectionId: id,
      name: collection.name,
      designIds: designs.map((d: any) => d.id),
      forceMultiSupplier: body?.forceMultiSupplier === true,
      ownerId: gate.user.id,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    if (e instanceof MultiSupplierConflict) {
      return NextResponse.json(
        {
          error: "multi_supplier_conflict",
          message: e.message,
          supplierCount: e.supplierCount,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
