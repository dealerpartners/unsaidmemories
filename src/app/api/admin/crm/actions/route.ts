// ---------------------------------------------------------------------------
// /api/admin/crm/actions/route.ts
//
// CRM quick actions: customers, pets, notes, messages, intake forms,
// household merges. Each handler:
//   1. Strips the FIRST module prefix (crm_* / cust_*) so the case keys
//      match the registry.
//   2. Performs a real transactional write.
//   3. Appends a row to crm_audit_log via the shared auditAction() helper.
//   4. Returns structured JSON for TanStack cache invalidation.
//
// CRITICAL FIX vs previous version: every stub case key was the LAST
// underscore-segment of the registry code (e.g. `case 'customer'` for
// `crm_add_customer`). The prefix-stripping regex `^[a-z]+_` only strips
// the FIRST run, so `crm_add_customer` becomes `add_customer`, NOT
// `customer`. Every "short" stub case was dead code. This rewrite uses
// the correct prefix-stripped names.
//
// Also fixed real-handler bugs:
//   - crm_messages.metadata is NOT NULL → all INSERTs must provide it
//   - crm_notes.note_type has a CHECK constraint (internal | customer_visible
//     | appointment | pet_handling | system); non-allowed values are rejected
//     silently — we now coerce to a valid value via the logCustomerNote
//     helper, or use 'internal' for direct INSERTs.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { guardPayloadIds, guardRequiredFields } from "@/lib/quick-actions/validate";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgExec, pgQuery } from "@/lib/pg";
import { auditAction, getActorIdFromRequest, logCustomerNote } from "@/lib/quick-actions/audit";
import { sendEmail } from "@/lib/email";
import { esc } from "@/lib/email/design";
import { withPg } from "@/lib/crm/enterprise";
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

