import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";

export const dynamic = "force-dynamic";

// ============================================================================
// GET /api/admin/analytics/insights — comparisons, forecasts, locations.
//
// §4.3 gaps: the Analytics screen's funnel was real but (1) side-by-side
// comparisons stopped at revenue, (2) the projections panel admitted
// "No projection model is connected", and (3) the multi-location
// rollup was one hardcoded tenant-wide row. This endpoint computes all
// three from the live stores:
//
//   comparisons — today vs yesterday (revenue + appointments), new
//     customers 30d vs prior 30d, no-show rate 30d vs prior 30d
//     (no_show / (completed + no_show)), repeat-booking rate 90d vs
//     prior 90d (customers with 2+ appointments / customers with 1+).
//   forecasts — least-squares linear trend over the trailing 28 daily
//     points, projected forward; every figure carries its sample size
//     and method so a thin series reads as thin. Staffing derives
//     groomer-days from trailing throughput (appointments per
//     groomer-day). Churn is a cohort count: customers whose last
//     appointment is aging into the 45–90 day risk window. Conversion
//     projects the begin_booking → booking_created rate trend from
//     analytics_events (the platform event store the funnel already
//     reads — it carries no tenant column, so it is platform-scope by
//     the existing design and labeled as such).
//   locations — one row per crm_locations record from
//     crm_appointments (appointments, completed-services revenue,
//     distinct groomers, avg ticket), plus an unassigned bucket.
//     Payments revenue is not location-attributed anywhere in the
//     schema (commerce_sales carries no location), so per-location
//     revenue is services revenue and the consolidated payments figure
//     stays tenant-wide in the reports API.
// ============================================================================

function trend(points: number[]): { avg: number; slopePerDay: number; next7: number; next30: number } {
  const n = points.length;
  const avg = n ? points.reduce((s, v) => s + v, 0) / n : 0;
  if (n < 2) return { avg, slopePerDay: 0, next7: avg * 7, next30: avg * 30 };
  const xMean = (n - 1) / 2;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (points[i] - avg);
    den += (i - xMean) * (i - xMean);
  }
  const slope = den ? num / den : 0;
  const projectDay = (offset: number) => Math.max(0, avg + slope * (offset - xMean));
  let next7 = 0;
  let next30 = 0;
  for (let d = 0; d < 30; d++) {
    const v = projectDay(n + d);
    if (d < 7) next7 += v;
    next30 += v;
  }
  return { avg, slopePerDay: slope, next7, next30 };
}

