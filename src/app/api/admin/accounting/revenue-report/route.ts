import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/accounting/revenue-report
//
// The Revenue Report's data (gross receipts by day/week/month from
// acct_ar_receipts, invoiced totals from acct_ar_invoices,
// chargebacks from acct_disputes, refunds issued from acct_refunds,
// and the scheduled vendor payouts from acct_ap_payments) — the
// same figures the Revenue Report page has always shown, served
// as JSON so the page renders in the statement suite's format.

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const [receipts, invoices, disputes, apPayments, refunds] = await Promise.all([
      pgQuery<{ receipt_date: string; amount: string }>(
        `SELECT receipt_date::text AS receipt_date, amount::text AS amount
           FROM public.acct_ar_receipts WHERE tenant_id = $1 LIMIT 2000`, [tenant]),
      pgQuery<{ invoice_date: string; total: string }>(
        `SELECT invoice_date::text AS invoice_date, total::text AS total
           FROM public.acct_ar_invoices WHERE tenant_id = $1 AND status NOT IN ('void', 'voided') LIMIT 2000`, [tenant]),
      pgQuery<{ dispute_number: string; kind: string; amount: string; status: string }>(
        `SELECT dispute_number, kind, amount::text AS amount, status
           FROM public.acct_disputes WHERE tenant_id = $1 ORDER BY created_at DESC`, [tenant]),
      pgQuery<{ payment_number: string; payment_date: string; amount: string; status: string }>(
        `SELECT payment_number, payment_date::text AS payment_date, amount::text AS amount, status
           FROM public.acct_ap_payments WHERE tenant_id = $1 ORDER BY payment_date DESC LIMIT 50`, [tenant]),
      pgQuery<{ amount: string }>(
        `SELECT amount::text AS amount FROM public.acct_refunds
          WHERE tenant_id = $1 AND status = 'issued'`, [tenant]),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    const monthStart = today.slice(0, 8) + "01";
    const sumFrom = (rows: { d: string; v: number }[], from: string) =>
      round2(rows.filter((r) => r.d >= from).reduce((s, r) => s + r.v, 0));
    const rc = receipts.map((r) => ({ d: r.receipt_date, v: Number(r.amount || 0) }));
    const inv = invoices.map((r) => ({ d: r.invoice_date, v: Number(r.total || 0) }));
    const byDay = new Map<string, number>();
    for (const r of rc) if (r.d >= monthStart) byDay.set(r.d, round2((byDay.get(r.d) || 0) + r.v));
    return NextResponse.json({
      kpis: {
        grossToday: sumFrom(rc, today),
        grossWeek: sumFrom(rc, weekAgo),
        grossMonth: sumFrom(rc, monthStart),
        invoicedMonth: sumFrom(inv, monthStart),
        chargebacksAllTime: round2(disputes.filter((d) => d.kind === "chargeback").reduce((s, d) => s + Number(d.amount || 0), 0)),
        refundsIssued: round2(refunds.reduce((s, r) => s + Number(r.amount || 0), 0)),
      },
      days: [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, amount]) => ({ date, amount })),
      payouts: apPayments.map((p) => ({ paymentNumber: p.payment_number, date: p.payment_date, amount: Number(p.amount || 0), status: p.status })),
      disputes: disputes.map((d) => ({ disputeNumber: d.dispute_number, kind: d.kind, amount: Number(d.amount || 0), status: d.status })),
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/revenue-report]", e);
    return NextResponse.json({ error: e?.message || "Failed to load revenue report" }, { status: 500 });
  }
}
