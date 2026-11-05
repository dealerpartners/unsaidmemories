import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/accounting/summary
//
// The Accounting cluster's shared KPI source (§3.3 Payments summary,
// §3.4 Invoices summary, §3.0 Accounting overview). Every figure is
// computed from acct_ar_invoices / commerce_gift_cards at request time:
//
//   outstanding      — open invoices (posted / partially_paid / approved)
//                      with a balance still owed
//   overdue30        — the spec's ">30 days" overdue definition: balance
//                      owed and due_date more than 30 days in the past
//   invoicedMtd      — total invoiced since the 1st (invoice_date basis)
//   paidThisMonth    — amount_paid on invoices whose paid_at falls in
//                      the current month
//   draftInvoices    — invoices still in draft
//   avgDaysToPay     — mean days from invoice_date to paid_at over
//                      invoices that carry a paid_at stamp
//   giftCardLiability— outstanding balance on active gift cards (the
//                      §3.7 liability figure the Payments summary shows)
//
// Balance per invoice = total − amount_paid − amount_credited −
// deposit_paid, the same arithmetic the invoices list renders.

const BALANCE = `(i.total - i.amount_paid - i.amount_credited - i.deposit_paid)`;

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const inv = await pgQuery<{
      outstanding_count: number; outstanding_total: string;
      overdue30_count: number; overdue30_total: string;
      invoiced_mtd: string; paid_this_month: string;
      draft_count: number; avg_days_to_pay: string | null;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE i.status IN ('posted','partially_paid','approved') AND ${BALANCE} > 0)::int AS outstanding_count,
         COALESCE(SUM(${BALANCE}) FILTER (WHERE i.status IN ('posted','partially_paid','approved') AND ${BALANCE} > 0), 0)::text AS outstanding_total,
         COUNT(*) FILTER (WHERE i.status IN ('posted','partially_paid','approved') AND ${BALANCE} > 0 AND i.due_date < CURRENT_DATE - 30)::int AS overdue30_count,
         COALESCE(SUM(${BALANCE}) FILTER (WHERE i.status IN ('posted','partially_paid','approved') AND ${BALANCE} > 0 AND i.due_date < CURRENT_DATE - 30), 0)::text AS overdue30_total,
         COALESCE(SUM(i.total) FILTER (WHERE i.invoice_date >= date_trunc('month', CURRENT_DATE)::date), 0)::text AS invoiced_mtd,
         COALESCE(SUM(i.amount_paid) FILTER (WHERE i.paid_at >= date_trunc('month', now())), 0)::text AS paid_this_month,
         COUNT(*) FILTER (WHERE i.status = 'draft')::int AS draft_count,
         (AVG(EXTRACT(EPOCH FROM (i.paid_at - i.invoice_date::timestamp)) / 86400.0)
            FILTER (WHERE i.paid_at IS NOT NULL AND i.invoice_date IS NOT NULL))::text AS avg_days_to_pay
       FROM public.acct_ar_invoices i
       WHERE i.tenant_id = $1`,
      [tenant],
    );
    const gc = await pgQuery<{ liability: string; active_count: number }>(
      `SELECT COALESCE(SUM(balance), 0)::text AS liability, COUNT(*)::int AS active_count
         FROM public.commerce_gift_cards
        WHERE tenant_id = $1 AND status IN ('active','partially_redeemed')`,
      [tenant],
    );
    const r = inv[0] || ({} as any);
    return NextResponse.json({
      outstanding: { count: Number(r.outstanding_count || 0), total: Number(r.outstanding_total || 0) },
      overdue30: { count: Number(r.overdue30_count || 0), total: Number(r.overdue30_total || 0) },
      invoicedMtd: Number(r.invoiced_mtd || 0),
      paidThisMonth: Number(r.paid_this_month || 0),
      draftInvoices: Number(r.draft_count || 0),
      avgDaysToPay: r.avg_days_to_pay === null || r.avg_days_to_pay === undefined ? null : Math.round(Number(r.avg_days_to_pay) * 10) / 10,
      giftCards: { liability: Number(gc[0]?.liability || 0), activeCount: Number(gc[0]?.active_count || 0) },
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/summary]", e);
    return NextResponse.json({ error: e?.message || "Failed to load accounting summary" }, { status: 500 });
  }
}
