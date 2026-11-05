import { createServerClient } from "@/lib/supabase";
import { postJournal, round2, nextNumber } from "@/lib/accounting";
import type Stripe from "stripe";

type DB = ReturnType<typeof createServerClient>;

/**
 * Stripe money events → Accounting records. The sale journal is
 * posted by order-ledger.ts when a payment succeeds; this module
 * wires the three money movements that used to stop at Stripe:
 *
 *   1. payout.paid — the clearing account settles to the bank:
 *      an acct_payouts row (gross / fees / refunds / chargebacks
 *      broken out from the payout's balance transactions), a
 *      journal Dr operating bank / Cr 1010 Stripe Clearing for the
 *      NET amount, and an acct_bank_transactions row so the
 *      reconciliation workbench has the real deposit to match.
 *   2. charge.refunded — every succeeded Stripe refund becomes an
 *      acct_refunds row (issued) + journal Dr 4020 / Cr 1010,
 *      mirroring the admin refunds API exactly.
 *   3. charge.dispute.created / .closed — a chargeback becomes an
 *      acct_disputes row + journal Dr 6040 / Cr 1010 (Stripe pulls
 *      the funds at creation), mirroring the admin disputes API.
 *      A dispute WON reverses that journal; a dispute lost needs
 *      no second entry — the money already left at creation.
 *
 * Every poster is idempotent on the Stripe object id, and callers
 * wrap them so a failure here never fails the webhook — the money
 * already moved; the records heal on redelivery.
 */

const isoDate = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString().slice(0, 10);
const isoTs = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString();

