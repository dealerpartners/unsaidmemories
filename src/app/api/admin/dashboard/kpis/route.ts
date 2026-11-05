import { NextRequest, NextResponse } from "next/server";
import { requireModuleApi } from "@/lib/admin/gate";
import { resolveActiveTenantId } from "@/lib/admin/tenant-resolution";
import { withPg } from "@/lib/crm/enterprise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/dashboard/kpis
// Dashboard KPI cards: today's appointments, today's revenue, MTD revenue,
// new customers (30d), low inventory, no-show rate (30d), rebook rate (30d).
//
// Every figure is a real aggregate over the live tables:
//   revenue        → erp_orders.total by order_date — the store's real
//                    order ledger (same aggregates the analytics route
//                    publishes: 49 orders / $5,294.70 all-time at the
//                    2026-10-31 re-point). commerce_payments is NOT the
//                    ledger; it read near-zero forever.
//   appointments   → crm_appointments.starts_at
//   new customers  → crm_customers.created_at (active only)
//   low inventory  → catalog items whose SKU carries stock (≥1 movement in
//                    erp_inventory_movements) with net on-hand ≤ 5. Items
//                    with no movement history are unstocked (dropship), not
//                    "low" — they are excluded by definition.
//   no-show rate   → crm_appointments, same definition as the analytics
//                    actions report: no_show / (no_show+completed+
//                    cancelled+confirmed) over the last 30 days
//   rebook rate    → same definition as the analytics actions report:
//                    customers whose 2nd appointment starts within 30 days
//                    of the 1st, over customers with ≥1 completed/confirmed
//                    appointment in the last 30 days
//   vaccinations expiring (30d) → crm_pet_vaccinations.expires_on — this
//                    count previously existed ONLY on the orphaned
//                    /api/admin/dashboard route whose sole consumer
//                    (hooks/useQueries.ts) no component imports, so the
//                    dashboard never rendered it (audit §1.1.8). NOTE:
//                    the column is expires_on; the orphan route's
//                    expires_at variant throws against the live schema
//                    and its silent catch masked that as a permanent 0.
//   unsigned documents → crm_documents status='unsigned' OR signed_at
//                    IS NULL — same orphan-route history (audit §1.1.9)
// Rates are null when their denominator is 0 — the UI renders "No data yet"
// instead of a fabricated 0%. Query failures are logged, never swallowed
// silently (the previous version's silent catches hid two dead columns:
// acct_ar_receipts.created_at and commerce_orders.total do not exist, so
// revenue read $0.00 forever).
export async function GET(req: NextRequest) {
  // Module gate — this route previously had none while its sibling
  // dashboard routes gate (widgets: analytics/read, reports/*:
  // reports/*). B.9's contract is analytics:read.
  const gate = await requireModuleApi("analytics", "read");
  if (gate) return gate;

  const __out = await withPg(async (client) => {
    // Scope = the caller's resolved active tenant (lib/admin/
    // tenant-resolution): their identity-bound switcher selection when
    // entitled, otherwise their membership home — master for the
    // platform owner. A stale demo-tenant cookie can no longer scope
    // the owner's dashboard to an empty tenant.
    const tenant = await resolveActiveTenantId(client, req);
    const safeCount = (rows: any[]) => (rows[0]?.count ? Number(rows[0].count) : 0);
    const safeNum = (rows: any[], key: string) => (rows[0]?.[key] ? Number(rows[0][key]) : 0);

    let todayAppointments = 0;
    let todayRevenue = 0;
    let mtdRevenue = 0;
    let newCustomers30d = 0;
    let lowInventoryCount = 0;
    let noShowRate30d: number | null = null;
    let noShowCounts = { noShow: 0, completed: 0, cancelled: 0, confirmed: 0, total: 0 };
    let rebookRate30d: number | null = null;
    let rebookCounts = { totalCustomers: 0, rebookCustomers: 0 };
    let vaccinationsExpiring = 0;
    let unsignedDocuments = 0;
    let ordersTotal = 0;
    let ordersToday = 0;
    let revenueTotal = 0;
    let publishedProducts = 0;
    let openTickets = 0;

    try {
      todayAppointments = safeCount(
        await client.query(
          `SELECT COUNT(*)::text AS count FROM public.crm_appointments WHERE starts_at::date = CURRENT_DATE AND tenant_id = $1`,
          [tenant],
        ).then(r => r.rows),
      );
    } catch (e) { console.error("[kpis] todayAppointments failed:", e); }

    try {
      todayRevenue = safeNum(
        await client.query(
          `SELECT COALESCE(SUM(total), 0)::text AS rev FROM public.erp_orders WHERE tenant_id = $1 AND order_date::date = CURRENT_DATE`,
          [tenant],
        ).then(r => r.rows),
        "rev",
      );
    } catch (e) { console.error("[kpis] todayRevenue failed:", e); }

    try {
      mtdRevenue = safeNum(
        await client.query(
          `SELECT COALESCE(SUM(total), 0)::text AS rev FROM public.erp_orders WHERE tenant_id = $1 AND order_date >= date_trunc('month', CURRENT_DATE)`,
          [tenant],
        ).then(r => r.rows),
        "rev",
      );
    } catch (e) { console.error("[kpis] mtdRevenue failed:", e); }

    try {
      newCustomers30d = safeCount(
        await client.query(
          `SELECT COUNT(*)::text AS count FROM public.crm_customers WHERE created_at >= NOW() - INTERVAL '30 days' AND tenant_id = $1 AND is_active = true`,
          [tenant],
        ).then(r => r.rows),
      );
    } catch (e) { console.error("[kpis] newCustomers30d failed:", e); }

    try {
      lowInventoryCount = safeCount(
        await client.query(
          `SELECT COUNT(*)::text AS count
             FROM public.commerce_catalog_items ci
            WHERE ci.tenant_id = $1 AND ci.active IS TRUE
              AND EXISTS (
                SELECT 1 FROM public.erp_inventory_movements im
                 WHERE im.sku_id = ci.sku_id AND im.tenant_id = ci.tenant_id
              )
              AND COALESCE((
                SELECT SUM(CASE WHEN im2.movement_type IN ('sale','damage','scrap','ship') THEN -im2.quantity ELSE im2.quantity END)
                  FROM public.erp_inventory_movements im2
                 WHERE im2.sku_id = ci.sku_id AND im2.tenant_id = ci.tenant_id
              ), 0) <= 5`,
          [tenant],
        ).then(r => r.rows),
      );
    } catch (e) { console.error("[kpis] lowInventoryCount failed:", e); }

    try {
      const rows = await client.query(
        `SELECT status, COUNT(*)::text AS count
           FROM public.crm_appointments
          WHERE tenant_id = $1
            AND status IN ('no_show','completed','cancelled','confirmed')
            AND starts_at::date BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE
          GROUP BY status`,
        [tenant],
      ).then(r => r.rows);
      const get = (s: string) => Number(rows.find((r: any) => r.status === s)?.count || 0);
      noShowCounts = {
        noShow: get("no_show"), completed: get("completed"),
        cancelled: get("cancelled"), confirmed: get("confirmed"),
        total: get("no_show") + get("completed") + get("cancelled") + get("confirmed"),
      };
      noShowRate30d = noShowCounts.total > 0
        ? Number(((noShowCounts.noShow / noShowCounts.total) * 100).toFixed(2))
        : null;
    } catch (e) { console.error("[kpis] noShowRate30d failed:", e); }

    try {
      const totals = await client.query(
        `SELECT COUNT(DISTINCT customer_id)::text AS count
           FROM public.crm_appointments
          WHERE tenant_id = $1 AND status IN ('completed','confirmed')
            AND starts_at::date BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE
            AND customer_id IS NOT NULL`,
        [tenant],
      ).then(r => r.rows);
      const rebookers = await client.query(
        `SELECT COUNT(DISTINCT a1.customer_id)::text AS count
           FROM public.crm_appointments a1
           JOIN public.crm_appointments a2
             ON a1.customer_id = a2.customer_id
            AND a1.tenant_id = a2.tenant_id
            AND a1.starts_at < a2.starts_at
            AND a2.starts_at <= a1.starts_at + INTERVAL '30 days'
          WHERE a1.tenant_id = $1
            AND a1.status IN ('completed','confirmed')
            AND a2.status IN ('completed','confirmed')
            AND a1.starts_at::date BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE
            AND a1.customer_id IS NOT NULL`,
        [tenant],
      ).then(r => r.rows);
      rebookCounts = {
        totalCustomers: safeCount(totals),
        rebookCustomers: safeCount(rebookers),
      };
      rebookRate30d = rebookCounts.totalCustomers > 0
        ? Number(((rebookCounts.rebookCustomers / rebookCounts.totalCustomers) * 100).toFixed(2))
        : null;
    } catch (e) { console.error("[kpis] rebookRate30d failed:", e); }

    try {
      vaccinationsExpiring = safeCount(
        await client.query(
          `SELECT COUNT(*)::text AS count FROM public.crm_pet_vaccinations
            WHERE expires_on IS NOT NULL AND expires_on <= CURRENT_DATE + INTERVAL '30 days'
              AND tenant_id = $1`,
          [tenant],
        ).then(r => r.rows),
      );
    } catch (e) { console.error("[kpis] vaccinationsExpiring failed:", e); }

    try {
      unsignedDocuments = safeCount(
        await client.query(
          `SELECT COUNT(*)::text AS count FROM public.crm_documents
            WHERE (status = 'unsigned' OR signed_at IS NULL)
              AND tenant_id = $1`,
          [tenant],
        ).then(r => r.rows),
      );
    } catch (e) { console.error("[kpis] unsignedDocuments failed:", e); }

    try {
      ordersTotal = safeCount(
        await client.query(
          `SELECT COUNT(*)::text AS count FROM public.erp_orders WHERE tenant_id = $1`,
          [tenant],
        ).then(r => r.rows),
      );
    } catch (e) { console.error("[kpis] ordersTotal failed:", e); }

    try {
      ordersToday = safeCount(
        await client.query(
          `SELECT COUNT(*)::text AS count FROM public.erp_orders WHERE tenant_id = $1 AND order_date::date = CURRENT_DATE`,
          [tenant],
        ).then(r => r.rows),
      );
    } catch (e) { console.error("[kpis] ordersToday failed:", e); }

    try {
      revenueTotal = safeNum(
        await client.query(
          `SELECT COALESCE(SUM(total), 0)::text AS rev FROM public.erp_orders WHERE tenant_id = $1`,
          [tenant],
        ).then(r => r.rows),
        "rev",
      );
    } catch (e) { console.error("[kpis] revenueTotal failed:", e); }

    try {
      publishedProducts = safeCount(
        await client.query(
          `SELECT COUNT(*)::text AS count FROM public.products WHERE tenant_id = $1 AND status = 'published'`,
          [tenant],
        ).then(r => r.rows),
      );
    } catch (e) { console.error("[kpis] publishedProducts failed:", e); }

    try {
      openTickets = safeCount(
        await client.query(
          `SELECT COUNT(*)::text AS count FROM public.support_tickets WHERE tenant_id = $1 AND lower(status) NOT IN ('resolved','closed')`,
          [tenant],
        ).then(r => r.rows),
      );
    } catch (e) { console.error("[kpis] openTickets failed:", e); }

    return NextResponse.json({
      data: {
        todayAppointments,
        todayRevenue,
        mtdRevenue,
        newCustomers30d,
        lowInventoryCount,
        noShowRate30d,
        noShowCounts,
        rebookRate30d,
        rebookCounts,
        vaccinationsExpiring,
        unsignedDocuments,
        ordersTotal,
        ordersToday,
        revenueTotal,
        publishedProducts,
        openTickets,
      },
    });
  });
  return __out ?? NextResponse.json({ error: "Database unavailable" }, { status: 503 });
}
