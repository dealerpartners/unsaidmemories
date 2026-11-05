import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { sendEmail } from "@/lib/email";
import { esc } from "@/lib/email/design";
import {
  appendTicketMessage,
  getOrCreateCustomerTicket,
  logTicketEvent,
} from "@/lib/support/tickets";
import { resolveActingStaff } from "@/lib/support/actor";
import {
  recordSmsMessage,
  sendSmsStrict,
  SmsNotConfiguredError,
} from "@/lib/messaging/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /api/admin/crm/customers/[id]/communications
//   [id] = the shop customer id (customers.id — the id /api/customers returns
//   and the customer profile view carries).
//
//   GET → the customer's REAL communication history, merged from the two
//   stores that actually hold it:
//     - public.communications — every email sendEmail() delivered for this
//       customer (order/booking/shop notifications), keyed by customers.id.
//     - public.crm_messages — CRM-originated messages for the linked CRM
//       customer (crm_customers.source_customer_id = [id], or ?crm_id=).
//   Rows are normalized to one shape and sorted newest first. Statuses are
//   the stored values — crm_messages rows sit at 'queued' because no queue
//   processor delivers them; we show that honestly instead of "Delivered".
//
//   POST { channel, body, subject?, crm_id? } → send a direct message:
//     email → a real Resend send via sendEmail() (which also writes the
//             communications history row, so it appears in GET immediately).
//             The SAME message also lands on the customer's Support
//             conversation — the support-ticket thread via lib/support
//             (getOrCreateCustomerTicket + appendTicketMessage), so the
//             profile modal is not a bypass around the thread the
//             Support Desk works — plus a portal bell row for shop-linked
//             customers. Thread + bell are best-effort: they run after the
//             email has been delivered and never fail the send.
//     sms   → a real Twilio send via lib/messaging/sms (the platform's
//             one SMS provider, BL-10), recorded on the customer's
//             Support conversation exactly like the email leg — or as a
//             standalone crm_messages row when no CRM record is linked —
//             so it lands in the SMS history the moment it is sent. An
//             unconfigured provider fails loudly; never a fake send.

const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v || "");

async function ctxId(ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return id;
}

type CommRow = {
  id: string;
  source: "communications" | "crm_messages";
  channel: string; // 'Email' | 'SMS' | raw title-cased
  type: string;
  direction: string; // 'Outgoing' | 'Incoming'
  subject: string;
  preview: string;
  status: string; // title-cased stored status
  timestamp: string; // ISO
};

function titleCase(s: string): string {
  const t = String(s || "").trim().toLowerCase();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
}

function mapChannel(raw: string): string {
  const c = String(raw || "").trim().toLowerCase();
  if (c === "email") return "Email";
  if (c === "sms") return "SMS";
  return titleCase(c) || "Email";
}

function mapDirection(raw: string): string {
  const d = String(raw || "").trim().toLowerCase();
  if (d === "inbound" || d === "incoming") return "Incoming";
  return "Outgoing";
}

