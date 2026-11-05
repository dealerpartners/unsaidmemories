// ---------------------------------------------------------------------------
// Shared payroll-run engine — the ONE computation behind every "Run Payroll"
// surface:
//   POST /api/admin/payroll/runs            (PayrollView disbursement button)
//   fin_run_payroll  → /api/admin/finance/actions   (command palette SA-87)
//   payroll_run      → /api/admin/accounting/actions (owner accounting API)
//
// Gross per employee, from the pay profile on crm_staff:
//   hourly — (regular + PTO hours) × hourly_rate + overtime × rate × 1.5
//   salary — salary_amount (annualized per salary_period) × period days / 365
//   commission / *_plus_commission — plus accrued commission ledger rows
//     (crm_commission_entries, 'earned'/'pending', earned_on in the period).
//     Paying them here flips them to 'paid' + payroll_run_id, and the total
//     rides on the run item as commission_amount (inside gross_wages).
// Sources are APPROVED payroll_timesheets whose week_start falls in the
// period, plus pending commission entries earned in the period. Timesheets
// consumed by the run are marked 'processed' so they can't be double-paid.
//
// WITHHOLDING (BL-3): each line's tax_withheld is computed by
// src/lib/payroll/withholding.ts from the employee's RECORDED tax profile
// (acct_payroll_employees.tax_info) and active deduction definitions
// (acct_payroll_deductions). No statutory rate table exists in the schema,
// so no rate is ever invented: an employee with no profile on file
// withholds $0 and is flagged in missingWithholding, exactly as a missing
// wage rate is flagged in missingRates. net = gross − tax − post-tax
// deductions.
//
// NO JOURNAL ENTRY posts at creation: the run is created in 'draft' —
// nothing has been disbursed. The lifecycle transitions live in
// src/lib/payroll/lifecycle.ts (draft → approved → paid → posted, void
// from draft); the 'posted' transition posts the balanced JE through
// src/lib/accounting/journal.ts and stamps payroll_runs.journal_id.
// ---------------------------------------------------------------------------

import { annualizeSalary } from "@/lib/crm/commissions";
import {
  loadWithholdingInputs,
  computeWithholding,
  type WithholdingResult,
} from "@/lib/payroll/withholding";

export interface PayrollRunClient {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
}

export interface PayrollRunLine {
  employee_id: string;
  employee_name: string | null;
  pay_type: string;
  hourly_rate: number | null;
  salary_amount: number | null;
  reg_hours: number;
  ot_hours: number;
  pto_hours: number;
  timesheet_count: number;
  commission_amount: number;
  commission_entries: number;
  gross_wages: number;
  tax_withheld: number;
  net_paid: number;
  rate_missing: boolean;
  /** The withholding computation for this line, inputs included. */
  withholding: WithholdingResult;
}