const pct = (a: number, b: number) => (b > 0 ? Number((((a - b) / b) * 100).toFixed(1)) : null);

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("analytics", "read");
  if (gate) return gate;
  const tenant = resolveTenantId(req);

  const data = await withPg(async (c) => {
    // ---- daily series, trailing 28 days --------------------------------
    const { rows: revSeries } = await c.query(
      `SELECT COALESCE(SUM(p.amount), 0)::float AS v
         FROM generate_series(CURRENT_DATE - 27, CURRENT_DATE, INTERVAL '1 day') AS d(day)
         LEFT JOIN public.commerce_payments p
           ON p.tenant_id = $1 AND p.created_at::date = d.day::date
          AND p.status IN ('succeeded','captured')
        GROUP BY d.day ORDER BY d.day`,
      [tenant],
    );
    const { rows: apptSeries } = await c.query(
      `SELECT COUNT(a.id)::int AS v
         FROM generate_series(CURRENT_DATE - 27, CURRENT_DATE, INTERVAL '1 day') AS d(day)
         LEFT JOIN public.crm_appointments a
           ON a.tenant_id = $1 AND a.starts_at::date = d.day::date
          AND a.status <> 'cancelled'
        GROUP BY d.day ORDER BY d.day`,
      [tenant],
    );

    // ---- comparisons ----------------------------------------------------
    const { rows: cmp } = await c.query(
      `SELECT
         (SELECT COALESCE(SUM(amount),0)::float FROM public.commerce_payments
           WHERE tenant_id = $1 AND status IN ('succeeded','captured') AND created_at::date = CURRENT_DATE) AS rev_today,
         (SELECT COALESCE(SUM(amount),0)::float FROM public.commerce_payments
           WHERE tenant_id = $1 AND status IN ('succeeded','captured') AND created_at::date = CURRENT_DATE - 1) AS rev_yesterday,
         (SELECT COUNT(*)::int FROM public.crm_appointments
           WHERE tenant_id = $1 AND starts_at::date = CURRENT_DATE AND status <> 'cancelled') AS appts_today,
         (SELECT COUNT(*)::int FROM public.crm_appointments
           WHERE tenant_id = $1 AND starts_at::date = CURRENT_DATE - 1 AND status <> 'cancelled') AS appts_yesterday,
         (SELECT COUNT(*)::int FROM public.crm_customers
           WHERE tenant_id = $1 AND created_at::date > CURRENT_DATE - 30) AS cust_new_30,
         (SELECT COUNT(*)::int FROM public.crm_customers
           WHERE tenant_id = $1 AND created_at::date <= CURRENT_DATE - 30 AND created_at::date > CURRENT_DATE - 60) AS cust_new_prev30,
         (SELECT COUNT(*)::int FROM public.crm_appointments
           WHERE tenant_id = $1 AND status = 'no_show' AND starts_at::date > CURRENT_DATE - 30) AS noshow_30,
         (SELECT COUNT(*)::int FROM public.crm_appointments
           WHERE tenant_id = $1 AND status IN ('completed','no_show') AND starts_at::date > CURRENT_DATE - 30) AS decided_30,
         (SELECT COUNT(*)::int FROM public.crm_appointments
           WHERE tenant_id = $1 AND status = 'no_show' AND starts_at::date <= CURRENT_DATE - 30 AND starts_at::date > CURRENT_DATE - 60) AS noshow_prev30,
         (SELECT COUNT(*)::int FROM public.crm_appointments
           WHERE tenant_id = $1 AND status IN ('completed','no_show') AND starts_at::date <= CURRENT_DATE - 30 AND starts_at::date > CURRENT_DATE - 60) AS decided_prev30`,
      [tenant],
    );
    const r0 = cmp[0] || {};
    const noShowRate = r0.decided_30 > 0 ? Number(((r0.noshow_30 / r0.decided_30) * 100).toFixed(1)) : null;
    const noShowRatePrev = r0.decided_prev30 > 0 ? Number(((r0.noshow_prev30 / r0.decided_prev30) * 100).toFixed(1)) : null;

    const { rows: rebook } = await c.query(
      `SELECT
         (SELECT COUNT(*)::int FROM (SELECT customer_id FROM public.crm_appointments
            WHERE tenant_id = $1 AND customer_id IS NOT NULL AND status <> 'cancelled'
              AND starts_at::date > CURRENT_DATE - 90
            GROUP BY customer_id HAVING COUNT(*) >= 2) s) AS repeat_90,
         (SELECT COUNT(DISTINCT customer_id)::int FROM public.crm_appointments
            WHERE tenant_id = $1 AND customer_id IS NOT NULL AND status <> 'cancelled'
              AND starts_at::date > CURRENT_DATE - 90) AS base_90,
         (SELECT COUNT(*)::int FROM (SELECT customer_id FROM public.crm_appointments
            WHERE tenant_id = $1 AND customer_id IS NOT NULL AND status <> 'cancelled'
              AND starts_at::date <= CURRENT_DATE - 90 AND starts_at::date > CURRENT_DATE - 180
            GROUP BY customer_id HAVING COUNT(*) >= 2) s) AS repeat_prev90,
         (SELECT COUNT(DISTINCT customer_id)::int FROM public.crm_appointments
            WHERE tenant_id = $1 AND customer_id IS NOT NULL AND status <> 'cancelled'
              AND starts_at::date <= CURRENT_DATE - 90 AND starts_at::date > CURRENT_DATE - 180) AS base_prev90`,
      [tenant],
    );
    const rb = rebook[0] || {};
    const rebookRate = rb.base_90 > 0 ? Number(((rb.repeat_90 / rb.base_90) * 100).toFixed(1)) : null;
    const rebookRatePrev = rb.base_prev90 > 0 ? Number(((rb.repeat_prev90 / rb.base_prev90) * 100).toFixed(1)) : null;

    // ---- staffing throughput -------------------------------------------
    const { rows: thru } = await c.query(
      `SELECT CASE WHEN COUNT(DISTINCT (starts_at::date, assigned_groomer_id)) > 0
              THEN COUNT(*)::float / COUNT(DISTINCT (starts_at::date, assigned_groomer_id))
              ELSE 0 END AS per_groomer_day
         FROM public.crm_appointments
        WHERE tenant_id = $1 AND status <> 'cancelled' AND assigned_groomer_id IS NOT NULL
          AND starts_at::date > CURRENT_DATE - 28`,
      [tenant],
    );
    const throughput = Number(thru[0]?.per_groomer_day || 0);

    // ---- churn cohorts ---------------------------------------------------
    const { rows: churn } = await c.query(
      `WITH last_appt AS (
         SELECT customer_id, MAX(starts_at)::date AS last_day
           FROM public.crm_appointments
          WHERE tenant_id = $1 AND customer_id IS NOT NULL AND status <> 'cancelled'
          GROUP BY customer_id
       )
       SELECT
         COUNT(*) FILTER (WHERE last_day > CURRENT_DATE - 90)::int AS active_base,
         COUNT(*) FILTER (WHERE last_day <= CURRENT_DATE - 45 AND last_day > CURRENT_DATE - 90)::int AS at_risk_now,
         COUNT(*) FILTER (WHERE last_day <= CURRENT_DATE - 15 AND last_day > CURRENT_DATE - 45)::int AS entering_window
         FROM last_appt`,
      [tenant],
    );
    const ch = churn[0] || { active_base: 0, at_risk_now: 0, entering_window: 0 };

    // ---- conversions (platform event store) ------------------------------
    // Same-session funnel: a session counts as converted only when it
    // both began and completed a booking inside the window, so the rate
    // is bounded at 100% by construction (raw event counts are not —
    // booking_created also fires for flows that began earlier).
    const { rows: conv } = await c.query(
      `WITH sess AS (
         SELECT session_id,
                BOOL_OR(event_name = 'begin_booking') AS started,
                BOOL_OR(event_name = 'booking_created') AS completed,
                MIN(created_at::date) AS first_day
           FROM public.analytics_events
          WHERE session_id IS NOT NULL AND created_at::date > CURRENT_DATE - 60
          GROUP BY session_id
       )
       SELECT
         COUNT(*) FILTER (WHERE started AND first_day > CURRENT_DATE - 30)::int AS starts_30,
         COUNT(*) FILTER (WHERE started AND completed AND first_day > CURRENT_DATE - 30)::int AS done_30,
         COUNT(*) FILTER (WHERE started AND first_day <= CURRENT_DATE - 30)::int AS starts_prev30,
         COUNT(*) FILTER (WHERE started AND completed AND first_day <= CURRENT_DATE - 30)::int AS done_prev30
         FROM sess`,
      [],
    );
    const cv = conv[0] || {};
    const convRate = cv.starts_30 > 0 ? Number(((cv.done_30 / cv.starts_30) * 100).toFixed(1)) : null;
    const convRatePrev = cv.starts_prev30 > 0 ? Number(((cv.done_prev30 / cv.starts_prev30) * 100).toFixed(1)) : null;
    const convRateProjected = convRate !== null && convRatePrev !== null
      ? Number(Math.max(0, Math.min(100, convRate + (convRate - convRatePrev))).toFixed(1))
      : convRate;

    // ---- locations ---------------------------------------------------------
    const { rows: locations } = await c.query(
      `SELECT l.id::text AS id, l.name,
              COUNT(a.id)::int AS appointments_30d,
              COALESCE(SUM(a.total) FILTER (WHERE a.status = 'completed'), 0)::float AS services_revenue_30d,
              COUNT(a.id) FILTER (WHERE a.status = 'completed')::int AS completed_30d,
              COUNT(DISTINCT a.assigned_groomer_id)::int AS active_groomers_30d
         FROM public.crm_locations l
         LEFT JOIN public.crm_appointments a
           ON a.tenant_id = l.tenant_id AND a.location_id = l.id
          AND a.starts_at::date > CURRENT_DATE - 30 AND a.status <> 'cancelled'
        WHERE l.tenant_id = $1
        GROUP BY l.id, l.name
        ORDER BY l.name`,
      [tenant],
    );
    const { rows: unassigned } = await c.query(
      `SELECT COUNT(*)::int AS appointments_30d,
              COALESCE(SUM(total) FILTER (WHERE status = 'completed'), 0)::float AS services_revenue_30d
         FROM public.crm_appointments
        WHERE tenant_id = $1 AND location_id IS NULL
          AND starts_at::date > CURRENT_DATE - 30 AND status <> 'cancelled'`,
      [tenant],
    );

    const revTrend = trend(revSeries.map((x: any) => Number(x.v) || 0));
    const apptTrend = trend(apptSeries.map((x: any) => Number(x.v) || 0));
    const projectedApptsPerDay = apptTrend.next7 / 7;

    return {
      comparisons: {
        todayVsYesterday: {
          revenue: { today: Number(r0.rev_today || 0), yesterday: Number(r0.rev_yesterday || 0), changePct: pct(Number(r0.rev_today || 0), Number(r0.rev_yesterday || 0)) },
          appointments: { today: r0.appts_today || 0, yesterday: r0.appts_yesterday || 0, changePct: pct(r0.appts_today || 0, r0.appts_yesterday || 0) },
        },
        newCustomers: { last30: r0.cust_new_30 || 0, prev30: r0.cust_new_prev30 || 0, changePct: pct(r0.cust_new_30 || 0, r0.cust_new_prev30 || 0) },
        noShowRate: { last30: noShowRate, prev30: noShowRatePrev, decidedLast30: r0.decided_30 || 0 },
        rebookRate: { last90: rebookRate, prev90: rebookRatePrev, baseLast90: rb.base_90 || 0 },
      },
      forecasts: {
        method: "Least-squares linear trend over the trailing 28 daily points, projected forward; churn is a last-appointment cohort count; conversion projects the 30d rate trend.",
        revenue: { avgDaily: revTrend.avg, slopePerDay: revTrend.slopePerDay, next7: revTrend.next7, next30: revTrend.next30, sampleDays: revSeries.length },
        appointments: { avgDaily: apptTrend.avg, slopePerDay: apptTrend.slopePerDay, next7: apptTrend.next7, next30: apptTrend.next30, sampleDays: apptSeries.length },
        staffing: {
          projectedAppointmentsPerDay: Number(projectedApptsPerDay.toFixed(2)),
          trailingAppointmentsPerGroomerDay: Number(throughput.toFixed(2)),
          impliedGroomerDaysPerDay: throughput > 0 ? Number((projectedApptsPerDay / throughput).toFixed(2)) : null,
        },
        churn: {
          activeBase: ch.active_base || 0,
          atRiskNow: ch.at_risk_now || 0,
          atRiskRate: ch.active_base > 0 ? Number(((ch.at_risk_now / ch.active_base) * 100).toFixed(1)) : null,
          enteringRiskWindow: ch.entering_window || 0,
          projectedAtRisk30d: (ch.at_risk_now || 0) + (ch.entering_window || 0),
        },
        conversions: {
          scope: "platform (analytics_events carries no tenant column — same store the funnel reads)",
          starts30: cv.starts_30 || 0, completed30: cv.done_30 || 0,
          rate30: convRate, ratePrev30: convRatePrev, projectedRateNext30: convRateProjected,
        },
      },
      locations: {
        rows: locations.map((l: any) => ({
          id: l.id, name: l.name,
          appointments30d: l.appointments_30d,
          servicesRevenue30d: Number(l.services_revenue_30d || 0),
          completed30d: l.completed_30d,
          activeGroomers30d: l.active_groomers_30d,
          avgTicket: l.completed_30d > 0 ? Number((Number(l.services_revenue_30d || 0) / l.completed_30d).toFixed(2)) : null,
        })),
        unassigned: {
          appointments30d: unassigned[0]?.appointments_30d || 0,
          servicesRevenue30d: Number(unassigned[0]?.services_revenue_30d || 0),
        },
      },
    };
  });

  return NextResponse.json(data ?? { error: "insights unavailable" }, data ? undefined : { status: 500 });
}
