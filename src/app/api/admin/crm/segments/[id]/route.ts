import { NextResponse } from "next/server";
import { requireCrmAdmin } from "@/lib/admin/gate";
import { getDb, getTenantId, evaluateSegment, type SegmentDefinition } from "@/lib/crm/data";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireCrmAdmin(req);
  if ("response" in gate) return gate.response;
  const { id } = await params;
  const db = getDb();
  const tenantId = await getTenantId(db);
  const { data, error } = await db.from("crm_segments").select("*").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Segment not found." }, { status: 404 });
  const members = await evaluateSegment(db, tenantId, ((data as { definition: SegmentDefinition }).definition || { rules: [] }) as SegmentDefinition);
  return NextResponse.json({ segment: data, members });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireCrmAdmin(req);
  if ("response" in gate) return gate.response;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of ["name", "description", "segment_type", "definition", "is_active"]) {
    if (k in body) patch[k] = body[k];
  }
  const db = getDb();
  const tenantId = await getTenantId(db);
  const { error } = await db.from("crm_segments").update(patch).eq("tenant_id", tenantId).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireCrmAdmin(req);
  if ("response" in gate) return gate.response;
  const { id } = await params;
  const db = getDb();
  const tenantId = await getTenantId(db);
  await db.from("crm_segment_memberships").delete().eq("segment_id", id);
  const { error } = await db.from("crm_segments").delete().eq("tenant_id", tenantId).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
