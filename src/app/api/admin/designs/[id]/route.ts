import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin/gate";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/designs/[id] — the full design INCLUDING canvas_state.
 * This is the reopen path the old studio never had: the editor loads
 * this, restores per-surface nodes, product setup and template link.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  try {
    const { id } = await params;
    const db = createServerClient();
    const { data, error } = await db
      .from("designs")
      .select("*")
      .eq("id", id)
      .single();
    if (error || !data) {
      return NextResponse.json({ error: "Design not found" }, { status: 404 });
    }

    // Assets produced for this design (print files, mockups, artwork).
    const { data: assets } = await db
      .from("design_assets")
      .select("id, kind, surface, storage_path, bucket, mime_type, width, height, provider, prompt, created_at")
      .eq("design_id", id)
      .order("created_at", { ascending: false });

    // Existing publication links (design → storefront variants).
    const { data: publications } = await db
      .from("design_publications")
      .select("id, product_variant_id, collection_id, status, published_at")
      .eq("design_id", id);

    // Print-ready files of record (pre-existing design_files table).
    const { data: printFiles } = await db
      .from("design_files")
      .select("id, placement, file_url, width_px, height_px, dpi, version, created_at")
      .eq("design_id", id)
      .order("version", { ascending: false });

    return NextResponse.json({
      design: data,
      assets: assets ?? [],
      publications: publications ?? [],
      printFiles: printFiles ?? [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * PUT /api/admin/designs/[id] — save edits to an existing draft.
 * Mirrors the canvas_state onto the parent project so the project file
 * and the design snapshot never diverge.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  try {
    const { id } = await params;
    const body = await req.json();
    const allowed = [
      "name",
      "canvas_state",
      "supplier_catalog_product_id",
      "product_title",
      "description",
      "retail_price",
      "category_id",
      "collection_id",
      "garment_color",
      "product_type",
    ] as const;
    const patch: Record<string, unknown> = {};
    for (const k of allowed) {
      if (k in body) patch[k] = body[k];
    }
    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }
    const db = createServerClient();
    const { data, error } = await db
      .from("designs")
      .update(patch)
      .eq("id", id)
      .select("id, project_id, updated_at")
      .single();
    if (error || !data) {
      return NextResponse.json({ error: "Design not found" }, { status: 404 });
    }
    if (body.canvas_state && data.project_id) {
      await db
        .from("projects")
        .update({
          canvas_state: body.canvas_state,
          name: body.name ?? undefined,
          collection_id: body.collection_id ?? undefined,
          active_supplier_catalog_product_id:
            body.supplier_catalog_product_id ?? undefined,
        })
        .eq("id", data.project_id);
    }
    return NextResponse.json({ ok: true, design_id: data.id, updated_at: data.updated_at });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** DELETE /api/admin/designs/[id] — archive (never hard-delete). */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  try {
    const { id } = await params;
    const db = createServerClient();
    const { error } = await db
      .from("designs")
      .update({ status: "archived" })
      .eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
