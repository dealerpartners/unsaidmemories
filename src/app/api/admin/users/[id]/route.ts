/**
 * /api/admin/users/[id] — staff record management.
 * PATCH  — update display_name / phone / role_type / is_active / is_owner.
 * DELETE — deactivate (soft; the auth account and history are kept).
 * Self-lockout guards: you cannot deactivate yourself or strip your own
 * owner flag.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, requireModuleApi, getAdminContext } from "@/lib/admin/gate";
import { createServerClient } from "@/lib/supabase";
import { writePermissionAudit } from "@/lib/admin/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadStaff(id: string) {
  const db = createServerClient();
  const { data } = await db
    .from("portal_users")
    .select("id, user_id, email, display_name, phone, role_type, is_owner, is_active")
    .eq("id", id)
    .limit(1);
  return data?.[0] ?? null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const mod = await requireModuleApi("administration", "write");
  if (mod) return mod;
  const { id } = await params;
  try {
    const ctx = await getAdminContext();
    const before = await loadStaff(id);
    if (!before) return NextResponse.json({ error: "Staff account not found." }, { status: 404 });

    const body = await req.json();
    const patch: Record<string, unknown> = {};
    if (typeof body.display_name === "string") patch.display_name = body.display_name.trim() || null;
    if (typeof body.phone === "string") patch.phone = body.phone.trim() || null;
    if (typeof body.role_type === "string" && body.role_type.trim()) patch.role_type = body.role_type.trim();
    if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
    if (typeof body.is_owner === "boolean") patch.is_owner = body.is_owner;

    if (ctx?.portalUserId === id) {
      if (patch.is_active === false) {
        return NextResponse.json({ error: "You cannot deactivate your own account." }, { status: 400 });
      }
      if (patch.is_owner === false && before.is_owner) {
        return NextResponse.json({ error: "You cannot remove your own owner flag." }, { status: 400 });
      }
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }
    const db = createServerClient();
    const { error } = await db.from("portal_users").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    for (const [field, value] of Object.entries(patch)) {
      const old = (before as Record<string, unknown>)[field];
      if (String(old ?? "") !== String(value ?? "")) {
        await writePermissionAudit({
          portalUserId: id,
          changedBy: ctx?.portalUserId ?? null,
          changeType: field === "role_type" ? "role" : field === "is_active" ? "status" : "update",
          key: field,
          oldValue: String(old ?? "none"),
          newValue: String(value ?? "none"),
        });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Update failed" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const mod = await requireModuleApi("administration", "full");
  if (mod) return mod;
  const { id } = await params;
  try {
    const ctx = await getAdminContext();
    if (ctx?.portalUserId === id) {
      return NextResponse.json({ error: "You cannot deactivate your own account." }, { status: 400 });
    }
    const db = createServerClient();
    const { error } = await db.from("portal_users").update({ is_active: false }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await writePermissionAudit({
      portalUserId: id,
      changedBy: ctx?.portalUserId ?? null,
      changeType: "status",
      key: "is_active",
      oldValue: "true",
      newValue: "false",
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Deactivate failed" }, { status: 500 });
  }
}