function previewOf(body: string | null | undefined, max = 160): string {
  const text = String(body || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("customers", "read");
  if (gate) return gate;
  const id = await ctxId(ctx);
  if (!id) return NextResponse.json({ error: "customer id required" }, { status: 400 });
  const crmIdParam = req.nextUrl.searchParams.get("crm_id") || "";

  const result = await withPg(async (c) => {
    const tenant = resolveTenantId(req);
    const rows: CommRow[] = [];

    // 1) communications — keyed by the shop customer id.
    try {
      const comms = await c.query(
        `SELECT id::text AS id, channel, direction, subject, body, status,
                "relatedBookingId" AS related_booking_id,
                COALESCE("sentAt", "createdAt") AS ts
           FROM public.communications
          WHERE "customerId" = $1 AND tenant_id = $2
          ORDER BY COALESCE("sentAt", "createdAt") DESC
          LIMIT 200`,
        [id, tenant],
      );
      for (const r of comms.rows as any[]) {
        const preview = previewOf(r.body);
        rows.push({
          id: `comm-${r.id}`,
          source: "communications",
          channel: mapChannel(r.channel),
          type: r.related_booking_id ? "Booking Notification" : "Notification",
          direction: mapDirection(r.direction),
          subject: r.subject || preview || "(no subject)",
          preview: r.subject ? preview : "",
          status: titleCase(r.status) || "Sent",
          timestamp: r.ts ? new Date(r.ts).toISOString() : new Date(0).toISOString(),
        });
      }
    } catch {
      // History store unreadable — return whatever the other store has.
    }

    // 2) crm_messages — resolve the linked CRM customer, then read its rows.
    let crmCustomerId: string | null = isUuid(crmIdParam) ? crmIdParam : null;
    if (!crmCustomerId) {
      try {
        const link = await c.query(
          `SELECT id::text AS id FROM public.crm_customers
            WHERE tenant_id = $1 AND (source_customer_id = $2 OR id::text = $2)
            LIMIT 1`,
          [tenant, id],
        );
        crmCustomerId = (link.rows[0] as any)?.id || null;
      } catch {
        crmCustomerId = null;
      }
    }
    if (crmCustomerId) {
      try {
        const msgs = await c.query(
          `SELECT id::text AS id, channel, direction, subject, body, status, metadata,
                  COALESCE(sent_at, created_at) AS ts
             FROM public.crm_messages
            WHERE customer_id = $1::uuid AND tenant_id = $2
            ORDER BY COALESCE(sent_at, created_at) DESC
            LIMIT 200`,
          [crmCustomerId, tenant],
        );
        for (const r of msgs.rows as any[]) {
          const preview = previewOf(r.body);
          const meta = (r.metadata || {}) as Record<string, unknown>;
          rows.push({
            id: `crm-${r.id}`,
            source: "crm_messages",
            channel: mapChannel(r.channel),
            type: meta.source === "quick_action" || meta.source === "profile_direct_message" ? "Direct Message" : "CRM Message",
            direction: mapDirection(r.direction),
            subject: r.subject || preview || "(no subject)",
            preview: r.subject ? preview : "",
            status: titleCase(r.status) || "Queued",
            timestamp: r.ts ? new Date(r.ts).toISOString() : new Date(0).toISOString(),
          });
        }
      } catch {
        // CRM store unreadable — communications rows above still returned.
      }
    }

    rows.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
    // Communication filters (audit §1.3.8g/§1.3.8h): one channel filter and
    // one type filter over the unified feed — ?channel=Email|SMS|… and
    // ?type=<row type>, both matched against the normalized row fields.
    const channelParam = (req.nextUrl.searchParams.get("channel") || "").trim().toLowerCase();
    const typeParam = (req.nextUrl.searchParams.get("type") || "").trim().toLowerCase();
    const filtered = rows.filter((r) =>
      (!channelParam || r.channel.toLowerCase() === channelParam) &&
      (!typeParam || r.type.toLowerCase() === typeParam));
    return NextResponse.json({ data: filtered, total: filtered.length });
  });

  return result ?? NextResponse.json({ data: [], total: 0 });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("customers", "write");
  if (gate) return gate;
  const id = await ctxId(ctx);
  if (!id) return NextResponse.json({ ok: false, error: "customer id required" }, { status: 400 });

  const payload = await req.json().catch(() => null);
  const channel = String(payload?.channel || "email").trim().toLowerCase();
  const text = String(payload?.body || "").trim();
  if (!text) return NextResponse.json({ ok: false, error: "Message body is required" }, { status: 400 });

  if (channel !== "email" && channel !== "sms") {
    return NextResponse.json({ ok: false, error: `Unsupported channel: ${channel}` }, { status: 400 });
  }

  // Resolve the customer: contact details (shop record first, CRM record
  // as fallback — the long-standing order) AND the CRM link the support
  // thread hangs off. Both lookups always run: the thread write below
  // needs the CRM customer even when the contact came from the shop
  // record. The SMS leg additionally resolves the phone (CRM mobile
  // first, then CRM phone, then the shop record) and the transactional
  // SMS opt-in flag the send paths honour.
  const resolved = await withPg(async (c) => {
    const tenant = resolveTenantId(req);
    let shopFound = false;
    let shopEmail: string | null = null;
    let shopPhone: string | null = null;
    let shopSmsOptIn: boolean | null = null;
    try {
      const shop = await c.query(
        `SELECT email, phone, "smsTransactionalOptIn" AS sms_opt_in FROM public.customers WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [id, tenant],
      );
      if (shop.rows[0]) {
        shopFound = true;
        if ((shop.rows[0] as any).email) shopEmail = String((shop.rows[0] as any).email);
        if ((shop.rows[0] as any).phone) shopPhone = String((shop.rows[0] as any).phone);
        if (typeof (shop.rows[0] as any).sms_opt_in === "boolean") shopSmsOptIn = (shop.rows[0] as any).sms_opt_in;
      }
    } catch { /* fall through to CRM lookup */ }
    let crm: { id: string; name: string | null; email: string | null; phone: string | null; smsOptIn: boolean | null; sourceCustomerId: string | null } | null = null;
    try {
      const crmIdParam = String(payload?.crm_id || "");
      const r = await c.query(
        `SELECT id::text AS id, first_name, last_name, email, phone, mobile_phone,
                transactional_sms_opt_in, source_customer_id
           FROM public.crm_customers
          WHERE tenant_id = $1 AND (source_customer_id = $2 OR id::text = $2 OR id::text = $3)
          LIMIT 1`,
        [tenant, id, crmIdParam],
      );
      const row = r.rows[0] as any;
      if (row) {
        crm = {
          id: String(row.id),
          name: [row.first_name, row.last_name].filter(Boolean).join(" ") || null,
          email: row.email ? String(row.email) : null,
          phone: (row.mobile_phone ? String(row.mobile_phone) : null) || (row.phone ? String(row.phone) : null),
          smsOptIn: typeof row.transactional_sms_opt_in === "boolean" ? row.transactional_sms_opt_in : null,
          sourceCustomerId: row.source_customer_id ? String(row.source_customer_id) : null,
        };
      }
    } catch { /* no CRM link — contact-only send, as before */ }
    if (!shopFound && !crm) return null;
    const email = shopEmail || crm?.email || null;
    const phone = crm?.phone || shopPhone || null;
    const smsOptIn = crm ? crm.smsOptIn : shopSmsOptIn;
    return { email, phone, smsOptIn, crm, shopCustomerId: shopFound ? id : (crm?.sourceCustomerId ?? null) };
  });
  if (!resolved) {
    return NextResponse.json(
      { ok: false, error: "Customer not found." },
      { status: 404 },
    );
  }

  // ── SMS leg (BL-10): a real Twilio send through the platform's one
  // SMS provider module, recorded on the same Support conversation the
  // email leg writes (or as a standalone crm_messages row when the
  // customer has no CRM record), so the send appears in the customer's
  // SMS history with its Twilio delivery status.
  if (channel === "sms") {
    const phone = resolved.phone;
    if (!phone) {
      return NextResponse.json(
        { ok: false, error: "This customer has no phone number on file." },
        { status: 400 },
      );
    }
    if (resolved.smsOptIn === false) {
      return NextResponse.json(
        { ok: false, error: "This customer has opted out of text messages." },
        { status: 403 },
      );
    }
    const tenant = resolveTenantId(req);
    const staff = await resolveActingStaff().catch(() => null);
    const smsSend = await withPg(async (c) => {
      try {
        const sent = await sendSmsStrict(c, tenant, phone, text);
        return { ok: true as const, sent };
      } catch (e) {
        return { ok: false as const, error: e as Error };
      }
    });
    if (!smsSend) {
      return NextResponse.json({ ok: false, error: "Database unavailable — the text was not sent." }, { status: 503 });
    }
    if (!smsSend.ok) {
      // The failed attempt is still recorded (status 'failed' with the
      // reason) so the history never silently drops a message.
      await withPg(async (c) => {
        await recordSmsMessage(c, {
          tenantId: tenant,
          customerId: resolved.crm?.id ?? null,
          toAddress: phone,
          body: text,
          status: "failed",
          failureReason: smsSend.error.message,
          createdBy: staff?.staffId ?? null,
          metadata: { source: "profile_direct_message" },
        });
      }).catch(() => null);
      const status = smsSend.error instanceof SmsNotConfiguredError ? 503 : 502;
      return NextResponse.json({ ok: false, error: smsSend.error.message }, { status });
    }
    const sent = smsSend.sent;
    // Record the send: on the Support conversation when a CRM record is
    // linked (identical model to the email leg below, channel 'sms'),
    // with the desk lifecycle stamps; otherwise a standalone row.
    let messageId: string | null = null;
    let thread: { ticketRef: string; messageId: string; bell: boolean } | null = null;
    if (resolved.crm) {
      const crm = resolved.crm;
      thread = await withPg(async (c) => {
        const { ticket } = await getOrCreateCustomerTicket(
          c, tenant,
          { id: crm.id, name: crm.name, email: crm.email || resolved.email },
          "Text message from UnSaid Memories",
        );
        const msg = await appendTicketMessage(c, tenant, ticket, {
          customerId: crm.id,
          channel: "sms",
          direction: "outbound",
          status: "sent",
          fromAddress: sent.from,
          toAddress: phone,
          subject: null,
          body: text,
          createdBy: staff?.staffId ?? null,
          provider: "twilio",
          providerMessageId: sent.sid,
          deliveryStatus: sent.status,
          metadata: { source: "profile_direct_message" },
        });
        await c.query(
          `UPDATE public.support_tickets
              SET first_public_reply_at = COALESCE(first_public_reply_at, now()),
                  status = CASE WHEN status = 'open' THEN 'pending' ELSE status END,
                  updated_at = now()
            WHERE id = $1::uuid`,
          [ticket.id],
        ).catch(() => {});
        await logTicketEvent(c, tenant, ticket.id, {
          type: "reply",
          actorStaffId: staff?.staffId ?? null,
          actorLabel: staff?.name ?? null,
          detail: { messageId: msg.id, source: "profile_direct_message", channel: "sms" },
        }).catch(() => {});
        let bell = false;
        if (resolved.shopCustomerId) {
          await c.query(
            `INSERT INTO public.customer_notifications
               (id, tenant_id, "customerId", type, title, body, link, "relatedId", "createdAt")
             VALUES (gen_random_uuid()::text, $1, $2, 'message', $3,
                     'You have a new message from the salon — read it in Support.',
                     '/customer/support', $4, now())`,
            [tenant, resolved.shopCustomerId, "Text message from UnSaid Memories", msg.id],
          ).then(() => { bell = true; }).catch(() => {});
        }
        return { ticketRef: ticket.ticketRef, messageId: msg.id, bell };
      }).catch(() => null);
      messageId = thread?.messageId ?? null;
    }
    if (!messageId) {
      messageId = await withPg(async (c) =>
        recordSmsMessage(c, {
          tenantId: tenant,
          customerId: resolved.crm?.id ?? null,
          toAddress: phone,
          fromAddress: sent.from,
          body: text,
          status: "sent",
          providerMessageId: sent.sid,
          deliveryStatus: sent.status,
          createdBy: staff?.staffId ?? null,
          metadata: { source: "profile_direct_message", shop_customer_id: id },
        }),
      ).catch(() => null);
    }
    if (!messageId) {
      return NextResponse.json(
        { ok: false, error: "The text was sent but could not be recorded — check the customer's history before resending.", providerMessageId: sent.sid },
        { status: 500 },
      );
    }
    return NextResponse.json({
      ok: true, channel: "sms", status: "sent",
      messageId, providerMessageId: sent.sid, thread,
    });
  }

  if (!resolved?.email) {
    return NextResponse.json(
      { ok: false, error: "This customer has no email address on file." },
      { status: 400 },
    );
  }

  const subject = String(payload?.subject || "Message from UnSaid Memories").trim() || "Message from UnSaid Memories";
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#1a1a1a;max-width:560px;margin:auto;padding:24px;">${esc(text).replace(/\n/g, "<br/>")}</div>`;

  const sent = await sendEmail({
    customerId: id,
    to: resolved.email,
    template: "direct_message",
    subject,
    html,
    tenantId: resolveTenantId(req),
  });
  if (!sent.ok) {
    return NextResponse.json(
      { ok: false, error: sent.error || "Email could not be sent." },
      { status: 503 },
    );
  }

  // Support chain: the SAME message also lands on the customer's Support
  // conversation, so a profile-modal send is no longer a bypass around
  // the thread the Support Desk works. Reuses the support library
  // (getOrCreateCustomerTicket + appendTicketMessage) — the ticket model
  // is identical from every door — and leaves the portal bell for
  // shop-linked customers. A customer with no linked CRM record keeps
  // the email-only behavior (there is no thread to write to); a CRM
  // customer without a shop link gets the thread row but no bell (the
  // bell resolves by shop customer id). Best-effort throughout: the
  // email has already been delivered, and a thread/bell failure must
  // never fail (or duplicate) the send.
  let thread: { ticketRef: string; messageId: string; bell: boolean } | null = null;
  if (resolved.crm) {
    const crm = resolved.crm;
    const staff = await resolveActingStaff();
    thread = await withPg(async (c) => {
      const tenant = resolveTenantId(req);
      const { ticket } = await getOrCreateCustomerTicket(
        c, tenant,
        { id: crm.id, name: crm.name, email: crm.email || resolved.email },
        subject,
      );
      const msg = await appendTicketMessage(c, tenant, ticket, {
        customerId: crm.id,
        channel: "chat",
        direction: "outbound",
        status: "sent",
        fromAddress: staff?.email ?? null,
        toAddress: crm.email || resolved.email,
        subject,
        body: text,
        createdBy: staff?.staffId ?? null,
        metadata: { source: "profile_direct_message" },
      });
      // The same lifecycle stamps the Support Desk applies to a reply:
      // first public reply recorded, and an open ticket moves to
      // pending (the ball is with the customer now).
      await c.query(
        `UPDATE public.support_tickets
            SET first_public_reply_at = COALESCE(first_public_reply_at, now()),
                status = CASE WHEN status = 'open' THEN 'pending' ELSE status END,
                updated_at = now()
          WHERE id = $1::uuid`,
        [ticket.id],
      ).catch(() => {});
      await logTicketEvent(c, tenant, ticket.id, {
        type: "reply",
        actorStaffId: staff?.staffId ?? null,
        actorLabel: staff?.name ?? null,
        detail: { messageId: msg.id, source: "profile_direct_message" },
      }).catch(() => {});
      // Portal bell — shop-linked customers only; everyone else still
      // has the email and the thread row (staff see it on the profile).
      let bell = false;
      if (resolved.shopCustomerId) {
        await c.query(
          `INSERT INTO public.customer_notifications
             (id, tenant_id, "customerId", type, title, body, link, "relatedId", "createdAt")
           VALUES (gen_random_uuid()::text, $1, $2, 'message', $3,
                   'You have a new message from the salon — read it in Support.',
                   '/customer/support', $4, now())`,
          [tenant, resolved.shopCustomerId, subject, msg.id],
        ).then(() => { bell = true; }).catch(() => {});
      }
      return { ticketRef: ticket.ticketRef, messageId: msg.id, bell };
    });
  }
  return NextResponse.json({ ok: true, messageId: sent.messageId || null, thread });
}
