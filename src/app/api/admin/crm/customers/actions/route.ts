// ---------------------------------------------------------------------------
// /api/admin/crm/customers/actions/route.ts
//
// Customer quick actions — FULL_FEATURE_TREE.txt Section 2.
//
// Actions:
//   merge_customer, merge_household, send_magic_link, send_rebooking_link,
//   add_to_campaign, book_next_visit, take_payment, create_invoice,
//   checkout, update_documents, view_grooming_history, view_payment_history,
//   view_documents, print_history
//
// Tables: crm_customers, crm_pets, crm_appointments, crm_documents,
// crm_messages, acct_ar_invoices.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { adminGet, adminCreate, adminUpdate, adminList, resolveTenantId} from "@/lib/admin-api";
import { requireAdminApi } from "@/lib/admin/gate";
import { pgExec, pgQuery } from "@/lib/pg";
import { sendEmail } from "@/lib/email";
import { esc } from "@/lib/email/design";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const T = {
  customers: "crm_customers",
  pets: "crm_party_dependents",
  appointments: "crm_appointments",
  documents: "crm_documents",
  messages: "crm_messages",
  invoices: "acct_ar_invoices",
  campaigns: "crm_campaign_members",
};

export async function POST(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  let body: Record<string, any> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const action = String(body.action || "");
  const p = body.payload ?? body;

  try {
    switch (action) {
      case "merge_customer": {
        const keepId = String(p.keep_customer_id || "");
        const dropId = String(p.drop_customer_id || "");
        if (!keepId || !dropId) return NextResponse.json({ error: "keep_customer_id and drop_customer_id required" }, { status: 400 });
        // Reassign pets, appointments, documents to the kept customer
        for (const tbl of [T.pets, T.appointments, T.documents]) {
          const rows = await adminList(tbl, { tenantId: resolveTenantId(req),  filters: { customer_id: dropId }, limit: 500 });
          const rj = await rows.json().catch(() => ({ data: [] }));
          for (const r of (rj?.data || [])) {
            await adminUpdate(tbl, r.id, { customer_id: keepId }, { tenantId: resolveTenantId(req) });
          }
        }
        const fin = await adminUpdate(T.customers, dropId, { status: "merged", merged_into_id: keepId, merged_at: new Date().toISOString() }, { tenantId: resolveTenantId(req) });
        const finJ = await fin.clone().json().catch(() => null);
        if (!fin.ok || finJ?.error || finJ?._empty || !finJ?.data) return fin;
        return NextResponse.json({ ok: true, kept: keepId, merged: dropId });
      }
      case "merge_household": {
        const customerIds: string[] = Array.isArray(p.customer_ids) ? p.customer_ids : [];
        if (customerIds.length < 2) return NextResponse.json({ error: "customer_ids (2+) required" }, { status: 400 });
        const householdId = p.household_id || `HH-${Date.now().toString(36).toUpperCase()}`;
        let linked = 0;
        for (const cid of customerIds) {
          const r = await adminUpdate(T.customers, cid, { household_id: householdId }, { tenantId: resolveTenantId(req) });
          if (r && r.ok) {
            const rj = await r.clone().json().catch(() => null);
            if (rj?.data) linked++;
          }
        }
        if (!linked) return NextResponse.json({ error: `Household ${householdId} was not applied — no customer records were updated` }, { status: 500 });
        return NextResponse.json({ ok: true, household_id: householdId, members: customerIds, linked });
      }
      case "send_magic_link":
      case "send_rebooking_link": {
        // REAL delivery (was fiction: a base64 "token" pointing at a
        // /auth/magic route that does not exist, queued into crm_messages
        // that nothing drains). Now: magic link = hashed token row in
        // portal_magic_links + a real Resend email (same flow as
        // /api/admin/system/actions send_magic_link); rebooking = a real
        // Resend email with the booking link. crm_messages records the
        // honest outcome.
        const customerId = String(p.customer_id || "");
        if (!customerId) return NextResponse.json({ error: "customer_id required" }, { status: 400 });
        const tenantId = resolveTenantId(req);
        const c = await adminGet(T.customers, customerId, { tenantId });
        const cj = await c.json().catch(() => null);
        if (!cj?.data) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
        const email = String(cj.data.email || "").trim();
        if (!email || !email.includes("@")) {
          return NextResponse.json({ error: "Customer has no email on file — nothing was sent" }, { status: 400 });
        }
        const firstName = String(cj.data.first_name || "there");
        const isMagic = action === "send_magic_link";
        let subject: string;
        let body: string;
        let html: string;
        if (isMagic) {
          const crypto = await import("crypto");
          const rawToken = crypto.randomBytes(32).toString("hex");
          const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
          const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
          // portal_magic_links_open_idx allows only ONE unused link per
          // (customer, purpose) — supersede any prior unused link first,
          // or every repeat send dies on the unique index (23505).
          await pgExec(
            `UPDATE public.portal_magic_links
                SET used_at = now()
              WHERE tenant_id = $1 AND customer_id = $2::uuid
                AND purpose = 'magic_link' AND used_at IS NULL`,
            [tenantId, customerId],
          );
          const linkRows = await pgQuery<{ id: string }>(
            `INSERT INTO public.portal_magic_links
               (id, tenant_id, customer_id, purpose, token_hash, expires_at, requested_by, created_at)
             VALUES (gen_random_uuid(), $1, $2::uuid, 'magic_link', $3, $4, NULL, now())
             RETURNING id`,
            [tenantId, customerId, tokenHash, expiresAt],
          );
          if (!linkRows[0]?.id) {
            return NextResponse.json({ error: "Magic link could not be created — no email was sent" }, { status: 500 });
          }
          const linkUrl = `https://www.unsaidmemories.com/magic?token=${rawToken}`;
          subject = "Your sign-in link for UnSaid Memories";
          body = `Sign-in link sent by email (expires ${expiresAt}).`;
          html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a">` +
            `<p>Hi ${esc(firstName)}, here's your one-time sign-in link for UnSaid Memories. It expires in 24 hours.</p>` +
            `<p><a href="${linkUrl}" style="display:inline-block;background:#ea580c;color:#ffffff;padding:10px 22px;border-radius:999px;text-decoration:none;font-weight:bold">Sign in to UnSaid Memories</a></p>` +
            `<p style="color:#666;font-size:12px">If you didn't request this link, you can ignore this email.<br>UnSaid Memories · 699 Waring Rd, Memphis, TN 38122 · 901-722-1114</p></div>`;
        } else {
          subject = "Book your next visit to UnSaid Memories";
          body = `Hi ${firstName}, we'd love to see you and your pet again soon. You can book your next visit online any time: https://unsaidmemories.com/book`;
          html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a">` +
            `<p>Hi ${esc(firstName)}, we'd love to see you and your pet again soon. You can book your next visit online any time:</p>` +
            `<p><a href="https://unsaidmemories.com/book" style="display:inline-block;background:#ea580c;color:#ffffff;padding:10px 22px;border-radius:999px;text-decoration:none;font-weight:bold">Book your next visit</a></p>` +
            `<p style="color:#666;font-size:12px">UnSaid Memories · 699 Waring Rd, Memphis, TN 38122 · 901-722-1114</p></div>`;
        }
        const msgRes = await adminCreate(T.messages, {
          customer_id: customerId,
          channel: "email",
          direction: "outbound",
          to_address: email,
          subject,
          body,
          status: "queued",
          provider: "resend",
          metadata: { kind: isMagic ? "magic_login" : "rebooking", source: "customers_actions" },
        }, { tenantId });
        const msgJ = msgRes ? await msgRes.clone().json().catch(() => null) : null;
        const msgId = Array.isArray(msgJ?.data) ? msgJ.data[0]?.id : msgJ?.data?.id;
        if (!msgRes || !msgRes.ok || msgJ?.error || !msgId) {
          return NextResponse.json({ error: "The message record could not be saved — the email was not sent" }, { status: 502 });
        }
        const sent = await sendEmail({
          customerId: cj.data.source_customer_id || undefined,
          to: email,
          template: isMagic ? "magic_link" : "crm_rebooking_link",
          subject,
          html,
          tenantId,
        });
        await adminUpdate(T.messages, msgId, { status: sent.ok ? "sent" : "failed" }, { tenantId });
        if (!sent.ok) {
          return NextResponse.json({ ok: false, error: `Message recorded but the email could not be sent: ${sent.error || "unknown error"}`, customer_id: customerId, emailed: false }, { status: 502 });
        }
        return NextResponse.json({ ok: true, customer_id: customerId, kind: isMagic ? "magic_login" : "rebooking", emailed: true, status: "sent" });
      }
      case "add_to_campaign": {
        const customerId = String(p.customer_id || "");
        const campaignId = String(p.campaign_id || "");
        if (!customerId || !campaignId) return NextResponse.json({ error: "customer_id and campaign_id required" }, { status: 400 });
        // CHECK (crm_campaign_members_status_check): status IN
        // ('queued','sent','delivered','opened','clicked','converted',
        // 'failed','unsubscribed','skipped') — the old status "added"
        // was rejected by the DB on every call, and the old "added_at"
        // column does not exist (the enrollment timestamp is
        // enrolled_at). 'queued' is the enrollment state, matching
        // the pg actions route's add_to_campaign.
        const r = await adminCreate(T.campaigns, { customer_id: customerId, campaign_id: campaignId, status: "queued", enrolled_at: new Date().toISOString() }, { tenantId: resolveTenantId(req) });
        const rj = await r.json().catch(() => ({}));
        if (rj?.error) return r;
        if (rj?._empty) return NextResponse.json({ error: "Campaign members table not available" }, { status: 501 });
        return NextResponse.json({ data: rj?.data }, { status: 201 });
      }
      case "book_next_visit": {
        const customerId = String(p.customer_id || "");
        if (!customerId) return NextResponse.json({ error: "customer_id required" }, { status: 400 });
        return adminCreate(T.appointments, {
          customer_id: customerId,
          // NOTE: crm_appointments has NO dependent_id column (pets live in the
          // crm_appointment_pets join table) — sending dependent_id made
          // PostgREST reject the insert. Pet attachment happens through
          // POST /api/admin/crm/appointments (E1 join-row create).
          starts_at: p.starts_at || null,
          status: "precheck",
          source_channel: "admin_rebook",
          internal_notes: p.notes || "Next visit booked from customer profile",
        }, { tenantId: resolveTenantId(req) });
      }
      case "take_payment": {
        const customerId = String(p.customer_id || "");
        const amount = Number(p.amount_cents ?? 0);
        if (!customerId || !amount) return NextResponse.json({ error: "customer_id and amount_cents required" }, { status: 400 });
        // HONEST: this route captures nothing and records nothing — the old
        // response claimed "recorded intent" for a write that never happened.
        return NextResponse.json({
          ok: false,
          error: "No payment was captured and nothing was recorded here — use /api/admin/payments (Stripe) to capture this payment.",
          customer_id: customerId,
          amount_cents: amount,
        }, { status: 501 });
      }
      case "create_invoice": {
        const customerId = String(p.customer_id || "");
        if (!customerId) return NextResponse.json({ error: "customer_id required" }, { status: 400 });
        // HONEST GATE (was a silent zombie): this case used to adminCreate
        // into acct_ar_invoices with *_cents columns that do not exist on
        // that table — every call errored. Canonical invoice creation is
        // fin_create_invoice in /api/admin/finance/actions (writes
        // acct_ar_invoices, the single invoice record the UI/send/payments
        // all run on since the 2026-10-13 consolidation). This bespoke
        // shape carries no line items, so it cannot mint a faithful
        // invoice — refuse honestly and point at the canonical path
        // instead of pretending.
        return NextResponse.json({
          ok: false,
          error: "Create invoices via the finance invoice action (fin_create_invoice) — it writes the single invoice record (acct_ar_invoices) with line items. This quick action does not create invoices.",
          customer_id: customerId,
        }, { status: 501 });
      }
      case "checkout": {
        const customerId = String(p.customer_id || "");
        if (!customerId) return NextResponse.json({ error: "customer_id required" }, { status: 400 });
        return NextResponse.json({ ok: true, customer_id: customerId, checkout_url: `/api/shop/checkout?customer_id=${customerId}` });
      }
      case "update_documents": {
        const customerId = String(p.customer_id || "");
        if (!customerId) return NextResponse.json({ error: "customer_id required" }, { status: 400 });
        // crm_documents has NO document_type / file_url / file_name columns and
        // its status CHECK rejects 'active' — the old insert could never land.
        // Real columns only: a document that already has a stored file is
        // 'submitted'; a metadata-only record starts 'pending'. Actual file
        // bytes go through POST /api/admin/crm/documents (multipart), which
        // writes this same shape after uploading to the customer-documents
        // bucket. p.file_url is still accepted as a legacy alias for the
        // stored location.
        const storagePath = p.storage_path || p.file_url || null;
        return adminCreate(T.documents, {
          customer_id: customerId,
          dependent_id: p.dependent_id || null,
          document_type_id: p.document_type_id || null,
          name: p.name || p.file_name || "Document",
          status: storagePath ? "submitted" : "pending",
          storage_path: storagePath,
          mime_type: p.mime_type || null,
          file_size_bytes: p.file_size_bytes ?? null,
          uploaded_at: storagePath ? new Date().toISOString() : null,
          expires_at: p.expires_at || null,
        }, { tenantId: resolveTenantId(req) });
      }
      case "view_grooming_history": {
        const customerId = String(p.customer_id || "");
        if (!customerId) return NextResponse.json({ error: "customer_id required" }, { status: 400 });
        const appts = await adminList(T.appointments, { tenantId: resolveTenantId(req),  filters: { customer_id: customerId }, order: "starts_at.desc", limit: 100 });
        return appts;
      }
      case "view_payment_history": {
        const customerId = String(p.customer_id || "");
        if (!customerId) return NextResponse.json({ error: "customer_id required" }, { status: 400 });
        const inv = await adminList(T.invoices, { tenantId: resolveTenantId(req),  filters: { customer_id: customerId }, order: "created_at.desc", limit: 100 });
        return inv;
      }
      case "view_documents": {
        const customerId = String(p.customer_id || "");
        if (!customerId) return NextResponse.json({ error: "customer_id required" }, { status: 400 });
        return adminList(T.documents, { tenantId: resolveTenantId(req),  filters: { customer_id: customerId }, limit: 100 });
      }
      case "print_history": {
        const customerId = String(p.customer_id || "");
        if (!customerId) return NextResponse.json({ error: "customer_id required" }, { status: 400 });
        const [appts, invs, docs] = await Promise.all([
          adminList(T.appointments, { tenantId: resolveTenantId(req),  filters: { customer_id: customerId }, limit: 100 }).then((r) => r.json().catch(() => ({ data: [] }))),
          adminList(T.invoices, { tenantId: resolveTenantId(req),  filters: { customer_id: customerId }, limit: 100 }).then((r) => r.json().catch(() => ({ data: [] }))),
          adminList(T.documents, { tenantId: resolveTenantId(req),  filters: { customer_id: customerId }, limit: 100 }).then((r) => r.json().catch(() => ({ data: [] }))),
        ]);
        return NextResponse.json({ data: { appointments: appts?.data || [], invoices: invs?.data || [], documents: docs?.data || [], generated_at: new Date().toISOString() } });
      }
      default:
        return NextResponse.json({ error: `Unknown customer action: ${action}` }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "customer action failed", action }, { status: 500 });
  }
}
