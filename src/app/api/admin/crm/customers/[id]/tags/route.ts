import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /api/admin/crm/customers/[id]/tags — customer tag assignments (1.12)
//   GET    → { assigned: [...], available: [...] }
//   POST   { tag_id } → assign tag
//   DELETE ?tag_id=  → remove assignment

async function ctxId(ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return id;
}

const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v || "");

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("customers", "read");
  if (gate) return gate;
  const id = await ctxId(ctx);
  if (!id) return NextResponse.json({ error: "customer id required" }, { status: 400 });
  if (!isUuid(id)) return NextResponse.json({ assigned: [], available: [] });
  return withPg(async (c) => {
    const tenant = resolveTenantId(req);
    const assigned = await c.query(
      `SELECT t.id::text AS id, t.name, t.color
       FROM public.crm_customer_tag_assignments a
       JOIN public.crm_tags t ON t.id = a.tag_id
       WHERE a.tenant_id = $1 AND a.customer_id = $2::uuid
       ORDER BY t.name`,
      [tenant, id]
    );
    const available = await c.query(
      `SELECT t.id::text AS id, t.name, t.color
       FROM public.crm_tags t
       WHERE t.tenant_id = $1 AND t.description = 'customer'
         AND NOT EXISTS (
           SELECT 1 FROM public.crm_customer_tag_assignments a
           WHERE a.tenant_id = $1 AND a.customer_id = $2::uuid AND a.tag_id = t.id
         )
       ORDER BY t.name`,
      [tenant, id]
    );
    return NextResponse.json({ assigned: assigned.rows, available: available.rows });
  })
    .then((r) => r ?? NextResponse.json({ error: "DB unavailable" }, { status: 503 }))
    .catch((e: any) => NextResponse.json({ error: e?.message }, { status: 500 }));
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("customers", "write");
  if (gate) return gate;
  const id = await ctxId(ctx);
  const body = await req.json().catch(() => null);
  const tagId = body?.tag_id;
  if (!id || !tagId) return NextResponse.json({ error: "customer id and tag_id required" }, { status: 400 });
  if (!isUuid(id) || !isUuid(tagId)) return NextResponse.json({ error: "invalid id format" }, { status: 400 });
  return withPg(async (c) => {
    const tenant = resolveTenantId(req);
    await c.query(
      `INSERT INTO public.crm_customer_tag_assignments (tenant_id, customer_id, tag_id)
       VALUES ($1, $2::uuid, $3::uuid) ON CONFLICT DO NOTHING`,
      [tenant, id, tagId]
    );
    return NextResponse.json({ success: true });
  })
    .then((r) => r ?? NextResponse.json({ error: "DB unavailable" }, { status: 503 }))
    .catch((e: any) => NextResponse.json({ error: e?.message }, { status: 500 }));
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("customers", "write");
  if (gate) return gate;
  const id = await ctxId(ctx);
  const tagId = new URL(req.url).searchParams.get("tag_id");
  if (!id || !tagId) return NextResponse.json({ error: "customer id and tag_id required" }, { status: 400 });
  if (!isUuid(id) || !isUuid(tagId)) return NextResponse.json({ error: "invalid id format" }, { status: 400 });
  return withPg(async (c) => {
    const tenant = resolveTenantId(req);
    await c.query(
      `DELETE FROM public.crm_customer_tag_assignments
       WHERE tenant_id = $1 AND customer_id = $2::uuid AND tag_id = $3::uuid`,
      [tenant, id, tagId]
    );
    return NextResponse.json({ success: true });
  })
    .then((r) => r ?? NextResponse.json({ error: "DB unavailable" }, { status: 503 }))
    .catch((e: any) => NextResponse.json({ error: e?.message }, { status: 500 }));
}
