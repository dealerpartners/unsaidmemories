import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg, platformAudit } from "@/lib/crm/enterprise";
import { getPg } from "@/lib/pg";
import { postBalancedJournalEntry, clientQuery } from "@/lib/accounting/journal";

/** Best-effort GL posting for refunds — logs failure, never blocks the refund. */
async function postRefundGl(
  tenantId: string,
  amount: number,
  memo: string,
  sourceId?: string | null,
): Promise<string | null> {
  if (!(amount > 0)) return null;
  try {
    const client = await getPg();
    try {
      return await postBalancedJournalEntry(clientQuery(client), tenantId, {
        source: "refund",
        sourceId: sourceId || null,
        memo,
        lines: [
          { accountCode: "4000", debit: amount, credit: 0, memo: "Revenue reversal" },
          { accountCode: "1000", debit: 0, credit: amount, memo: "Cash refunded" },
        ],
      });
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("[api/admin/refunds] GL post failed (non-blocking):", e instanceof Error ? e.message : e);
    return null;
  }
}

// commerce_payments.payment_number and payment_method_id are NOT NULL —
// refund ledger rows need both. The method falls back to the tenant's
// manual-cash method, then any active method (the same chain the finance
// take_payment action uses).
async function refundLedgerFields(client: any, tenant: string): Promise<{ paymentNumber: string; methodId: string } | null> {
  const r = await client.query(
    `SELECT id::text AS id FROM public.commerce_payment_methods
      WHERE tenant_id = $1 AND active = true
      ORDER BY (code = 'manual_cash') DESC, (method_type = 'cash') DESC, id
      LIMIT 1`,
    [tenant],
  );
  if (!r.rows[0]?.id) return null;
  return { paymentNumber: `PAY-${Date.now().toString(36).toUpperCase()}`, methodId: String(r.rows[0].id) };
}

// ============================================================================
// /api/admin/refunds
//   GET  — list all commerce_refunds + commerce_disputes (joined with orders)
//   POST — process a refund via Stripe + record in commerce_payments
// ============================================================================

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("refunds_disputes", "read");
  if (gate) return gate;

  const rows = await withPg(async (client) => {
    const tenant = resolveTenantId(req);

    // Fetch commerce_refunds joined with commerce_sales for customer info
    const { rows: refunds } = await client.query(`
      SELECT r.id::text, r.refund_number, r.sale_id::text AS sale_id,
             r.amount, r.reason, r.status, r.refund_method,
             r.store_credit_id::text AS store_credit_id,
             r.processor_reference, r.created_at::text AS created_at,
             r.processed_at::text AS processed_at, r.created_by::text AS created_by,
             r.requires_approval, r.approved_at, r.rejected_at,
             s.customer_id::text AS customer_id,
             s.total::float AS sale_total,
             s.metadata->>'customer_email' AS customer_email
      FROM public.commerce_refunds r
      LEFT JOIN public.commerce_sales s ON s.id = r.sale_id
      WHERE r.tenant_id = $1
      ORDER BY r.created_at DESC
    `, [tenant]);

    // Fetch commerce_disputes
    const { rows: disputes } = await client.query(`
      SELECT d.id::text, d.dispute_number, d.refund_id::text AS refund_id,
             d.payment_id::text AS payment_id, d.sale_id::text AS sale_id,
             d.reason, d.status, d.amount, d.processor_dispute_id,
             d.created_at::text AS created_at
      FROM public.commerce_disputes d
      WHERE d.tenant_id = $1
      ORDER BY d.created_at DESC
    `, [tenant]);

    // Fetch commerce_refund_lines for each refund
    const refundIds = refunds.map((r: any) => r.id);
    let linesByRefund = new Map<string, any[]>();
    if (refundIds.length > 0) {
      const { rows: lines } = await client.query(
        `SELECT rl.id::text, rl.refund_id::text AS refund_id, rl.sale_line_id::text AS sale_line_id,
                rl.quantity, rl.amount, rl.restock, rl.disposition,
                sl.description AS item_name
         FROM public.commerce_refund_lines rl
         LEFT JOIN public.commerce_sale_lines sl ON sl.id = rl.sale_line_id
         WHERE rl.refund_id::text = ANY($1::text[])`,
        [refundIds],
      );
      for (const l of lines) {
        const arr = linesByRefund.get(l.refund_id) || [];
        arr.push(l);
        linesByRefund.set(l.refund_id, arr);
      }
    }

    // Summary KPIs — computed from live data, never hardcoded.
    const { rows: sumRows } = await client.query(`
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE)), 0)::float AS mtd_refunded,
        COUNT(*)::int AS total_count,
        COUNT(*) FILTER (WHERE status IN ('completed','refunded','succeeded'))::int AS completed_count,
        COUNT(*) FILTER (WHERE requires_approval AND approved_at IS NULL AND rejected_at IS NULL)::int AS pending_approval,
        COALESCE(SUM(amount), 0)::float AS all_time_refunded
      FROM public.commerce_refunds WHERE tenant_id = $1
    `, [tenant]);
    const { rows: dispRows } = await client.query(`
      SELECT COUNT(*)::int AS dispute_count,
             COALESCE(SUM(amount), 0)::float AS dispute_amount
      FROM public.commerce_disputes WHERE tenant_id = $1 AND status NOT IN ('lost','won','closed')
    `, [tenant]);
    const { rows: scRows } = await client.query(`
      SELECT COALESCE(SUM(balance) FILTER (WHERE status = 'active'), 0)::float AS sc_outstanding,
             COALESCE(SUM(original_amount) FILTER (WHERE issued_at >= date_trunc('month', CURRENT_DATE)), 0)::float AS sc_issued_mtd
      FROM public.commerce_store_credits WHERE tenant_id = $1
    `, [tenant]);
    const { rows: payRows } = await client.query(`
      SELECT COALESCE(SUM(amount) FILTER (WHERE status IN ('succeeded','completed','paid')), 0)::float AS gross
      FROM public.commerce_payments WHERE tenant_id = $1 AND created_at >= date_trunc('month', CURRENT_DATE)
    `, [tenant]);
    const s = sumRows[0] || {};
    const gross = Number(payRows[0]?.gross || 0);
    const mtdRefunded = Number(s.mtd_refunded || 0);
    const summary = {
      totalRefundedMtd: mtdRefunded,
      refundTransactions: Number(s.total_count || 0),
      allRefunds: Number(s.total_count || 0),
      completed: Number(s.completed_count || 0),
      pendingApproval: Number(s.pending_approval || 0),
      disputes: Number(dispRows[0]?.dispute_count || 0),
      disputeAmount: Number(dispRows[0]?.dispute_amount || 0),
      storeCreditIssuedMtd: Number(scRows[0]?.sc_issued_mtd || 0),
      storeCreditOutstanding: Number(scRows[0]?.sc_outstanding || 0),
      refundRate: gross > 0 ? (mtdRefunded / gross) * 100 : 0,
    };

    // Non-standard classification (D2): a refund is STANDARD when it is
    // an ordinary processor refund against a sale, inside the sale's
    // total, with no approval hold and no store-credit settlement.
    // Anything else is NON-STANDARD and carries its reasons — each one
    // a fact on the row, never a guess:
    //   no_processor_reference  settled outside the processor (manual)
    //   awaiting_approval       threshold-held, undecided
    //   exceeds_sale_total      refund larger than the sale it refunds
    //   store_credit_settled    settled as store credit, not cash
    // The desk filters on ?classification=standard|non_standard.
    const classified = refunds.map((r: any) => {
      const reasons: string[] = [];
      if (!r.processor_reference) reasons.push("no_processor_reference");
      if (r.requires_approval && !r.approved_at && !r.rejected_at) reasons.push("awaiting_approval");
      if (r.sale_total != null && Number(r.amount) > Number(r.sale_total)) reasons.push("exceeds_sale_total");
      if (r.store_credit_id) reasons.push("store_credit_settled");
      return {
        ...r,
        lines: linesByRefund.get(r.id) || [],
        classification: reasons.length ? "non_standard" : "standard",
        classification_reasons: reasons,
      };
    });
    const wantClass = (req.nextUrl.searchParams.get("classification") || "").trim();
    const visible =
      wantClass === "standard" || wantClass === "non_standard"
        ? classified.filter((r: any) => r.classification === wantClass)
        : classified;

    return {
      refunds: visible,
      disputes,
      summary: {
        ...summary,
        nonStandard: classified.filter((r: any) => r.classification === "non_standard").length,
        standard: classified.filter((r: any) => r.classification === "standard").length,
      },
    };
  });

  return NextResponse.json(rows || { refunds: [], disputes: [] });
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("refunds_disputes", "write"); if (gate) return gate;

  let body: any; try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const amount = parseFloat(String(body.amount || "0"));
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "Valid amount is required" }, { status: 400 });
  }
  const reason = String(body.reason || "requested_by_customer");

  // Try Stripe refund if the Stripe SDK is available
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (stripeKey && (body.paymentIntentId || body.chargeId)) {
    try {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(stripeKey);
      const refundParams: any = { amount: Math.round(amount * 100), reason };
      if (body.paymentIntentId) refundParams.payment_intent = body.paymentIntentId;
      if (body.chargeId) refundParams.charge = body.chargeId;
      const refund = await stripe.refunds.create(refundParams);
      // Record in commerce_payments AND commerce_refunds (so it appears in the refunds table)
      let paymentRowId: string | null = null;
      let ledgerFailed = false;
      const ledgerOut = await withPg(async (client) => {
        const tenant = resolveTenantId(req);
        try {
          await client.query("SAVEPOINT refund_sp");
          const ledger = await refundLedgerFields(client, tenant);
          if (!ledger) throw new Error("No payment method available for the refund ledger row");
          const payIns = await client.query(
            `INSERT INTO public.commerce_payments
               (tenant_id, payment_number, payment_method_id, customer_id, amount, status, currency, processor_transaction_id, external_reference, created_at)
             VALUES ($1::uuid, $2, $3::uuid, $4, $5::numeric, 'refunded', 'USD', $6, $7, now()) RETURNING id::text`,
            [tenant, ledger.paymentNumber, ledger.methodId, body.customerId || null, amount.toFixed(2), refund.id, `refund_${reason}`],
          );
          paymentRowId = payIns.rows[0]?.id ?? null;
          await client.query(
            `INSERT INTO public.commerce_refunds
               (id, tenant_id, refund_number, payment_id, amount, reason, status,
                processor_reference, refund_method, created_at, processed_at)
             VALUES (gen_random_uuid(), $1::uuid, $2, $3::uuid, $4::numeric, $5, 'completed', $6, 'original_payment', now(), now())`,
            [tenant, `RFN-${Date.now().toString(36).toUpperCase()}`, paymentRowId, amount.toFixed(2), reason, refund.id],
          );
          await platformAudit(client, {
            action: "refund.processed",
            targetType: "commerce_payment",
            targetId: refund.id,
            actorRole: "admin",
            metadata: { amount, reason, customerId: body.customerId || null },
          });
          await client.query("RELEASE SAVEPOINT refund_sp");
        } catch (dbErr) {
          console.warn("[api/admin/refunds POST] refund ledger insert failed:", dbErr instanceof Error ? dbErr.message : dbErr);
          await client.query("ROLLBACK TO SAVEPOINT refund_sp").catch(() => {});
          ledgerFailed = true;
        }
      });
      if (ledgerOut === null) ledgerFailed = true;
      if (ledgerFailed) {
        return NextResponse.json({
          error: `Stripe refund ${refund.id} succeeded, but the ledger rows were not recorded — reconcile this refund before reporting it as complete.`,
          refundId: refund.id, amount, status: refund.status, ledgerRecorded: false,
        }, { status: 500 });
      }
      // GL: reverse the sale — debit revenue (4000), credit cash (1000). Best-effort.
      const stripeJe = await postRefundGl(resolveTenantId(req), amount, `Stripe refund ${refund.id} — $${amount.toFixed(2)} (${reason})`, refund.id);
      return NextResponse.json({ ok: true, refundId: refund.id, amount, status: refund.status, journalEntryId: stripeJe });
    } catch (stripeErr: any) {
      console.error("[api/admin/refunds POST] Stripe refund failed:", stripeErr?.message);
      return NextResponse.json({ error: `Stripe refund failed: ${stripeErr?.message}` }, { status: 502 });
    }
  }

  // No Stripe payment intent — record the refund in the ledger AND commerce_refunds.
  // Two designed behaviors the old handler bypassed entirely:
  //  • Approval policy (policy_settings refunds.approval_required_above_cents):
  //    refunds at/above the threshold land as 'requires_approval' with NO
  //    payment-ledger row and NO journal entry — both happen at approval
  //    (SA-63, fin_approve_refund).
  //  • Payout type: 'store_credit' converts the refund to a real store
  //    credit (commerce_store_credits row linked via store_credit_id) with
  //    GL Dr 4000 / Cr 2310 — no cash moves. Anything else is a cash/manual
  //    refund with GL Dr 4000 / Cr 1000.
  // The caller-supplied reference (invoice / txn id from the issue modal)
  // is persisted on the payment row's external_reference + the audit row —
  // it used to be silently dropped.
  const refundMethod = String(body.refund_method || body.refundMethod || "manual");
  const isStoreCredit = refundMethod === "store_credit";
  const reference = body.reference ? String(body.reference).slice(0, 200) : null;
  return withPg(async (client) => {
    const tenant = resolveTenantId(req);
    const pol = await client.query(
      `SELECT value FROM public.policy_settings
        WHERE tenant_id = $1 AND scope = 'refunds' AND key = 'approval_required_above_cents'`,
      [tenant],
    ).catch(() => ({ rows: [] as any[] }));
    const thresholdCents = Number(pol.rows[0]?.value ?? 10000);
    const requiresApproval = thresholdCents > 0 && Math.round(amount * 100) >= thresholdCents;
    await client.query("BEGIN");
    try {
      const refundNumber = `RFN-${Date.now().toString(36).toUpperCase()}`;
      let paymentId: string | null = null;
      let storeCreditId: string | null = null;
      if (!requiresApproval && !isStoreCredit) {
        const ledger = await refundLedgerFields(client, tenant);
        if (!ledger) {
          await client.query("ROLLBACK").catch(() => {});
          return NextResponse.json({ error: "No payment method available — configure one in /admin/financial-settings" }, { status: 400 });
        }
        const ins = await client.query(
          `INSERT INTO public.commerce_payments
             (tenant_id, payment_number, payment_method_id, customer_id, amount, status, currency, external_reference, created_at)
           VALUES ($1::uuid, $2, $3::uuid, $4, $5::numeric, 'refunded', 'USD', $6, now()) RETURNING id::text`,
          [tenant, ledger.paymentNumber, ledger.methodId, body.customerId || null, amount.toFixed(2), reference || `manual_refund_${reason}`],
        );
        paymentId = ins.rows[0].id;
      }
      if (!requiresApproval && isStoreCredit) {
        const creditNumber = `SC-${Date.now().toString(36).toUpperCase()}`;
        const sc = await client.query(
          `INSERT INTO public.commerce_store_credits
             (id, tenant_id, credit_number, customer_id, original_amount, balance, currency, status, issued_at)
           VALUES (gen_random_uuid(), $1::uuid, $2, $3, $4::numeric, $4::numeric, 'USD', 'active', now())
           RETURNING id::text`,
          [tenant, creditNumber, body.customerId || null, amount.toFixed(2)],
        );
        storeCreditId = sc.rows[0].id;
      }
      const rf = await client.query(
        `INSERT INTO public.commerce_refunds
           (id, tenant_id, refund_number, payment_id, store_credit_id, amount, reason, status,
            refund_method, requires_approval, created_at, processed_at)
         VALUES (gen_random_uuid(), $1::uuid, $2, $3::uuid, $4::uuid, $5::numeric, $6, $7, $8, $9, now(), $10)
         RETURNING id::text`,
        [
          tenant, refundNumber, paymentId, storeCreditId, amount.toFixed(2), reason,
          requiresApproval ? "requires_approval" : "completed",
          isStoreCredit ? "store_credit" : "manual",
          requiresApproval,
          requiresApproval ? null : new Date().toISOString(),
        ],
      );
      const refundId = rf.rows[0].id;
      try {
        await client.query("SAVEPOINT audit_sp");
        await platformAudit(client, {
          action: requiresApproval ? "refund.pending_approval" : "refund.processed",
          targetType: "commerce_refund",
          targetId: refundId,
          actorRole: "admin",
          metadata: { amount, reason, customerId: body.customerId || null, manual: true, reference, refundMethod: isStoreCredit ? "store_credit" : "manual", requiresApproval },
        });
        await client.query("RELEASE SAVEPOINT audit_sp");
      } catch { await client.query("ROLLBACK TO SAVEPOINT audit_sp").catch(() => {}); }
      await client.query("COMMIT");
      if (requiresApproval) {
        return NextResponse.json({ ok: true, refundId, refundNumber, amount, status: "requires_approval", requiresApproval: true, message: `Refund of $${amount.toFixed(2)} is at/above the approval threshold — it is pending approval and no money has moved yet` }, { status: 201 });
      }
      // GL at issue (completed refunds only): cash → Dr 4000 / Cr 1000;
      // store credit → Dr 4000 / Cr 2310 (liability, no cash). Best-effort.
      let manualJe: string | null = null;
      if (isStoreCredit) {
        try {
          const c2 = await getPg();
          try {
            manualJe = await postBalancedJournalEntry(clientQuery(c2), tenant, {
              source: "refund",
              sourceId: refundId,
              memo: `Refund to store credit ${refundNumber} — $${amount.toFixed(2)} (${reason})`,
              lines: [
                { accountCode: "4000", debit: amount, credit: 0, memo: "Revenue reversal" },
                { accountCode: "2310", debit: 0, credit: amount, memo: "Store credit liability" },
              ],
            });
          } finally { c2.release(); }
        } catch (e) { console.error("[api/admin/refunds] store-credit GL post failed (non-blocking):", e instanceof Error ? e.message : e); }
      } else {
        manualJe = await postRefundGl(tenant, amount, `Manual refund — $${amount.toFixed(2)} (${reason})`, paymentId);
      }
      return NextResponse.json({ ok: true, refundId, refundNumber, paymentId, storeCreditId, amount, status: "refunded", journalEntryId: manualJe }, { status: 201 });
    } catch (e: any) {
      await client.query("ROLLBACK").catch(() => {});
      return NextResponse.json({ error: e?.message }, { status: 500 });
    }
  }).then((r) => r ?? NextResponse.json({ error: "DB unavailable" }, { status: 503 }))
    .catch((e: any) => NextResponse.json({ error: e?.message }, { status: 500 }));
}
