import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/dashboard
// Returns all CRM dashboard KPIs in a single response — no round-trips.
// Each query is wrapped in try/catch so a missing table never 500s the
// entire dashboard; it returns 0 for that metric instead.
//
// DEFINITIONS — this route previously computed its own variants that
// disagreed with the canonical dashboard figures (/api/admin/dashboard/
// kpis + the analytics actions), so two live endpoints stated two
// different no-show rates, rebook rates and low-stock counts for the
// same tenant. Every figure below now uses the CANONICAL definition:
//   revenue        → commerce_payments status IN ('succeeded','captured')
//   new customers  → crm_customers created in the last 30 days, active only
//   no-show rate   → no_show / (no_show+completed+cancelled+confirmed),
//                    appointments starting in the last 30 days; null when
//                    the denominator is 0 (no rated appointments)
//   rebook rate    → customers whose 2nd appointment starts within 30
//                    days of the 1st, over customers with ≥1 completed/
//                    confirmed appointment starting in the last 30 days;
//                    null when the denominator is 0
//   low inventory  → active catalog items whose SKU carries stock (≥1
//                    movement in erp_inventory_movements) with net
//                    on-hand ≤ 5; unstocked dropship items are not "low"
//   funnel         → crm_funnel_events, the 6 canonical stages,
//                    zero-filled, last 30 days
export async function GET(req: NextRequest) {
  // Module gate — previously none (sibling dashboard routes gate with
  // analytics/read; B.9's contract is analytics:read).
  const gate = await requireModuleApi("analytics", "read");
  if (gate) return gate;

  return withPg(async (client) => {
    const tenant = resolveTenantId(req);
    const safeCount = (rows: any[]) => (rows[0]?.count ? Number(rows[0].count) : 0);
    const safeNum = (rows: any[], key: string) => (rows[0]?.[key] ? Number(rows[0][key]) : 0);

    // ---- KPIs ----
    let todayAppointments = 0;
    let todayRevenue = 0;
    let newCustomers30d = 0;
    let noShowRate30d: number | null = null;
    let rebookRate30d: number | null = null;
    let staffOnDuty = 0;

    try {
      todayAppointments = safeCount(
        await client.query(
          `SELECT COUNT(*)::text FROM public.crm_appointments WHERE starts_at::date = CURRENT_DATE AND tenant_id = $1`,
          [tenant],
        ).then(r => r.rows),
      );
    } catch { /* table or column missing — return 0 */ }

    try {
      todayRevenue = safeNum(
        await client.query(
          `SELECT COALESCE(SUM(amount), 0)::text AS rev FROM public.commerce_payments WHERE status IN ('succeeded','captured') AND created_at::date = CURRENT_DATE AND tenant_id = $1`,
          [tenant],
        ).then(r => r.rows),
        "rev",
      );
    } catch { /* commerce_payments might not exist yet */ }

    try {
      newCustomers30d = safeCount(
        await client.query(
          `SELECT COUNT(*)::text FROM public.crm_customers WHERE created_at >= NOW() - INTERVAL '30 days' AND tenant_id = $1 AND is_active = true`,
          [tenant],
        ).then(r => r.rows),
      );
    } catch { /* crm_customers might not exist yet */ }

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
      const total = get("no_show") + get("completed") + get("cancelled") + get("confirmed");
      noShowRate30d = total > 0 ? Number(((get("no_show") / total) * 100).toFixed(2)) : null;
    } catch { /* leave null */ }

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
      const totalCustomers = safeCount(totals);
      const rebookCustomers = safeCount(rebookers);
      rebookRate30d = totalCustomers > 0
        ? Number(((rebookCustomers / totalCustomers) * 100).toFixed(2))
        : null;
    } catch { /* leave null */ }

    try {
      staffOnDuty = safeCount(
        await client.query(
          `SELECT COUNT(*)::text FROM public.crm_staff WHERE is_active = true AND tenant_id = $1`,
          [tenant],
        ).then(r => r.rows),
      );
    } catch { /* return 0 */ }

    // ---- Booking Funnel (30 days) — the 6 canonical stages ----
    let bookingFunnel: Array<{ stage: string; count: number }> = [];
    try {
      const funnelRows = await client.query(
        `SELECT event_type, COUNT(*)::text AS count
         FROM public.crm_funnel_events
         WHERE occurred_at >= CURRENT_DATE - INTERVAL '30 days' AND tenant_id = $1
         GROUP BY event_type`,
        [tenant],
      );
      const funnelMap: Record<string, number> = {};
      for (const row of funnelRows.rows) {
        funnelMap[row.event_type] = Number(row.count);
      }
      bookingFunnel = [
        { stage: "Website Visits", count: funnelMap["website_visit"] || 0 },
        { stage: "Accounts Created", count: funnelMap["account_created"] || 0 },
        { stage: "Intake Started", count: funnelMap["intake_started"] || 0 },
        { stage: "Intake Completed", count: funnelMap["intake_completed"] || 0 },
        { stage: "Booking Started", count: funnelMap["booking_started"] || 0 },
        { stage: "Booking Completed", count: funnelMap["booking_completed"] || 0 },
      ];
    } catch { /* return empty array */ }

    // ---- Alerts ----
    let vaccinationsExpiring = 0;
    let unsignedDocuments = 0;
    let upcomingBirthdays = 0;
    let lowInventory = 0;

    try {
      vaccinationsExpiring = safeCount(
        await client.query(
          `SELECT COUNT(*)::text FROM public.crm_pet_vaccinations
           WHERE expires_at IS NOT NULL AND expires_at <= CURRENT_DATE + INTERVAL '30 days'
           AND tenant_id = $1`,
          [tenant],
        ).then(r => r.rows),
      );
    } catch { /* return 0 */ }

    try {
      unsignedDocuments = safeCount(
        await client.query(
          `SELECT COUNT(*)::text FROM public.crm_documents
           WHERE (status = 'unsigned' OR signed_at IS NULL)
           AND tenant_id = $1`,
          [tenant],
        ).then(r => r.rows),
      );
    } catch { /* return 0 */ }

    try {
      // Upcoming birthdays (B.9.4) — the pet's NEXT anniversary within
      // 30 days. Interval arithmetic clamps Feb 29 → Feb 28 in non-leap
      // years, and a past anniversary rolls to next year. (The previous
      // (month, day) tuple BETWEEN broke across the year boundary: a
      // window spanning Dec → Jan matched nothing in January.)
      upcomingBirthdays = safeCount(
        await client.query(
          `WITH p AS (
             SELECT (date_of_birth + ((EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM date_of_birth))::int) * INTERVAL '1 year')::date AS this_year
               FROM public.crm_pets
              WHERE tenant_id = $1 AND date_of_birth IS NOT NULL
           ), n AS (
             SELECT CASE WHEN this_year >= CURRENT_DATE THEN this_year
                         ELSE (this_year + INTERVAL '1 year')::date END AS next_bday
               FROM p
           )
           SELECT COUNT(*)::text AS count FROM n WHERE next_bday <= CURRENT_DATE + 30`,
          [tenant],
        ).then(r => r.rows),
      );
    } catch { /* return 0 */ }

    try {
      // Canonical low-inventory definition (same as /dashboard/kpis and
      // the widgets alert). The previous version's primary read threw on
      // every call (inventory_items has no `stock` column) and its
      // erp_low_inventory fallback counted 31,514 rows for this tenant —
      // against a canonical figure of 0.
      lowInventory = safeCount(
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
    } catch { /* return 0 */ }

    return NextResponse.json({
      kpis: {
        todayAppointments,
        todayRevenue: todayRevenue.toFixed(2),
        newCustomers30d,
        noShowRate30d,
        rebookRate30d,
        staffOnDuty,
      },
      bookingFunnel,
      alerts: {
        vaccinationsExpiring,
        unsignedDocuments,
        upcomingBirthdays,
        lowInventory,
      },
    });
  }).then(r => r ?? NextResponse.json({ error: "DB unavailable" }, { status: 503 }))
    .catch((e) => NextResponse.json({ error: e?.message || "Dashboard fetch failed" }, { status: 500 }));
}