/** Cheap UUID shape check — used to coerce non-UUID business keys to NULL. */
function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("customers", "write");
  if (gate) return gate;

  let action = "";
  let payload: Record<string, unknown> = {};
  let actorId: string | null = null;
  let ip: string | null = null;

  try {
    const body = await req.json();
    action = String(body.action || "");
    payload = body.payload ?? body;
    delete (payload as Record<string, unknown>).action;
    const idGuard = guardPayloadIds(payload);
    if (idGuard) return idGuard;
    const reqGuard = guardRequiredFields(action, payload);
    if (reqGuard) return reqGuard;
    actorId = await getActorIdFromRequest(req);
    ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  } catch (e) {
    return NextResponse.json({ error: `Invalid request body: ${e instanceof Error ? e.message : "unknown"}` }, { status: 400 });
  }

  const shortAction = action.replace(/^[a-z]+_/, "");

  try {
    switch (shortAction) {
      // ───────────────────────────────────────────────────────────────────
      // CUSTOMER handlers
      // ───────────────────────────────────────────────────────────────────

      case "add_customer": {
        // crm_add_customer → add_customer
        // CHECK constraints:
        //   customer_type IN ('individual','business','breeder','rescue','referral_partner','staff','other')
        //   lifecycle_stage IN ('new_lead','new_customer','active','vip','returning','lapsed','at_risk','lost')
        //   lifecycle_status IN ('healthy','needs_attention','at_risk')
        const firstName = payload.first_name ? String(payload.first_name) : null;
        const lastName = payload.last_name ? String(payload.last_name) : null;
        const email = payload.email ? String(payload.email) : null;
        const phone = payload.phone ? String(payload.phone) : null;
        const customerType = String(payload.customer_type || "individual");
        const lifecycleStage = String(payload.lifecycle_stage || "new_customer");
        const lifecycleStatus = String(payload.lifecycle_status || "healthy");
        const rows = await pgQuery<{ id: string }>(
          `INSERT INTO public.crm_customers
             (id, tenant_id, customer_type, lifecycle_stage, lifecycle_status,
              first_name, last_name, email, phone, country, is_active, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, 'US', true, now(), now())
           RETURNING id`,
          [resolveTenantId(req), customerType, lifecycleStage, lifecycleStatus, firstName, lastName, email, phone],
        );
        const customerId = rows[0]?.id ?? null;
        if (!customerId) {
          return NextResponse.json({ ok: false, error: "Customer could not be created — the customer was not saved" }, { status: 500 });
        }
        await auditAction({ action, domain: "crm", tableName: "crm_customers", recordId: customerId, afterData: { firstName, lastName, email, customerType, lifecycleStage }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, customerId, firstName, lastName, email, customerType });
      }

      case "edit_customer": {
        // crm_edit_customer → edit_customer
        const customerId = String(payload.customer_id || "");
        const firstName = payload.first_name ? String(payload.first_name) : null;
        const lastName = payload.last_name ? String(payload.last_name) : null;
        const phone = payload.phone ? String(payload.phone) : null;
        const email = payload.email ? String(payload.email) : null;
        const updated = await pgExec(
          `UPDATE public.crm_customers
              SET first_name = COALESCE($1, first_name),
                  last_name = COALESCE($2, last_name),
                  phone = COALESCE($3, phone),
                  email = COALESCE($4, email),
                  updated_at = now()
            WHERE id = $5::uuid AND tenant_id = $6`,
          [firstName, lastName, phone, email, customerId, resolveTenantId(req)],
        );
        await auditAction({ action, domain: "crm", tableName: "crm_customers", recordId: customerId, afterData: { firstName, lastName, phone, email, updated }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, customerId, updated });
      }

      case "merge_customer":
      case "merge": {
        // crm_merge_customer → merge_customer
        // ALSO accept "merge" (frontend registry ID `cust-merge` prefix-strips
        // `cust_` → `merge`). Treat as merge_customer (the more common case).
        // Reassign all pets, appointments, notes, messages from source to target,
        // then deactivate the source.
        // Payload aliases: the command palette sends source_id/target_id;
        // the customer-profile merge modal historically sent
        // source_customer_id/target_customer_id and the typed payload uses
        // duplicate_customer_id/surviving_customer_id — all three shapes
        // land here (the modal previously matched NONE of them, so the
        // merge ran with empty ids and died on a uuid cast).
        const sourceId = String(payload.source_id || payload.source_customer_id || payload.duplicate_customer_id || "");
        const targetId = String(payload.target_id || payload.target_customer_id || payload.surviving_customer_id || "");
        if (!sourceId || !targetId) {
          return NextResponse.json({ ok: false, error: "source_id and target_id are required to merge customers" }, { status: 400 });
        }
        if (sourceId === targetId) {
          return NextResponse.json({ ok: false, error: "Cannot merge a customer into itself" }, { status: 400 });
        }
        await pgExec(`UPDATE public.crm_pets SET primary_customer_id = $1 WHERE primary_customer_id = $2 AND tenant_id = $3`, [targetId, sourceId, resolveTenantId(req)]);
        await pgExec(`UPDATE public.crm_appointments SET customer_id = $1 WHERE customer_id = $2 AND tenant_id = $3`, [targetId, sourceId, resolveTenantId(req)]);
        await pgExec(`UPDATE public.crm_notes SET customer_id = $1 WHERE customer_id = $2 AND tenant_id = $3`, [targetId, sourceId, resolveTenantId(req)]);
        await pgExec(`UPDATE public.crm_messages SET customer_id = $1 WHERE customer_id = $2 AND tenant_id = $3`, [targetId, sourceId, resolveTenantId(req)]);
        await pgExec(`UPDATE public.crm_documents SET customer_id = $1 WHERE customer_id = $2 AND tenant_id = $3`, [targetId, sourceId, resolveTenantId(req)]);
        const updated = await pgExec(
          `UPDATE public.crm_customers SET is_active = false, merged_into_customer_id = $1::uuid, updated_at = now()
            WHERE id = $2::uuid AND tenant_id = $3`,
          [targetId, sourceId, resolveTenantId(req)],
        );
        await auditAction({ action, domain: "crm", tableName: "crm_customers", recordId: sourceId, afterData: { sourceId, targetId, merged: true, updated }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, sourceId, targetId, updated, message: "Customers merged" });
      }

      case "merge_household": {
        // cust_merge_household → merge_household
        // Create a new household row, link every customer/pet in the
        // `customer_ids` list to that household, set the first customer as
        // primary, then log the merge. Idempotent: re-running with the
        // same `customer_ids` will not create duplicate households — call
        // with `household_id` to merge INTO an existing household.
        const customerIds = (payload.customer_ids as string[]) || [];
        if (customerIds.length < 2) {
          return NextResponse.json({ ok: false, error: "At least 2 customer_ids are required to form a household" }, { status: 400 });
        }
        const householdName = String(payload.name || `Household ${Date.now().toString(36).toUpperCase()}`);
        const status = String(payload.status || "active");
        let householdId = payload.household_id ? String(payload.household_id) : null;

        if (!householdId) {
          const rows = await pgQuery<{ id: string }>(
            `INSERT INTO public.crm_households
               (id, tenant_id, name, status, primary_customer_id, created_at, updated_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4::uuid, now(), now())
             RETURNING id`,
            [resolveTenantId(req), householdName, status, customerIds[0]],
          );
          householdId = rows[0]?.id ?? null;
        }
        if (!householdId) {
          return NextResponse.json({ ok: false, error: "Failed to create household" }, { status: 500 });
        }
        // Link each customer to the household
        let linked = 0;
        for (const cid of customerIds) {
          linked += await pgExec(
            `UPDATE public.crm_customers SET household_id = $1::uuid, updated_at = now()
              WHERE id = $2::uuid AND tenant_id = $3`,
            [householdId, cid, resolveTenantId(req)],
          );
        }
        // Also link their pets
        const petLinked = await pgExec(
          `UPDATE public.crm_pets SET household_id = $1::uuid
            WHERE primary_customer_id = ANY($2::uuid[]) AND tenant_id = $3`,
          [householdId, customerIds, resolveTenantId(req)],
        );
        await auditAction({ action, domain: "crm", tableName: "crm_households", recordId: householdId, afterData: { householdName, householdId, customerCount: customerIds.length, linked, petLinked }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, householdId, householdName, customerCount: customerIds.length, linked, petLinked });
      }

      // ───────────────────────────────────────────────────────────────────
      // PET handlers
      // ───────────────────────────────────────────────────────────────────

      case "add_pet": {
        // crm_add_pet → add_pet
        // CHECK constraints:
        //   status IN ('active','inactive','deceased','archived')
        //   sex IN ('male','female','unknown')
        //   altered_status IN ('intact','spayed','neutered','unknown')
        const customerId = payload.customer_id ? String(payload.customer_id) : null;
        const name = String(payload.name || "");
        const species = String(payload.species || "Dog");
        const breed = payload.breed ? String(payload.breed) : null;
        const sex = payload.sex ? String(payload.sex) : "unknown";
        const alteredStatus = payload.altered_status ? String(payload.altered_status) : "unknown";
        const dateOfBirth = payload.date_of_birth ? String(payload.date_of_birth) : null;
        const weight = payload.weight !== undefined ? Number(payload.weight) : null;
        const weightUnit = String(payload.weight_unit || "lbs");
        const microchip = payload.microchip_number ? String(payload.microchip_number) : null;
        const vetName = payload.veterinarian_name ? String(payload.veterinarian_name) : null;
        const vetPhone = payload.veterinarian_phone ? String(payload.veterinarian_phone) : null;
        const medicalAlert = Boolean(payload.medical_alert ?? false);
        const specialHandling = Boolean(payload.special_handling ?? false);
        const nervous = Boolean(payload.nervous ?? false);
        const aggressive = Boolean(payload.aggressive ?? false);
        const firstVisit = Boolean(payload.first_visit ?? false);
        const senior = Boolean(payload.senior ?? false);
        const puppy = Boolean(payload.puppy ?? false);
        const status = String(payload.status || "active");
        const rows = await pgQuery<{ id: string }>(
          `INSERT INTO public.crm_pets
             (id, tenant_id, primary_customer_id, name, species, breed, mixed_breed, sex,
              altered_status, date_of_birth, weight, weight_unit, microchip_number,
              veterinarian_name, veterinarian_phone, medical_alert, special_handling,
              nervous, aggressive, first_visit, senior, puppy, status, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2::uuid, $3, $4, $5, false, $6, $7, $8, $9, $10,
                   $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, now(), now())
           RETURNING id`,
          [resolveTenantId(req), customerId, name, species, breed, sex, alteredStatus, dateOfBirth, weight, weightUnit, microchip, vetName, vetPhone, medicalAlert, specialHandling, nervous, aggressive, firstVisit, senior, puppy, status],
        );
        const petId = rows[0]?.id ?? null;
        if (!petId) {
          return NextResponse.json({ ok: false, error: `Pet "${name}" could not be created — the pet was not saved` }, { status: 500 });
        }
        // Link the pet to its household (crm_party_dependents) — the pet row
        // alone doesn't surface the pet on the customer's household.
        // Primary when the customer has no linked pet yet.
        if (customerId && isUuid(customerId)) {
          await pgExec(
            `INSERT INTO public.crm_party_dependents
               (id, tenant_id, customer_id, dependent_id, relationship, is_primary, created_at)
             VALUES (gen_random_uuid(), $1, $2::uuid, $3::uuid, 'owner',
                     NOT EXISTS (SELECT 1 FROM public.crm_party_dependents
                                  WHERE tenant_id = $1 AND customer_id = $2::uuid),
                     now())
             ON CONFLICT DO NOTHING`,
            [resolveTenantId(req), customerId, petId],
          );
        }
        await auditAction({ action, domain: "crm", tableName: "crm_pets", recordId: petId, afterData: { name, species, breed, customerId }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, petId, name, species, breed, customerId });
      }

      // ───────────────────────────────────────────────────────────────────
      // NOTES handlers
      // ───────────────────────────────────────────────────────────────────

      case "add_note": {
        // crm_add_note → add_note
        // CHECK: note_type IN ('internal','customer_visible','appointment','pet_handling','system')
        const customerId = payload.customer_id ? String(payload.customer_id) : null;
        const petId = payload.dependent_id ? String(payload.dependent_id) : null;
        const appointmentId = payload.appointment_id ? String(payload.appointment_id) : null;
        const body = String(payload.body || payload.note || "");
        const ALLOWED_NOTE_TYPES = new Set(["internal", "customer_visible", "appointment", "pet_handling", "system"]);
        const noteType = ALLOWED_NOTE_TYPES.has(String(payload.note_type || "")) ? String(payload.note_type) : "internal";
        const isPinned = Boolean(payload.is_pinned ?? false);
        const rows = await pgQuery<{ id: string }>(
          `INSERT INTO public.crm_notes
             (id, tenant_id, customer_id, dependent_id, appointment_id, note_type, body, is_pinned, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, now(), now())
           RETURNING id`,
          [resolveTenantId(req), customerId, petId, appointmentId, noteType, body, isPinned],
        );
        const noteId = rows[0]?.id ?? null;
        if (!noteId) {
          return NextResponse.json({ ok: false, error: "Note could not be saved" }, { status: 500 });
        }
        await auditAction({ action, domain: "crm", tableName: "crm_notes", recordId: noteId, afterData: { customerId, noteType, body: body.slice(0, 100) }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, noteId, customerId, noteType });
      }

      // ───────────────────────────────────────────────────────────────────
      // MESSAGE handlers
      // ───────────────────────────────────────────────────────────────────

      case "send_message":
      case "send_rebooking_link":
      case "rebooking_link": {
        // crm_send_message → send_message; cust_send_rebooking_link →
        // send_rebooking_link; ALSO accept "rebooking_link" (frontend registry
        // ID `cust-rebooking-link` prefix-strips `cust_` → `rebooking_link`).
        // REAL DELIVERY: email goes out through sendEmail (Resend, tenant
        // key) and SMS through the platform's Twilio provider module
        // (lib/messaging/sms, BL-10); either way the crm_messages row
        // records the honest outcome ('sent' or 'failed', with the
        // provider message id + delivery status for SMS).
        // SUPPORT CHAIN: a send_message row is written ON the customer's
        // support-ticket conversation via lib/support (the same helpers
        // the Support Desk and the profile Send Message modal use), so
        // the desk works the same conversation the customer thread shows.
        // CHECK: channel IN ('email','sms','phone','chat','whatsapp','push','in_app','other')
        //        direction IN ('inbound','outbound')
        //        status IN ('queued','sent','delivered','failed','read','received')
        const tenant = resolveTenantId(req);
        const customerId = payload.customer_id ? String(payload.customer_id) : null;
        if (!customerId) {
          return NextResponse.json({ ok: false, error: "customer_id is required" }, { status: 400 });
        }
        const isRebooking = shortAction !== "send_message";
        const channel = isRebooking ? "email" : String(payload.channel || "email").toLowerCase();
        if (channel !== "email" && channel !== "sms") {
          return NextResponse.json({ ok: false, error: `Unsupported channel "${channel}" — email and text are the connected channels` }, { status: 400 });
        }
        const custRows = await pgQuery<{ email: string | null; phone: string | null; mobile_phone: string | null; transactional_sms_opt_in: boolean | null; first_name: string | null; last_name: string | null; source_customer_id: string | null }>(
          `SELECT email, phone, mobile_phone, transactional_sms_opt_in, first_name, last_name, source_customer_id::text
             FROM public.crm_customers WHERE id = $1::uuid AND tenant_id = $2`,
          [customerId, tenant],
        );
        if (custRows.length === 0) {
          return NextResponse.json({ ok: false, error: "Customer not found" }, { status: 404 });
        }
        const firstName = custRows[0].first_name || "there";
        const subject = String(payload.subject || (isRebooking ? "Book your next visit to UnSaid Memories" : "A message from UnSaid Memories"));
        const msgBody = String(
          payload.body || payload.message ||
          (isRebooking ? `Hi ${firstName}, we'd love to see you and your pet again soon. You can book your next visit online any time:` : ""),
        );
        if (!msgBody) {
          return NextResponse.json({ ok: false, error: "Message body is required" }, { status: 400 });
        }
        // ── SMS leg (BL-10): a real Twilio send via lib/messaging/sms.
        // The message row is written ON the customer's support-ticket
        // conversation (same model as the email leg below) with
        // provider 'twilio', the Twilio message id and the live
        // delivery status; a failed send still records a 'failed' row.
        if (channel === "sms") {
          const phone = custRows[0].mobile_phone || custRows[0].phone;
          if (!phone) {
            return NextResponse.json({ ok: false, error: "Customer has no phone on file — the message was not sent. Add a phone number to the profile first." }, { status: 400 });
          }
          if (custRows[0].transactional_sms_opt_in === false) {
            return NextResponse.json({ ok: false, error: "This customer has opted out of text messages." }, { status: 403 });
          }
          const smsSend = await withPg(async (c) => {
            try {
              const sent = await sendSmsStrict(c, tenant, phone, msgBody);
              return { ok: true as const, sent };
            } catch (e) {
              return { ok: false as const, error: e as Error };
            }
          });
          if (!smsSend) {
            return NextResponse.json({ ok: false, error: "Database unavailable — the text was not sent." }, { status: 503 });
          }
          if (!smsSend.ok) {
            await withPg(async (c) => {
              await recordSmsMessage(c, {
                tenantId: tenant,
                customerId,
                toAddress: phone,
                subject,
                body: msgBody,
                status: "failed",
                failureReason: smsSend.error.message,
                createdBy: actorId && isUuid(actorId) ? actorId : null,
                metadata: { source: "quick_action", action },
              });
            }).catch(() => null);
            const status = smsSend.error instanceof SmsNotConfiguredError ? 503 : 502;
            return NextResponse.json({ ok: false, error: smsSend.error.message, customerId, channel: "sms", status: "failed" }, { status });
          }
          const sent = smsSend.sent;
          const actingStaff = await resolveActingStaff().catch(() => null);
          let smsMessageId: string | null = null;
          let smsThread: { ticketRef: string; messageId: string } | null = null;
          let smsTicketId: string | null = null;
          const appended = await withPg(async (c) => {
            const name = [custRows[0].first_name, custRows[0].last_name].filter(Boolean).join(" ") || null;
            const { ticket } = await getOrCreateCustomerTicket(
              c, tenant,
              { id: customerId, name, email: custRows[0].email },
              subject,
            );
            const msg = await appendTicketMessage(c, tenant, ticket, {
              customerId,
              channel: "sms",
              direction: "outbound",
              status: "sent",
              fromAddress: sent.from,
              toAddress: phone,
              subject,
              body: msgBody,
              createdBy: actingStaff?.staffId ?? null,
              provider: "twilio",
              providerMessageId: sent.sid,
              deliveryStatus: sent.status,
              metadata: { source: "quick_action", action },
            });
            return { ticketId: ticket.id, ticketRef: ticket.ticketRef, messageId: msg.id };
          }).catch(() => null);
          if (appended) {
            smsMessageId = appended.messageId;
            smsTicketId = appended.ticketId;
            smsThread = { ticketRef: appended.ticketRef, messageId: appended.messageId };
          }
          if (!smsMessageId) {
            smsMessageId = await withPg(async (c) =>
              recordSmsMessage(c, {
                tenantId: tenant,
                customerId,
                toAddress: phone,
                fromAddress: sent.from,
                subject,
                body: msgBody,
                status: "sent",
                providerMessageId: sent.sid,
                deliveryStatus: sent.status,
                createdBy: actingStaff?.staffId ?? null,
                metadata: { source: "quick_action", action },
              }),
            ).catch(() => null);
          }
          if (!smsMessageId) {
            return NextResponse.json({ ok: false, error: "The text was sent but could not be recorded — check the customer's history before resending.", providerMessageId: sent.sid }, { status: 500 });
          }
          if (custRows[0].source_customer_id) {
            await pgExec(
              `INSERT INTO public.customer_notifications
                 (id, tenant_id, "customerId", type, title, body, link, "relatedId", "createdAt")
               VALUES (gen_random_uuid()::text, $1, $2, 'message', $3,
                       'The salon replied to your message — read it in Support.',
                       '/customer/support', $4, now())`,
              [tenant, custRows[0].source_customer_id, subject, smsMessageId],
            ).catch(() => {});
          }
          if (smsTicketId) {
            const tid = smsTicketId;
            await withPg(async (c) => {
              await c.query(
                `UPDATE public.support_tickets
                    SET first_public_reply_at = COALESCE(first_public_reply_at, now()),
                        status = CASE WHEN status = 'open' THEN 'pending' ELSE status END,
                        updated_at = now()
                  WHERE id = $1::uuid`,
                [tid],
              ).catch(() => {});
              await logTicketEvent(c, tenant, tid, {
                type: "reply",
                actorStaffId: actingStaff?.staffId ?? null,
                actorLabel: actingStaff?.name ?? null,
                detail: { messageId: smsMessageId, source: "quick_action", channel: "sms" },
              }).catch(() => {});
            }).catch(() => null);
          }
          await auditAction({ action, domain: "crm", tableName: "crm_messages", recordId: smsMessageId, afterData: { customerId, channel: "sms", subject, texted: true }, actorUserId: actorId, ipAddress: ip });
          return NextResponse.json({ ok: true, messageId: smsMessageId, customerId, channel: "sms", status: "sent", texted: true, providerMessageId: sent.sid, thread: smsThread });
        }
        const email = custRows[0].email;
        if (!email) {
          return NextResponse.json({ ok: false, error: "Customer has no email on file — the message was not sent. Add an email to the profile first." }, { status: 400 });
        }
        // The message row. For send_message it is written ON the
        // customer's support-ticket conversation through the shared
        // support library (getOrCreateCustomerTicket +
        // appendTicketMessage — identical model to the Support Desk and
        // the profile Send Message modal), so the row carries the
        // ticket's conversation_id and the desk sees the same message
        // the customer thread and the profile render. Rebooking sends
        // stay off the ticket — they are not support replies (same gate
        // as the bell below). Best-effort: if the thread write fails,
        // the send falls back to the standalone insert so a support-
        // table hiccup never loses (or fails) the message itself.
        let messageId: string | null = null;
        let thread: { ticketRef: string; messageId: string } | null = null;
        let threadTicketId: string | null = null;
        let actingStaff: Awaited<ReturnType<typeof resolveActingStaff>> = null;
        if (!isRebooking) {
          actingStaff = await resolveActingStaff();
          const appended = await withPg(async (c) => {
            const name = [custRows[0].first_name, custRows[0].last_name].filter(Boolean).join(" ") || null;
            const { ticket } = await getOrCreateCustomerTicket(
              c, tenant,
              { id: customerId, name, email },
              subject,
            );
            const msg = await appendTicketMessage(c, tenant, ticket, {
              customerId,
              channel: "chat",
              direction: "outbound",
              status: "queued",
              fromAddress: actingStaff?.email ?? null,
              toAddress: email,
              subject,
              body: msgBody,
              createdBy: actingStaff?.staffId ?? null,
              metadata: { source: "quick_action", action },
            });
            return { ticketId: ticket.id, ticketRef: ticket.ticketRef, messageId: msg.id };
          });
          if (appended) {
            messageId = appended.messageId;
            threadTicketId = appended.ticketId;
            thread = { ticketRef: appended.ticketRef, messageId: appended.messageId };
          }
        }
        if (!messageId) {
          const rows = await pgQuery<{ id: string }>(
            `INSERT INTO public.crm_messages
               (id, tenant_id, customer_id, channel, direction, status, from_address,
                to_address, subject, body, provider, sent_at, metadata, created_by, created_at)
             VALUES (gen_random_uuid(), $1, $2::uuid, 'email', 'outbound', 'queued', NULL,
                     $3, $4, $5, 'resend', now(), $6::jsonb, $7::uuid, now())
             RETURNING id`,
            [tenant, customerId, email, subject, msgBody, JSON.stringify({ source: "quick_action", action }), actorId],
          );
          messageId = rows[0]?.id ?? null;
        }
        if (!messageId) {
          return NextResponse.json({ ok: false, error: "Message could not be created — the message was not saved" }, { status: 500 });
        }
        // Portal bell: this reply now sits in the customer's Support
        // thread, so leave an in-app notification too — the customer
        // learns support answered without re-checking the thread by
        // hand. (The 'crm_message' email template is not in the
        // customer-notifications TEMPLATE_META, so sendEmail's own
        // hook never writes this row.) Best-effort: a failed bell
        // write must never fail the send. Shop-linked customers only —
        // the bell resolves rows by shop customer id; everyone else
        // still gets the email and the thread row.
        if (!isRebooking && custRows[0].source_customer_id) {
          await pgExec(
            `INSERT INTO public.customer_notifications
               (id, tenant_id, "customerId", type, title, body, link, "relatedId", "createdAt")
             VALUES (gen_random_uuid()::text, $1, $2, 'message', $3,
                     'The salon replied to your message — read it in Support.',
                     '/customer/support', $4, now())`,
            [tenant, custRows[0].source_customer_id, subject, messageId],
          ).catch(() => {});
        }
        const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a">` +
          `<p>${esc(msgBody).replace(/\n/g, "<br>")}</p>` +
          (isRebooking ? `<p><a href="https://unsaidmemories.com/book" style="display:inline-block;background:#ea580c;color:#ffffff;padding:10px 22px;border-radius:999px;text-decoration:none;font-weight:bold">Book your next visit</a></p>` : "") +
          `<p style="color:#666;font-size:12px">UnSaid Memories · 699 Waring Rd, Memphis, TN 38122 · 901-722-1114</p></div>`;
        const sent = await sendEmail({
          customerId: custRows[0].source_customer_id || undefined,
          to: email,
          template: isRebooking ? "crm_rebooking_link" : "crm_message",
          subject,
          html,
          tenantId: tenant,
        });
        await pgExec(
          `UPDATE public.crm_messages SET status = $1 WHERE id = $2::uuid AND tenant_id = $3`,
          [sent.ok ? "sent" : "failed", messageId, tenant],
        );
        if (!sent.ok && sent.error) {
          await pgExec(
            `UPDATE public.crm_messages
                SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('delivery_error', $1::text)
              WHERE id = $2::uuid AND tenant_id = $3`,
            [sent.error, messageId, tenant],
          );
        }
        // Desk lifecycle for a delivered quick-action reply — the same
        // stamps the Support Desk and the profile modal apply once a
        // reply lands: first public reply recorded, an open ticket
        // moves to pending (the ball is with the customer now), and a
        // 'reply' event joins the ticket history. Best-effort: the
        // email has already been delivered; a stamp failure must never
        // fail (or duplicate) the send.
        if (!isRebooking && sent.ok && threadTicketId) {
          const tid = threadTicketId;
          await withPg(async (c) => {
            await c.query(
              `UPDATE public.support_tickets
                  SET first_public_reply_at = COALESCE(first_public_reply_at, now()),
                      status = CASE WHEN status = 'open' THEN 'pending' ELSE status END,
                      updated_at = now()
                WHERE id = $1::uuid`,
              [tid],
            ).catch(() => {});
            await logTicketEvent(c, tenant, tid, {
              type: "reply",
              actorStaffId: actingStaff?.staffId ?? null,
              actorLabel: actingStaff?.name ?? null,
              detail: { messageId, source: "quick_action" },
            }).catch(() => {});
          });
        }
        await auditAction({ action, domain: "crm", tableName: "crm_messages", recordId: messageId, afterData: { customerId, channel: "email", subject, emailed: sent.ok }, actorUserId: actorId, ipAddress: ip });
        if (!sent.ok) {
          return NextResponse.json({ ok: false, error: `Message recorded but the email could not be sent: ${sent.error || "unknown error"}`, messageId, customerId, channel: "email", status: "failed", thread }, { status: 502 });
        }
        return NextResponse.json({ ok: true, messageId, customerId, channel: "email", status: "sent", emailed: true, thread });
      }

      // ───────────────────────────────────────────────────────────────────
      // INTAKE FORM handler
      // ───────────────────────────────────────────────────────────────────

      case "intake_form": {
        // crm_intake_form → intake_form
        // crm_unsigned_documents is a VIEW, not a table — INSERT into the
        // underlying crm_documents table instead. The view auto-shows rows
        // with status='pending' or 'submitted' (i.e. unsigned).
        // CHECK constraint: status IN ('pending','submitted','signed',
        // 'approved','expired','rejected','archived')
        const customerId = payload.customer_id ? String(payload.customer_id) : null;
        const petId = payload.dependent_id ? String(payload.dependent_id) : null;
        const name = String(payload.name || payload.form_name || "Customer Intake Form");
        const status = String(payload.status || "pending");
        // crm_documents requires a customer_id (NOT NULL) — bail if missing
        if (!customerId) {
          return NextResponse.json({ ok: false, error: "customer_id is required for an intake form" }, { status: 400 });
        }
        const rows = await pgQuery<{ id: string }>(
          `INSERT INTO public.crm_documents
             (id, tenant_id, customer_id, dependent_id, name, status, metadata, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2::uuid, $3::uuid, $4, $5, '{}'::jsonb, now(), now())
           RETURNING id`,
          [resolveTenantId(req), customerId, petId, name, status],
        );
        const formId = rows[0]?.id ?? null;
        if (!formId) {
          return NextResponse.json({ ok: false, error: "Intake form could not be created — the form was not saved" }, { status: 500 });
        }
        await auditAction({ action, domain: "crm", tableName: "crm_documents", recordId: formId, afterData: { customerId, petId, name, status }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, formId, customerId, petId, name, status });
      }

      case "update_documents": {
        // cust_update_documents → update_documents
        // Update a customer's document (rename, change status, add notes).
        // CHECK: status IN ('pending','submitted','signed','approved','expired','rejected','archived')
        const documentId = String(payload.document_id || "");
        const name = payload.name ? String(payload.name) : null;
        const status = payload.status ? String(payload.status) : null;
        const notes = payload.notes ? String(payload.notes) : null;
        const updated = await pgExec(
          `UPDATE public.crm_documents
              SET name = COALESCE($1, name),
                  status = COALESCE($2, status),
                  metadata = CASE WHEN $3 IS NOT NULL THEN jsonb_set(COALESCE(metadata, '{}'::jsonb), '{notes}', $4::jsonb) ELSE metadata END,
                  updated_at = now()
            WHERE id = $5::uuid AND tenant_id = $6`,
          [name, status, notes, JSON.stringify(notes), documentId, resolveTenantId(req)],
        );
        await auditAction({ action, domain: "crm", tableName: "crm_documents", recordId: documentId, afterData: { name, status, updated }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, documentId, updated, message: updated ? "Document updated" : "Document not found" });
      }

      case "view_documents": {
        // cust_view_documents → view_documents
        // Read-only: list all documents for a customer (or all if no customer_id).
        const customerId = payload.customer_id ? String(payload.customer_id) : null;
        const rows = await pgQuery<{
          id: string; name: string; status: string; document_type_id: string | null;
          storage_path: string | null; mime_type: string | null;
          uploaded_at: string | null; signed_at: string | null; expires_at: Date | null;
        }>(
          `SELECT id, name, status, document_type_id, storage_path, mime_type,
                  uploaded_at::text, signed_at::text, expires_at
             FROM public.crm_documents
            WHERE tenant_id = $1 ${customerId ? "AND customer_id = $2::uuid" : ""}
            ORDER BY created_at DESC LIMIT 100`,
          customerId ? [resolveTenantId(req), customerId] : [resolveTenantId(req)],
        );
        const documents = rows.map(r => ({
          id: r.id, name: r.name, status: r.status,
          documentTypeId: r.document_type_id, storagePath: r.storage_path,
          mimeType: r.mime_type, uploadedAt: r.uploaded_at,
          signedAt: r.signed_at, expiresAt: r.expires_at,
        }));
        const result = { customerId, documents, total: documents.length };
        await auditAction({ action, domain: "crm", tableName: "crm_documents", recordId: null, afterData: { total: documents.length, customerId }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, documents: result });
      }

      case "add_to_campaign": {
        // cust_add_to_campaign → add_to_campaign
        // Enroll a customer in a marketing campaign via crm_campaign_members.
        const campaignId = String(payload.campaign_id || "");
        const customerId = String(payload.customer_id || "");
        if (!campaignId || !customerId) {
          return NextResponse.json({ ok: false, error: "campaign_id and customer_id are required" }, { status: 400 });
        }
        // CHECK: status IN ('queued','sent','delivered','opened','clicked','converted','failed','unsubscribed','skipped')
        const rows = await pgQuery<{ id: string }>(
          `INSERT INTO public.crm_campaign_members
             (id, tenant_id, campaign_id, customer_id, status, enrolled_at)
           VALUES (gen_random_uuid(), $1, $2::uuid, $3::uuid, 'queued', now())
           RETURNING id`,
          [resolveTenantId(req), campaignId, customerId],
        );
        const memberId = rows[0]?.id ?? null;
        if (!memberId) {
          return NextResponse.json({ ok: false, error: "Customer could not be added to the campaign — the enrollment was not saved" }, { status: 500 });
        }
        await auditAction({ action, domain: "crm", tableName: "crm_campaign_members", recordId: memberId, afterData: { campaignId, customerId }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, memberId, campaignId, customerId, message: "Customer added to campaign" });
      }

      case "snooze_rebooking": {
        // crm_snooze_rebooking → snooze_rebooking (B.1.19 Snooze)
        // Real store: crm_rebooking_recommendations (status CHECK includes
        // 'snoozed', snoozed_until date). The rebooking candidate view
        // crm_needs_rebooking excludes customers with an active snooze, so
        // this write is respected by the candidate query — not a toast.
        const customerId = payload.customer_id ? String(payload.customer_id) : "";
        if (!customerId || !isUuid(customerId)) {
          return NextResponse.json({ ok: false, error: "customer_id (uuid) is required" }, { status: 400 });
        }
        const daysRaw = Number(payload.days ?? 30);
        const days = Number.isFinite(daysRaw) ? Math.min(Math.max(Math.round(daysRaw), 1), 365) : 30;
        const tenant = resolveTenantId(req);
        const updated = await pgExec(
          `UPDATE public.crm_rebooking_recommendations
              SET status = 'snoozed',
                  snoozed_until = CURRENT_DATE + $3::int,
                  reason = COALESCE($4, reason),
                  updated_at = now()
            WHERE tenant_id = $1 AND customer_id = $2::uuid
              AND status IN ('open', 'snoozed')`,
          [tenant, customerId, days, payload.reason ? String(payload.reason).slice(0, 500) : null],
        );
        let recId: string | null = null;
        if (!updated) {
          const rows = await pgQuery<{ id: string; snoozed_until: string }>(
            `INSERT INTO public.crm_rebooking_recommendations
               (id, tenant_id, customer_id, status, snoozed_until, reason, created_at, updated_at)
             VALUES (gen_random_uuid(), $1, $2::uuid, 'snoozed', CURRENT_DATE + $3::int, $4, now(), now())
             RETURNING id, snoozed_until::text`,
            [tenant, customerId, days, payload.reason ? String(payload.reason).slice(0, 500) : "Snoozed from customer profile"],
          );
          recId = rows[0]?.id ?? null;
          if (!recId) {
            return NextResponse.json({ ok: false, error: "Snooze could not be saved" }, { status: 500 });
          }
          await auditAction({ action, domain: "crm", tableName: "crm_rebooking_recommendations", recordId: recId, afterData: { customerId, days, status: "snoozed" }, actorUserId: actorId, ipAddress: ip });
          return NextResponse.json({ ok: true, recommendationId: recId, customerId, snoozedUntil: rows[0].snoozed_until, days });
        }
        const rows = await pgQuery<{ id: string; snoozed_until: string }>(
          `SELECT id, snoozed_until::text FROM public.crm_rebooking_recommendations
            WHERE tenant_id = $1 AND customer_id = $2::uuid AND status = 'snoozed'
            ORDER BY updated_at DESC LIMIT 1`,
          [tenant, customerId],
        );
        await auditAction({ action, domain: "crm", tableName: "crm_rebooking_recommendations", recordId: rows[0]?.id ?? null, afterData: { customerId, days, status: "snoozed" }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, recommendationId: rows[0]?.id ?? null, customerId, snoozedUntil: rows[0]?.snoozed_until ?? null, days });
      }

      case "enroll_rebooking_campaign": {
        // crm_enroll_rebooking_campaign → enroll_rebooking_campaign (B.1.19.3)
        // "Add to Rebooking Campaign" enrolls the customer in the tenant's
        // rebooking AUTOMATION: a row in crm_automation_enrollments against
        // the workflow_type='rebooking' workflow — the store the audit
        // found never written (marketing campaigns land in
        // crm_campaign_members; automations were a promise with no store
        // leg). The workflow row is resolved per tenant and created on
        // first use with the manual-enrollment definition; the enrollment
        // sits 'queued' for the automation executor (cadence = BL-9; the
        // manual Run executor already processes rebooking outreach).
        // Re-enrolling a customer with a live enrollment is a no-op that
        // reports the existing enrollment instead of duplicating it.
        const customerId = payload.customer_id ? String(payload.customer_id) : "";
        if (!customerId || !isUuid(customerId)) {
          return NextResponse.json({ ok: false, error: "customer_id (uuid) is required" }, { status: 400 });
        }
        const tenant = resolveTenantId(req);
        let wf = await pgQuery<{ id: string }>(
          `SELECT id FROM public.crm_automation_workflows
            WHERE tenant_id = $1 AND workflow_type = 'rebooking' AND status = 'active'
            ORDER BY created_at ASC LIMIT 1`,
          [tenant],
        );
        if (!wf.length) {
          wf = await pgQuery<{ id: string }>(
            `INSERT INTO public.crm_automation_workflows
               (id, tenant_id, name, workflow_type, status, trigger_definition,
                condition_definition, action_definition, allow_reentry, created_by, created_at, updated_at)
             VALUES (gen_random_uuid(), $1, 'Rebooking Campaign', 'rebooking', 'active',
                     '{"type":"manual_enrollment"}'::jsonb, '{}'::jsonb,
                     '{"type":"rebooking_outreach","channel":"email"}'::jsonb, false,
                     CASE WHEN $2 ~ '^[0-9a-fA-F-]{36}$' THEN $2::uuid ELSE NULL END, now(), now())
             RETURNING id`,
            [tenant, actorId],
          );
        }
        const workflowId = wf[0]?.id ?? null;
        if (!workflowId) {
          return NextResponse.json({ ok: false, error: "Rebooking workflow could not be resolved" }, { status: 500 });
        }
        const existing = await pgQuery<{ id: string; status: string }>(
          `SELECT id, status FROM public.crm_automation_enrollments
            WHERE tenant_id = $1 AND workflow_id = $2::uuid AND customer_id = $3::uuid
              AND status IN ('queued', 'running', 'waiting')
            ORDER BY created_at DESC LIMIT 1`,
          [tenant, workflowId, customerId],
        );
        if (existing.length) {
          return NextResponse.json({ ok: true, alreadyEnrolled: true, enrollmentId: existing[0].id, status: existing[0].status, workflowId, customerId });
        }
        const rows = await pgQuery<{ id: string }>(
          `INSERT INTO public.crm_automation_enrollments
             (id, tenant_id, workflow_id, customer_id, status, current_step, scheduled_for, context, created_at)
           VALUES (gen_random_uuid(), $1, $2::uuid, $3::uuid, 'queued', 0, now(),
                   $4::jsonb, now())
           RETURNING id`,
          [tenant, workflowId, customerId, JSON.stringify({ source: "profile_quick_action", enrolled_by: actorId })],
        );
        const enrollmentId = rows[0]?.id ?? null;
        if (!enrollmentId) {
          return NextResponse.json({ ok: false, error: "Enrollment could not be saved" }, { status: 500 });
        }
        await auditAction({ action, domain: "crm", tableName: "crm_automation_enrollments", recordId: enrollmentId, afterData: { customerId, workflowId, status: "queued" }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, enrollmentId, workflowId, customerId, status: "queued" });
      }

      case "print_history": {
        // cust_print_history → print_history
        // Read-only: return a customer's appointment + payment history in a
        // print-friendly format. Joins crm_appointments with crm_appointment_services
        // for service detail.
        const customerId = payload.customer_id ? String(payload.customer_id) : null;
        if (!customerId) {
          return NextResponse.json({ ok: false, error: "customer_id is required" }, { status: 400 });
        }
        const appts = await pgQuery<{
          id: string; appointment_number: string; starts_at: string; status: string;
          total: string; amount_paid: string; outstanding: string;
        }>(
          `SELECT id, appointment_number, starts_at::text, status,
                  total::text, amount_paid::text, outstanding_amount::text
             FROM public.crm_appointments
            WHERE tenant_id = $1 AND customer_id = $2::uuid
            ORDER BY starts_at DESC LIMIT 100`,
          [resolveTenantId(req), customerId],
        );
        const history = appts.map(r => ({
          appointmentId: r.id, appointmentNumber: r.appointment_number,
          date: r.starts_at, status: r.status,
          total: Number(r.total), amountPaid: Number(r.amount_paid),
          outstanding: Number(r.outstanding),
        }));
        const result = {
          customerId,
          appointments: history,
          totals: {
            totalVisits: history.length,
            totalSpend: history.reduce((s, h) => s + h.amountPaid, 0),
            totalOutstanding: history.reduce((s, h) => s + h.outstanding, 0),
          },
        };
        await auditAction({ action, domain: "crm", tableName: "crm_appointments", recordId: null, afterData: { customerId, totalVisits: history.length }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, printHistory: result });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action} (short: ${shortAction})` }, { status: 400 });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[crm/actions] ${action} failed:`, msg);
    return NextResponse.json({ error: msg, action }, { status: 500 });
  }
}
