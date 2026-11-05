// ---------------------------------------------------------------------------
// Staff pay profiles + commission accrual.
//
// Sunny's model (2026-10-13): the rate lives ON the staff profile
// (crm_staff.pay_type / hourly_rate / salary_amount / salary_period /
// commission_rate). When an appointment is completed, commission accrues
// into the existing ledger — crm_commission_entries — one 'earned' row per
// performed service, at the performing staff member's profile rate.
// Payroll runs later flip those rows to 'paid' and stamp payroll_run_id.
//
// Rules:
//  - Only commission-bearing pay types accrue (commission,
//    salary_plus_commission, hourly_plus_commission). Pure hourly/salary
//    staff never accrue — by design, not a gap.
//  - No rate on the profile → NO accrual and NO invented default. The miss
//    is reported back as a gap so it stays visible.
//  - Accrual is idempotent per (appointment, service, staff): completing
//    the same appointment twice never double-pays.
//  - The performer is the service line's staff_id, falling back to the
//    appointment's assigned_groomer_id. Appointments with no service lines
//    accrue one whole-appointment line on the appointment total.
// ---------------------------------------------------------------------------

import { pgQuery } from "@/lib/pg";

export const PAY_TYPES = [
  "hourly",
  "salary",
  "commission",
  "salary_plus_commission",
  "hourly_plus_commission",
] as const;

export function isCommissionPayType(payType: string | null | undefined): boolean {
  const t = String(payType || "").toLowerCase();
  return t === "commission" || t === "salary_plus_commission" || t === "hourly_plus_commission";
}

