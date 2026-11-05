// ---------------------------------------------------------------------------
// Withholding engine — BL-3 (payroll last mile).
//
// Computes per-line withholding from the data the schema ALREADY carries:
//
//   1. The employee's tax profile: public.acct_payroll_employees.tax_info
//      (jsonb, one roster row per crm_staff via staff_id). Recognized keys:
//        withholding_percent  — one flat % of taxable wages, OR
//        federal_percent / state_percent / local_percent — component %s
//        additional_amount    — extra flat $ withheld per run
//      Written by PATCH /api/admin/payroll/employees/[id] (tax_profile).
//   2. The employee's active deduction definitions:
//      public.acct_payroll_deductions (joined to the roster row above).
//      calc_method 'percent' → percent % of gross; anything else → the flat
//      `amount`. is_pretax deductions reduce the taxable base before the
//      profile % applies; post-tax deductions reduce net after withholding.
//
// There is NO statutory rate table for payroll anywhere in the schema
// (acct_tax_rules is sales tax, consumed by the POS register), so this
// engine NEVER invents a rate: an employee with no recorded profile
// withholds $0 and the run flags the line (missingWithholding) — the same
// honesty discipline the wage engine applies to missing pay rates.
//
// annual_cap on a deduction is NOT enforced here: per-line deduction
// history is not persisted anywhere in the schema, so a year-to-date cap
// cannot be computed truthfully. Caps are surfaced in the recorded inputs
// so the limitation is visible rather than silently approximated.
// ---------------------------------------------------------------------------

export interface PayrollDbClient {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
}

export interface TaxProfile {
  withholding_percent: number | null;
  federal_percent: number | null;
  state_percent: number | null;
  local_percent: number | null;
  additional_amount: number | null;
}

export interface DeductionDef {
  deduction_code: string | null;
  label: string | null;
  deduction_type: string | null;
  is_pretax: boolean;
  calc_method: string | null;
  amount: number | null;
  percent: number | null;
  annual_cap: number | null;
}

export interface WithholdingInputs {
  profile: TaxProfile | null;
  deductions: DeductionDef[];
}

