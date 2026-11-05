import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import pg from "pg";
import { requireCapabilityApi } from "@/lib/capabilities/guards";
import { portalUserIdForStaff, platformLevelToPortal } from "@/lib/capabilities/module-grants";
import { getCurrentUser } from "@/lib/auth/server";
import { ensureCrmStaffForUser, withPg } from "@/lib/crm/enterprise";

// M3: the module-permission store is portal_module_permissions (the
// surviving name — migration 20261187; platform_module_permissions is
// now a compatibility view over it). The codes below are the set
// src/lib/admin/modules.ts gates routes on, and the UI vocabulary is
// still none/read/write/full ('full' is stored as portal 'all').
// Grants attach to the target's PORTAL identity (portal_users row for
// their auth user in this tenant, created on demand by
// portalUserIdForStaff when salon staff have none); crm_staff rows
// remain the staff identity, not the grant store.
const MODULES = [
  { code: 'accounting', label: 'Accounting', module: 'ACCOUNTING' },
  { code: 'customers', label: 'Customers', module: 'CRM' },
  { code: 'appointments', label: 'Appointments', module: 'CRM' },
  { code: 'communications', label: 'Communications', module: 'CRM' },
  { code: 'payments', label: 'Payments & Register', module: 'ACCOUNTING' },
  { code: 'invoices', label: 'Invoices', module: 'ACCOUNTING' },
  { code: 'deposits', label: 'Deposits & Escrow', module: 'ACCOUNTING' },
  { code: 'refunds_disputes', label: 'Refunds & Disputes', module: 'ACCOUNTING' },
  { code: 'gift_cards_credits', label: 'Gift Cards & Credits', module: 'ACCOUNTING' },
  { code: 'orders', label: 'Orders & Fulfillment', module: 'ORDERS' },
  { code: 'inventory', label: 'Inventory', module: 'ORDERS' },
  { code: 'products_services', label: 'Products & Services', module: 'ORDERS' },
  { code: 'purchasing', label: 'Purchasing', module: 'ORDERS' },
  { code: 'sellers', label: 'Sellers & Marketplace', module: 'ORDERS' },
  { code: 'trust_safety', label: 'Trust Center', module: 'ORDERS' },
  { code: 'shipping', label: 'Shipping & Labels', module: 'ORDERS' },
  { code: 'marketing', label: 'Marketing', module: 'MARKETING' },
  { code: 'analytics', label: 'Analytics', module: 'REPORTS' },
  { code: 'reports', label: 'Reports', module: 'REPORTS' },
  { code: 'cms', label: 'Content / CMS', module: 'SYSTEM' },
  { code: 'lms', label: 'Learning Center', module: 'SYSTEM' },
  { code: 'policies', label: 'Policies', module: 'SYSTEM' },
  { code: 'docs', label: 'Document Center', module: 'SYSTEM' },
  { code: 'staff_groomer_management', label: 'Staff & Groomer Management', module: 'SYSTEM' },
  { code: 'administration', label: 'Administration', module: 'SYSTEM' },
];

const VALID_CODES = new Set(MODULES.map((m) => m.code));
const VALID_LEVELS = new Set(["none", "read", "write", "full"]);

