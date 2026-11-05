import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";

/* /api/admin/locations/[id]
 * PATCH  -> update a location. Body: any of { name, address_line1, address_line2,
 *           city, state, postal_code, phone, email, timezone, is_primary, is_active, tenant_id }
 * DELETE -> remove a location (blocked when it is the tenant's only primary).
 */

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const { id } = await params;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const data = await withPg(async (client) => {
      const cur = await client.query(
        `SELECT id::text AS id, tenant_id::text AS tenant_id, address, is_primary
           FROM public.tenant_locations WHERE id=$1::uuid LIMIT 1`,
        [id],
      );
      if (cur.rowCount === 0) return { notFound: true };
      const existing = cur.rows[0];
      const addr = { ...(existing.address || {}) };
      if (body.address_line1 !== undefined) addr.line1 = String(body.address_line1 || "");
      if (body.address_line2 !== undefined) addr.line2 = String(body.address_line2 || "");
      if (body.city !== undefined) addr.city = String(body.city || "");
      if (body.state !== undefined) addr.state = String(body.state || "");
      if (body.postal_code !== undefined) addr.postal_code = String(body.postal_code || "");
      if (body.phone !== undefined) addr.phone = String(body.phone || "");
      if (body.email !== undefined) addr.email = String(body.email || "");

      const r = await client.query(
        `UPDATE public.tenant_locations
            SET name = COALESCE($2, name),
                address = $3::jsonb,
                timezone = COALESCE($4, timezone),
                is_primary = COALESCE($5, is_primary),
                is_active = COALESCE($6, is_active),
                tenant_id = COALESCE($7::uuid, tenant_id),
                updated_at = now()
          WHERE id=$1::uuid
        RETURNING id::text AS id, tenant_id::text AS tenant_id, name, address,
                  timezone, is_primary, is_active, updated_at`,
        [
          id,
          body.name !== undefined ? String(body.name).trim() || null : null,
          JSON.stringify(addr),
          body.timezone !== undefined ? String(body.timezone) || null : null,
          body.is_primary !== undefined ? !!body.is_primary : null,
          body.is_active !== undefined ? !!body.is_active : null,
          body.tenant_id !== undefined ? String(body.tenant_id) || null : null,
        ],
      );
      const row = r.rows[0];
      if (row.is_primary) {
        await client.query(
          `UPDATE public.tenant_locations SET is_primary=false
            WHERE tenant_id=$1::uuid AND id <> $2::uuid`,
          [row.tenant_id, row.id],
        );
      }
      return { row };
    });

    if (!data) return NextResponse.json({ error: "Database unavailable" }, { status: 502 });
    if ((data as any).notFound) return NextResponse.json({ error: "Location not found" }, { status: 404 });
    return NextResponse.json({ data: (data as any).row });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "location update failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const { id } = await params;

  try {
    const data = await withPg(async (client) => {
      const cur = await client.query(
        `SELECT id::text AS id, tenant_id::text AS tenant_id, is_primary
           FROM public.tenant_locations WHERE id=$1::uuid LIMIT 1`,
        [id],
      );
      if (cur.rowCount === 0) return { notFound: true };
      const row = cur.rows[0];
      if (row.is_primary) {
        const others = await client.query(
          `SELECT 1 FROM public.tenant_locations
            WHERE tenant_id=$1::uuid AND id <> $2::uuid AND is_active IS DISTINCT FROM false LIMIT 1`,
          [row.tenant_id, id],
        );
        if (others.rowCount === 0) {
          return { blocked: "Cannot delete the tenant's only active location." };
        }
      }
      await client.query(`DELETE FROM public.tenant_locations WHERE id=$1::uuid`, [id]);
      return { ok: true };
    });

    if (!data) return NextResponse.json({ error: "Database unavailable" }, { status: 502 });
    if ((data as any).notFound) return NextResponse.json({ error: "Location not found" }, { status: 404 });
    if ((data as any).blocked) return NextResponse.json({ error: (data as any).blocked }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "location delete failed" }, { status: 500 });
  }
}
