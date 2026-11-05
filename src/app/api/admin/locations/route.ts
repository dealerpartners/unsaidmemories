import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireAdminApi } from "@/lib/admin/gate";
import { withPg, withPgStrict } from "@/lib/crm/enterprise";

/* /api/admin/locations — Location Management (replaces the mock INITIAL_LOCATIONS).
 *
 * GET  -> { data: locations[], total } — tenant_locations joined with tenants
 *         (type: internal | franchise) and franchise business info.
 * POST -> { data: location } — create a location.
 *   Body: { tenant_id?, name, address_line1?, address_line2?, city?, state?,
 *           postal_code?, phone?, email?, timezone?, is_primary?, is_active?,
 *           location_type?: 'internal' | 'franchise' }
 *   When location_type is 'franchise' and no tenant_id is given, the location
 *   is created on the master tenant and must be reassigned via franchise signup.
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
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    // tenant_id=active scopes to the caller's resolved tenant (the Org
    // settings screen); an explicit uuid filters to that tenant; no
    // param keeps the platform-wide list the Locations manager shows.
    const tenantParam = (searchParams.get("tenant_id") || "").trim();
    const tenantFilter = tenantParam === "active" ? resolveTenantId(req) : tenantParam;

    const data = await withPg(async (client) => {
      if (!(await tableExists(client, "tenant_locations"))) {
        return { rows: [], missing: true };
      }
      const hasFranchise = await tableExists(client, "franchise_locations");

      const where: string[] = [];
      const params: any[] = [];
      if (q) {
        params.push(`%${q.replace(/[%_]/g, "")}%`);
        where.push(`(tl.name ILIKE $${params.length} OR t.name ILIKE $${params.length})`);
      }
      if (tenantFilter) {
        params.push(tenantFilter);
        where.push(`tl.tenant_id = $${params.length}::uuid`);
      }

      const r = await client.query(
        `SELECT tl.id::text AS id, tl.tenant_id::text AS tenant_id,
                tl.name, tl.address, tl.timezone, tl.is_primary, tl.is_active,
                tl.created_at, tl.updated_at,
                t.name AS tenant_name, t.slug AS tenant_slug,
                COALESCE(t.tenant_type, 'internal') AS tenant_type,
                ${hasFranchise ? `(SELECT fl.business_name FROM public.franchise_locations fl WHERE fl.tenant_id = tl.tenant_id LIMIT 1)` : `NULL`} AS franchise_business_name,
                ${hasFranchise ? `(SELECT fl.slug FROM public.franchise_locations fl WHERE fl.tenant_id = tl.tenant_id LIMIT 1)` : `NULL`} AS franchise_slug
           FROM public.tenant_locations tl
           LEFT JOIN public.tenants t ON t.id = tl.tenant_id
          ${where.length ? "WHERE " + where.join(" AND ") : ""}
          ORDER BY tl.is_primary DESC, tl.name
          LIMIT 200`,
        params,
      );
      return { rows: r.rows };
    });

    if (!data) return NextResponse.json({ error: "Database unavailable" }, { status: 502 });
    if ((data as any).missing) {
      return NextResponse.json({ data: [], total: 0, _empty: true, note: "tenant_locations table missing" });
    }
    return NextResponse.json({ data: data.rows, total: data.rows.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "locations list failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = String(body?.name || "").trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  try {
    const data = await withPgStrict(async (client) => {
      if (!(await tableExists(client, "tenant_locations"))) {
        return { error: "tenant_locations table missing" };
      }
      const tenantId = String(body?.tenant_id || "").trim() || resolveTenantId(req);
      const address = {
        line1: String(body?.address_line1 || "").trim(),
        line2: String(body?.address_line2 || "").trim(),
        city: String(body?.city || "").trim(),
        state: String(body?.state || "").trim(),
        postal_code: String(body?.postal_code || "").trim(),
        phone: String(body?.phone || "").trim(),
        email: String(body?.email || "").trim(),
      };
      const r = await client.query(
        `INSERT INTO public.tenant_locations
           (tenant_id, name, address, timezone, is_primary, is_active)
         VALUES ($1::uuid, $2, $3::jsonb, $4, $5, COALESCE($6, true))
         RETURNING id::text AS id, tenant_id::text AS tenant_id, name, address,
                   timezone, is_primary, is_active, created_at`,
        [
          tenantId,
          name,
          JSON.stringify(address),
          String(body?.timezone || "America/Chicago"),
          !!body?.is_primary,
          body?.is_active !== false,
        ],
      );
      if (!r.rows[0]) throw new Error("location insert did not land");
      // Only one primary per tenant.
      if (body?.is_primary) {
        await client.query(
          `UPDATE public.tenant_locations SET is_primary=false
            WHERE tenant_id=$1::uuid AND id <> $2::uuid`,
          [tenantId, r.rows[0].id],
        );
      }
      return { row: r.rows[0] };
    });

    if (!data) return NextResponse.json({ error: "Database unavailable" }, { status: 502 });
    if ((data as any).error) return NextResponse.json({ error: (data as any).error }, { status: 500 });
    return NextResponse.json({ data: (data as any).row }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "location create failed" }, { status: 500 });
  }
}
