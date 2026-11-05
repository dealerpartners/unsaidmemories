import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin/gate";
import { PLATFORM_TENANT_ID } from "@/lib/fabric/publish";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/designs — create a studio design draft.
 *
 * The design row is the product-in-waiting: it carries the full v2
 * canvas_state (per-surface node trees), the supplier catalog product
 * it designs, and the product setup (title, price, category,
 * collection) the publish pipeline reads. Optionally creates/links a
 * project (the reopenable working file).
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  try {
    const body = await req.json();
    const {
      name,
      canvas_state,
      supplier_catalog_product_id,
      project_id,
      product_title,
      description,
      retail_price,
      category_id,
      collection_id,
      garment_color,
      product_type,
    } = body;
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const db = createServerClient();

    let projectId: string | null = project_id ?? null;
    if (!projectId) {
      const { data: project, error: pErr } = await db
        .from("projects")
        .insert({
          tenant_id: PLATFORM_TENANT_ID,
          owner_id: gate.user.id,
          name,
          collection_id: collection_id ?? null,
          canvas_state: canvas_state || {},
          active_supplier_catalog_product_id: supplier_catalog_product_id ?? null,
          status: "draft",
        })
        .select("id")
        .single();
      if (pErr) throw pErr;
      projectId = project.id;
    }

    const { data, error } = await db
      .from("designs")
      .insert({
        tenant_id: PLATFORM_TENANT_ID,
        name,
        canvas_state: canvas_state || {},
        status: "draft",
        supplier_catalog_product_id: supplier_catalog_product_id ?? null,
        project_id: projectId,
        product_title: product_title ?? null,
        description: description ?? null,
        retail_price: retail_price ?? null,
        category_id: category_id ?? null,
        collection_id: collection_id ?? null,
        garment_color: garment_color ?? null,
        product_type: product_type ?? null,
        owner_id: gate.user.id,
      })
      .select("id")
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, design_id: data.id, project_id: projectId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * GET /api/admin/designs — list designs WITH the fields the studio and
 * review queue need (status, product setup, catalog link, collection).
 * canvas_state is intentionally excluded from the list payload; fetch a
 * single design to reopen it.
 */
export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const collectionId = searchParams.get("collection_id");
    const db = createServerClient();
    let query = db
      .from("designs")
      .select(
        "id, name, status, product_title, retail_price, category_id, collection_id, supplier_catalog_product_id, project_id, product_type, garment_color, print_file_path, mockup_path, published_product_id, created_at, updated_at",
      )
      .order("updated_at", { ascending: false })
      .limit(200);
    if (status) query = query.eq("status", status);
    if (collectionId) query = query.eq("collection_id", collectionId);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ designs: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