async function entityId(sb: DB, tenantId: string): Promise<string | null> {
  const { data } = await sb
    .from("acct_entities")
    .select("id")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

async function orderForPaymentIntent(
  sb: DB,
  tenantId: string,
  paymentIntentId: string | null,
): Promise<{ id: string; crmCustomerId: string | null } | null> {
  if (!paymentIntentId) return null;
  const { data: order } = await sb
    .from("orders")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  if (!order) return null;
  const { data: twin } = await sb
    .from("erp_orders")
    .select("crm_customer_id")
    .eq("tenant_id", tenantId)
    .eq("source_order_id", order.id)
    .maybeSingle();
  return { id: order.id as string, crmCustomerId: (twin?.crm_customer_id as string) ?? null };
}

/* ------------------------------ payouts ------------------------------ */

export async function postStripePayout(
  sb: DB,
  stripe: Stripe,
  tenantId: string,
  payout: Stripe.Payout,
): Promise<string | null> {
  const { data: prior } = await sb
    .from("acct_payouts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("provider", "stripe")
    .eq("provider_payout_id", payout.id)
    .maybeSingle();
  if (prior) return prior.id as string;

  const net = round2((payout.amount ?? 0) / 100);

  // Break the payout down from its balance transactions so the
  // settlement screens show real gross / fees / refunds /
  // chargebacks instead of a single net lump. If that read fails,
  // the payout still records with net-only figures and the
  // fallback is stated in metadata — never invented numbers.
  let gross = 0;
  let fees = 0;
  let refunds = 0;
  let chargebacks = 0;
  let breakdownOk = false;
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  try {
    const txns = await stripe.balanceTransactions.list({ payout: payout.id, limit: 100 });
    for (const t of txns.data) {
      const amt = Number(t.amount ?? 0) / 100;
      const fee = Number(t.fee ?? 0) / 100;
      if (t.type === "charge" || t.type === "payment") {
        gross = round2(gross + amt);
        fees = round2(fees + fee);
      } else if (t.type === "refund" || t.type === "payment_refund") {
        refunds = round2(refunds + Math.abs(amt));
        fees = round2(fees + fee);
      } else if (t.type === "chargeback" || t.type === "dispute") {
        chargebacks = round2(chargebacks + Math.abs(amt));
        fees = round2(fees + fee);
      } else {
        fees = round2(fees + fee);
      }
      const d = isoDate(t.created);
      if (!periodStart || d < periodStart) periodStart = d;
      if (!periodEnd || d > periodEnd) periodEnd = d;
    }
    breakdownOk = true;
  } catch {
    breakdownOk = false;
  }
  if (!breakdownOk) {
    gross = net;
    fees = 0;
    refunds = 0;
    chargebacks = 0;
  }

  const number = await nextNumber(sb, "acct_payouts", "payout_number", "PAY", tenantId);
  const dest = typeof payout.destination === "object" && payout.destination ? (payout.destination as any) : null;
  const { data: row, error } = await sb
    .from("acct_payouts")
    .insert({
      tenant_id: tenantId,
      payout_number: number,
      provider: "stripe",
      provider_payout_id: payout.id,
      destination_type: dest?.object ?? "bank_account",
      destination_last4: dest?.last4 ?? null,
      gross_amount: gross,
      fee_amount: fees,
      refund_amount: refunds,
      chargeback_amount: chargebacks,
      net_amount: net,
      currency: payout.currency ?? "usd",
      period_start: periodStart ?? isoDate(payout.created),
      period_end: periodEnd ?? isoDate(payout.created),
      scheduled_for: isoDate(payout.arrival_date),
      status: payout.status ?? "paid",
      arrived_at: payout.status === "paid" ? isoTs(payout.arrival_date) : null,
      metadata: { source: "stripe_webhook", breakdown_from_balance_transactions: breakdownOk },
    })
    .select("id")
    .single();
  if (error) throw new Error("payout insert failed: " + error.message);
  const payoutRowId = row.id as string;

  // Settle clearing → bank. The bank account is the tenant's active
  // account whose GL account is 1000 Cash (Operating Checking).
  // Without one there is nothing honest to debit — the payout row
  // stands and the journal is skipped, stated in metadata.
  const { data: bankAccounts } = await sb
    .from("acct_bank_accounts")
    .select("id, gl_account_id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  let bank: { id: string; code: string } | null = null;
  for (const ba of bankAccounts ?? []) {
    if (!ba.gl_account_id) continue;
    const { data: coa } = await sb
      .from("acct_chart_of_accounts")
      .select("code")
      .eq("id", ba.gl_account_id)
      .maybeSingle();
    if (coa?.code === "1000") {
      bank = { id: ba.id as string, code: "1000" };
      break;
    }
  }
  if (bank && net > 0) {
    const journalId = await postJournal(sb, {
      source: "payout",
      sourceId: payoutRowId,
      reference: number,
      memo: `Stripe payout ${payout.id} settled to bank`,
      lines: [
        { accountCode: bank.code, debit: net, credit: 0, memo: "Payout deposited" },
        { accountCode: "1010", debit: 0, credit: net, memo: "Stripe clearing settled" },
      ],
    });
    await sb.from("acct_payouts").update({ gl_journal_entry_id: journalId }).eq("id", payoutRowId);
    await sb.from("acct_bank_transactions").insert({
      tenant_id: tenantId,
      bank_account_id: bank.id,
      transaction_date: isoDate(payout.arrival_date),
      posted_date: isoDate(payout.arrival_date),
      amount: net,
      currency: payout.currency ?? "usd",
      description: `Stripe payout ${payout.id}`,
      reference: number,
      provider_transaction_id: payout.id,
      match_status: "unmatched",
    });
  }
  return payoutRowId;
}

/* ------------------------------ refunds ------------------------------ */

export async function postStripeChargeRefunds(
  sb: DB,
  tenantId: string,
  charge: Stripe.Charge,
): Promise<{ recorded: string[] }> {
  const recorded: string[] = [];
  const refunds = (charge.refunds?.data ?? []).filter((r) => r.status === "succeeded");
  if (!refunds.length) return { recorded };
  const entity = await entityId(sb, tenantId);
  const order = await orderForPaymentIntent(
    sb,
    tenantId,
    typeof charge.payment_intent === "string" ? charge.payment_intent : (charge.payment_intent?.id ?? null),
  );
  for (const refund of refunds) {
    const { data: prior } = await sb
      .from("acct_refunds")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("processor_refund_id", refund.id)
      .maybeSingle();
    if (prior) {
      recorded.push(prior.id as string);
      continue;
    }
    const amount = round2((refund.amount ?? 0) / 100);
    if (amount <= 0) continue;
    const number = await nextNumber(sb, "acct_refunds", "refund_number", "RFD", tenantId);
    const { data: row, error } = await sb
      .from("acct_refunds")
      .insert({
        tenant_id: tenantId,
        entity_id: entity,
        refund_number: number,
        customer_id: order?.crmCustomerId ?? null,
        order_ref: order?.id ?? charge.id,
        refund_type: "refund",
        reason: refund.reason ?? "requested_by_customer",
        amount,
        currency: refund.currency ?? "usd",
        status: "issued",
        payment_method: "card",
        processor: "stripe",
        processor_refund_id: refund.id,
        issued_at: new Date().toISOString(),
        notes: "Recorded from Stripe charge.refunded webhook",
      })
      .select("id")
      .single();
    if (error) throw new Error("refund insert failed: " + error.message);
    const journalId = await postJournal(sb, {
      source: "refund",
      sourceId: row.id as string,
      reference: number,
      memo: `Stripe refund ${refund.id}`,
      lines: [
        { accountCode: "4020", debit: amount, credit: 0, memo: "Refund issued (Stripe)" },
        { accountCode: "1010", debit: 0, credit: amount, memo: "Stripe clearing — refund" },
      ],
    });
    await sb.from("acct_refunds").update({ posted_journal_id: journalId }).eq("id", row.id);
    recorded.push(row.id as string);
  }
  return { recorded };
}

/* ------------------------------ disputes ----------------------------- */

export async function postStripeDisputeCreated(
  sb: DB,
  tenantId: string,
  dispute: Stripe.Dispute,
): Promise<string | null> {
  const { data: prior } = await sb
    .from("acct_disputes")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("processor_dispute_id", dispute.id)
    .maybeSingle();
  if (prior) return prior.id as string;

  const entity = await entityId(sb, tenantId);
  const amount = round2((dispute.amount ?? 0) / 100);
  const kind = String(dispute.status ?? "").startsWith("warning") ? "inquiry" : "chargeback";
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : (dispute.charge?.id ?? null);
  const piId =
    typeof dispute.payment_intent === "string"
      ? dispute.payment_intent
      : (dispute.payment_intent?.id ?? null);
  const order = await orderForPaymentIntent(sb, tenantId, piId);
  const number = await nextNumber(sb, "acct_disputes", "dispute_number", "DSP", tenantId);
  const { data: row, error } = await sb
    .from("acct_disputes")
    .insert({
      tenant_id: tenantId,
      entity_id: entity,
      dispute_number: number,
      customer_id: order?.crmCustomerId ?? null,
      order_ref: order?.id ?? chargeId,
      processor: "stripe",
      processor_dispute_id: dispute.id,
      kind,
      reason: dispute.reason ?? null,
      amount,
      currency: dispute.currency ?? "usd",
      status: "open",
      evidence_due_at: dispute.evidence_details?.due_by ? isoTs(dispute.evidence_details.due_by) : null,
      evidence_notes: "Recorded from Stripe charge.dispute.created webhook",
    })
    .select("id")
    .single();
  if (error) throw new Error("dispute insert failed: " + error.message);

  // Funds leave the Stripe balance when a chargeback is created
  // (inquiries/warnings do not move money until they escalate).
  if (kind === "chargeback" && amount > 0) {
    const journalId = await postJournal(sb, {
      source: "expense",
      sourceId: row.id as string,
      reference: number,
      memo: `Chargeback ${number} opened (Stripe)`,
      lines: [
        { accountCode: "6040", debit: amount, credit: 0, memo: "Chargeback — funds withdrawn by Stripe" },
        { accountCode: "1010", debit: 0, credit: amount, memo: "Stripe clearing — chargeback" },
      ],
    });
    await sb.from("acct_disputes").update({ posted_journal_id: journalId }).eq("id", row.id);
  }
  return row.id as string;
}

export async function postStripeDisputeClosed(
  sb: DB,
  tenantId: string,
  dispute: Stripe.Dispute,
): Promise<string | null> {
  const { data: row } = await sb
    .from("acct_disputes")
    .select("id, status, posted_journal_id, dispute_number, amount")
    .eq("tenant_id", tenantId)
    .eq("processor_dispute_id", dispute.id)
    .maybeSingle();
  if (!row) {
    // Closed for a dispute the books never saw (created before this
    // wiring) — record the opening first, then close it.
    const created = await postStripeDisputeCreated(sb, tenantId, dispute);
    if (!created) return null;
    return postStripeDisputeClosed(sb, tenantId, dispute);
  }
  const finalStatus = dispute.status === "won" ? "won" : dispute.status === "lost" ? "lost" : null;
  if (!finalStatus || row.status === finalStatus) return row.id as string;
  await sb.from("acct_disputes").update({ status: finalStatus }).eq("id", row.id);
  if (finalStatus === "won" && row.posted_journal_id) {
    const amount = round2(Number(row.amount) || 0);
    if (amount > 0) {
      await postJournal(sb, {
        source: "expense",
        sourceId: row.id as string,
        reference: (row.dispute_number as string) ?? null,
        memo: `Chargeback ${row.dispute_number} won — funds returned`,
        lines: [
          { accountCode: "1010", debit: amount, credit: 0, memo: "Stripe clearing — chargeback reversed" },
          { accountCode: "6040", debit: 0, credit: amount, memo: "Chargeback won — expense reversed" },
        ],
      });
    }
  }
  return row.id as string;
}
