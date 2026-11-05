import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/accounting/revenue-bridge
//
// Gross-to-Net Revenue Bridge (owner's
// gross_to_net_revenue_bridge.html): the waterfall from captured
// storefront GMV down to net revenue. Every stage is computed
// from a named source — no estimates anywhere:
//   GMV          orders with payment captured (paid / refunded)
//   Discounts    discount_total on the ERP twins of those orders
//   Refunds      acct_refunds issued
//   Credits      acct_ar_credit_memos totals
//   Chargebacks  acct_disputes of kind chargeback
//   Gateway fees acct_payouts fee_amount (the payout ledger)
// A stage whose source holds no records reports a real 0 and says
// so. Orders still pending payment are excluded from GMV and
// reported as a memo, and the posted GL revenue accounts are
// returned as a check figure.

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const [byStatus, discounts, refunds, credits, chargebacks, fees, glAccounts, glRevenue] = await Promise.all([
      pgQuery<{ status: string; n: number; total: string }>(
        `SELECT status, COUNT(*)::int AS n, COALESCE(SUM(total), 0)::text AS total
           FROM public.orders WHERE tenant_id = $1 GROUP BY status`, [tenant]),
      pgQuery<{ amount: string }>(
        `SELECT COALESCE(SUM(e.discount_total), 0)::text AS amount
           FROM public.erp_orders e
           JOIN public.orders o ON o.id::text = e.source_order_id
          WHERE e.tenant_id = $1 AND o.status IN ('paid', 'refunded')`, [tenant]),
      pgQuery<{ n: number; amount: string }>(
        `SELECT COUNT(*)::int AS n, COALESCE(SUM(amount), 0)::text AS amount
           FROM public.acct_refunds WHERE tenant_id = $1 AND status = 'issued'`, [tenant]),
      pgQuery<{ n: number; amount: string }>(
        `SELECT COUNT(*)::int AS n, COALESCE(SUM(total), 0)::text AS amount
           FROM public.acct_ar_credit_memos WHERE tenant_id = $1`, [tenant]),
      pgQuery<{ n: number; amount: string }>(
        `SELECT COUNT(*)::int AS n, COALESCE(SUM(amount), 0)::text AS amount
           FROM public.acct_disputes WHERE tenant_id = $1 AND kind = 'chargeback'`, [tenant]),
      pgQuery<{ n: number; amount: string }>(
        `SELECT COUNT(*)::int AS n, COALESCE(SUM(fee_amount), 0)::text AS amount
           FROM public.acct_payouts WHERE tenant_id = $1`, [tenant]),
      pgQuery<{ code: string; name: string }>(
        `SELECT code, name FROM public.acct_chart_of_accounts
          WHERE tenant_id = $1 AND code IN ('4000', '4010', '4020', '6030')`, [tenant]),
      pgQuery<{ debit: string; credit: string; normal_balance: string | null }>(
        `SELECT a.normal_balance,
                COALESCE(SUM(l.debit), 0)::text AS debit,
                COALESCE(SUM(l.credit), 0)::text AS credit
           FROM public.acct_journal_lines l
           JOIN public.acct_journal_entries e ON e.id = l.journal_entry_id
           JOIN public.acct_chart_of_accounts a ON a.id = l.account_id
          WHERE l.tenant_id = $1 AND e.status = 'posted' AND a.account_type = 'revenue'
          GROUP BY a.normal_balance`, [tenant]),
    ]);
    const glName = (code: string, fallback: string) => {
      const a = glAccounts.find((x) => x.code === code);
      return a ? `GL ${a.code} · ${a.name}` : fallback;
    };
    const captured = byStatus.filter((s) => s.status === "paid" || s.status === "refunded");
    const gmv = round2(captured.reduce((s, x) => s + Number(x.total || 0), 0));
    const gmvCount = captured.reduce((s, x) => s + Number(x.n || 0), 0);
    const pending = byStatus.find((s) => s.status === "pending_payment");
    const disc = round2(Number(discounts[0]?.amount || 0));
    const ref = round2(Number(refunds[0]?.amount || 0));
    const cred = round2(Number(credits[0]?.amount || 0));
    const cb = round2(Number(chargebacks[0]?.amount || 0));
    const fee = round2(Number(fees[0]?.amount || 0));
    const net = round2(gmv - disc - ref - cred - cb - fee);
    const pct = (v: number) => (gmv ? round2((Math.abs(v) / gmv) * 100) : 0);
    const stage = (name: string, detail: string, amount: number, gl: string, source: string, hasRecords: boolean) => ({
      name, detail, amount, pctOfGmv: pct(amount), gl, source,
      audit: hasRecords ? "From source records" : "No records in source — real $0.00",
    });
    const stages = [
      stage("Gross Order Volume (GMV Captured)", `${gmvCount} storefront order(s) reached payment`, gmv,
        glName("4000", "Revenue accounts"), "Storefront orders (paid + refunded)", gmvCount > 0),
      stage("Promotional Discounts & Coupon Codes", "Discount totals recorded on the ERP twins of captured orders", -disc,
        glName("4010", "Contra revenue"), "erp_orders.discount_total", disc !== 0),
      stage("Customer Refunds", `${Number(refunds[0]?.n || 0)} refund(s) issued`, -ref,
        glName("4020", "Contra revenue"), "acct_refunds (issued)", Number(refunds[0]?.n || 0) > 0),
      stage("Concession Credits & Credit Memos", `${Number(credits[0]?.n || 0)} credit memo(s) on file`, -cred,
        glName("4020", "Contra revenue"), "acct_ar_credit_memos", Number(credits[0]?.n || 0) > 0),
      stage("Chargeback Disputes", `${Number(chargebacks[0]?.n || 0)} chargeback case(s) on the disputes desk`, -cb,
        glName("4020", "Contra revenue"), "acct_disputes (kind = chargeback)", Number(chargebacks[0]?.n || 0) > 0),
      stage("Gateway & Processor Fees", `${Number(fees[0]?.n || 0)} payout(s) in the payout ledger`, -fee,
        glName("6030", "Payment processing fees"), "acct_payouts.fee_amount", Number(fees[0]?.n || 0) > 0),
      { ...stage("Net Realized Revenue", "GMV minus every recorded deduction above", net, glName("4000", "Revenue accounts"), "Computed from the stages above", true), audit: "Computed" },
    ];
    const glPostedRevenue = round2(glRevenue.reduce((s, r) => {
      const net2 = Number(r.debit || 0) - Number(r.credit || 0);
      return s + (r.normal_balance === "credit" ? -net2 : net2);
    }, 0));
    return NextResponse.json({
      stages,
      gmv, net,
      yieldPct: gmv ? round2((net / gmv) * 100) : 0,
      totalDrag: round2(gmv - net),
      memo: {
        pendingOrders: Number(pending?.n || 0),
        pendingTotal: round2(Number(pending?.total || 0)),
        glPostedRevenue,
      },
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/revenue-bridge]", e);
    return NextResponse.json({ error: e?.message || "Failed to build revenue bridge" }, { status: 500 });
  }
}
