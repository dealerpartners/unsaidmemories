import { NextResponse } from "next/server";
import { requireCrmAdmin } from "@/lib/admin/gate";
import { getDb, getTenantId, evaluateSegment, type SegmentDefinition } from "@/lib/crm/data";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gate = await requireCrmAdmin(req);
  if ("response" in gate) return gate.response;
  const db = getDb();
  const tenantId = await getTenantId(db);
  const { data, error } = await db
    .from("crm_segments")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("entity_type", "customer")
    .order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const withCounts = await Promise.all(
    (data || []).map(async (s: { id: string; definition: SegmentDefinition }) => {
      const members = await evaluateSegment(db, tenantId, (s.definition || { rules: [] }) as SegmentDefinition);
      return { ...s, member_count: members.length };
    })
  );
  return NextResponse.json({ segments: withCounts });
}

export async function POST(req: Request) {
  const gate = await requireCrmAdmin(req);
  if ("response" in gate) return gate.response;
  const body = await req.json().catch(() => null);
  if (!body?.name?.trim()) return NextResponse.json({ error: "Segment name is required." }, { status: 400 });
  const db = getDb();
  const tenantId = await getTenantId(db);
  const { data, error } = await db
    .from("crm_segments")
    .insert({
      tenant_id: tenantId,
      name: body.name.trim(),
      description: body.description || null,
      entity_type: "customer",
      segment_type: body.segment_type || "behavioral",
      definition: body.definition || { match: "all", rules: [] },
      is_active: true,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
