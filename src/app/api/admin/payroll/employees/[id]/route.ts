import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { getPgWithRetry } from "@/lib/pg";

// Pool-backed runner with the exact withPg contract (fn(client) → result,
// null on failure). withPg's session-pooler Client cannot establish SSL
// from this runtime (the EMAXCONNSESSION/SSL failure class lib/pg was
// built to fix); the transaction pooler in lib/pg works everywhere and a
// checked-out PoolClient has the same .query() surface as a Client, so no
// call site below changes.
async function withPg<T>(fn: (client: any) => Promise<T>): Promise<T | null> {
  let client: any;
  try { client = await getPgWithRetry(); } catch { return null; }
  try { return await fn(client); }
  catch (e) { console.error("[withPg->pool] Query execution failed:", e instanceof Error ? e.message : String(e)); return null; }
  finally { client.release(); }
}
import { PAY_TYPES } from "@/lib/crm/commissions";
import { parseTaxProfile, type TaxProfile } from "@/lib/payroll/withholding";

// The employee's withholding profile lives in acct_payroll_employees.tax_info
// (the roster row keyed by staff_id) — it is the ONLY input the withholding
// engine (src/lib/payroll/withholding.ts) computes from. GET returns it;
// PATCH upserts it. A profile field sent as null removes that key.
async function readTaxProfile(client: any, tenant: string, staffId: string): Promise<TaxProfile | null> {
  const r = await client.query(
    `SELECT tax_info FROM public.acct_payroll_employees
      WHERE tenant_id = $1 AND staff_id = $2::uuid AND is_active IS NOT FALSE
      ORDER BY created_at DESC LIMIT 1`,
    [tenant, staffId],
  );
  if (r.rows.length === 0) return null;
  return parseTaxProfile(r.rows[0].tax_info);
}

async function upsertTaxProfile(
  client: any, tenant: string, staffId: string, taxInfo: Record<string, unknown>,
): Promise<TaxProfile | null> {
  const staff = await client.query(
    `SELECT display_name, pay_type, hourly_rate::numeric AS hourly_rate,
            salary_amount::numeric AS salary_amount
       FROM public.crm_staff WHERE id = $1::uuid AND tenant_id = $2`,
    [staffId, tenant],
  );
  if (staff.rows.length === 0) return null;
  const s = staff.rows[0];
  const existing = await client.query(
    `SELECT id::text AS id, tax_info FROM public.acct_payroll_employees
      WHERE tenant_id = $1 AND staff_id = $2::uuid
      ORDER BY created_at DESC LIMIT 1`,
    [tenant, staffId],
  );
  if (existing.rows.length > 0) {
    const merged: Record<string, unknown> = {
      ...(existing.rows[0].tax_info && typeof existing.rows[0].tax_info === "object" ? existing.rows[0].tax_info : {}),
    };
    for (const [k, v] of Object.entries(taxInfo)) {
      if (v === null) delete merged[k]; else merged[k] = v;
    }
    await client.query(
      `UPDATE public.acct_payroll_employees SET tax_info = $2::jsonb, is_active = true, updated_at = now()
        WHERE id = $1::uuid`,
      [existing.rows[0].id, JSON.stringify(merged)],
    );
    return parseTaxProfile(merged);
  }
  const payRate = s.pay_type === "salary" || s.pay_type === "salary_plus_commission"
    ? s.salary_amount : s.hourly_rate;
  await client.query(
    `INSERT INTO public.acct_payroll_employees
       (id, tenant_id, staff_id, employee_name, pay_type, pay_rate, tax_info, is_active)
     VALUES (gen_random_uuid(), $1, $2::uuid, $3, $4, $5, $6::jsonb, true)`,
    [tenant, staffId, s.display_name, s.pay_type, payRate, JSON.stringify(taxInfo)],
  );
  return parseTaxProfile(taxInfo);
}

// GET /api/admin/payroll/employees/[id] — the pay profile + bank presence +
// the recorded withholding (tax) profile for one employee.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("staff_groomer_management", "read");
  if (gate) return gate;
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ ok: false, error: "employee id is required" }, { status: 400 });
  return withPg(async (client) => {
    const tenant = resolveTenantId(req);
    const r = await client.query(
      `SELECT id::text AS id, display_name, pay_type,
              hourly_rate::numeric AS hourly_rate,
              salary_amount::numeric AS salary_amount, salary_period,
              commission_rate::numeric AS commission_rate,
              (bank_routing_number IS NOT NULL AND bank_account_number IS NOT NULL) AS bank_configured,
              bank_account_type
         FROM public.crm_staff WHERE id = $1::uuid AND tenant_id = $2`,
      [id, tenant],
    );
    if (r.rows.length === 0) {
      return NextResponse.json({ ok: false, error: "Employee not found" }, { status: 404 });
    }
    const taxProfile = await readTaxProfile(client, tenant, id);
    return NextResponse.json({ ok: true, employee: r.rows[0], tax_profile: taxProfile });
  }).then((r) => r ?? NextResponse.json({ error: "DB unavailable" }, { status: 503 }))
    .catch((e: any) => NextResponse.json({ error: e?.message }, { status: 500 }));
}

