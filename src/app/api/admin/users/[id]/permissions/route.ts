/**
 * PUT /api/admin/users/[id]/permissions — set one module grant for one
 * staff member. Body: { module_key, level } where level is
 * 'read' | 'write' | 'full' | null (null revokes).
 *
 * Writes the portal_module_permissions table (the matrix store) and a
 * portal_permission_audit_log row. The gate reads the union of this
 * table and the platform_module_permissions view, so a grant set here
 * takes effect on the member's next request.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, requireModuleApi, getAdminContext } from "@/lib/admin/gate";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";
import { MODULE_CODES, normalizeLevel, type ModuleCode } from "@/lib/admin/modules";
import { writePermissionAudit } from "@/lib/admin/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const mod = await requireModuleApi("administration", "full");
  if (mod) return mod;
  const { id } = await params;
  try {
    const body = await req.json();
    const moduleKey = String(body.module_key || "") as ModuleCode;
    if (!MODULE_CODES.includes(moduleKey)) {
      return NextResponse.json({ error: "Unknown module." }, { status: 400 });
    }
    const rawLevel = body.level === null ? null : String(body.level || "");
    const level = rawLevel === null ? null : normalizeLevel(rawLevel);
    if (rawLevel !== null && level === "none") {
      return NextResponse.json({ error: "Level must be read, write, full, or null." }, { status: 400 });
    }

    const db = createServerClient();
    const ctx = await getAdminContext();

    const { data: target } = await db.from("portal_users").select("id, is_owner").eq("id", id).limit(1);
    if (!target?.[0]) return NextResponse.json({ error: "Staff account not found." }, { status: 404 });

    const { data: existing } = await db
      .from("portal_module_permissions")
      .select("permission_level")
      .eq("portal_user_id", id)
      .eq("module_key", moduleKey)
      .limit(1);
    const oldValue = existing?.[0]?.permission_level ? normalizeLevel(existing[0].permission_level as string) : "none";

    const del = await db
      .from("portal_module_permissions")
      .delete()
      .eq("portal_user_id", id)
      .eq("module_key", moduleKey);
    if (del.error) return NextResponse.json({ error: del.error.message }, { status: 500 });

    if (level !== null) {
      const ins = await db.from("portal_module_permissions").insert({
        tenant_id: getTenantId(),
        portal_user_id: id,
        module_key: moduleKey,
        permission_level: level,
      });
      if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 });
    }

    await writePermissionAudit({
      portalUserId: id,
      changedBy: ctx?.portalUserId ?? null,
      changeType: level === null ? "revoke" : "grant",
      key: moduleKey,
      oldValue,
      newValue: level ?? "none",
    });
    return NextResponse.json({ ok: true, module_key: moduleKey, level });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Permission update failed" }, { status: 500 });
  }
}
