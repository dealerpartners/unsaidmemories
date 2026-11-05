import { NextResponse } from "next/server";
import { requireCrmAdmin } from "@/lib/admin/gate";
import { getDb, getTenantId, getCustomer } from "@/lib/crm/data";

export const dynamic = "force-dynamic";

/**
 * Send a message to a customer (email or SMS). Creates/reuses the open
 * conversation for the channel, records the crm_messages row, and — for
 * email — attempts a real send through Resend when RESEND_API_KEY is
 * configured. The stored status always reflects what actually happened:
 * 'sent' only when the provider accepted it, 'failed' with the provider
 * error, 'queued' when no provider is configured yet.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireCrmAdmin(req);
  if ("response" in gate) return gate.response;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const channel = body?.channel === "sms" ? "sms" : "email";
  const text = (body?.body || "").trim();
  if (!text) return NextResponse.json({ error: "Message body is required." }, { status: 400 });

  const db = getDb();
  const tenantId = await getTenantId(db);
  const customer = await getCustomer(db, tenantId, id);
  if (!customer) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  if (customer.do_not_contact) {
    return NextResponse.json({ error: "Customer is marked do-not-contact." }, { status: 422 });
  }
  const toAddress = channel === "email" ? customer.email : customer.mobile_phone || customer.phone;
  if (!toAddress) {
    return NextResponse.json({ error: `Customer has no ${channel === "email" ? "email address" : "phone number"} on file.` }, { status: 422 });
  }

  // Conversation: reuse the open one for this channel or start a new one.
  let conversationId: string | null = body.conversation_id || null;
  if (!conversationId) {
    const { data: open } = await db
      .from("crm_conversations")
      .select("id")
      .eq("customer_id", id)
      .eq("channel", channel)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (open) conversationId = (open as { id: string }).id;
    else {
      const { data: conv, error: convErr } = await db
        .from("crm_conversations")
        .insert({
          tenant_id: tenantId,
          customer_id: id,
          channel,
          status: "open",
          subject: body.subject || null,
          started_at: new Date().toISOString(),
          last_message_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (convErr) return NextResponse.json({ error: convErr.message }, { status: 500 });
      conversationId = (conv as { id: string }).id;
    }
  }

  let status = "queued";
  let deliveryStatus = "queued";
  let providerMessageId: string | null = null;
  let failureReason: string | null = null;
  let provider = channel === "email" ? "resend" : "sms-gateway";

  if (channel === "email" && process.env.RESEND_API_KEY) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM_EMAIL || "Unsaid Memories <hello@unsaidmemories.com>",
          to: [toAddress],
          subject: body.subject || "A message from Unsaid Memories",
          text,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (res.ok && json.id) {
        status = "sent";
        deliveryStatus = "sent";
        providerMessageId = json.id;
      } else {
        status = "failed";
        deliveryStatus = "failed";
        failureReason = json.message || `Resend returned ${res.status}`;
      }
    } catch (e) {
      status = "failed";
      deliveryStatus = "failed";
      failureReason = (e as Error).message;
    }
  }

  const now = new Date().toISOString();
  const { data, error } = await db
    .from("crm_messages")
    .insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      customer_id: id,
      channel,
      direction: "outbound",
      status,
      delivery_status: deliveryStatus,
      from_address: channel === "email" ? process.env.RESEND_FROM_EMAIL || "hello@unsaidmemories.com" : null,
      to_address: toAddress,
      subject: body.subject || null,
      body: text,
      body_text: text,
      template_id: body.template_id || null,
      provider,
      provider_message_id: providerMessageId,
      sent_at: status === "sent" ? now : null,
      failed_at: status === "failed" ? now : null,
      failure_reason: failureReason,
      created_by: gate.admin.userId,
      authored_by_staff_id: null,
      metadata: { source: "crm_composer" },
    })
    .select("id, status")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db.from("crm_conversations").update({ last_message_at: now, updated_at: now }).eq("id", conversationId);
  await db.from("crm_customers").update({ last_activity_at: now }).eq("id", id);
  return NextResponse.json({ id: data.id, status: data.status, conversation_id: conversationId }, { status: 201 });
}