export async function GET(req: NextRequest) {
  // Capability gate: staff-permission editing is org management
  // (org.amend, held by platform admins and both salon hats). Denial
  // shape is identical to the old requireAdminApi denial (401).
  const gate = await requireCapabilityApi("org.amend");
  if (gate) return gate;

  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    // ?list=1 → staff roster for the user picker
    if (searchParams.get("list") === "1") {
      const rows = await withPg(async (client) => {
        const r = await client.query(
          `SELECT s.id::text AS id, s.display_name, s.email, s.role, s.is_active,
                  s.user_id::text AS user_id,
                  (SELECT count(*)::int FROM public.portal_module_permissions p
                     JOIN public.portal_users pu
                       ON pu.id = p.portal_user_id AND pu.tenant_id = s.tenant_id
                    WHERE pu.user_id = s.user_id AND p.permission_level <> 'none') AS grant_count
             FROM public.crm_staff s
            WHERE s.tenant_id = $1
            ORDER BY s.role = 'owner' DESC, s.display_name NULLS LAST, s.email NULLS LAST
            LIMIT 200`,
          [resolveTenantId(req)],
        );
        return r.rows;
      });
      if (!rows) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });
      return NextResponse.json({ staff: rows });
    }

    const result = await withPg(async (client) => {
      let userPerms: any[] = [];
      let hasStaffRecord = false;
      let staffRole: string | null = null;
      if (userId) {
        // Permissions attach to the user's crm_staff record (his model).
        const staff = await client.query(
          `SELECT id::text AS id, role FROM public.crm_staff WHERE tenant_id = $1 AND user_id = $2::uuid LIMIT 1`,
          [resolveTenantId(req), userId],
        );
        if (staff.rows[0]) {
          hasStaffRecord = true;
          staffRole = staff.rows[0].role || "staff";
          // M3: read the surviving store through the staff member's
          // portal identity, in the UI's vocabulary (all -> full) so
          // the response shape is unchanged.
          const res = await client.query(
            `SELECT p.module_key AS module_code,
                    CASE p.permission_level WHEN 'all' THEN 'full' ELSE p.permission_level END AS access_level
               FROM public.portal_module_permissions p
               JOIN public.portal_users pu
                 ON pu.id = p.portal_user_id AND pu.tenant_id = $1
              WHERE p.tenant_id = $1 AND pu.user_id = $2::uuid`,
            [resolveTenantId(req), userId],
          );
          userPerms = res.rows;
        }
      }
      return { userPerms, hasStaffRecord, staffRole };
    });

    if (!result) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

    return NextResponse.json({
      modules: MODULES,
      hasStaffRecord: result.hasStaffRecord,
      staffRole: result.staffRole,
      isOwner: result.staffRole === "owner",
      userPermissions: result.userPerms.reduce((acc: Record<string, string>, p: any) => {
        acc[p.module_code] = p.access_level;
        return acc;
      }, {}),
    });
  } catch (err: any) {
    console.error("[GET /api/admin/permissions]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireCapabilityApi("org.amend");
  if (gate) return gate;

  try {
    const body = await req.json();
    let { userId, moduleCode, accessLevel } = body;
    if (!userId || !moduleCode || !VALID_CODES.has(moduleCode)) {
      return NextResponse.json({ error: "userId and a valid moduleCode are required" }, { status: 400 });
    }
    // The app's checkbox posts 'edit'; his enum is none/read/write/full.
    if (accessLevel === "edit") accessLevel = "write";
    if (!accessLevel) accessLevel = "write";
    if (!VALID_LEVELS.has(accessLevel)) {
      return NextResponse.json({ error: `accessLevel must be one of none/read/write/full` }, { status: 400 });
    }

    const actor = await getCurrentUser();

    const ok = await withPg(async (client) => {
      // The grant attaches to the user's crm_staff record — find-or-create
      // (creating the staff registry row IS the enterprise way to make an
      // auth user grantable; no parallel table).
      const auth = await client.query(
        `SELECT email, raw_user_meta_data FROM auth.users WHERE id = $1::uuid LIMIT 1`,
        [userId],
      );
      const email = auth.rows[0]?.email || null;
      const displayName =
        (auth.rows[0]?.raw_user_meta_data?.full_name) || (email ? email.split("@")[0] : null);
      const staffId = await ensureCrmStaffForUser(client, { userId, displayName, email });
      if (!staffId) return false;

      // M3: the grant lands in portal_module_permissions, keyed by
      // the target's portal identity (created on demand for salon
      // staff without one). granted_by is the acting admin's auth id
      // — the portal store carries no staff FK for it. The staff row
      // above is still ensured (staff identity), it is just no longer
      // the grant store.
      const portalUserId = await portalUserIdForStaff(client, {
        tenantId: resolveTenantId(req),
        userId,
        email,
        displayName,
      });
      if (!portalUserId) return false;
      const portalLevel = platformLevelToPortal(accessLevel);
      if (portalLevel === "none") {
        await client.query(
          `DELETE FROM public.portal_module_permissions
           WHERE tenant_id = $1 AND portal_user_id = $2::uuid AND module_key = $3`,
          [resolveTenantId(req), portalUserId, moduleCode],
        );
      } else {
        await client.query(
          `INSERT INTO public.portal_module_permissions
             (tenant_id, portal_user_id, module_key, permission_level, granted_by)
           SELECT $1::uuid, $2::uuid, $3, $4, $5::uuid
            WHERE NOT EXISTS (
              SELECT 1 FROM public.portal_module_permissions
               WHERE tenant_id = $1::uuid AND portal_user_id = $2::uuid AND module_key = $3)`,
          [resolveTenantId(req), portalUserId, moduleCode, portalLevel, actor?.id ?? null],
        );
        await client.query(
          `UPDATE public.portal_module_permissions
              SET permission_level = $4, granted_by = $5::uuid, updated_at = now()
            WHERE tenant_id = $1::uuid AND portal_user_id = $2::uuid AND module_key = $3`,
          [resolveTenantId(req), portalUserId, moduleCode, portalLevel, actor?.id ?? null],
        );
      }
      return true;
    });

    if (!ok) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[POST /api/admin/permissions]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Bulk save: PUT { userId, permissions: { [moduleCode]: 'none'|'read'|'write'|'full' }, isOwner?: boolean }
// Replaces the user's full permission set in one call. Owner toggle sets role='owner' on crm_staff (bypasses all checks).
export async function PUT(req: NextRequest) {
  const gate = await requireCapabilityApi("org.amend");
  if (gate) return gate;

  try {
    const body = await req.json();
    const { userId, permissions, isOwner } = body as {
      userId?: string;
      permissions?: Record<string, string>;
      isOwner?: boolean;
    };
    if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

    const actor = await getCurrentUser();

    const ok = await withPg(async (client) => {
      const auth = await client.query(
        `SELECT email, raw_user_meta_data FROM auth.users WHERE id = $1::uuid LIMIT 1`,
        [userId],
      );
      const email = auth.rows[0]?.email || null;
      const displayName =
        (auth.rows[0]?.raw_user_meta_data?.full_name) || (email ? email.split("@")[0] : null);
      const staffId = await ensureCrmStaffForUser(client, { userId, displayName, email });
      if (!staffId) return false;

      // M3: granted_by is the acting admin's auth id (see POST).
      const grantedBy: string | null = actor?.id ?? null;

      // Owner toggle: role='owner' bypasses every requireModuleApi check.
      if (typeof isOwner === "boolean") {
        await client.query(
          `UPDATE public.crm_staff SET role = $2, updated_at = now() WHERE id = $1::uuid`,
          [staffId, isOwner ? "owner" : "staff"],
        );
      }

      if (permissions && typeof permissions === "object") {
        for (const [moduleCode, rawLevel] of Object.entries(permissions)) {
          if (!VALID_CODES.has(moduleCode)) continue;
          let level = rawLevel === "edit" ? "write" : rawLevel;
          if (!level) level = "write";
          if (!VALID_LEVELS.has(level)) continue;
          // M3: bulk save writes the surviving store through the
          // target's portal identity (created on demand).
          const portalUserId = await portalUserIdForStaff(client, {
            tenantId: resolveTenantId(req),
            userId,
            email,
            displayName,
          });
          if (!portalUserId) continue;
          const portalLevel = platformLevelToPortal(level);
          if (portalLevel === "none") {
            await client.query(
              `DELETE FROM public.portal_module_permissions
               WHERE tenant_id = $1 AND portal_user_id = $2::uuid AND module_key = $3`,
              [resolveTenantId(req), portalUserId, moduleCode],
            );
          } else {
            await client.query(
              `INSERT INTO public.portal_module_permissions
                 (tenant_id, portal_user_id, module_key, permission_level, granted_by)
               SELECT $1::uuid, $2::uuid, $3, $4, $5::uuid
                WHERE NOT EXISTS (
                  SELECT 1 FROM public.portal_module_permissions
                   WHERE tenant_id = $1::uuid AND portal_user_id = $2::uuid AND module_key = $3)`,
              [resolveTenantId(req), portalUserId, moduleCode, portalLevel, grantedBy],
            );
            await client.query(
              `UPDATE public.portal_module_permissions
                  SET permission_level = $4, granted_by = $5::uuid, updated_at = now()
                WHERE tenant_id = $1::uuid AND portal_user_id = $2::uuid AND module_key = $3`,
              [resolveTenantId(req), portalUserId, moduleCode, portalLevel, grantedBy],
            );
          }
        }
      }
      return true;
    });

    if (!ok) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[PUT /api/admin/permissions]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
