import { NextResponse } from "next/server";
import { requireCrmAdmin } from "@/lib/admin/gate";
import { getDb, getTenantId, evaluateSegment, type SegmentDefinition } from "@/lib/crm/data";

export const dynamic = "force-dynamic";

type AutomationConfig = {
  trigger?: string;
  action?: string;
  segment_id?: string | null;
  message_subject?: string | null;
  message_body?: string | null;
};

/**
 * Run an automation now: resolve its audience (the configured segment,
 * evaluated live), then perform its action for each member —
 * send_message writes real crm_messages rows (queued for provider
 * delivery), create_task writes follow-up tasks, enroll writes
 * crm_campaign_members. Every enrollment is recorded.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireCrmAdmin(req);
  if ("response" in gate) return gate.response;
  const { id } = await params;
  const db = getDb();
  const tenantId = await getTenantId(db);
  const { data: automation, error } = await db
    .from("crm_campaigns")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .eq("campaign_type", "automation")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!automation) return NextResponse.json({ error: "Automation not found." }, { status: 404 });
  const A = automation as { segment_definition: AutomationConfig | null; channel: string | null; name: string };
  const config = A.segment_definition || {};
  if (!config.segment_id) {
    return NextResponse.json({ error: "This automation has no audience segment configured." }, { status: 422 });
  }
  const { data: segment } = await db.from("crm_segments").select("definition").eq("id", config.segment_id).maybeSingle();
  if (!segment) return NextResponse.json({ error: "Audience segment no longer exists." }, { status: 422 });
  const members = await evaluateSegment(db, tenantId, ((segment as { definition: SegmentDefinition }).definition || { rules: [] }) as SegmentDefinition);

  const now = new Date().toISOString();
  const action = config.action || "send_message";
  let processed = 0;
  let failed = 0;

  for (const member of members) {
    if (member.do_not_contact) { failed++; continue; }
    const { error: enrollErr } = await db.from("crm_campaign_members").insert({
      tenant_id: tenantId, campaign_id: id, customer_id: member.id,
      status: "enrolled", enrolled_at: now,
    });
    if (enrollErr) { failed++; continue; }
    if (action === "send_message") {
      const channel = A.channel === "sms" ? "sms" : "email";
      const toAddress = channel === "email" ? member.email : member.mobile_phone || member.phone;
      if (!toAddress) { failed++; continue; }
      const { data: conv } = await db.from("crm_conversations").insert({
        tenant_id: tenantId, customer_id: member.id, channel, status: "open",
        subject: config.message_subject || A.name, started_at: now, last_message_at: now,
      }).select("id").single();
      await db.from("crm_messages").insert({
        tenant_id: tenantId, conversation_id: (conv as { id: string }).id, customer_id: member.id,
        channel, direction: "outbound", status: "queued", delivery_status: "queued",
        to_address: toAddress, subject: config.message_subject || A.name,
        body: config.message_body || "", body_text: config.message_body || "",
        provider: channel === "email" ? "resend" : "sms-gateway",
        is_system_generated: true, is_auto_reply: false, created_by: gate.admin.userId,
        metadata: { automation_id: id },
      });
      await db.from("crm_campaign_members").update({ status: "sent", sent_at: now }).eq("campaign_id", id).eq("customer_id", member.id);
    } else if (action === "create_task") {
      await db.from("crm_tasks").insert({
        tenant_id: tenantId, customer_id: member.id, created_by: gate.admin.userId,
        task_type: "follow_up", priority: "normal",
        title: `${A.name} — follow up`, description: config.message_body || null,
        due_at: now, status: "open",
      });
      await db.from("crm_campaign_members").update({ status: "sent", sent_at: now }).eq("campaign_id", id).eq("customer_id", member.id);
    }
    processed++;
  }

  await db.from("crm_campaigns").update({ started_at: now, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ ok: true, audience: members.length, processed, failed });
}
