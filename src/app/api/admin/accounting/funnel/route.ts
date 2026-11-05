import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/accounting/funnel
//
// Financial Funnel & Revenue Attrition Bridge (owner's
// e_commerce_conversion_funnel_analytics.html). Source honesty:
// the event tables a session funnel would need — analytics_events,
// crm_funnel_events, commerce_checkout_sessions — all exist but
// currently hold zero events, and their counts are returned with
// the payload so the page can say exactly that. The bridge itself
// is built from the records that do exist: storefront orders and
// their ERP fulfillment twins (erp_orders.source_order_id), so
// every stage count and every dollar of attrition is real.

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const [ordersAgg, twinAgg, cohorts, eventCounts] = await Promise.all([
      pgQuery<{ status: string; n: number; total: string }>(
        `SELECT status, COUNT(*)::int AS n, COALESCE(SUM(total), 0)::text AS total
           FROM public.orders WHERE tenant_id = $1 GROUP BY status`, [tenant]),
      pgQuery<{ stage: string; n: number; total: string }>(
        `SELECT CASE WHEN e.status IN ('shipped', 'delivered') THEN 'shipped' ELSE 'in_fulfillment' END AS stage,
                COUNT(DISTINCT o.id)::int AS n, COALESCE(SUM(o.total), 0)::text AS total
           FROM public.orders o
           JOIN public.erp_orders e ON e.source_order_id = o.id::text AND e.tenant_id = o.tenant_id
          WHERE o.tenant_id = $1 AND o.status IN ('paid', 'refunded')
          GROUP BY 1`, [tenant]),
      pgQuery<{ customer_id: string | null; n: number; total: string }>(
        `SELECT customer_id::text AS customer_id, COUNT(*)::int AS n, COALESCE(SUM(total), 0)::text AS total
           FROM public.orders
          WHERE tenant_id = $1 AND status IN ('paid', 'refunded') AND customer_id IS NOT NULL
          GROUP BY customer_id`, [tenant]),
      pgQuery<{ src: string; n: number }>(
        `SELECT 'analytics_events' AS src, COUNT(*)::int AS n FROM public.analytics_events
         UNION ALL SELECT 'crm_funnel_events', COUNT(*)::int FROM public.crm_funnel_events WHERE tenant_id = $1
         UNION ALL SELECT 'commerce_checkout_sessions', COUNT(*)::int FROM public.commerce_checkout_sessions WHERE tenant_id = $1`,
        [tenant]),
    ]);
    const agg = (status: string) => ordersAgg.find((x) => x.status === status);
    const placed = { n: ordersAgg.reduce((s, x) => s + x.n, 0), value: round2(ordersAgg.reduce((s, x) => s + Number(x.total || 0), 0)) };
    const paid = agg("paid") || { n: 0, total: "0" };
    const refunded = agg("refunded") || { n: 0, total: "0" };
    const pending = agg("pending_payment") || { n: 0, total: "0" };
    const captured = { n: paid.n + refunded.n, value: round2(Number(paid.total) + Number(refunded.total)) };
    const inFulf = twinAgg.find((x) => x.stage === "in_fulfillment");
    const shippedRow = twinAgg.find((x) => x.stage === "shipped");
    const twinTotal = {
      n: (inFulf?.n || 0) + (shippedRow?.n || 0),
      value: round2(Number(inFulf?.total || 0) + Number(shippedRow?.total || 0)),
    };
    const shipped = { n: shippedRow?.n || 0, value: round2(Number(shippedRow?.total || 0)) };
    const kept = { n: paid.n, value: round2(Number(paid.total)) };
    const stage = (name: string, detail: string, s: { n: number; value: number }, prev: { n: number; value: number } | null, source: string) => ({
      name, detail, count: s.n, value: s.value, source,
      pctOfPlaced: placed.n ? round2((s.n / placed.n) * 100) : 0,
      lostCount: prev ? prev.n - s.n : 0,
      lostValue: prev ? round2(prev.value - s.value) : 0,
    });
    const stages = [
      stage("Orders Placed", "Every storefront order recorded, any status", placed, null, "orders"),
      stage("Payment Captured", "Orders whose payment completed (paid or later refunded)", captured, placed, "orders.status"),
      stage("In Fulfillment", "Captured orders with an ERP fulfillment twin", twinTotal, captured, "erp_orders (source_order_id)"),
      stage("Shipped / Delivered", "Fulfillment twins shipped or delivered", shipped, twinTotal, "erp_orders.status"),
      stage("Kept (Not Refunded)", "Captured orders that were not refunded", kept, captured, "orders.status = paid"),
    ];
    const repeat = cohorts.filter((c) => c.n > 1);
    const single = cohorts.filter((c) => c.n === 1);
    const cohort = (label: string, rows: typeof cohorts) => ({
      label,
      buyers: rows.length,
      orders: rows.reduce((s, r) => s + r.n, 0),
      revenue: round2(rows.reduce((s, r) => s + Number(r.total || 0), 0)),
      aov: rows.length && rows.reduce((s, r) => s + r.n, 0) > 0
        ? round2(rows.reduce((s, r) => s + Number(r.total || 0), 0) / rows.reduce((s, r) => s + r.n, 0)) : 0,
    });
    return NextResponse.json({
      stages,
      abandonment: {
        orders: Number(pending.n || 0),
        value: round2(Number(pending.total || 0)),
        note: "Orders placed but still pending payment — the checkout-completion gap that exists in the order record today.",
      },
      aov: captured.n ? round2(captured.value / captured.n) : 0,
      cohorts: [cohort("First-time buyers (one captured order)", single), cohort("Repeat buyers (2+ captured orders)", repeat)],
      identifiedBuyers: cohorts.length,
      eventSources: eventCounts.map((r) => ({ source: r.src, events: r.n })),
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/funnel]", e);
    return NextResponse.json({ error: e?.message || "Failed to build funnel" }, { status: 500 });
  }
}
