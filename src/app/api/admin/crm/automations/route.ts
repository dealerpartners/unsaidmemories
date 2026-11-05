import { NextResponse } from "next/server";
import { requireCrmAdmin } from "@/lib/admin/gate";
import { getDb, getTenantId } from "@/lib/crm/data";

export const dynamic = "force-dynamic";

/**
 * Automations live on crm_campaigns with campaign_type='automation'; the
 * trigger/action configuration rides in segment_definition JSONB:
 * { trigger, action, segment_id?, template_campaign_id?, delay_days? }.
 */
export async function GET(req: Request) {
  const gate = await requireCrmAdmin(req);
  if ("response" in gate) return gate.response;
  const db = getDb();
  const tenantId = await getTenantId(db);
  const { data, error } = await db
    .from("crm_campaigns")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("campaign_type", "automation")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ automations: data || [] });
}

export async function POST(req: Request) {
  const gate = await requireCrmAdmin(req);
  if ("response" in gate) return gate.response;
  const body = await req.json().catch(() => null);
  if (!body?.name?.trim()) return NextResponse.json({ error: "Automation name is required." }, { status: 400 });
  const db = getDb();
  const tenantId = await getTenantId(db);
  const { data, error } = await db
    .from("crm_campaigns")
    .insert({
      tenant_id: tenantId,
      name: body.name.trim(),
      campaign_type: "automation",
      status: body.status || "active",
      channel: body.channel || "email",
      segment_definition: {
        trigger: body.trigger || "cart_abandoned",
        action: body.action || "send_message",
        segment_id: body.segment_id || null,
        template_campaign_id: body.template_campaign_id || null,
        delay_days: Number(body.delay_days || 0),
        message_subject: body.message_subject || null,
        message_body: body.message_body || null,
      },
      created_by: gate.admin.userId,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