export interface WithholdingResult {
  profile_found: boolean;
  pretax_deductions: number;
  taxable_wages: number;
  components: { federal: number; state: number; local: number; total_percent: number | null };
  additional_amount: number;
  tax_withheld: number;
  posttax_deductions: number;
  net_paid: number;
  /** The exact inputs the computation used, recorded per line. */
  inputs: {
    profile: TaxProfile | null;
    deductions: (DeductionDef & { applied_amount: number })[];
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function pct(v: unknown): number | null {
  const n = num(v);
  return n != null && n <= 100 ? n : null;
}

/** Parse a tax_info jsonb value into a profile; null when it carries no
 *  recognized withholding input (the caller then withholds $0 + flags). */
export function parseTaxProfile(raw: unknown): TaxProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  const profile: TaxProfile = {
    withholding_percent: pct(t.withholding_percent),
    federal_percent: pct(t.federal_percent),
    state_percent: pct(t.state_percent),
    local_percent: pct(t.local_percent),
    additional_amount: num(t.additional_amount ?? t.additional_withholding),
  };
  const any = Object.values(profile).some((v) => v != null);
  return any ? profile : null;
}

/** Load tax profiles + active deduction definitions for a set of staff ids. */
export async function loadWithholdingInputs(
  client: PayrollDbClient,
  tenant: string,
  staffIds: string[],
  periodStart: string,
  periodEnd: string,
): Promise<Map<string, WithholdingInputs>> {
  const out = new Map<string, WithholdingInputs>();
  for (const id of staffIds) out.set(id, { profile: null, deductions: [] });
  if (staffIds.length === 0) return out;

  const profiles = await client.query(
    `SELECT staff_id::text AS staff_id, tax_info
       FROM public.acct_payroll_employees
      WHERE tenant_id = $1 AND is_active IS NOT FALSE
        AND staff_id = ANY($2::uuid[])`,
    [tenant, staffIds],
  );
  for (const r of profiles.rows) {
    const entry = out.get(r.staff_id);
    if (entry) entry.profile = parseTaxProfile(r.tax_info);
  }

  // Deduction definitions hang off the payroll roster row
  // (acct_payroll_deductions.employee_id → acct_payroll_employees.id);
  // the roster row is what links a definition to a crm_staff id.
  const defs = await client.query(
    `SELECT pe.staff_id::text AS staff_id, d.deduction_code, d.label,
            d.deduction_type, d.is_pretax, d.calc_method,
            d.amount::numeric AS amount, d.percent::numeric AS percent,
            d.annual_cap::numeric AS annual_cap
       FROM public.acct_payroll_deductions d
       JOIN public.acct_payroll_employees pe
         ON pe.id = d.employee_id AND pe.tenant_id = d.tenant_id
      WHERE d.tenant_id = $1 AND pe.staff_id = ANY($2::uuid[])
        AND d.is_active IS NOT FALSE
        AND (d.effective_from IS NULL OR d.effective_from <= $4::date)
        AND (d.effective_to IS NULL OR d.effective_to >= $3::date)`,
    [tenant, staffIds, periodStart, periodEnd],
  );
  for (const r of defs.rows) {
    const entry = out.get(r.staff_id);
    if (!entry) continue;
    entry.deductions.push({
      deduction_code: r.deduction_code ?? null,
      label: r.label ?? null,
      deduction_type: r.deduction_type ?? null,
      is_pretax: !!r.is_pretax,
      calc_method: r.calc_method ?? null,
      amount: r.amount == null ? null : Number(r.amount),
      percent: r.percent == null ? null : Number(r.percent),
      annual_cap: r.annual_cap == null ? null : Number(r.annual_cap),
    });
  }
  return out;
}

function deductionAmount(def: DeductionDef, gross: number): number {
  if (String(def.calc_method || "").toLowerCase() === "percent") {
    return def.percent != null ? round2((gross * def.percent) / 100) : 0;
  }
  return def.amount != null ? round2(def.amount) : 0;
}

/**
 * Compute one line's withholding. Pure: gross + recorded inputs in,
 * withholding + net + the recorded inputs out.
 */
export function computeWithholding(gross: number, inputs: WithholdingInputs): WithholdingResult {
  const applied = inputs.deductions.map((d) => ({ ...d, applied_amount: deductionAmount(d, gross) }));
  const pretax = round2(applied.filter((d) => d.is_pretax).reduce((s, d) => s + d.applied_amount, 0));
  const taxable = Math.max(0, round2(gross - pretax));

  const p = inputs.profile;
  let federal = 0, state = 0, local = 0, totalPercent: number | null = null, additional = 0;
  if (p) {
    if (p.withholding_percent != null) {
      totalPercent = p.withholding_percent;
      federal = round2((taxable * p.withholding_percent) / 100);
    } else {
      federal = p.federal_percent != null ? round2((taxable * p.federal_percent) / 100) : 0;
      state = p.state_percent != null ? round2((taxable * p.state_percent) / 100) : 0;
      local = p.local_percent != null ? round2((taxable * p.local_percent) / 100) : 0;
    }
    additional = p.additional_amount != null ? round2(p.additional_amount) : 0;
  }
  // Withholding can never exceed the taxable wages it is withheld from.
  const tax = Math.min(round2(federal + state + local + additional), taxable);
  const posttaxRaw = round2(applied.filter((d) => !d.is_pretax).reduce((s, d) => s + d.applied_amount, 0));
  const posttax = Math.min(posttaxRaw, Math.max(0, round2(gross - tax)));
  const net = round2(gross - tax - posttax);

  return {
    profile_found: !!p,
    pretax_deductions: pretax,
    taxable_wages: taxable,
    components: { federal, state, local, total_percent: totalPercent },
    additional_amount: additional,
    tax_withheld: tax,
    posttax_deductions: posttax,
    net_paid: net,
    inputs: { profile: p, deductions: applied },
  };
}
