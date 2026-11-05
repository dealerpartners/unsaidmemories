import { NextResponse } from "next/server";
import { requireCrmAdmin } from "@/lib/admin/gate";
import { getDb, getTenantId } from "@/lib/crm/data";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireCrmAdmin(req);
  if ("response" in gate) return gate.response;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  const db = getDb();
  const tenantId = await getTenantId(db);
  const { data: current } = await db.from("crm_campaigns").select("segment_definition").eq("id", id).maybeSingle();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("name" in body) patch.name = body.name;
  if ("status" in body) patch.status = body.status;
  if ("channel" in body) patch.channel = body.channel;
  const configKeys = ["trigger", "action", "segment_id", "template_campaign_id", "delay_days", "message_subject", "message_body"];
  if (configKeys.some((k) => k in body)) {
    const merged = { ...((current as { segment_definition?: object } | null)?.segment_definition || {}) };
    for (const k of configKeys) if (k in body) (merged as Record<string, unknown>)[k] = body[k];
    patch.segment_definition = merged;
  }
  const { error } = await db.from("crm_campaigns").update(patch).eq("tenant_id", tenantId).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireCrmAdmin(req);
  if ("response" in gate) return gate.response;
  const { id } = await params;
  const db = getDb();
  const tenantId = await getTenantId(db);
  const { error } = await db.from("crm_campaigns").delete().eq("tenant_id", tenantId).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
