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
import { createPayrollRun } from "@/lib/payroll/runPayroll";

// GET /api/admin/payroll/runs — list payroll runs
export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("staff_groomer_management", "read");
  if (gate) return gate;
  return withPg(async (client) => {
    const tenant = resolveTenantId(req);
    const r = await client.query(
      `SELECT id::text AS id, number, pay_period_start::text AS pay_period_start,
              pay_period_end::text AS pay_period_end, pay_date::text AS pay_date,
              status, COALESCE(gross_wages, 0)::numeric AS gross_wages,
              COALESCE(tax_withheld, 0)::numeric AS tax_withheld,
              COALESCE(net_paid, 0)::numeric AS net_paid,
              COALESCE(employer_taxes, 0)::numeric AS employer_taxes,
              journal_id::text AS journal_id,
              created_at::text AS created_at
         FROM public.payroll_runs
        WHERE tenant_id = $1
        ORDER BY created_at DESC`,
      [tenant],
    );
    return NextResponse.json({ runs: r.rows });
  }).then((r) => r ?? NextResponse.json({ error: "DB unavailable" }, { status: 503 }))
    .catch((e: any) => NextResponse.json({ error: e?.message }, { status: 500 }));
}

// POST /api/admin/payroll/runs — create a disbursement run from approved timesheets
// Body: { pay_period_start: "YYYY-MM-DD", pay_period_end: "YYYY-MM-DD", pay_date: "YYYY-MM-DD" }
// The computation lives in the shared engine (@/lib/payroll/runPayroll) so
// this route, the finance palette action (fin_run_payroll, SA-87) and the
// accounting action (payroll_run) all produce identical runs: gross from the
// crm_staff pay profile, accrued commissions absorbed and flipped to 'paid',
// withholding computed per line from each employee's recorded tax profile
// (@/lib/payroll/withholding — no profile on file withholds $0 and is
// flagged in missingWithholding), created in 'draft'; the lifecycle
// (approve → pay → post) is PATCH /api/admin/payroll/runs/[id].
export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("staff_groomer_management", "write");
  if (gate) return gate;
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const payPeriodStart = String(body.pay_period_start || "");
  const payPeriodEnd = String(body.pay_period_end || "");
  const payDate = String(body.pay_date || payPeriodEnd);
  if (!payPeriodStart || !payPeriodEnd) {
    return NextResponse.json({ ok: false, error: "pay_period_start and pay_period_end are required (YYYY-MM-DD)" }, { status: 400 });
  }
  const startMs = Date.parse(`${payPeriodStart}T00:00:00Z`);
  const endMs = Date.parse(`${payPeriodEnd}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return NextResponse.json({ ok: false, error: "pay_period_start and pay_period_end must be valid dates (YYYY-MM-DD), end on or after start" }, { status: 400 });
  }
  return withPg(async (client) => {
    const tenant = resolveTenantId(req);
    const result = await createPayrollRun(client, tenant, { payPeriodStart, payPeriodEnd, payDate });
    return NextResponse.json({
      ok: true,
      run: { id: result.runId, number: result.runNumber, status: result.status },
      summary: result.summary,
      missingRates: result.missingRates,
      missingWithholding: result.missingWithholding,
      lines: result.lines,
    });
  }).then((r) => r ?? NextResponse.json({ error: "DB unavailable" }, { status: 503 }))
    .catch((e: any) => NextResponse.json({ error: e?.message }, { status: 500 }));
}
