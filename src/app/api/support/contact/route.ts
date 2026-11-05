import { NextRequest, NextResponse } from "next/server";
import { db, T, logEvent, nextTicketRef, stampSlaForNewTicket } from "@/lib/trust/support";
import { notifyTicketReceived } from "@/lib/support/notify";
import { getShopper } from "@/lib/customer-support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/support/contact — the storefront contact form.
 *
 * Creates exactly what the admin console's own ticket-create
 * creates (conversation -> ticket -> first message -> SLA stamp ->
 * event), with source_channel "web_form" and requester_type
 * "customer", so a shopper's message lands in the Support Desk
 * queue indistinguishable from a staff-created ticket. If the
 * email matches a CRM customer, the ticket links to them.
 *
 * Session required (owner ruling, 2026-11-03): support is a
 * customer surface — guests read the FAQ, and writing to the team
 * happens signed in, inside the account, where the conversation
 * lives. The requester's name/email come from the account, so the
 * ticket always links to the customer who wrote it.
 * Validation is deliberately plain: real fields, sane lengths.
 */
const CATEGORIES = ["general", "orders", "shipping", "returns", "technical", "trust_safety", "billing"];

export async function POST(req: NextRequest) {
  const shopper = await getShopper();
  if (!shopper) {
    return NextResponse.json(
      { error: "Please sign in to write to us — support conversations live in your account, under Help and care." },
      { status: 401 },
    );
  }
  const body = await req.json().catch(() => null);
  const name = (String(body?.name ?? "").trim() || shopper.name || shopper.email.split("@")[0]).slice(0, 120);
  const email = shopper.email;
  const subject = String(body?.subject ?? "").trim().slice(0, 200);
  const message = String(body?.body ?? "").trim().slice(0, 5000);
  const category = CATEGORIES.includes(body?.category) ? body.category : "general";

  if (!name) return NextResponse.json({ error: "Please tell us your name." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "That email address doesn't look right — we reply there, so it has to be real." }, { status: 400 });
  }
  if (!subject) return NextResponse.json({ error: "Please give your message a subject." }, { status: 400 });
  if (message.length < 5) return NextResponse.json({ error: "Please write a few words about what's happening." }, { status: 400 });

  const sb = db();
  try {
    // Link to the CRM customer when we know this email.
    const { data: crm } = await sb
      .from("crm_customers")
      .select("id")
      .eq("tenant_id", T())
      .ilike("email", email)
      .is("merged_into_customer_id", null)
      .limit(1)
      .maybeSingle();

    const { data: conv, error: convErr } = await sb
      .from("crm_conversations")
      .insert({
        tenant_id: T(), customer_id: crm?.id ?? null, channel: "web_form", status: "open",
        subject, started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (convErr) throw new Error(convErr.message);

    const ref = await nextTicketRef();
    const { data: ticket, error } = await sb
      .from("support_tickets")
      .insert({
        tenant_id: T(), ticket_ref: ref, conversation_id: conv.id,
        requester_type: "customer",
        requester_customer_id: crm?.id ?? null,
        requester_name: name, requester_email: email,
        subject, status: "open", priority: "normal",
        category, source_channel: "web_form",
        tags: [], visibility_level: "standard", on_hold: false, spam_flag: false,
        reopened_count: 0, time_spent_seconds: 0, message_count: 1, public_reply_count: 0,
        metadata: { source: "storefront_contact_form" }, last_message_at: new Date().toISOString(),
      })
      .select("id, ticket_ref")
      .single();
    if (error) throw new Error(error.message);

    await sb.from("crm_messages").insert({
      tenant_id: T(), conversation_id: conv.id, customer_id: crm?.id ?? null,
      channel: "web_form", direction: "inbound", status: "received",
      from_address: email, subject, body: message, body_text: message,
      metadata: {}, email_references: [], cc_addresses: [], bcc_addresses: [],
      quoted_content_stripped: false, is_auto_reply: false, is_system_generated: false,
    });

    await stampSlaForNewTicket(ticket.id, "normal", category);
    await logEvent(ticket.id, "created", { summary: `Ticket ${ref} created from the storefront contact form` }, { label: name, type: "customer" }, "public");

    // (i) "We got your message [SUP-n]" — the received-confirmation
    // email, linking back to the conversation on /help. Best-effort:
    // a mail failure never fails the intake that already landed.
    await notifyTicketReceived({
      ticketRef: ref, subject,
      requesterType: "customer", requesterName: name, requesterEmail: email,
    } as any).catch(() => false);

    return NextResponse.json({ ok: true, ticket_ref: ref }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Something went wrong sending your message. Please try again." }, { status: 500 });
  }
}
