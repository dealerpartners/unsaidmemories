import { NextResponse } from "next/server";
import { requireCrmAdmin } from "@/lib/admin/gate";
import { getDb, getTenantId } from "@/lib/crm/data";

export const dynamic = "force-dynamic";

/**
 * Message templates ride on crm_campaigns with campaign_type='message_template'
 * (Unsaid has no dedicated templates table); subject/body live in
 * segment_definition JSONB: { subject, body }.
 */
export async function GET(req: Request) {
  const gate = await requireCrmAdmin(req);
  if ("response" in gate) return gate.response;
  const db = getDb();
  const tenantId = await getTenantId(db);
  const channel = new URL(req.url).searchParams.get("channel");
  let query = db
    .from("crm_campaigns")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("campaign_type", "message_template")
    .order("name");
  if (channel) query = query.eq("channel", channel);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const templates = (data || []).map((t: { id: string; name: string; channel: string; segment_definition: { subject?: string; body?: string } | null; created_at: string }) => ({
    id: t.id,
    name: t.name,
    channel: t.channel,
    subject: t.segment_definition?.subject || "",
    body: t.segment_definition?.body || "",
    created_at: t.created_at,
  }));
  return NextResponse.json({ templates });
}

export async function POST(req: Request) {
  const gate = await requireCrmAdmin(req);
  if ("response" in gate) return gate.response;
  const body = await req.json().catch(() => null);
  if (!body?.name?.trim() || !body?.body?.trim()) {
    return NextResponse.json({ error: "Template name and body are required." }, { status: 400 });
  }
  const db = getDb();
  const tenantId = await getTenantId(db);
  const { data, error } = await db
    .from("crm_campaigns")
    .insert({
      tenant_id: tenantId,
      name: body.name.trim(),
      campaign_type: "message_template",
      status: "active",
      channel: body.channel === "sms" ? "sms" : "email",
      segment_definition: { subject: body.subject || "", body: body.body },
      created_by: gate.admin.userId,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}

export async function DELETE(req: Request) {
  const gate = await requireCrmAdmin(req);
  if ("response" in gate) return gate.response;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });
  const db = getDb();
  const tenantId = await getTenantId(db);
  const { error } = await db.from("crm_campaigns").delete().eq("tenant_id", tenantId).eq("id", id).eq("campaign_type", "message_template");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
