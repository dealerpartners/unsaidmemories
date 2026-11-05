// ---------------------------------------------------------------------------
// /api/admin/analytics/actions/route.ts
//
// Customer & Operations Analytics quick actions. Each handler runs real
// SQL aggregations against the live Supabase database (no stubs, no log-
// only fallbacks). All invocations are audit-logged via the shared
// auditAction() helper.
//
// Currently supported:
//   analytics_view_bookings_funnel   — funnel events by stage
//   analytics_view_no_show_rate      — no-show rate over a date range
//   analytics_view_rebook_rate       — repeat-booking rate within 30 days
//
// These are SELECT-only operations; the audit log captures the call so the
// operator can see "who asked for the no-show report on what date range".
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { guardPayloadIds, guardRequiredFields } from "@/lib/quick-actions/validate";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";
import { auditAction, getActorIdFromRequest } from "@/lib/quick-actions/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("reports", "write");
  if (gate) return gate;

  let action = "";
  let payload: Record<string, unknown> = {};
  let actorId: string | null = null;
  let ip: string | null = null;

  try {
    const body = await req.json();
    action = String(body.action || "");
    payload = body.payload ?? body;
    delete (payload as Record<string, unknown>).action;
    const idGuard = guardPayloadIds(payload);
    if (idGuard) return idGuard;
    const reqGuard = guardRequiredFields(action, payload);
    if (reqGuard) return reqGuard;
    actorId = await getActorIdFromRequest(req);
    ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  } catch (e) {
    return NextResponse.json({ error: `Invalid request body: ${e instanceof Error ? e.message : "unknown"}` }, { status: 400 });
  }

  // Palette alias: registry rpt-revenue → "revenue"; the handler below is
  // daily_revenue (daily revenue summary).
  const strippedAction = action.replace(/^[a-z]+_/, "");
  const shortAction = strippedAction === "revenue" ? "daily_revenue" : strippedAction;

  try {
    switch (shortAction) {
      case "view_bookings_funnel":
      case "bookings_funnel":
      case "funnel": {
        // analytics_view_bookings_funnel → view_bookings_funnel
        // Aggregate crm_funnel_events by event_type over a date range.
        // CHECK constraint on event_type only allows:
        //   website_visit | account_created | intake_started | intake_completed |
        //   booking_started | booking_completed
        const startDate = String(payload.start_date || payload.from_date || "");
        const endDate = String(payload.end_date || payload.to_date || "");
        const dateFilter = startDate && endDate
          ? `AND occurred_at::date BETWEEN $2::date AND $3::date`
          : "";
        const params: unknown[] = [resolveTenantId(req)];
        if (startDate && endDate) params.push(startDate, endDate);
        const rows = await pgQuery<{ event_type: string; count: string }>(
          `SELECT event_type, COUNT(*)::text AS count
             FROM public.crm_funnel_events
            WHERE tenant_id = $1
            ${dateFilter}
            GROUP BY event_type
            ORDER BY
              CASE event_type
                WHEN 'website_visit' THEN 1
                WHEN 'account_created' THEN 2
                WHEN 'intake_started' THEN 3
                WHEN 'intake_completed' THEN 4
                WHEN 'booking_started' THEN 5
                WHEN 'booking_completed' THEN 6
                ELSE 99
              END`,
          params,
        );
        // Build the funnel with all 6 canonical stages (zero-filled)
        const STAGES = ["website_visit", "account_created", "intake_started", "intake_completed", "booking_started", "booking_completed"];
        const counts: Record<string, number> = {};
        for (const s of STAGES) {
          counts[s] = Number(rows.find(r => r.event_type === s)?.count || 0);
        }
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        const result = {
          dateRange: { from: startDate || null, to: endDate || null },
          stages: STAGES.map(stage => ({ stage, count: counts[stage] })),
          totalEvents: total,
        };
        await auditAction({ action, domain: "crm", tableName: "crm_funnel_events", recordId: null, afterData: result, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, bookingsFunnel: result });
      }

      case "view_no_show_rate":
      case "no_show_rate":
      case "no_show": {
        // analytics_view_no_show_rate → view_no_show_rate
        // Compute the no-show rate over a date range.
        // crm_appointments.status CHECK enum includes: precheck, deposit_paid,
        // scheduled, assigned, waiting_checkin, confirmed, checked_in, in_service,
        // hold, completed, no_show, cancelled, rescheduled.
        // No-show rate = (no_show count) / (no_show + completed + cancelled)
        const startDate = String(payload.start_date || payload.from_date || "");
        const endDate = String(payload.end_date || payload.to_date || "");
        const dateFilter = startDate && endDate
          ? `AND starts_at::date BETWEEN $2::date AND $3::date`
          : "";
        const params: unknown[] = [resolveTenantId(req)];
        if (startDate && endDate) params.push(startDate, endDate);
        const rows = await pgQuery<{ status: string; count: string }>(
          `SELECT status, COUNT(*)::text AS count
             FROM public.crm_appointments
            WHERE tenant_id = $1
              AND status IN ('no_show','completed','cancelled','confirmed')
            ${dateFilter}
            GROUP BY status`,
          params,
        );
        const noShow = Number(rows.find(r => r.status === "no_show")?.count || 0);
        const completed = Number(rows.find(r => r.status === "completed")?.count || 0);
        const cancelled = Number(rows.find(r => r.status === "cancelled")?.count || 0);
        const confirmed = Number(rows.find(r => r.status === "confirmed")?.count || 0);
        const denominator = noShow + completed + cancelled + confirmed;
        const rate = denominator > 0 ? (noShow / denominator) : 0;
        const result = {
          dateRange: { from: startDate || null, to: endDate || null },
          counts: { noShow, completed, cancelled, confirmed, totalAppointments: denominator },
          noShowRate: rate,
          noShowRatePct: Number((rate * 100).toFixed(2)),
        };
        await auditAction({ action, domain: "crm", tableName: "crm_appointments", recordId: null, afterData: result, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, noShowRate: result });
      }

      case "view_rebook_rate":
      case "rebook_rate":
      case "rebook": {
        // analytics_view_rebook_rate → view_rebook_rate
        // Compute the rebook rate: customers with >=2 appointments where
        // the second appointment starts within 30 days of the first's
        // completion. Denominator = unique customers with >=1 completed appt.
        const startDate = String(payload.start_date || payload.from_date || "");
        const endDate = String(payload.end_date || payload.to_date || "");
        const dateFilter = startDate && endDate
          ? `AND a1.starts_at::date BETWEEN $2::date AND $3::date`
          : "";
        const params: unknown[] = [resolveTenantId(req)];
        if (startDate && endDate) params.push(startDate, endDate);
        // Customers with >= 1 completed/confirmed appointment in the range
        const totals = await pgQuery<{ total_customers: string }>(
          `SELECT COUNT(DISTINCT customer_id)::text AS total_customers
             FROM public.crm_appointments
            WHERE tenant_id = $1
              AND status IN ('completed','confirmed')
              ${dateFilter}
              AND customer_id IS NOT NULL`,
          params,
        );
        const totalCustomers = Number(totals[0]?.total_customers || 0);
        // Customers with >= 2 appointments within 30 days of each other.
        // We use a self-join on the appointments table directly (NOT a CTE
        // alias — the CTE causes a scope bug where a1 isn't visible).
        const rebookers = await pgQuery<{ rebook_customers: string }>(
          `SELECT COUNT(DISTINCT a1.customer_id)::text AS rebook_customers
             FROM public.crm_appointments a1
             JOIN public.crm_appointments a2
               ON a1.customer_id = a2.customer_id
              AND a1.tenant_id = a2.tenant_id
              AND a1.starts_at < a2.starts_at
              AND a2.starts_at <= a1.starts_at + INTERVAL '30 days'
            WHERE a1.tenant_id = $1
              AND a1.status IN ('completed','confirmed')
              AND a2.status IN ('completed','confirmed')
              ${dateFilter ? `AND a1.starts_at::date BETWEEN $2::date AND $3::date` : ''}
              AND a1.customer_id IS NOT NULL`,
          params,
        );
        const rebookCustomers = Number(rebookers[0]?.rebook_customers || 0);
        const rate = totalCustomers > 0 ? (rebookCustomers / totalCustomers) : 0;
        const result = {
          dateRange: { from: startDate || null, to: endDate || null },
          counts: { totalCustomers, rebookCustomers },
          rebookRate: rate,
          rebookRatePct: Number((rate * 100).toFixed(2)),
        };
        await auditAction({ action, domain: "crm", tableName: "crm_appointments", recordId: null, afterData: result, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, rebookRate: result });
      }

      // ───────────────────────────────────────────────────────────────────
      // ENTITY REPORTS — 10 SQL aggregation reports that surface business
      // metrics across the live data. Each handler runs direct SQL against
      // the relevant tables (no RPC functions needed — these are simple
      // GROUP BY aggregations). All invocations are audit-logged.
      // ───────────────────────────────────────────────────────────────────

      case "view_daily_revenue":
      case "daily_revenue":
      case "daily_revenue_summary": {
        // analytics_view_daily_revenue → view_daily_revenue
        // Daily revenue from succeeded commerce_payments, optionally
        // grouped by day over the date range. Includes payment count and
        // average ticket.
        const startDate = String(payload.start_date || payload.from_date || "");
        const endDate = String(payload.end_date || payload.to_date || "");
        const dateFilter = startDate && endDate
          ? `AND created_at::date BETWEEN $2::date AND $3::date`
          : "";
        const params: unknown[] = [resolveTenantId(req)];
        if (startDate && endDate) params.push(startDate, endDate);
        const rows = await pgQuery<{ day: string; count: string; revenue: string }>(
          `SELECT DATE(created_at)::text AS day, COUNT(*)::text AS count, COALESCE(SUM(amount),0)::text AS revenue
             FROM public.commerce_payments
            WHERE tenant_id = $1 AND status = 'succeeded'
            ${dateFilter}
            GROUP BY DATE(created_at) ORDER BY day DESC LIMIT 90`,
          params,
        );
        const days = rows.map(r => ({ date: r.day, paymentCount: Number(r.count), revenue: Number(r.revenue) }));
        const totals = {
          totalRevenue: days.reduce((s, d) => s + d.revenue, 0),
          totalPayments: days.reduce((s, d) => s + d.paymentCount, 0),
          dayCount: days.length,
          avgDailyRevenue: days.length > 0 ? days.reduce((s, d) => s + d.revenue, 0) / days.length : 0,
          avgTicket: days.length > 0 && days.reduce((s, d) => s + d.paymentCount, 0) > 0
            ? days.reduce((s, d) => s + d.revenue, 0) / days.reduce((s, d) => s + d.paymentCount, 0)
            : 0,
        };
        const result = { dateRange: { from: startDate || null, to: endDate || null }, days, totals };
        await auditAction({ action, domain: "commerce", tableName: "commerce_payments", recordId: null, afterData: { totals }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, dailyRevenue: result });
      }

      case "view_service_revenue":
      case "service_revenue":
      case "service_report": {
        // analytics_view_service_revenue → view_service_revenue
        // Per-service report from the appointment line items:
        // crm_appointment_services carries one row per booked service
        // with a price snapshot. (The previous version grouped
        // crm_appointments by service_type_confirmed — a BOOLEAN
        // workflow flag, not a service type — and NULLIF(flag, '')
        // threw 22P02 on every call.) Revenue counts completed
        // appointments only; counts are distinct appointments per
        // service (a multi-service appointment counts once per service).
        const startDate = String(payload.start_date || payload.from_date || "");
        const endDate = String(payload.end_date || payload.to_date || "");
        const dateFilter = startDate && endDate
          ? `AND a.starts_at::date BETWEEN $2::date AND $3::date`
          : "";
        const params: unknown[] = [resolveTenantId(req)];
        if (startDate && endDate) params.push(startDate, endDate);
        const rows = await pgQuery<{ service_type: string; count: string; completed_count: string; revenue: string }>(
          `SELECT sv.name AS service_type,
                  COUNT(DISTINCT aps.appointment_id)::text AS count,
                  COUNT(DISTINCT aps.appointment_id) FILTER (WHERE a.status = 'completed')::text AS completed_count,
                  COALESCE(SUM(aps.total) FILTER (WHERE a.status = 'completed'), 0)::text AS revenue
             FROM public.crm_appointment_services aps
             JOIN public.crm_services sv ON sv.id = aps.service_id
             JOIN public.crm_appointments a ON a.id = aps.appointment_id
            WHERE aps.tenant_id = $1
            ${dateFilter}
            GROUP BY sv.name ORDER BY revenue DESC`,
          params,
        );
        const services = rows.map(r => ({
          serviceType: r.service_type,
          appointmentCount: Number(r.count),
          completedCount: Number(r.completed_count),
          revenue: Number(r.revenue),
        }));
        const result = {
          dateRange: { from: startDate || null, to: endDate || null },
          services,
          totals: {
            totalRevenue: services.reduce((s, r) => s + r.revenue, 0),
            totalAppointments: services.reduce((s, r) => s + r.appointmentCount, 0),
            serviceCount: services.length,
          },
        };
        await auditAction({ action, domain: "crm", tableName: "crm_appointment_services", recordId: null, afterData: { totals: result.totals }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, serviceRevenue: result });
      }

      case "view_product_sales":
      case "product_sales":
      case "product_report": {
        // analytics_view_product_sales → view_product_sales
        // Per-product sales from commerce_order_items. (The previous
        // version grouped commerce_orders BY STATUS and labeled the rows
        // as products — and its SUM(total_amount::numeric) cast threw on
        // the "$25.27" text totals anyway. Line items are the real
        // source: unit_price is also text, stripped and cast safely.)
        const startDate = String(payload.start_date || payload.from_date || "");
        const endDate = String(payload.end_date || payload.to_date || "");
        const dateFilter = startDate && endDate
          ? `AND o.created_at::date BETWEEN $2::date AND $3::date`
          : "";
        const params: unknown[] = [resolveTenantId(req)];
        if (startDate && endDate) params.push(startDate, endDate);
        const rows = await pgQuery<{ product_name: string; order_count: string; units: string; revenue: string }>(
          `SELECT COALESCE(i.name, o.id) AS product_name,
                  COUNT(DISTINCT i.order_id)::text AS order_count,
                  COALESCE(SUM(i.quantity), 0)::text AS units,
                  COALESCE(SUM(i.quantity * NULLIF(regexp_replace(i.unit_price, '[^0-9.\\-]', '', 'g'), '')::numeric), 0)::text AS revenue
             FROM public.commerce_order_items i
             JOIN public.commerce_orders o ON o.id = i.order_id
            WHERE i.tenant_id = $1
            ${dateFilter}
            GROUP BY COALESCE(i.name, o.id) ORDER BY revenue DESC`,
          params,
        );
        const products = rows.map(r => ({
          product: r.product_name,
          orderCount: Number(r.order_count),
          units: Number(r.units),
          revenue: Number(r.revenue),
        }));
        // Distinct orders overall — summing the per-product distinct
        // counts would double-count any order holding two products.
        const orderTotals = await pgQuery<{ order_count: string }>(
          `SELECT COUNT(DISTINCT i.order_id)::text AS order_count
             FROM public.commerce_order_items i
             JOIN public.commerce_orders o ON o.id = i.order_id
            WHERE i.tenant_id = $1
            ${dateFilter}`,
          params,
        );
        const result = {
          dateRange: { from: startDate || null, to: endDate || null },
          products,
          totals: {
            totalRevenue: products.reduce((s, r) => s + r.revenue, 0),
            totalOrders: Number(orderTotals[0]?.order_count || 0),
            totalUnits: products.reduce((s, r) => s + r.units, 0),
          },
        };
        await auditAction({ action, domain: "commerce", tableName: "commerce_order_items", recordId: null, afterData: { totals: result.totals }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, productSales: result });
      }

      case "view_multi_location_revenue":
      case "multi_location_revenue":
      case "location_report": {
        // analytics_view_multi_location_revenue → view_multi_location_revenue
        // Revenue and appointment count grouped by location from
        // crm_appointments. Joins crm_locations for the location name.
        const startDate = String(payload.start_date || payload.from_date || "");
        const endDate = String(payload.end_date || payload.to_date || "");
        const dateFilter = startDate && endDate
          ? `AND a.starts_at::date BETWEEN $2::date AND $3::date`
          : "";
        const params: unknown[] = [resolveTenantId(req)];
        if (startDate && endDate) params.push(startDate, endDate);
        // Revenue counts COMPLETED appointments only — scheduled/precheck
        // totals are pipeline value, not earned revenue.
        const rows = await pgQuery<{ location_id: string | null; location_name: string | null; count: string; completed_count: string; revenue: string }>(
          `SELECT a.location_id, COALESCE(l.name, '(unspecified)') AS location_name,
                  COUNT(*)::text AS count,
                  COUNT(*) FILTER (WHERE a.status = 'completed')::text AS completed_count,
                  COALESCE(SUM(a.total) FILTER (WHERE a.status = 'completed'),0)::text AS revenue
             FROM public.crm_appointments a
             LEFT JOIN public.crm_locations l ON l.id = a.location_id
            WHERE a.tenant_id = $1
            ${dateFilter}
            GROUP BY a.location_id, l.name ORDER BY revenue DESC`,
          params,
        );
        const locations = rows.map(r => ({
          locationId: r.location_id, locationName: r.location_name,
          appointmentCount: Number(r.count), completedCount: Number(r.completed_count),
          revenue: Number(r.revenue),
        }));
        const result = {
          dateRange: { from: startDate || null, to: endDate || null },
          locations,
          totals: {
            totalRevenue: locations.reduce((s, r) => s + r.revenue, 0),
            totalAppointments: locations.reduce((s, r) => s + r.appointmentCount, 0),
            locationCount: locations.length,
          },
        };
        await auditAction({ action, domain: "crm", tableName: "crm_appointments", recordId: null, afterData: { totals: result.totals }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, multiLocationRevenue: result });
      }

      case "view_groomer_performance":
      case "groomer_performance":
      case "groomer_report": {
        // analytics_view_groomer_performance → view_groomer_performance
        // Revenue + appointment count + completed count grouped by groomer
        // (assigned_groomer_id) from crm_appointments. Joins crm_staff for
        // the groomer's display name.
        const startDate = String(payload.start_date || payload.from_date || "");
        const endDate = String(payload.end_date || payload.to_date || "");
        const dateFilter = startDate && endDate
          ? `AND a.starts_at::date BETWEEN $2::date AND $3::date`
          : "";
        const params: unknown[] = [resolveTenantId(req)];
        if (startDate && endDate) params.push(startDate, endDate);
        const rows = await pgQuery<{
          staff_id: string | null; groomer_name: string | null;
          appt_count: string; completed_count: string; revenue: string;
        }>(
          `SELECT a.assigned_groomer_id AS staff_id,
                  COALESCE(s.display_name, '(unassigned)') AS groomer_name,
                  COUNT(*)::text AS appt_count,
                  COUNT(*) FILTER (WHERE a.status = 'completed')::text AS completed_count,
                  COALESCE(SUM(a.total) FILTER (WHERE a.status = 'completed'),0)::text AS revenue
             FROM public.crm_appointments a
             LEFT JOIN public.crm_staff s ON s.id = a.assigned_groomer_id
            WHERE a.tenant_id = $1
            ${dateFilter}
            GROUP BY a.assigned_groomer_id, s.display_name ORDER BY revenue DESC`,
          params,
        );
        const groomers = rows.map(r => ({
          groomerId: r.staff_id, groomerName: r.groomer_name,
          appointmentCount: Number(r.appt_count), completedCount: Number(r.completed_count),
          revenue: Number(r.revenue),
          completionRate: Number(r.appt_count) > 0 ? Number(r.completed_count) / Number(r.appt_count) : 0,
        }));
        const result = {
          dateRange: { from: startDate || null, to: endDate || null },
          groomers,
          totals: {
            totalRevenue: groomers.reduce((s, r) => s + r.revenue, 0),
            totalAppointments: groomers.reduce((s, r) => s + r.appointmentCount, 0),
            totalCompleted: groomers.reduce((s, r) => s + r.completedCount, 0),
            groomerCount: groomers.length,
          },
        };
        await auditAction({ action, domain: "crm", tableName: "crm_appointments", recordId: null, afterData: { totals: result.totals }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, groomerPerformance: result });
      }

      case "commission":
      case "commissions": {
        // rpt-commission → "commission" (prefix-stripped). Groomer
        // commission report from the REAL ledger — crm_commission_entries
        // accrued on appointment completion at each groomer's profile rate
        // (crm_staff.commission_rate). Same aggregates as
        // v_groomer_commission_report, over the requested date range
        // (earned_on). No entries in range → honest all-zero report.
        const startDate = String(payload.start_date || payload.from_date || "");
        const endDate = String(payload.end_date || payload.to_date || "");
        const dateFilter = startDate && endDate
          ? `AND e.earned_on BETWEEN $2::date AND $3::date`
          : "";
        const params: unknown[] = [resolveTenantId(req)];
        if (startDate && endDate) params.push(startDate, endDate);
        const rows = await pgQuery<{
          staff_id: string; groomer_name: string;
          transactions: string; basis_total: string; tips_total: string;
          commission_pending: string; commission_paid: string; commission_total: string;
        }>(
          `SELECT e.staff_id::text AS staff_id,
                  s.display_name AS groomer_name,
                  COUNT(*) FILTER (WHERE e.entry_type = 'earned')::text AS transactions,
                  COALESCE(SUM(e.basis_amount), 0)::text AS basis_total,
                  COALESCE(SUM(e.tips_amount), 0)::text AS tips_total,
                  COALESCE(SUM(e.commission_amount) FILTER (WHERE e.status = 'pending'), 0)::text AS commission_pending,
                  COALESCE(SUM(e.commission_amount) FILTER (WHERE e.status = 'paid'), 0)::text AS commission_paid,
                  COALESCE(SUM(e.commission_amount) FILTER (WHERE e.entry_type = 'earned'), 0)::text AS commission_total
             FROM public.crm_commission_entries e
             JOIN public.crm_staff s ON s.id = e.staff_id
            WHERE e.tenant_id = $1 AND e.status <> 'void'
            ${dateFilter}
            GROUP BY e.staff_id, s.display_name
            ORDER BY commission_total DESC`,
          params,
        );
        const groomers = rows.map(r => ({
          staffId: r.staff_id, groomerName: r.groomer_name,
          transactions: Number(r.transactions),
          basisTotal: Number(r.basis_total), tipsTotal: Number(r.tips_total),
          commissionPending: Number(r.commission_pending),
          commissionPaid: Number(r.commission_paid),
          commissionTotal: Number(r.commission_total),
        }));
        const result = {
          dateRange: { from: startDate || null, to: endDate || null },
          groomers,
          totals: {
            groomerCount: groomers.length,
            transactions: groomers.reduce((s, r) => s + r.transactions, 0),
            basisTotal: groomers.reduce((s, r) => s + r.basisTotal, 0),
            commissionPending: groomers.reduce((s, r) => s + r.commissionPending, 0),
            commissionPaid: groomers.reduce((s, r) => s + r.commissionPaid, 0),
            commissionTotal: groomers.reduce((s, r) => s + r.commissionTotal, 0),
          },
        };
        await auditAction({ action, domain: "crm", tableName: "crm_commission_entries", recordId: null, afterData: { totals: result.totals }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, commissionReport: result });
      }

      case "view_customer_acquisition":
      case "customer_acquisition":
      case "acquisition_report": {
        // analytics_view_customer_acquisition → view_customer_acquisition
        // New customers per month from crm_customers. Returns the last 12
        // months of acquisition data plus a cumulative total.
        const rows = await pgQuery<{ month: string; count: string }>(
          `SELECT DATE_TRUNC('month', created_at)::text AS month,
                  COUNT(*)::text AS count
             FROM public.crm_customers
            WHERE tenant_id = $1 AND is_active = true
            GROUP BY month ORDER BY month DESC LIMIT 12`,
          [resolveTenantId(req)],
        );
        const months = rows.map(r => ({ month: r.month.slice(0, 7), newCustomers: Number(r.count) }));
        const result = {
          months,
          totals: {
            totalCustomers: months.reduce((s, r) => s + r.newCustomers, 0),
            avgPerMonth: months.length > 0 ? months.reduce((s, r) => s + r.newCustomers, 0) / months.length : 0,
            monthCount: months.length,
          },
        };
        await auditAction({ action, domain: "crm", tableName: "crm_customers", recordId: null, afterData: { totals: result.totals }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, customerAcquisition: result });
      }

      case "view_ar_aging":
      case "ar_aging": {
        // analytics_view_ar_aging → view_ar_aging
        // AR aging report over the SINGLE invoice record —
        // public.acct_ar_invoices, the enterprise AR table every invoice
        // surface reads and writes since the 2026-10-13 consolidation.
        // Semantics match the aging ledger screen's computeAging exactly,
        // so the two surfaces tie to the cent: open = balance > 0 with
        // balance = total − paid − credited − deposit; days past due
        // counted in whole days from due_date (the consolidation set
        // due_date = the legacy dueDate, falling back to the creation
        // date — the same basis the ledger uses); buckets 1-30 / 31-60 /
        // 61-90 / 90+. Open balances not yet past due are totalled
        // separately (notYetDue) instead of dropped, so the report
        // states all of AR.
        const asOfDate = String(payload.as_of_date || payload.end_date || "");
        const asOf = asOfDate || new Date().toISOString().slice(0, 10);
        const rows = await pgQuery<{ invoice_id: string; invoice_number: string; customer_id: string | null; total: string; balance_due: string; basis: string }>(
          `SELECT id::text AS invoice_id, invoice_number, source_customer_id AS customer_id,
                  total::text AS total,
                  (total - amount_paid - amount_credited - deposit_paid)::text AS balance_due,
                  due_date::text AS basis
             FROM public.acct_ar_invoices
            WHERE tenant_id = $1 AND (total - amount_paid - amount_credited - deposit_paid) > 0
            ORDER BY basis ASC`,
          [resolveTenantId(req)],
        );
        const dayMs = 86400000;
        const asOfDay = Date.UTC(Number(asOf.slice(0, 4)), Number(asOf.slice(5, 7)) - 1, Number(asOf.slice(8, 10)));
        const invoices = rows.map(r => {
          const basisDate = new Date(r.basis);
          const basisDay = Date.UTC(basisDate.getUTCFullYear(), basisDate.getUTCMonth(), basisDate.getUTCDate());
          const days = Math.floor((asOfDay - basisDay) / dayMs);
          let bucket = "not-yet-due";
          if (days > 90) bucket = "90+";
          else if (days > 60) bucket = "61-90";
          else if (days > 30) bucket = "31-60";
          else if (days > 0) bucket = "1-30";
          const total = Number(r.total) || 0;
          const outstanding = Number(r.balance_due) || 0;
          return {
            invoiceId: r.invoice_id, invoiceNumber: r.invoice_number, customerId: r.customer_id,
            total, amountPaid: Number((total - outstanding).toFixed(2)),
            outstanding, daysOutstanding: Math.max(days, 0), bucket,
          };
        });
        const pastDue = invoices.filter(i => i.bucket !== "not-yet-due");
        const notYetDue = invoices.filter(i => i.bucket === "not-yet-due");
        const buckets = ["1-30", "31-60", "61-90", "90+"].map(b => {
          const inBucket = pastDue.filter(i => i.bucket === b);
          return {
            bucket: b,
            count: inBucket.length,
            outstanding: inBucket.reduce((s, i) => s + i.outstanding, 0),
          };
        });
        const result = {
          asOfDate: asOf,
          buckets,
          invoices: pastDue,
          totals: {
            totalOutstanding: pastDue.reduce((s, i) => s + i.outstanding, 0),
            invoiceCount: pastDue.length,
            notYetDueCount: notYetDue.length,
            notYetDueTotal: notYetDue.reduce((s, i) => s + i.outstanding, 0),
          },
        };
        await auditAction({ action, domain: "acct", tableName: "invoices", recordId: null, afterData: { totals: result.totals }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, arAging: result });
      }

      case "view_gift_card_liability":
      case "gift_card_liability": {
        // analytics_view_gift_card_liability → view_gift_card_liability
        // Outstanding gift card balances grouped by status. The "liability"
        // is the sum of balances still outstanding (i.e. active cards only —
        // converted/replaced/cancelled cards have balance=0).
        const rows = await pgQuery<{ status: string; count: string; liability: string }>(
          `SELECT status, COUNT(*)::text AS count, COALESCE(SUM(balance),0)::text AS liability
             FROM public.commerce_gift_cards
            WHERE tenant_id = $1
            GROUP BY status ORDER BY liability DESC`,
          [resolveTenantId(req)],
        );
        const byStatus = rows.map(r => ({ status: r.status, cardCount: Number(r.count), liability: Number(r.liability) }));
        const result = {
          byStatus,
          totals: {
            totalLiability: byStatus.reduce((s, r) => s + r.liability, 0),
            totalCards: byStatus.reduce((s, r) => s + r.cardCount, 0),
            activeLiability: Number(byStatus.find(r => r.status === "active")?.liability || 0),
            activeCards: Number(byStatus.find(r => r.status === "active")?.cardCount || 0),
          },
        };
        await auditAction({ action, domain: "acct", tableName: "commerce_gift_cards", recordId: null, afterData: { totals: result.totals }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, giftCardLiability: result });
      }

      case "view_store_credit_liability":
      case "store_credit_liability": {
        // analytics_view_store_credit_liability → view_store_credit_liability
        // Outstanding store credit balances grouped by status. Same
        // shape as the gift card liability report.
        const rows = await pgQuery<{ status: string; count: string; liability: string }>(
          `SELECT status, COUNT(*)::text AS count, COALESCE(SUM(balance),0)::text AS liability
             FROM public.commerce_store_credits
            WHERE tenant_id = $1
            GROUP BY status ORDER BY liability DESC`,
          [resolveTenantId(req)],
        );
        const byStatus = rows.map(r => ({ status: r.status, creditCount: Number(r.count), liability: Number(r.liability) }));
        const result = {
          byStatus,
          totals: {
            totalLiability: byStatus.reduce((s, r) => s + r.liability, 0),
            totalCredits: byStatus.reduce((s, r) => s + r.creditCount, 0),
            activeLiability: Number(byStatus.find(r => r.status === "active")?.liability || 0),
            activeCredits: Number(byStatus.find(r => r.status === "active")?.creditCount || 0),
          },
        };
        await auditAction({ action, domain: "acct", tableName: "commerce_store_credits", recordId: null, afterData: { totals: result.totals }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, storeCreditLiability: result });
      }

      case "view_deposit_liability":
      case "deposit_liability": {
        // analytics_view_deposit_liability → view_deposit_liability
        // Held deposits grouped by status. "Held" deposits are the
        // salon's liability — they owe the customer either the service
        // or the refund.
        const rows = await pgQuery<{ status: string; count: string; liability: string }>(
          `SELECT status, COUNT(*)::text AS count, COALESCE(SUM(amount),0)::text AS liability
             FROM public.commerce_deposits
            WHERE tenant_id = $1
            GROUP BY status ORDER BY liability DESC`,
          [resolveTenantId(req)],
        );
        const byStatus = rows.map(r => ({ status: r.status, depositCount: Number(r.count), liability: Number(r.liability) }));
        const result = {
          byStatus,
          totals: {
            totalLiability: byStatus.reduce((s, r) => s + r.liability, 0),
            totalDeposits: byStatus.reduce((s, r) => s + r.depositCount, 0),
            heldLiability: Number(byStatus.find(r => r.status === "held")?.liability || 0),
            heldDeposits: Number(byStatus.find(r => r.status === "held")?.depositCount || 0),
          },
        };
        await auditAction({ action, domain: "acct", tableName: "commerce_deposits", recordId: null, afterData: { totals: result.totals }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, depositLiability: result });
      }

      case "run_full_client_database":
      case "full_client_database":
      case "client_database": {
        // Full client database export — every customer with pets, last visit, lifetime value.
        // (Previous version selected c.name — crm_customers has no name
        // column, names are first_name/last_name — and joined pets on
        // p.customer_id, which doesn't exist either; pets link through
        // primary_customer_id. It 500'd on every call. Lifetime value is
        // the customer's real succeeded payments: commerce_payments
        // .customer_id references crm_customers.id directly. Last visit
        // is the latest COMPLETED appointment.)
        const rows = await pgQuery<{
          id: string; name: string | null; email: string; phone: string;
          pet_count: string; last_visit: string | null; lifetime_value: string;
          created_at: string;
        }>(
          `SELECT c.id::text,
                  COALESCE(NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')), ''), c.company_name, c.email) AS name,
                  c.email, c.phone,
                  (SELECT COUNT(*)::text FROM public.crm_pets p WHERE p.primary_customer_id = c.id AND p.tenant_id = c.tenant_id) AS pet_count,
                  (SELECT MAX(starts_at)::text FROM public.crm_appointments a WHERE a.customer_id = c.id AND a.tenant_id = c.tenant_id AND a.status = 'completed') AS last_visit,
                  COALESCE((SELECT SUM(amount)::text FROM public.commerce_payments pay WHERE pay.customer_id = c.id AND pay.tenant_id = c.tenant_id AND pay.status = 'succeeded'), '0') AS lifetime_value,
                  c.created_at::text
             FROM public.crm_customers c
            WHERE c.tenant_id = $1 AND c.is_active = true
            ORDER BY name`,
          [resolveTenantId(req)],
        );
        const customers = rows.map(r => ({
          id: r.id, name: r.name, email: r.email, phone: r.phone,
          petCount: Number(r.pet_count), lastVisit: r.last_visit,
          lifetimeValue: Number(r.lifetime_value), createdAt: r.created_at,
        }));
        await auditAction({ action, domain: "crm", tableName: "crm_customers", recordId: null, afterData: { count: customers.length }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, clientDatabase: { customers, total: customers.length } });
      }

      case "run_customer_metrics":
      case "customer_metrics": {
        // Customer metrics: acquisition, retention, churn over last 12 months.
        const acq = await pgQuery<{ month: string; count: string }>(
          `SELECT DATE_TRUNC('month', created_at)::text AS month, COUNT(*)::text AS count
             FROM public.crm_customers WHERE tenant_id = $1 AND is_active = true
            GROUP BY month ORDER BY month DESC LIMIT 12`,
          [resolveTenantId(req)],
        );
        const churned = await pgQuery<{ month: string; count: string }>(
          `SELECT DATE_TRUNC('month', updated_at)::text AS month, COUNT(*)::text AS count
             FROM public.crm_customers WHERE tenant_id = $1 AND is_active = false
            GROUP BY month ORDER BY month DESC LIMIT 12`,
          [resolveTenantId(req)],
        );
        const retained = await pgQuery<{ count: string }>(
          `SELECT COUNT(DISTINCT customer_id)::text AS count FROM public.crm_appointments
            WHERE tenant_id = $1 AND starts_at >= NOW() - INTERVAL '90 days'
              AND customer_id IN (SELECT id FROM public.crm_customers WHERE tenant_id = $1 AND is_active = true)`,
          [resolveTenantId(req), resolveTenantId(req)],
        );
        const totalActive = await pgQuery<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM public.crm_customers WHERE tenant_id = $1 AND is_active = true`,
          [resolveTenantId(req)],
        );
        const active = Number(totalActive[0]?.count || 0);
        const retainedCount = Number(retained[0]?.count || 0);
        const result = {
          acquisition: acq.map(r => ({ month: r.month.slice(0, 7), newCustomers: Number(r.count) })),
          churn: churned.map(r => ({ month: r.month.slice(0, 7), churnedCustomers: Number(r.count) })),
          retention90d: active > 0 ? Math.round((retainedCount / active) * 100) : 0,
          // The count, not the raw query rows — this field previously
          // shipped the pg result array ([{count: "23"}]) as the value.
          totalActive: active,
        };
        await auditAction({ action, domain: "crm", tableName: "crm_customers", recordId: null, afterData: { totalActive: active }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, customerMetrics: result });
      }

      case "run_appointment_report":
      case "appointment_report": {
        // Appointment report by date range, groomer, service, status.
        const startDate = String(payload.start_date || payload.startDate || new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10));
        const endDate = String(payload.end_date || payload.endDate || new Date().toISOString().slice(0, 10));
        const rows = await pgQuery<{
          id: string; starts_at: string; status: string;
          customer_name: string; staff_name: string | null; service_name: string | null;
        }>(
          `SELECT a.id::text, a.starts_at::text, a.status,
                  COALESCE(NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')), ''), c.company_name, 'Unknown') AS customer_name,
                  COALESCE(s.display_name, NULLIF(TRIM(COALESCE(s.first_name,'') || ' ' || COALESCE(s.last_name,'')), '')) AS staff_name,
                  (SELECT string_agg(sv.name, ', ') FROM public.crm_appointment_services aps
                    JOIN public.crm_services sv ON sv.id = aps.service_id
                   WHERE aps.appointment_id = a.id) AS service_name
             FROM public.crm_appointments a
             LEFT JOIN public.crm_customers c ON c.id = a.customer_id
             LEFT JOIN public.crm_staff s ON s.id = a.assigned_groomer_id
            WHERE a.tenant_id = $1 AND a.starts_at::date BETWEEN $2 AND $3
            ORDER BY a.starts_at DESC`,
          [resolveTenantId(req), startDate, endDate],
        );
        const byStatus: Record<string, number> = {};
        rows.forEach(r => { byStatus[r.status] = (byStatus[r.status] || 0) + 1; });
        const result = {
          startDate, endDate,
          appointments: rows.map(r => ({
            id: r.id, startsAt: r.starts_at, status: r.status,
            customerName: r.customer_name, staffName: r.staff_name, services: r.service_name,
          })),
          total: rows.length,
          byStatus,
        };
        await auditAction({ action, domain: "crm", tableName: "crm_appointments", recordId: null, afterData: { total: rows.length, startDate, endDate }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, appointmentReport: result });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action} (short: ${shortAction})` }, { status: 400 });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[analytics/actions] ${action} failed:`, msg);
    return NextResponse.json({ error: msg, action }, { status: 500 });
  }
}
