import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin/gate";
import { PLATFORM_TENANT_ID } from "@/lib/fabric/publish";
import { slugifyCollectionName } from "@/lib/collection-builder";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/collections — collection folders with live counts
 * (designs filed in the folder + published products linked to it).
 * Folders are data (collections rows), never filesystem directories.
 */
export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  try {
    const db = createServerClient();
    const { data: collections, error } = await db
      .from("collections")
      .select("id, name, slug, type, framing_copy, is_active, parent_id, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;

    const ids = (collections ?? []).map((c: any) => c.id);
    const designCounts = new Map<string, number>();
    const productCounts = new Map<string, number>();
    if (ids.length) {
      const { data: designs } = await db
        .from("designs")
        .select("collection_id")
        .in("collection_id", ids);
      for (const d of designs ?? []) {
        if (d.collection_id) {
          designCounts.set(d.collection_id, (designCounts.get(d.collection_id) ?? 0) + 1);
        }
      }
      const { data: links } = await db
        .from("product_collections")
        .select("collection_id")
        .in("collection_id", ids);
      for (const l of links ?? []) {
        productCounts.set(l.collection_id, (productCounts.get(l.collection_id) ?? 0) + 1);
      }
    }

    return NextResponse.json({
      collections: (collections ?? []).map((c: any) => ({
        ...c,
        design_count: designCounts.get(c.id) ?? 0,
        product_count: productCounts.get(c.id) ?? 0,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** POST /api/admin/collections — create a collection folder. */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  try {
    const body = await req.json();
    const name: string = (body?.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const db = createServerClient();
    let slug = slugifyCollectionName(name);
    const { data: existing } = await db
      .from("collections")
      .select("id")
      .eq("slug", slug)
      .limit(1);
    if (existing?.length) slug = `${slug}-${Date.now().toString(36)}`;

    const { data, error } = await db
      .from("collections")
      .insert({
        tenant_id: PLATFORM_TENANT_ID,
        type: body?.type ?? "theme",
        name,
        slug,
        framing_copy: body?.framing_copy ?? null,
        is_active: true,
        parent_id: body?.parent_id ?? null,
      })
      .select("id, name, slug")
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, collection: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