export interface PayrollRunResult {
  runId: string;
  runNumber: string;
  status: "draft";
  summary: {
    employees: number;
    timesheets: number;
    totalRegHours: number;
    totalOtHours: number;
    totalGrossWages: number;
    totalTaxWithheld: number;
    totalNetPaid: number;
    totalCommission: number;
    commissionEntriesPaid: number;
    periodDays: number;
    missingRateCount: number;
    missingWithholdingCount: number;
    note?: string;
  };
  missingRates: { employee_id: string; employee_name: string | null; pay_type: string }[];
  /** Employees whose line withheld $0 because no tax profile is recorded. */
  missingWithholding: { employee_id: string; employee_name: string | null }[];
  lines: PayrollRunLine[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Create a draft payroll run inside a transaction on the caller's pg client.
 * Throws on failure (the transaction is rolled back before rethrowing).
 */
export async function createPayrollRun(
  client: PayrollRunClient,
  tenant: string,
  input: { payPeriodStart: string; payPeriodEnd: string; payDate: string },
): Promise<PayrollRunResult> {
  const { payPeriodStart, payPeriodEnd, payDate } = input;
  const startMs = Date.parse(`${payPeriodStart}T00:00:00Z`);
  const endMs = Date.parse(`${payPeriodEnd}T00:00:00Z`);
  const periodDays = Math.round((endMs - startMs) / 86400000) + 1; // inclusive

  await client.query("BEGIN");
  try {
    // Sum approved timesheets in the period, with each employee's wage setup
    const ts = await client.query(
      `SELECT t.employee_id::text AS employee_id, s.display_name AS employee_name,
              s.pay_type AS pay_type, s.hourly_rate AS hourly_rate,
              s.salary_amount AS salary_amount, s.salary_period AS salary_period,
              s.commission_rate AS commission_rate,
              SUM(COALESCE(t.hours_regular, 0))::numeric AS reg_hours,
              SUM(COALESCE(t.hours_overtime, 0))::numeric AS ot_hours,
              SUM(COALESCE(t.hours_pto, 0))::numeric AS pto_hours,
              COUNT(*)::int AS timesheet_count
         FROM public.payroll_timesheets t
         LEFT JOIN public.crm_staff s ON s.id = t.employee_id
        WHERE t.tenant_id = $1 AND t.status = 'approved'
          AND t.week_start >= $2::date AND t.week_start <= $3::date
        GROUP BY t.employee_id, s.display_name, s.pay_type, s.hourly_rate, s.salary_amount, s.salary_period, s.commission_rate`,
      [tenant, payPeriodStart, payPeriodEnd],
    );

    // Accrued commissions earned in the period (ledger rows still 'pending').
    const comm = await client.query(
      `SELECT e.staff_id::text AS employee_id, s.display_name AS employee_name,
              s.pay_type AS pay_type, s.hourly_rate AS hourly_rate,
              s.salary_amount AS salary_amount, s.salary_period AS salary_period,
              s.commission_rate AS commission_rate,
              COALESCE(SUM(e.commission_amount), 0)::numeric AS commission_total,
              COUNT(*)::int AS entry_count
         FROM public.crm_commission_entries e
         JOIN public.crm_staff s ON s.id = e.staff_id AND s.tenant_id = e.tenant_id
        WHERE e.tenant_id = $1 AND e.entry_type = 'earned' AND e.status = 'pending'
          AND e.earned_on >= $2::date AND e.earned_on <= $3::date
        GROUP BY e.staff_id, s.display_name, s.pay_type, s.hourly_rate, s.salary_amount, s.salary_period, s.commission_rate`,
      [tenant, payPeriodStart, payPeriodEnd],
    );

    type EmpSeed = {
      employee_id: string; employee_name: string | null; pay_type: string;
      hourly_rate: number | null; salary_amount: number | null;
      salary_period: string | null; commission_rate: number | null;
      reg: number; ot: number; pto: number; timesheet_count: number;
      commission_total: number; commission_entries: number;
    };
    const seedFrom = (r: any): EmpSeed => ({
      employee_id: r.employee_id,
      employee_name: r.employee_name ?? null,
      pay_type: String(r.pay_type || "hourly").toLowerCase(),
      hourly_rate: r.hourly_rate == null ? null : Number(r.hourly_rate),
      salary_amount: r.salary_amount == null ? null : Number(r.salary_amount),
      salary_period: r.salary_period ?? null,
      commission_rate: r.commission_rate == null ? null : Number(r.commission_rate),
      reg: 0, ot: 0, pto: 0, timesheet_count: 0,
      commission_total: 0, commission_entries: 0,
    });
    const byEmp = new Map<string, EmpSeed>();
    for (const r of ts.rows) {
      const s = seedFrom(r);
      s.reg = Number(r.reg_hours || 0);
      s.ot = Number(r.ot_hours || 0);
      s.pto = Number(r.pto_hours || 0);
      s.timesheet_count = Number(r.timesheet_count || 0);
      byEmp.set(s.employee_id, s);
    }
    for (const r of comm.rows) {
      const s = byEmp.get(r.employee_id) ?? seedFrom(r);
      s.commission_total = round2(Number(r.commission_total || 0));
      s.commission_entries = Number(r.entry_count || 0);
      byEmp.set(s.employee_id, s);
    }

    const lines: PayrollRunLine[] = [];
    const missingRates: PayrollRunResult["missingRates"] = [];
    // First pass computes gross per employee; withholding is applied in a
    // second pass once every line's gross is known (see below).
    const grossLines: {
      seed: EmpSeed; payType: string; commissionTotal: number;
      gross: number; rateMissing: boolean;
    }[] = [];
    for (const s of byEmp.values()) {
      const payType = s.pay_type;
      const commissionTotal = round2(s.commission_total);
      const hasCommissionRate = s.commission_rate != null && s.commission_rate > 0;
      let wage = 0;
      let wageMissing = false;
      if (payType === "salary" || payType === "salary_plus_commission") {
        if (s.salary_amount && s.salary_amount > 0) {
          wage = round2((annualizeSalary(s.salary_amount, s.salary_period) * periodDays) / 365);
        } else wageMissing = true;
      } else if (payType === "hourly" || payType === "hourly_plus_commission") {
        if (s.hourly_rate && s.hourly_rate > 0) {
          wage = round2((s.reg + s.pto) * s.hourly_rate + s.ot * s.hourly_rate * 1.5);
        } else wageMissing = true;
      }
      let rateMissing: boolean;
      if (payType === "hourly" || payType === "salary") {
        rateMissing = wageMissing;
      } else if (payType === "commission") {
        rateMissing = !hasCommissionRate && commissionTotal <= 0;
      } else if (payType === "salary_plus_commission" || payType === "hourly_plus_commission") {
        rateMissing = wageMissing && !hasCommissionRate && commissionTotal <= 0;
      } else {
        rateMissing = true; // unknown pay_type — no rate basis to compute from
      }
      const gross = round2(wage + commissionTotal);
      if (rateMissing) {
        missingRates.push({ employee_id: s.employee_id, employee_name: s.employee_name, pay_type: payType });
      }
      grossLines.push({ seed: s, payType, commissionTotal, gross, rateMissing });
    }

    // Withholding (BL-3): compute each line's tax + net from the
    // employee's recorded tax profile and active deduction definitions.
    // No profile on file → $0 withheld, flagged in missingWithholding —
    // a rate is never invented (see src/lib/payroll/withholding.ts).
    const whInputs = await loadWithholdingInputs(
      client, tenant, grossLines.map((g) => g.seed.employee_id), payPeriodStart, payPeriodEnd,
    );
    const missingWithholding: PayrollRunResult["missingWithholding"] = [];
    for (const g of grossLines) {
      const wh = computeWithholding(
        g.gross,
        whInputs.get(g.seed.employee_id) ?? { profile: null, deductions: [] },
      );
      if (!wh.profile_found && g.gross > 0) {
        missingWithholding.push({ employee_id: g.seed.employee_id, employee_name: g.seed.employee_name });
      }
      lines.push({
        employee_id: g.seed.employee_id,
        employee_name: g.seed.employee_name,
        pay_type: g.payType,
        hourly_rate: g.seed.hourly_rate,
        salary_amount: g.seed.salary_amount,
        reg_hours: g.seed.reg, ot_hours: g.seed.ot, pto_hours: g.seed.pto,
        timesheet_count: g.seed.timesheet_count,
        commission_amount: g.commissionTotal, commission_entries: g.seed.commission_entries,
        gross_wages: g.gross, tax_withheld: wh.tax_withheld, net_paid: wh.net_paid,
        rate_missing: g.rateMissing,
        withholding: wh,
      });
    }

    const runNumber = `PR-${Date.now().toString(36).toUpperCase()}`;
    const totalRegHours = lines.reduce((s, l) => s + l.reg_hours, 0);
    const totalOtHours = lines.reduce((s, l) => s + l.ot_hours, 0);
    const totalGross = round2(lines.reduce((s, l) => s + l.gross_wages, 0));
    const totalTax = round2(lines.reduce((s, l) => s + l.tax_withheld, 0));
    const totalNet = round2(lines.reduce((s, l) => s + l.net_paid, 0));
    const ins = await client.query(
      `INSERT INTO public.payroll_runs
         (id, tenant_id, number, pay_period_start, pay_period_end, pay_date, status,
          gross_wages, tax_withheld, net_paid, employer_taxes)
       VALUES (gen_random_uuid(), $1, $2, $3::date, $4::date, $5::date, 'draft', $6, $7, $8, 0)
       RETURNING id::text AS id, number`,
      [tenant, runNumber, payPeriodStart, payPeriodEnd, payDate, totalGross, totalTax, totalNet],
    );
    const runId = ins.rows[0].id;
    for (const l of lines) {
      await client.query(
        `INSERT INTO public.payroll_run_items
           (id, payroll_run_id, employee_id, timesheet_id,
            hours_regular, hours_overtime, gross_wages, tax_withheld, net_paid,
            commission_amount)
         VALUES (gen_random_uuid(), $1, $2, NULL, $3, $4, $5, $6, $7, $8)`,
        [runId, l.employee_id, l.reg_hours, l.ot_hours, l.gross_wages, l.tax_withheld, l.net_paid, l.commission_amount],
      );
    }
    // Flip the commission entries this run just paid: pending → paid,
    // stamped with the run so they can never be paid twice.
    const commissionStaffIds = lines.filter((l) => l.commission_amount > 0).map((l) => l.employee_id);
    if (commissionStaffIds.length > 0) {
      await client.query(
        `UPDATE public.crm_commission_entries
            SET status = 'paid', payroll_run_id = $1, updated_at = now()
          WHERE tenant_id = $2 AND entry_type = 'earned' AND status = 'pending'
            AND earned_on >= $3::date AND earned_on <= $4::date
            AND staff_id = ANY($5::uuid[])`,
        [runId, tenant, payPeriodStart, payPeriodEnd, commissionStaffIds],
      );
    }
    // Mark timesheets as processed so they aren't double-counted
    await client.query(
      `UPDATE public.payroll_timesheets
          SET status = 'processed'
        WHERE tenant_id = $1 AND status = 'approved'
          AND week_start >= $2::date AND week_start <= $3::date`,
      [tenant, payPeriodStart, payPeriodEnd],
    );
    await client.query("COMMIT");
    return {
      runId,
      runNumber,
      status: "draft",
      summary: {
        employees: lines.length,
        timesheets: lines.reduce((s, l) => s + l.timesheet_count, 0),
        totalRegHours: round2(totalRegHours),
        totalOtHours: round2(totalOtHours),
        totalGrossWages: totalGross,
        totalTaxWithheld: totalTax,
        totalNetPaid: totalNet,
        totalCommission: round2(lines.reduce((s, l) => s + l.commission_amount, 0)),
        commissionEntriesPaid: lines.reduce((s, l) => s + l.commission_entries, 0),
        periodDays,
        missingRateCount: missingRates.length,
        missingWithholdingCount: missingWithholding.length,
        ...((missingRates.length > 0 || missingWithholding.length > 0)
          ? {
              note: [
                ...(missingRates.length > 0
                  ? [`${missingRates.length} employee(s) have no wage rate on file (see missingRates) — their gross is $0 in this run. Set pay_type / hourly_rate / salary_amount / commission_rate on their staff record.`]
                  : []),
                ...(missingWithholding.length > 0
                  ? [`${missingWithholding.length} employee(s) have no tax profile on file (see missingWithholding) — their withholding is $0 in this run. Record their withholding percents on the employee's tax profile (Edit Compensation → Withholding).`]
                  : []),
              ].join(" "),
            }
          : {}),
      },
      missingRates,
      missingWithholding,
      lines,
    };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
}
