import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";

export const dynamic = "force-dynamic";

// ============================================================================
// /api/admin/reports/revenue — real revenue telemetry (3.13 Reports).
// Daily revenue for the last 14 days + MTD summary, from commerce_payments
// and commerce_sales. No mock data.
// ============================================================================

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("reports", "read");
  if (gate) return gate;
  const tenant = resolveTenantId(req);
  const daysParam = Number(new URL(req.url).searchParams.get("days") || 14);
  const days = Number.isFinite(daysParam) ? Math.min(Math.max(Math.trunc(daysParam), 1), 365) : 14;

  const data = await withPg(async (c) => {
    // Daily revenue, last `days` days, from succeeded/captured payments.
    const { rows: daily } = await c.query(
      `SELECT d.day::date AS day,
              COALESCE(SUM(p.amount), 0)::numeric AS revenue,
              COUNT(p.id)::int AS payments
         FROM generate_series(CURRENT_DATE - ($2::int - 1) * INTERVAL '1 day', CURRENT_DATE, INTERVAL '1 day') AS d(day)
         LEFT JOIN public.commerce_payments p
           ON p.tenant_id = $1
          AND p.created_at::date = d.day::date
          AND p.status IN ('succeeded','captured')
        GROUP BY d.day ORDER BY d.day`,
      [tenant, days]
    );
    // Window totals: this window vs the previous equal-length window.
    const { rows: win } = await c.query(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE created_at::date > CURRENT_DATE - $2::int), 0)::numeric AS revenue,
         COUNT(*) FILTER (WHERE created_at::date > CURRENT_DATE - $2::int)::int AS payments,
         COALESCE(SUM(amount) FILTER (WHERE created_at::date <= CURRENT_DATE - $2::int), 0)::numeric AS prev_revenue
       FROM public.commerce_payments
       WHERE tenant_id = $1 AND status IN ('succeeded','captured')
         AND created_at::date > CURRENT_DATE - (2 * $2::int)`,
      [tenant, days]
    );
    const windowRevenue = Number(win[0]?.revenue || 0);
    const prevRevenue = Number(win[0]?.prev_revenue || 0);
    const changePct = prevRevenue > 0
      ? Number((((windowRevenue - prevRevenue) / prevRevenue) * 100).toFixed(1))
      : null;
    // Operational mix over the same window: completed appointment totals
    // (services) and shop order totals (products). commerce_orders totals
    // are stored as text like "$25.27" — strip and cast safely.
    const { rows: mix } = await c.query(
      `SELECT
         COALESCE((SELECT SUM(a.total) FROM public.crm_appointments a
                    WHERE a.tenant_id = $1 AND a.status = 'completed'
                      AND a.starts_at::date > CURRENT_DATE - $2::int), 0)::numeric AS services,
         COALESCE((SELECT SUM(NULLIF(regexp_replace(o.total_amount, '[^0-9.\\-]', '', 'g'), '')::numeric)
                     FROM public.commerce_orders o
                    WHERE o.tenant_id = $1 AND o.status <> 'cancelled'
                      AND o.created_at::date > CURRENT_DATE - $2::int), 0)::numeric AS products`,
      [tenant, days]
    );
    const mixServices = Number(mix[0]?.services || 0);
    const mixProducts = Number(mix[0]?.products || 0);
    const mixTotal = mixServices + mixProducts;
    // MTD totals.
    const { rows: mtd } = await c.query(
      `SELECT COALESCE(SUM(amount),0)::numeric AS mtd_revenue,
              COUNT(id)::int AS mtd_payments,
              COALESCE(AVG(amount),0)::numeric AS avg_ticket
         FROM public.commerce_payments
        WHERE tenant_id = $1 AND status IN ('succeeded','captured')
          AND created_at >= date_trunc('month', CURRENT_DATE)`,
      [tenant]
    );
    // Disputes YTD (for the revenue report's dispute line).
    const { rows: disp } = await c.query(
      `SELECT COUNT(id)::int AS ytd_disputes, COALESCE(SUM(amount),0)::numeric AS ytd_dispute_amount
         FROM public.commerce_disputes
        WHERE tenant_id = $1 AND opened_at >= date_trunc('year', CURRENT_DATE)`,
      [tenant]
    );
    return {
      daily,
      mtd: mtd[0] || {},
      disputes: disp[0] || {},
      window: {
        days,
        revenue: windowRevenue,
        payments: Number(win[0]?.payments || 0),
        prevRevenue,
        changePct,
      },
      breakdown: {
        services: mixServices,
        products: mixProducts,
        servicesShare: mixTotal > 0 ? Number(((mixServices / mixTotal) * 100).toFixed(1)) : 0,
        productsShare: mixTotal > 0 ? Number(((mixProducts / mixTotal) * 100).toFixed(1)) : 0,
      },
    };
  });

  return NextResponse.json(data ?? { daily: [], mtd: {}, disputes: {} });
}