/** Annualize a salary_amount expressed in the given period (NULL = annual). */
export function annualizeSalary(amount: number, period: string | null | undefined): number {
  switch (String(period || "annual").toLowerCase()) {
    case "monthly": return amount * 12;
    case "biweekly": return amount * 26;
    case "weekly": return amount * 52;
    case "annual":
    default: return amount;
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Minimal SQL executor so the same accrual runs on a withPg client
 *  (employee portal, POS, booking sync) or the shared pg pool
 *  (admin action routes that use pgQuery/pgExec). */
export type SqlRunner = (sql: string, params?: unknown[]) => Promise<Record<string, any>[]>;

export function runnerFromClient(client: {
  query: (sql: string, params?: any) => Promise<{ rows: any[] }>;
}): SqlRunner {
  return async (sql, params) => (await client.query(sql, params as any)).rows as Record<string, any>[];
}

export function runnerFromPool(): SqlRunner {
  return async (sql, params) => pgQuery(sql, params as any) as Promise<Record<string, any>[]>;
}

export interface AccrualGap {
  staffId: string | null;
  reason: "no_groomer_assigned" | "no_commission_rate";
  serviceId: string | null;
}

export interface AccrualResult {
  accruedCount: number;
  accruedAmount: number;
  alreadyAccruedCount: number;
  gaps: AccrualGap[];
}

const SERVICE_SKIP_STATUSES = new Set(["cancelled", "canceled", "no_show", "void"]);

export async function accrueCommissionsForAppointment(
  run: SqlRunner,
  tenantId: string,
  appointmentId: string,
  source: string,
): Promise<AccrualResult> {
  const result: AccrualResult = { accruedCount: 0, accruedAmount: 0, alreadyAccruedCount: 0, gaps: [] };

  const apptRows = await run(
    `SELECT id::text AS id, assigned_groomer_id::text AS assigned_groomer_id,
            status, COALESCE(total, 0)::numeric AS total
       FROM public.crm_appointments
      WHERE id = $1::uuid AND tenant_id = $2`,
    [appointmentId, tenantId],
  );
  const appt = apptRows[0];
  if (!appt || appt.status !== "completed") return result;

  const serviceRows = await run(
    `SELECT id::text AS id, service_id::text AS service_id, staff_id::text AS staff_id,
            COALESCE(quantity, 1)::numeric AS quantity,
            COALESCE(unit_price, 0)::numeric AS unit_price,
            total::numeric AS total, status
       FROM public.crm_appointment_services
      WHERE appointment_id = $1::uuid AND tenant_id = $2
      ORDER BY created_at ASC`,
    [appointmentId, tenantId],
  );

  type Line = { serviceId: string | null; performerId: string | null; basis: number; basisSource: string };
  const lines: Line[] = [];
  for (const s of serviceRows) {
    if (SERVICE_SKIP_STATUSES.has(String(s.status || "").toLowerCase())) continue;
    const total = s.total == null ? null : Number(s.total);
    const basis = total != null && total > 0 ? total : round2(Number(s.unit_price) * Number(s.quantity));
    lines.push({
      serviceId: s.service_id,
      performerId: s.staff_id || appt.assigned_groomer_id,
      basis,
      basisSource: total != null && total > 0 ? "service_total" : "unit_price_x_quantity",
    });
  }
  if (lines.length === 0) {
    // No service lines recorded — accrue on the appointment total as a
    // single whole-appointment line for the assigned groomer.
    lines.push({
      serviceId: null,
      performerId: appt.assigned_groomer_id,
      basis: Number(appt.total),
      basisSource: "appointment_total",
    });
  }

  // Cache staff pay profiles within this call (one appointment can carry
  // several services for the same groomer).
  const profileCache = new Map<string, { pay_type: string | null; commission_rate: number | null }>();
  async function profileFor(staffId: string) {
    if (!profileCache.has(staffId)) {
      const rows = await run(
        `SELECT pay_type, commission_rate::numeric AS commission_rate
           FROM public.crm_staff WHERE id = $1::uuid AND tenant_id = $2`,
        [staffId, tenantId],
      );
      profileCache.set(staffId, {
        pay_type: rows[0]?.pay_type ?? null,
        commission_rate: rows[0]?.commission_rate == null ? null : Number(rows[0].commission_rate),
      });
    }
    return profileCache.get(staffId)!;
  }

  for (const line of lines) {
    if (!(line.basis > 0)) continue;
    if (!line.performerId) {
      result.gaps.push({ staffId: null, reason: "no_groomer_assigned", serviceId: line.serviceId });
      continue;
    }
    const profile = await profileFor(line.performerId);
    if (!isCommissionPayType(profile.pay_type)) continue; // hourly/salary only — no accrual by design
    const rate = profile.commission_rate;
    if (rate == null || !(rate > 0)) {
      result.gaps.push({ staffId: line.performerId, reason: "no_commission_rate", serviceId: line.serviceId });
      continue;
    }

    // Idempotency: an 'earned' entry already exists for this
    // appointment + service + staff (the partial unique index backs this
    // up for service lines).
    const existing = await run(
      `SELECT id::text AS id FROM public.crm_commission_entries
        WHERE tenant_id = $1 AND appointment_id = $2::uuid AND staff_id = $3::uuid
          AND entry_type = 'earned' AND status <> 'void'
          AND (($4::uuid IS NULL AND service_id IS NULL) OR service_id = $4::uuid)
        LIMIT 1`,
      [tenantId, appointmentId, line.performerId, line.serviceId],
    );
    if (existing.length > 0) {
      result.alreadyAccruedCount += 1;
      continue;
    }

    const amount = round2((line.basis * rate) / 100);
    try {
      await run(
        `INSERT INTO public.crm_commission_entries
           (tenant_id, staff_id, plan_id, appointment_id, service_id,
            basis_amount, rate_percent, commission_amount,
            entry_type, status, calculation_detail)
         VALUES ($1, $2::uuid, NULL, $3::uuid, $4::uuid,
                 $5, $6, $7, 'earned', 'pending', $8::jsonb)`,
        [
          tenantId, line.performerId, appointmentId, line.serviceId,
          line.basis, rate, amount,
          JSON.stringify({ source, pay_type: profile.pay_type, basis_source: line.basisSource }),
        ],
      );
      result.accruedCount += 1;
      result.accruedAmount = round2(result.accruedAmount + amount);
    } catch (e: any) {
      // 23505 = the partial unique index caught a concurrent accrual.
      if (e?.code === "23505") {
        result.alreadyAccruedCount += 1;
      } else {
        throw e;
      }
    }
  }

  return result;
}
