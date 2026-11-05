import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";

function num(v: any): number { return Math.round((parseFloat(String(v ?? "0")) || 0) * 100) / 100; }

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("reports", "read"); if (gate) return gate;
  const { searchParams } = new URL(req.url);
  const days = Math.min(parseInt(searchParams.get("days") || "30") || 30, 365);
  return withPg(async (client) => {
    const tenant = resolveTenantId(req);
    const totals = await client.query(
      `SELECT COALESCE(SUM(CASE WHEN status IN ('succeeded','captured') THEN amount ELSE 0 END), 0)::numeric AS revenue,
              COALESCE(SUM(CASE WHEN status = 'refunded' THEN amount ELSE 0 END), 0)::numeric AS refunds,
              COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0)::numeric AS pending,
              COUNT(*) FILTER (WHERE status IN ('succeeded','captured'))::int AS paid_count,
              COUNT(*)::int AS total_count
       FROM public.commerce_payments WHERE tenant_id = $1 AND created_at >= now() - ($2 || ' days')::interval`,
      [tenant, String(days)],
    );
    const t = totals.rows[0];
    const revenue = num(t.revenue);
    const refunds = num(t.refunds);
    const pending = num(t.pending);
    const paidCount = Number(t.paid_count);
    const totalCount = Number(t.total_count);
    const tenderRes = await client.query(
      `SELECT COALESCE(pm.name, 'Other') AS tender, COUNT(*)::int AS count, COALESCE(SUM(cp.amount), 0)::numeric AS total
       FROM public.commerce_payments cp LEFT JOIN public.commerce_payment_methods pm ON pm.id = cp.payment_method_id
       WHERE cp.tenant_id = $1 AND cp.status IN ('succeeded','captured','pending') AND cp.created_at >= now() - ($2 || ' days')::interval
       GROUP BY COALESCE(pm.name, 'Other') ORDER BY total DESC`,
      [tenant, String(days)],
    );
    return NextResponse.json({ days, totals: { revenue, refunds, pending, net: num(revenue - refunds), paidCount, totalCount }, tenderBreakdown: tenderRes.rows.map((r: any) => ({ tender: r.tender, count: Number(r.count), total: num(r.total) })) });
  }).then((r) => r ?? NextResponse.json({ error: "DB unavailable" }, { status: 503 }))
    .catch((e: any) => NextResponse.json({ error: e?.message }, { status: 500 }));
}
