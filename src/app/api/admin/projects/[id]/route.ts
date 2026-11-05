import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin/gate";

export const dynamic = "force-dynamic";

/** GET /api/admin/projects/[id] — full project incl. canvas_state. */
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
      .from("projects")
      .select("*")
      .eq("id", id)
      .single();
    if (error || !data) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json({ project: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** PUT /api/admin/projects/[id] — update name, canvas state, folder. */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  try {
    const { id } = await params;
    const body = await req.json();
    const patch: Record<string, unknown> = {};
    for (const k of [
      "name",
      "canvas_state",
      "collection_id",
      "active_supplier_catalog_product_id",
      "status",
    ]) {
      if (k in body) patch[k] = body[k];
    }
    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }
    patch.updated_at = new Date().toISOString();
    const db = createServerClient();
    const { data, error } = await db
      .from("projects")
      .update(patch)
      .eq("id", id)
      .select("id, updated_at")
      .single();
    if (error || !data) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, project_id: data.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
