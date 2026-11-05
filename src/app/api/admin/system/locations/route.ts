/**
 * /api/admin/system/locations — Locations & Branches (erp_warehouses).
 * GET  — warehouses with zone/location counts.
 * POST — create a warehouse/branch.
 * PATCH — update fields incl. is_active (body: { id, ...fields }).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, requireModuleApi } from "@/lib/admin/gate";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const mod = await requireModuleApi("administration", "read");
  if (mod) return mod;
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from("erp_warehouses")
      .select("id, code, name, warehouse_type, address_line1, address_line2, city, state, postal_code, country_code, timezone, is_active, created_at")
      .eq("tenant_id", getTenantId())
      .order("created_at", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const ids = (data ?? []).map((w) => w.id as string);
    const zoneCounts = new Map<string, number>();
    const locCounts = new Map<string, number>();
    if (ids.length) {
      const zones = await db.from("erp_warehouse_zones").select("warehouse_id").in("warehouse_id", ids);
      for (const z of zones.data ?? []) zoneCounts.set(z.warehouse_id as string, (zoneCounts.get(z.warehouse_id as string) ?? 0) + 1);
      const locs = await db.from("erp_warehouse_locations").select("warehouse_id").in("warehouse_id", ids);
      for (const l of locs.data ?? []) locCounts.set(l.warehouse_id as string, (locCounts.get(l.warehouse_id as string) ?? 0) + 1);
    }
    return NextResponse.json({
      locations: (data ?? []).map((w) => ({
        ...w,
        zones: zoneCounts.get(w.id as string) ?? 0,
        binLocations: locCounts.get(w.id as string) ?? 0,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "List failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const mod = await requireModuleApi("administration", "write");
  if (mod) return mod;
  try {
    const body = await req.json();
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
    const db = createServerClient();
    const { data, error } = await db
      .from("erp_warehouses")
      .insert({
        tenant_id: getTenantId(),
        name,
        code: String(body.code || "").trim() || null,
        warehouse_type: String(body.warehouse_type || "fulfillment"),
        address_line1: String(body.address_line1 || "").trim() || null,
        address_line2: String(body.address_line2 || "").trim() || null,
        city: String(body.city || "").trim() || null,
        state: String(body.state || "").trim() || null,
        postal_code: String(body.postal_code || "").trim() || null,
        country_code: String(body.country_code || "US").trim() || "US",
        timezone: String(body.timezone || "").trim() || null,
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
  const mod = await requireModuleApi("administration", "write");
  if (mod) return mod;
  try {
    const body = await req.json();
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });
    const patch: Record<string, unknown> = {};
    for (const k of ["name", "code", "warehouse_type", "address_line1", "address_line2", "city", "state", "postal_code", "country_code", "timezone"]) {
      if (typeof body[k] === "string") patch[k] = body[k].trim() || null;
    }
    if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    const db = createServerClient();
    const { error } = await db.from("erp_warehouses").update(patch).eq("id", id).eq("tenant_id", getTenantId());
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Update failed" }, { status: 500 });
  }
}
