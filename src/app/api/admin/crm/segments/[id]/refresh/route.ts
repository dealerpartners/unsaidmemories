import { NextResponse } from "next/server";
import { requireCrmAdmin } from "@/lib/admin/gate";
import { getDb, getTenantId, evaluateSegment, type SegmentDefinition } from "@/lib/crm/data";

export const dynamic = "force-dynamic";

/** Materialize live rule evaluation into crm_segment_memberships. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireCrmAdmin(req);
  if ("response" in gate) return gate.response;
  const { id } = await params;
  const db = getDb();
  const tenantId = await getTenantId(db);
  const { data: segment, error } = await db.from("crm_segments").select("*").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!segment) return NextResponse.json({ error: "Segment not found." }, { status: 404 });

  const members = await evaluateSegment(db, tenantId, ((segment as { definition: SegmentDefinition }).definition || { rules: [] }) as SegmentDefinition);
  const memberIds = new Set(members.map((m) => m.id));
  const now = new Date().toISOString();

  const { data: current } = await db
    .from("crm_segment_memberships")
    .select("id, customer_id")
    .eq("segment_id", id)
    .is("exited_at", null);
  const currentIds = new Set(((current || []) as { customer_id: string }[]).map((r) => r.customer_id));

  let entered = 0;
  for (const cid of memberIds) {
    if (!currentIds.has(cid)) {
      const { error: insErr } = await db.from("crm_segment_memberships").insert({
        tenant_id: tenantId, segment_id: id, customer_id: cid, entered_at: now,
      });
      if (!insErr) entered++;
    }
  }
  let exited = 0;
  for (const row of (current || []) as { id: string; customer_id: string }[]) {
    if (!memberIds.has(row.customer_id)) {
      const { error: updErr } = await db.from("crm_segment_memberships").update({ exited_at: now }).eq("id", row.id);
      if (!updErr) exited++;
    }
  }
  return NextResponse.json({ ok: true, member_count: memberIds.size, entered, exited });
}
