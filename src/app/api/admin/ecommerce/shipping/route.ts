/**
 * /api/admin/ecommerce/shipping — shipping_profiles management.
 * GET   — all profiles.
 * PATCH — { id, first_item_cost?, additional_item_cost?, min_days?,
 *           max_days?, is_default? } — setting is_default clears the
 *           flag on every other profile first (one default per store).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, requireModuleApi } from "@/lib/admin/gate";
import { createServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const mod = await requireModuleApi("ecommerce", "read");
  if (mod) return mod;
  const db = createServerClient();
  const { data, error } = await db
    .from("shipping_profiles")
    .select("id, supplier_id, profile_name, method_name, origin_country, destination_countries, first_item_cost, additional_item_cost, currency, min_days, max_days, is_default")
    .order("profile_name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profiles: data ?? [] });
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
    const db = createServerClient();
    if (body.is_default === true) {
      const clear = await db.from("shipping_profiles").update({ is_default: false }).neq("id", id);
      if (clear.error) return NextResponse.json({ error: clear.error.message }, { status: 500 });
    }
    const patch: Record<string, unknown> = {};
    for (const k of ["first_item_cost", "additional_item_cost", "min_days", "max_days"]) {
      if (body[k] !== undefined && body[k] !== null && body[k] !== "") patch[k] = Number(body[k]);
    }
    if (typeof body.is_default === "boolean") patch.is_default = body.is_default;
    if (typeof body.method_name === "string") patch.method_name = body.method_name;
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    const { error } = await db.from("shipping_profiles").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Update failed" }, { status: 500 });
  }
}