// PATCH /api/admin/payroll/employees/[id] — edit the pay profile on a
// crm_staff record. The profile is the single source of truth for pay:
//   pay_type: hourly | salary | commission | salary_plus_commission |
//             hourly_plus_commission
//   hourly_rate, salary_amount (+ salary_period), commission_rate (percent
//   of service price — drives commission accrual on appointment completion).
// Body: any subset of those fields. A field sent as null/"" clears it.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("staff_groomer_management", "write");
  if (gate) return gate;
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ ok: false, error: "employee id is required" }, { status: 400 });

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }

  const parseRate = (v: any): { present: boolean; value: number | null; valid: boolean } => {
    if (v === undefined) return { present: false, value: null, valid: true };
    if (v === null || String(v).trim() === "") return { present: true, value: null, valid: true };
    const n = Number(v);
    return Number.isFinite(n) && n >= 0
      ? { present: true, value: n, valid: true }
      : { present: true, value: null, valid: false };
  };

  const sets: string[] = [];
  const params: unknown[] = [];
  const push = (col: string, value: unknown) => {
    params.push(value);
    sets.push(`${col} = $${params.length}`);
  };

  if (body.pay_type !== undefined) {
    const payType = String(body.pay_type || "").trim().toLowerCase();
    if (!(PAY_TYPES as readonly string[]).includes(payType)) {
      return NextResponse.json({ ok: false, error: `pay_type must be one of: ${PAY_TYPES.join(", ")}` }, { status: 400 });
    }
    push("pay_type", payType);
  }
  const hourly = parseRate(body.hourly_rate);
  if (!hourly.valid) return NextResponse.json({ ok: false, error: "hourly_rate must be a non-negative number" }, { status: 400 });
  if (hourly.present) push("hourly_rate", hourly.value);

  const salary = parseRate(body.salary_amount);
  if (!salary.valid) return NextResponse.json({ ok: false, error: "salary_amount must be a non-negative number" }, { status: 400 });
  if (salary.present) push("salary_amount", salary.value);

  if (body.salary_period !== undefined) {
    const period = body.salary_period == null || String(body.salary_period).trim() === ""
      ? null
      : String(body.salary_period).trim().toLowerCase();
    if (period != null && !["annual", "monthly", "biweekly", "weekly"].includes(period)) {
      return NextResponse.json({ ok: false, error: "salary_period must be 'annual', 'monthly', 'biweekly' or 'weekly'" }, { status: 400 });
    }
    push("salary_period", period);
  }

  const commission = parseRate(body.commission_rate);
  if (!commission.valid || (commission.value != null && commission.value > 100)) {
    return NextResponse.json({ ok: false, error: "commission_rate must be a percent between 0 and 100" }, { status: 400 });
  }
  if (commission.present) push("commission_rate", commission.value);

  // Optional withholding profile (BL-3): body.tax_profile = {
  //   withholding_percent | federal_percent | state_percent |
  //   local_percent (0–100), additional_amount ($ ≥ 0) } — any subset;
  // a key sent as null clears that input. Stored on the employee's
  // acct_payroll_employees.tax_info; the run engine computes from it.
  let taxInfo: Record<string, unknown> | null = null;
  if (body.tax_profile !== undefined) {
    if (!body.tax_profile || typeof body.tax_profile !== "object" || Array.isArray(body.tax_profile)) {
      return NextResponse.json({ ok: false, error: "tax_profile must be an object" }, { status: 400 });
    }
    taxInfo = {};
    for (const key of ["withholding_percent", "federal_percent", "state_percent", "local_percent"]) {
      const p = parseRate(body.tax_profile[key]);
      if (body.tax_profile[key] !== undefined) {
        if (!p.valid || (p.value != null && p.value > 100)) {
          return NextResponse.json({ ok: false, error: `tax_profile.${key} must be a percent between 0 and 100` }, { status: 400 });
        }
        taxInfo[key] = p.value;
      }
    }
    if (body.tax_profile.additional_amount !== undefined) {
      const a = parseRate(body.tax_profile.additional_amount);
      if (!a.valid) {
        return NextResponse.json({ ok: false, error: "tax_profile.additional_amount must be a non-negative number" }, { status: 400 });
      }
      taxInfo.additional_amount = a.value;
    }
    if (Object.keys(taxInfo).length === 0) taxInfo = null;
  }

  if (sets.length === 0 && !taxInfo) {
    return NextResponse.json({ ok: false, error: "No pay fields provided" }, { status: 400 });
  }

  return withPg(async (client) => {
    const tenant = resolveTenantId(req);
    let employee: any = null;
    if (sets.length > 0) {
      params.push(id, tenant);
      const r = await client.query(
        `UPDATE public.crm_staff
            SET ${sets.join(", ")}, updated_at = now()
          WHERE id = $${params.length - 1}::uuid AND tenant_id = $${params.length}
          RETURNING id::text AS id, display_name, pay_type,
                    hourly_rate::numeric AS hourly_rate,
                    salary_amount::numeric AS salary_amount, salary_period,
                    commission_rate::numeric AS commission_rate`,
        params,
      );
      if (r.rows.length === 0) {
        return NextResponse.json({ ok: false, error: "Employee not found" }, { status: 404 });
      }
      employee = r.rows[0];
    } else {
      const r = await client.query(
        `SELECT id::text AS id, display_name, pay_type,
                hourly_rate::numeric AS hourly_rate,
                salary_amount::numeric AS salary_amount, salary_period,
                commission_rate::numeric AS commission_rate
           FROM public.crm_staff WHERE id = $1::uuid AND tenant_id = $2`,
        [id, tenant],
      );
      if (r.rows.length === 0) {
        return NextResponse.json({ ok: false, error: "Employee not found" }, { status: 404 });
      }
      employee = r.rows[0];
    }
    const taxProfile = taxInfo ? await upsertTaxProfile(client, tenant, id, taxInfo) : undefined;
    return NextResponse.json({
      ok: true,
      employee,
      ...(taxProfile !== undefined ? { tax_profile: taxProfile } : {}),
    });
  }).then((r) => r ?? NextResponse.json({ error: "DB unavailable" }, { status: 503 }))
    .catch((e: any) => NextResponse.json({ error: e?.message }, { status: 500 }));
}
