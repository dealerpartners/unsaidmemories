import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/gate";
import { TENANT_ID, withPg } from "@/lib/crm/enterprise";
import {
  callerTenantContext,
  decodeTenantSelection,
  readCookieValue,
} from "@/lib/admin/tenant-resolution";
import { ACTIVE_TENANT_COOKIE } from "@/lib/admin-api";

/* GET /api/admin/tenants/switchable
 *
 * Tenants the current admin caller may switch to in the tenant switcher.
 *  - Master owner (is_owner, or legacy admin with no portal_users row): all tenants, master first.
 *  - franchise_owner: every tenant they own (portal_users rows with role franchise_owner).
 *  - franchise_employee / others: their own tenant only.
 *
 * current_tenant_id is the caller's ACTIVE tenant as resolved by
 * lib/admin/tenant-resolution: their identity-bound switcher selection
 * when it names a tenant in this set, otherwise their home tenant
 * (master for the platform owner; a franchise session's own tenant).
 * A stored selection made under another identity never resolves here.
 *
 * Response: { data: [{ id, name, slug, tenant_type, parent_tenant_id, is_master }], current_tenant_id }
 */

async function tableExists(client: any, table: string): Promise<boolean> {
  const r = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1 LIMIT 1`,
    [table],
  );
  return r.rowCount > 0;
}

export async function GET(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;

  try {
    const data = await withPg(async (client) => {
      const hasTenants = await tableExists(client, "tenants");
      if (!hasTenants) {
        return { tenants: [], current: TENANT_ID(), note: "tenants table missing" };
      }

      const ctx = await callerTenantContext(client, req);
      const tenants = ctx.tenantRows.map((t: any) => ({
        ...t,
        is_master: t.slug === "all-about-portal" || t.id === ctx.masterTenantId,
      }));

      // Active tenant: this caller's identity-bound selection when it
      // names a tenant in their entitled set; otherwise their home.
      const raw = readCookieValue(req.headers.get("cookie") || "", ACTIVE_TENANT_COOKIE);
      const selected = decodeTenantSelection(raw, ctx.identityKeys);
      const current =
        selected && ctx.entitledTenantIds.has(selected) ? selected : ctx.homeTenantId;

      return { tenants, current_tenant_id: current };
    });

    if (!data) return NextResponse.json({ error: "Database unavailable" }, { status: 502 });
    return NextResponse.json({ data: data.tenants, current_tenant_id: data.current_tenant_id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "switchable failed" }, { status: 500 });
  }
}
