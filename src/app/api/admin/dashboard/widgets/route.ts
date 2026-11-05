import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// GET /api/admin/dashboard/widgets — Staff schedules, alerts, grooming records.
// ============================================================================

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("analytics", "read");
  if (gate) return gate;

  const tenant = resolveTenantId(req);
  const today = new Date().toISOString().slice(0, 10);

  const data = await withPg(async (client) => {
    // Staff schedules: staff + their today's appointment counts, their
    // profile commission rate, and commission accrued (pending) in the
    // real ledger — crm_commission_entries, written on appointment
    // completion at the profile rate.
    const { rows: staff } = await client.query(
      `SELECT s.id::text AS id, s.first_name, s.last_name, s.role, s.is_active,
              s.commission_rate,
              COUNT(a.id)::int AS today_appointments,
              COALESCE((
                SELECT SUM(e.commission_amount) FROM public.crm_commission_entries e
                 WHERE e.staff_id = s.id AND e.tenant_id = s.tenant_id
                   AND e.status = 'pending' AND e.entry_type = 'earned'
              ), 0)::numeric AS commission_accrued
       FROM public.crm_staff s
       LEFT JOIN public.crm_appointments a
         ON a.assigned_groomer_id = s.id
         AND a.tenant_id = s.tenant_id
         AND DATE(a.starts_at) = $2::date
       WHERE s.tenant_id = $1 AND s.is_active IS NOT FALSE
       GROUP BY s.id, s.first_name, s.last_name, s.role, s.is_active, s.commission_rate
       ORDER BY s.first_name`,
      [tenant, today]
    );

    // Alerts: low inventory, failed payments, unassigned appointments
    const alerts: Array<{ id: string; type: string; severity: string; message: string; link: string; count?: number; detail?: string }> = [];

    // Low inventory: catalog items whose SKU carries stock (≥1 movement)
    // with net on-hand ≤ 5 — the same definition as /dashboard/kpis.
    // (The old query joined im.sku_id (uuid) to ci.sku (text) — Postgres
    // has no uuid=text operator, so it threw 42883 and 500'd this whole
    // endpoint, taking staff schedules and every alert down with it.
    // The join key is ci.sku_id, and unstocked dropship items with no
    // movement history are not "low stock" — they hold no local stock.)
    const { rows: lowStock } = await client.query(
      `SELECT COUNT(*)::int AS c
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
      [tenant]
    );
    if (lowStock[0]?.c > 0) {
      alerts.push({
        id: "low-stock",
        type: "inventory",
        severity: "warning",
        message: `${lowStock[0].c} products are low on stock (≤5 units)`,
        count: lowStock[0].c,
        link: "/admin/inventory",
      });
    }

    // Failed payments (last 7 days)
    const { rows: failed } = await client.query(
      `SELECT COUNT(*)::int AS c FROM public.commerce_payments
       WHERE tenant_id = $1 AND status = 'failed'
         AND created_at >= now() - interval '7 days'`,
      [tenant]
    );
    if (failed[0]?.c > 0) {
      alerts.push({
        id: "failed-payments",
        type: "payments",
        severity: "error",
        message: `${failed[0].c} failed payments in the last 7 days`,
        count: failed[0].c,
        link: "/admin/payments",
      });
    }

    // Unassigned appointments (today + future)
    const { rows: unassigned } = await client.query(
      `SELECT COUNT(*)::int AS c FROM public.crm_appointments
       WHERE tenant_id = $1 AND assigned_groomer_id IS NULL
         AND starts_at >= now() AND status NOT IN ('cancelled', 'completed', 'no_show')`,
      [tenant]
    );
    if (unassigned[0]?.c > 0) {
      alerts.push({
        id: "unassigned-appts",
        type: "appointments",
        severity: "info",
        message: `${unassigned[0].c} upcoming appointments need a groomer assigned`,
        count: unassigned[0].c,
        link: "/admin/appointments",
      });
    }

    // Upcoming pet birthdays (B.9.4) — pets whose NEXT anniversary falls
    // within 30 days. Interval arithmetic clamps Feb 29 → Feb 28 in
    // non-leap years; a past anniversary rolls to next year. (The only
    // previous computation lived in the orphaned legacy dashboard route
    // and used a (month, day) tuple BETWEEN that matches nothing across
    // the Dec → Jan boundary.)
    const { rows: bdayRows } = await client.query(
      `WITH p AS (
         SELECT name, date_of_birth,
                (date_of_birth + ((EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM date_of_birth))::int) * INTERVAL '1 year')::date AS this_year
           FROM public.crm_pets
          WHERE tenant_id = $1 AND date_of_birth IS NOT NULL
       ), n AS (
         SELECT name, date_of_birth, CASE WHEN this_year >= CURRENT_DATE THEN this_year ELSE (this_year + INTERVAL '1 year')::date END AS next_bday
           FROM p
       )
       SELECT name, date_of_birth::text AS date_of_birth, next_bday::text AS next_birthday,
              (next_bday - CURRENT_DATE)::int AS days_away
         FROM n
        WHERE next_bday <= CURRENT_DATE + 30
        ORDER BY next_bday`,
      [tenant]
    );
    const upcomingBirthdays = bdayRows.map((r: any) => ({
      petName: r.name,
      dateOfBirth: r.date_of_birth,
      nextBirthday: r.next_birthday,
      daysAway: Number(r.days_away),
    }));
    if (upcomingBirthdays.length > 0) {
      const first = upcomingBirthdays[0];
      alerts.push({
        id: "upcoming-birthdays",
        type: "birthdays",
        severity: "info",
        message: `${upcomingBirthdays.length} pet birthday${upcomingBirthdays.length === 1 ? "" : "s"} in the next 30 days`,
        detail: `${first.petName} — ${new Date(`${first.nextBirthday}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}${upcomingBirthdays.length > 1 ? ` · +${upcomingBirthdays.length - 1} more` : ""}`,
        count: upcomingBirthdays.length,
        link: "/admin/crm",
      });
    }

    // Grooming records: there is NO public.grooming_records table (the old
    // query threw and silently returned []). A completed appointment IS
    // the grooming record — pet, breed, groomer, service, amount, and
    // payment state (amount_paid vs total) all live on the appointment
    // graph, so the card reads the most recent completed appointments.
    const { rows: gr } = await client.query(
      `SELECT a.id::text AS id, a.starts_at::text AS date, a.total::float8 AS amount,
              a.amount_paid::float8 AS amount_paid, a.outstanding_amount::float8 AS outstanding,
              (SELECT string_agg(p.name, ', ') FROM public.crm_appointment_pets ap
                 JOIN public.crm_pets p ON p.id = ap.dependent_id AND p.tenant_id = a.tenant_id
                WHERE ap.appointment_id = a.id) AS pet_names,
              (SELECT p.breed FROM public.crm_appointment_pets ap
                 JOIN public.crm_pets p ON p.id = ap.dependent_id AND p.tenant_id = a.tenant_id
                WHERE ap.appointment_id = a.id ORDER BY ap.sequence_no NULLS LAST LIMIT 1) AS pet_breed,
              (SELECT string_agg(sv.name, ', ') FROM public.crm_appointment_services aps
                 JOIN public.crm_services sv ON sv.id = aps.service_id AND sv.tenant_id = a.tenant_id
                WHERE aps.appointment_id = a.id) AS service_names,
              (SELECT NULLIF(trim(COALESCE(s.first_name,'') || ' ' || COALESCE(s.last_name,'')), '')
                 FROM public.crm_staff s WHERE s.id = a.assigned_groomer_id) AS groomer_name
         FROM public.crm_appointments a
        WHERE a.tenant_id = $1 AND a.status = 'completed'
        ORDER BY a.starts_at DESC LIMIT 5`,
      [tenant]
    );
    const groomingRecords = gr.map((r: any) => ({
      id: r.id,
      petName: r.pet_names || "—",
      breed: r.pet_breed || "",
      petEmoji: "🐾",
      date: r.date,
      serviceName: r.service_names || "",
      groomer: r.groomer_name || "Unassigned",
      amount: Number(r.amount || 0),
      status: Number(r.outstanding || 0) > 0 ? "Pending" : Number(r.amount_paid || 0) > 0 ? "Paid" : "Pending",
    }));

    return {
      staffSchedules: staff.map((s: any) => ({
        id: s.id,
        name: [s.first_name, s.last_name].filter(Boolean).join(" ") || "—",
        role: s.role || "—",
        todayAppointments: s.today_appointments || 0,
        status: s.is_active ? "active" : "inactive",
        commissionRate: s.commission_rate != null ? Number(s.commission_rate) : null,
        commissionAccrued: Number(s.commission_accrued || 0),
      })),
      alerts,
      groomingRecords,
      upcomingBirthdays,
    };
  });

  return NextResponse.json(data);
}
