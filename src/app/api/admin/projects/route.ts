import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin/gate";
import { PLATFORM_TENANT_ID } from "@/lib/fabric/publish";

export const dynamic = "force-dynamic";

/** GET /api/admin/projects — studio working files (for Open project). */
export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from("projects")
      .select("id, name, status, collection_id, active_supplier_catalog_product_id, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return NextResponse.json({ projects: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** POST /api/admin/projects — create a working file. */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  try {
    const body = await req.json();
    if (!body.name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const db = createServerClient();
    const { data, error } = await db
      .from("projects")
      .insert({
        tenant_id: PLATFORM_TENANT_ID,
        owner_id: gate.user.id,
        name: body.name,
        collection_id: body.collection_id ?? null,
        canvas_state: body.canvas_state ?? {},
        active_supplier_catalog_product_id:
          body.supplier_catalog_product_id ?? null,
        status: "draft",
      })
      .select("id")
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, project_id: data.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
