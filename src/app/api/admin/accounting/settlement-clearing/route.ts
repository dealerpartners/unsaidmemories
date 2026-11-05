import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/accounting/settlement-clearing
//
// Settlement & Clearing Reconciler (owner's
// settlement_clearing_reconciler.html): the per-charge clearing
// ledger (acct_gateway_clearing_entries — gross authorized,
// processor fee, escrow reserve, net in-clearing, payout link,
// deposit window, state) reconciled against the payout ledger
// (acct_payouts). Both ledgers are read as they stand: when they
// hold no rows the page shows real zeros and says the entries
// arrive when the gateway settlement sync writes them — nothing
// is synthesized.

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v: unknown) => Number(v || 0);

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const [entries, payouts] = await Promise.all([
      pgQuery<any>(
        `SELECT id::text AS id, payout_id::text AS payout_id, gateway, external_charge_id,
                external_payment_intent_id, order_ref, gross_amount::text AS gross_amount,
                fee_amount::text AS fee_amount, reserve_amount::text AS reserve_amount,
                net_amount::text AS net_amount, currency, state,
                deposit_window_start::text AS deposit_window_start,
                deposit_window_end::text AS deposit_window_end,
                released_at::text AS released_at, created_at::text AS created_at
           FROM public.acct_gateway_clearing_entries
          WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 500`, [tenant]),
      pgQuery<any>(
        `SELECT id::text AS id, payout_number, provider, provider_payout_id,
                gross_amount::text AS gross_amount, fee_amount::text AS fee_amount,
                refund_amount::text AS refund_amount, chargeback_amount::text AS chargeback_amount,
                net_amount::text AS net_amount, currency, status,
                scheduled_for::text AS scheduled_for, arrived_at::text AS arrived_at,
                (gl_journal_entry_id IS NOT NULL) AS posted_to_gl
           FROM public.acct_payouts
          WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 200`, [tenant]),
    ]);
    const payoutById = new Map(payouts.map((p: any) => [p.id, p]));
    const entryRows = entries.map((e: any) => ({
      id: e.id,
      orderRef: e.order_ref || e.external_charge_id || e.external_payment_intent_id || "—",
      gateway: e.gateway,
      gross: num(e.gross_amount), fees: num(e.fee_amount), reserve: num(e.reserve_amount), net: num(e.net_amount),
      currency: e.currency || "USD",
      state: e.state || "in_clearing",
      payoutId: e.payout_id ? (payoutById.get(e.payout_id)?.payout_number || payoutById.get(e.payout_id)?.provider_payout_id || "linked payout") : null,
      payoutLinked: Boolean(e.payout_id),
      windowStart: e.deposit_window_start, windowEnd: e.deposit_window_end,
      releasedAt: e.released_at, createdAt: e.created_at,
    }));
    const sum = (rows: any[], k: string) => round2(rows.reduce((s, r) => s + Number(r[k] || 0), 0));
    const reserveByGateway = new Map<string, number>();
    for (const e of entryRows) {
      if (!e.releasedAt && e.reserve > 0) reserveByGateway.set(e.gateway, round2((reserveByGateway.get(e.gateway) || 0) + e.reserve));
    }
    const payoutRows = payouts.map((p: any) => ({
      id: p.id, payoutNumber: p.payout_number, provider: p.provider, providerPayoutId: p.provider_payout_id,
      gross: num(p.gross_amount), fees: num(p.fee_amount), refunds: num(p.refund_amount),
      chargebacks: num(p.chargeback_amount), net: num(p.net_amount), status: p.status,
      scheduledFor: p.scheduled_for, arrivedAt: p.arrived_at, postedToGl: Boolean(p.posted_to_gl),
    }));
    const entriesWithPayout = entryRows.filter((e: any) => e.payoutLinked).length;
    const payoutsWithEntries = new Set(entryRows.filter((e: any) => e.payoutLinked).map((e: any) => e.payoutId)).size;
    return NextResponse.json({
      entries: entryRows,
      payouts: payoutRows,
      summary: {
        grossAuthorized: sum(entryRows, "gross"),
        processorFees: sum(entryRows, "fees"),
        escrowReserve: sum(entryRows, "reserve"),
        reserveHeld: round2([...reserveByGateway.values()].reduce((s, v) => s + v, 0)),
        netInClearing: sum(entryRows.filter((e: any) => !e.releasedAt), "net"),
        payoutsGross: sum(payoutRows, "gross"),
        payoutsFees: sum(payoutRows, "fees"),
        payoutsNet: sum(payoutRows, "net"),
      },
      reserveByGateway: [...reserveByGateway.entries()].map(([gateway, amount]) => ({ gateway, amount })),
      reconciliation: {
        entriesTotal: entryRows.length,
        entriesWithPayout,
        entriesOrphaned: entryRows.length - entriesWithPayout,
        payoutsTotal: payoutRows.length,
        payoutsWithoutEntries: payoutRows.length - payoutsWithEntries,
        payoutsPostedToGl: payoutRows.filter((p: any) => p.postedToGl).length,
      },
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/settlement-clearing]", e);
    return NextResponse.json({ error: e?.message || "Failed to load settlement clearing" }, { status: 500 });
  }
}
