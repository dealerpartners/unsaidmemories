import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { withPg } from "@/lib/crm/enterprise";
import { requireAdminApi } from "@/lib/admin/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// crm_saved_views is the designed persistence for module saved views
// (0 rows live today). GET lists views for an entity; POST inserts one
// real row — the Customers "Save View" button writes here and only
// reports success when the insert returns a row.
export async function GET(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const tenant = resolveTenantId(req);
  const entity = req.nextUrl.searchParams.get("entity") || "customers";
  const out = await withPg(async (client) => {
    const { rows } = await client.query(
      `SELECT id::text AS id, name, entity_type, filters, created_at
         FROM public.crm_saved_views
        WHERE tenant_id = $1 AND entity_type = $2
        ORDER BY created_at DESC LIMIT 100`,
      [tenant, entity],
    );
    return NextResponse.json({ data: rows });
  });
  return out ?? NextResponse.json({ error: "Database unavailable" }, { status: 500 });
}

export async function POST(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const tenant = resolveTenantId(req);
  const body = await req.json().catch(() => null);
  const name = String(body?.name || "").trim();
  const entity = String(body?.entity_type || "customers");
  if (!name) return NextResponse.json({ error: "A view name is required" }, { status: 400 });
  const out = await withPg(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO public.crm_saved_views (tenant_id, owner_user_id, name, entity_type, filters, columns, sort_definition, is_shared)
       VALUES ($1, NULL, $2, $3, $4::jsonb, '[]'::jsonb, '[]'::jsonb, false)
       RETURNING id::text AS id, name, entity_type, filters, created_at`,
      [tenant, name, entity, JSON.stringify(body?.filters ?? {})],
    );
    // Failed-insert honesty: an empty RETURNING result must never reach 201.
    if (!rows[0]) return NextResponse.json({ error: "View could not be saved" }, { status: 500 });
    return NextResponse.json({ data: rows[0] }, { status: 201 });
  });
  return out ?? NextResponse.json({ error: "Database unavailable" }, { status: 500 });
}
