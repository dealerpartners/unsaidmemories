/**
 * /api/admin/ecommerce/collections — storefront collections.
 * GET  — collections with linked product counts (product_collections).
 * POST — create a collection { name, type?, framing_copy? }.
 * PATCH — update { id, name?, type?, framing_copy?, is_active?, starts_on?, ends_on? }.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, requireModuleApi } from "@/lib/admin/gate";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "collection";
}

export async function GET() {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const mod = await requireModuleApi("ecommerce", "read");
  if (mod) return mod;
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from("collections")
      .select("id, type, name, slug, framing_copy, starts_on, ends_on, is_active, parent_id, created_at")
      .order("created_at", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const counts = new Map<string, number>();
    const { data: links } = await db.from("product_collections").select("collection_id");
    for (const l of links ?? []) counts.set(l.collection_id as string, (counts.get(l.collection_id as string) ?? 0) + 1);
    return NextResponse.json({
      collections: (data ?? []).map((c) => ({ ...c, productCount: counts.get(c.id as string) ?? 0 })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "List failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const mod = await requireModuleApi("ecommerce", "write");
  if (mod) return mod;
  try {
    const body = await req.json();
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
    const db = createServerClient();
    const { data, error } = await db
      .from("collections")
      .insert({
        tenant_id: getTenantId(),
        name,
        slug: slugify(String(body.slug || name)),
        type: String(body.type || "evergreen"),
        framing_copy: String(body.framing_copy || "").trim() || null,
        is_active: true,
      })
      .select("id")
      .single();
    if (error || !data) return NextResponse.json({ error: error?.message || "Create failed" }, { status: 500 });
    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Create failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const mod = await requireModuleApi("ecommerce", "write");
  if (mod) return mod;
  try {
    const body = await req.json();
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });
    const patch: Record<string, unknown> = {};
    for (const k of ["name", "type", "framing_copy", "starts_on", "ends_on"]) {
      if (typeof body[k] === "string") patch[k] = body[k].trim() || null;
    }
    if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    const db = createServerClient();
    const { error } = await db.from("collections").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Update failed" }, { status: 500 });
  }
}
