// ---------------------------------------------------------------------------
// GET /api/admin/staff
//
// Real staff roster for the Staff & Groomer Management pages (/admin/staff,
// /admin/schedule). Until this endpoint existed those pages rendered
// STAFF_SCHEDULES from dawg-mock-data — invented shifts, invented 50%
// commission rates, invented appointment counts. Everything here is read
// from crm_staff / crm_staff_shifts / crm_appointments for the resolved
// tenant; a value that isn't set in the data comes back null and the UI
// says "Not set" rather than inventing one.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/gate";
import { resolveTenantId } from "@/lib/admin-api";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TZ = "America/Chicago";

export async function GET(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const tenant = resolveTenantId(req);

  const staff = await pgQuery<{
    id: string; display_name: string | null; first_name: string | null; last_name: string | null;
    email: string | null; phone: string | null; role: string | null;
    is_service_staff: boolean; is_active: boolean; commission_rate: string | null; pay_type: string | null;
  }>(
    `SELECT id, display_name, first_name, last_name, email, phone, role,
            is_service_staff, is_active, commission_rate::text, pay_type
       FROM public.crm_staff
      WHERE tenant_id = $1
      ORDER BY is_active DESC, COALESCE(display_name, first_name, '') ASC`,
    [tenant],
  );

  const todayShifts = await pgQuery<{ staff_id: string; starts_at: string; ends_at: string }>(
    `SELECT staff_id, starts_at::text, ends_at::text
       FROM public.crm_staff_shifts
      WHERE tenant_id = $1
        AND shift_date = (now() AT TIME ZONE '${TZ}')::date`,
    [tenant],
  );

  const todayAppts = await pgQuery<{ staff_id: string; n: string }>(
    `SELECT assigned_groomer_id AS staff_id, count(*)::text AS n
       FROM public.crm_appointments
      WHERE tenant_id = $1
        AND assigned_groomer_id IS NOT NULL
        AND (starts_at AT TIME ZONE '${TZ}')::date = (now() AT TIME ZONE '${TZ}')::date
        AND upper(status) NOT IN ('CANCELLED', 'CANCELED')
      GROUP BY assigned_groomer_id`,
    [tenant],
  );

  const weekShifts = await pgQuery<{ staff_id: string; d: string }>(
    `SELECT staff_id, shift_date::text AS d
       FROM public.crm_staff_shifts
      WHERE tenant_id = $1
        AND shift_date BETWEEN (now() AT TIME ZONE '${TZ}')::date
                           AND (now() AT TIME ZONE '${TZ}')::date + 6`,
    [tenant],
  );

  const meta = await pgQuery<{ today: string; week: string[] }>(
    `SELECT (now() AT TIME ZONE '${TZ}')::date::text AS today,
            ARRAY(SELECT to_char(g, 'YYYY-MM-DD')
                    FROM generate_series((now() AT TIME ZONE '${TZ}')::date,
                                         (now() AT TIME ZONE '${TZ}')::date + 6, '1 day') g) AS week`,
    [],
  );

  const shiftByStaff = new Map(todayShifts.map((s) => [s.staff_id, s]));
  const apptsByStaff = new Map(todayAppts.map((a) => [a.staff_id, Number(a.n)]));
  const weekByStaff = new Map<string, string[]>();
  for (const w of weekShifts) {
    const arr = weekByStaff.get(w.staff_id) ?? [];
    arr.push(w.d);
    weekByStaff.set(w.staff_id, arr);
  }

  return NextResponse.json({
    today: meta[0]?.today ?? null,
    weekDates: meta[0]?.week ?? [],
    staff: staff.map((s) => ({
      id: s.id,
      name: s.display_name || [s.first_name, s.last_name].filter(Boolean).join(" ") || "Unnamed",
      email: s.email,
      phone: s.phone,
      role: s.role,
      isGroomer: s.is_service_staff === true,
      isActive: s.is_active === true,
      commissionRate: s.commission_rate !== null ? Number(s.commission_rate) : null,
      payType: s.pay_type,
      todayShift: shiftByStaff.get(s.id)
        ? { startsAt: shiftByStaff.get(s.id)!.starts_at, endsAt: shiftByStaff.get(s.id)!.ends_at }
        : null,
      todayAppointments: apptsByStaff.get(s.id) ?? 0,
      weekShiftDays: weekByStaff.get(s.id) ?? [],
    })),
  });
}
