import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { resolveActiveTenantId } from "@/lib/admin/tenant-resolution";
import { MASTER_TENANT_ID } from "@/lib/site-tenant-shared";

/* /api/admin/franchise — the Franchise Management Portal (owner spec,
 * 2026-10-17): the platform admin manages the franchise NETWORK here —
 * tenants, their owners, domains, templates, agreements, status.
 *
 * Master-only, like template assignment: a franchise tenant administers
 * its OWN business from its tenant panel; it never administers the
 * network. The check is the caller's resolved active tenant (their
 * home tenant, never a header): a franchise session's active tenant is
 * its own, so it gets a 403 here even though the route exists.
 *
 * GET -> { data: FranchiseRow[] } — one row per franchise tenant with
 * its owner, location count, and latest agreement status.
 */

export async function GET(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const out = await withPg(async (client) => {
    const activeTenantId = await resolveActiveTenantId(client, req);
    if (activeTenantId !== MASTER_TENANT_ID) {
      return NextResponse.json(
        { error: "Franchise management is a master-tenant surface." },
        { status: 403 },
      );
    }
    const r = await client.query(
      `SELECT t.id::text AS id, t.name, t.slug, t.status, t.tenant_type,
              t.custom_domain, t.primary_domain, t.template_key, t.created_at,
              (SELECT json_build_object(
                        'id', pu.id::text, 'name', pu.display_name,
                        'email', pu.email, 'is_active', pu.is_active,
                        'auth_linked', pu.user_id IS NOT NULL)
                 FROM public.portal_users pu
                WHERE pu.tenant_id = t.id AND pu.role_type = 'franchise_owner'
                ORDER BY pu.created_at LIMIT 1) AS owner,
              (SELECT count(*)::int FROM public.franchise_locations fl
                WHERE fl.tenant_id = t.id) AS locations,
              (SELECT fa.status FROM public.franchise_agreements fa
                WHERE fa.tenant_id = t.id
                ORDER BY fa.created_at DESC LIMIT 1) AS agreement_status
         FROM public.tenants t
        WHERE t.tenant_type = 'franchise'
        ORDER BY t.created_at DESC`,
    );
    return NextResponse.json({ data: r.rows });
  });
  return out ?? NextResponse.json({ error: "Database unavailable" }, { status: 500 });
}
