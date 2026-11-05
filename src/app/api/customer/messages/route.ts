import { NextRequest, NextResponse } from "next/server";
import { db, T } from "@/lib/trust/support";
import {
  getShopper, resolveShopperTicket, isCustomerVisibleMessage, mapThreadMessage,
} from "@/lib/customer-support";
import { withPg } from "@/lib/pg";
import {
  appendTicketMessage, getOrCreateCustomerTicket, getTicketById,
} from "@/lib/support/tickets";
import { notifyTicketReceived } from "@/lib/support/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* The customer's conversation API — the endpoints the SupportThread
   component was built against (it shipped with zero routes behind it).
   Reads and writes run over the desk's own model: a ticket owns one
   conversation; messages are crm_messages rows on it. */

export async function GET(req: NextRequest) {
  const shopper = await getShopper();
  if (!shopper) return NextResponse.json({ error: "Sign in to see your messages." }, { status: 401 });
  const selector = req.nextUrl.searchParams.get("ticket");
  const { ticket } = await resolveShopperTicket(shopper, selector);
  if (!ticket) return NextResponse.json({ messages: [], ticket: null });
  const sb = db();
  const { data } = await sb
    .from("crm_messages")
    .select("id, direction, body, body_text, channel, sent_at, created_at, metadata")
    .eq("tenant_id", T())
    .eq("conversation_id", ticket.conversation_id)
    .order("created_at", { ascending: true })
    .limit(500);
  const messages = (data ?? []).filter(isCustomerVisibleMessage).map(mapThreadMessage);
  return NextResponse.json({
    messages,
    ticket: { id: ticket.id, ticketRef: ticket.ticket_ref, subject: ticket.subject, status: ticket.status },
  });
}

export async function POST(req: NextRequest) {
  const shopper = await getShopper();
  if (!shopper) return NextResponse.json({ error: "Sign in to send a message." }, { status: 401 });
  const body = await req.json().catch(() => null);

  /* ── Report a shop message (Trust & Safety message-flag queue) ── */
  if (body?.action === "flag") {
    const messageId = String(body.message_id ?? "");
    if (!messageId) return NextResponse.json({ error: "Missing message." }, { status: 400 });
    const sb = db();
    const { data: msg } = await sb
      .from("crm_messages")
      .select("id, conversation_id, direction")
      .eq("tenant_id", T())
      .eq("id", messageId)
      .maybeSingle();
    if (!msg || msg.direction !== "outbound") {
      return NextResponse.json({ error: "That message can't be reported." }, { status: 404 });
    }
    const { tickets } = await resolveShopperTicket(shopper);
    if (!tickets.some((t) => t.conversation_id === msg.conversation_id)) {
      return NextResponse.json({ error: "That message can't be reported." }, { status: 404 });
    }
    const { error } = await sb.from("message_flags").insert({
      tenant_id: T(),
      message_id: msg.id,
      reporter_type: "customer",
      reporter_id: shopper.customerId,
      reason: body.reason ? String(body.reason).slice(0, 500) : null,
      status: "open",
    });
    if (error) return NextResponse.json({ error: "Could not save the report." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  /* ── Send a message on the customer's thread ── */
  const text = String(body?.message ?? "").trim().slice(0, 5000);
  if (!text) return NextResponse.json({ error: "Write a message first." }, { status: 400 });
  const selector = body?.ticketId ? String(body.ticketId) : null;

  const out = await withPg(async (c) => {
    const tenant = T();
    // Resolve (or create) the CRM customer row for this account email —
    // the same linkage the contact intake makes, so desk and thread agree.
    let customerId = shopper.customerId;
    if (!customerId) {
      const found = await c.query(
        `SELECT id::text AS id FROM public.crm_customers WHERE tenant_id = $1 AND lower(email) = lower($2) AND merged_into_customer_id IS NULL LIMIT 1`,
        [tenant, shopper.email],
      );
      customerId = found.rows[0]?.id ?? null;
      if (!customerId) {
        const parts = (shopper.name ?? "").trim().split(/\s+/).filter(Boolean);
        const ins = await c.query(
          `INSERT INTO public.crm_customers (tenant_id, email, first_name, last_name)
           VALUES ($1, $2, $3, $4) RETURNING id::text AS id`,
          [tenant, shopper.email, parts[0] ?? null, parts.slice(1).join(" ") || null],
        ).catch(() => null);
        customerId = ins?.rows[0]?.id ?? null;
      }
    }
    if (!customerId) return { status: 503, payload: { error: "We couldn't link your account to a customer record — please use the contact form so the team can help." } };

    // A selected, still-open ticket of theirs receives the reply;
    // anything else follows the model: one open ticket per thread,
    // a message after resolve/close opens a fresh ticket.
    let ticket: any = null;
    let created = false;
    if (selector) {
      const { ticket: selected } = await resolveShopperTicket(shopper, selector);
      if (selected && (selected.status === "open" || selected.status === "pending")) {
        ticket = await getTicketById(c, tenant, selected.id);
      }
    }
    if (!ticket) {
      const got = await getOrCreateCustomerTicket(
        c, tenant,
        { id: customerId, name: shopper.name, email: shopper.email },
        text,
      );
      ticket = got.ticket;
      created = got.created;
    }
    const msg = await appendTicketMessage(c, tenant, ticket, {
      customerId,
      channel: "chat",
      direction: "inbound",
      status: "received",
      fromAddress: shopper.email,
      body: text,
    });
    if (created) {
      // The received-confirmation leg (notify.ts) — best-effort by design.
      void notifyTicketReceived(ticket).catch(() => {});
    }
    return {
      status: 200,
      payload: {
        message: { id: msg.id, from: "customer", text, at: msg.at, channel: "chat" },
        ticket: { id: ticket.id, ticketRef: ticket.ticketRef, status: ticket.status },
        created,
      },
    };
  });
  if (!out) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  return NextResponse.json(out.payload, { status: out.status });
}
