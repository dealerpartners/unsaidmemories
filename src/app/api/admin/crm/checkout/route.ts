import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgExec, pgQuery, getPg } from "@/lib/pg";
import { auditAction, getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { postBalancedJournalEntry, clientQuery } from "@/lib/accounting/journal";
import { accrueCommissionsForAppointment, runnerFromPool } from "@/lib/crm/commissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/crm/checkout
// Process a customer checkout: creates receipt in acct_ar_receipts,
// marks appointment complete if appointment_id provided.
export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("payments", "write");
  if (gate) return gate;

  let customer_id = "";
  let appointment_id: string | null = null;
  let payment_method = "cash";
  let amount = 0;
  let notes = "";

  try {
    const body = await req.json();
    customer_id = String(body.customer_id || "");
    appointment_id = body.appointment_id ? String(body.appointment_id) : null;
    payment_method = String(body.payment_method || "cash");
    amount = Number(body.amount || 0);
    notes = String(body.notes || "");
  } catch (e) {
    return NextResponse.json({ error: `Invalid request body: ${e instanceof Error ? e.message : "unknown"}` }, { status: 400 });
  }

  if (!customer_id) return NextResponse.json({ error: "customer_id is required" }, { status: 400 });
  if (amount <= 0) return NextResponse.json({ error: "amount must be greater than 0" }, { status: 400 });

  const tenant = resolveTenantId(req);
  const actorId = await getActorIdFromRequest(req);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  try {
    // 1. Create receipt
    const receiptRows = await pgQuery<{ id: string }>(
      `INSERT INTO public.acct_ar_receipts (tenant_id, customer_id, amount, payment_method, notes, received_at)
       VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id::text`,
      [tenant, customer_id, amount, payment_method, notes || null],
    );
    const receiptId = receiptRows[0]?.id;

    // 2. Mark appointment complete if provided. Checkout IS the payment
    // processing event for this appointment, so the §1.4.5q "Processed
    // Payment Sent" state is stamped in the same write (first wins).
    if (appointment_id) {
      await pgExec(
        `UPDATE public.crm_appointments
            SET status = 'completed',
                processed_payment_sent_at = COALESCE(processed_payment_sent_at, NOW()),
                updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2`,
        [appointment_id, tenant],
      );
    }

    // 2b. Commission accrual for the groomer whose appointment just
    // completed (profile rate → crm_commission_entries). Best-effort,
    // same posture as the journal entry below.
    let commissionAccrual: unknown = undefined;
    if (appointment_id) {
      try {
        commissionAccrual = await accrueCommissionsForAppointment(runnerFromPool(), tenant, appointment_id, "admin_checkout");
      } catch (ce) {
        console.error("[crm/checkout] commission accrual failed (non-blocking):", ce instanceof Error ? ce.message : ce);
      }
    }

    // 3. Post a balanced journal entry (booking revenue → GL).
    // Debit: cash/checking (by payment method). Credit: service revenue.
    // Best-effort: a GL failure is logged but never blocks the checkout —
    // the receipt above is the primary money record.
    let journalEntryId: string | null = null;
    try {
      const client = await getPg();
      try {
        const pm = payment_method.toLowerCase();
        const debitCode = pm === "cash" || pm === "check" ? "1000" : "1010";
        journalEntryId = await postBalancedJournalEntry(clientQuery(client), tenant, {
          source: "booking_checkout",
          sourceId: receiptId || null,
          reference: appointment_id,
          memo: `Booking checkout${appointment_id ? ` ${appointment_id}` : ""} — $${amount.toFixed(2)} via ${payment_method}`,
          lines: [
            { accountCode: debitCode, debit: amount, credit: 0, memo: `Payment (${payment_method})` },
            { accountCode: "4100", debit: 0, credit: amount, memo: "Service revenue" },
          ],
        });
      } finally {
        client.release();
      }
    } catch (je) {
      console.error(`[crm/checkout] journal post failed (non-blocking):`, je instanceof Error ? je.message : je);
    }

    await auditAction({
      action: "crm_checkout", domain: "crm", tableName: "acct_ar_receipts",
      recordId: receiptId || null,
      afterData: { customer_id, appointment_id, amount, payment_method, journalEntryId },
      actorUserId: actorId, ipAddress: ip,
    });

    return NextResponse.json({
      ok: true,
      receiptId,
      journalEntryId,
      ...(commissionAccrual ? { commission: commissionAccrual } : {}),
      message: `Checkout complete: $${amount.toFixed(2)} via ${payment_method}`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[crm/checkout] failed:`, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
