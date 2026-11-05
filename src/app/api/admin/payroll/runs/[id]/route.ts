import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { getPgWithRetry } from "@/lib/pg";
import { transitionPayrollRun, type PayrollRunAction } from "@/lib/payroll/lifecycle";

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

export const dynamic = "force-dynamic";

// GET /api/admin/payroll/runs/[id] — one payroll run with its per-employee
// items (payroll_run_items joined to crm_staff for names). This is the
// data behind the PayrollView pay-stub inspector: a run's stubs ARE its
// items. Runs created before the unified engine recorded no items — the
// items list is then honestly empty, never synthesized.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("staff_groomer_management", "read");
  if (gate) return gate;
  const { id } = await ctx.params;
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
        WHERE id = $1::uuid AND tenant_id = $2`,
      [id, tenant],
    );
    if (r.rows.length === 0) {
      return NextResponse.json({ ok: false, error: "Payroll run not found" }, { status: 404 });
    }
    const items = await client.query(
      `SELECT i.id::text AS id, i.employee_id::text AS employee_id,
              s.display_name AS employee_name,
              COALESCE(i.hours_regular, 0)::numeric AS hours_regular,
              COALESCE(i.hours_overtime, 0)::numeric AS hours_overtime,
              COALESCE(i.gross_wages, 0)::numeric AS gross_wages,
              COALESCE(i.tax_withheld, 0)::numeric AS tax_withheld,
              COALESCE(i.net_paid, 0)::numeric AS net_paid,
              COALESCE(i.commission_amount, 0)::numeric AS commission_amount
         FROM public.payroll_run_items i
         LEFT JOIN public.crm_staff s ON s.id = i.employee_id
        WHERE i.payroll_run_id = $1::uuid
        ORDER BY s.display_name NULLS LAST`,
      [id],
    );
    return NextResponse.json({ ok: true, run: r.rows[0], items: items.rows });
  }).then((r) => r ?? NextResponse.json({ error: "DB unavailable" }, { status: 503 }))
    .catch((e: any) => NextResponse.json({ error: e?.message }, { status: 500 }));
}

// PATCH /api/admin/payroll/runs/[id] — move a run through its lifecycle
// (BL-3). Body: { action: "approve" | "pay" | "post" | "void" }.
// The transition machine itself — guards, the disbursement gates, the
// tax-forms writer on 'pay', the balanced JE + journal_id stamp on
// 'post', source release on 'void' — lives in src/lib/payroll/lifecycle.ts.
const LIFECYCLE_ACTIONS: PayrollRunAction[] = ["approve", "pay", "post", "void"];
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("staff_groomer_management", "write");
  if (gate) return gate;
  const { id } = await ctx.params;
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body.action || "") as PayrollRunAction;
  if (!LIFECYCLE_ACTIONS.includes(action)) {
    return NextResponse.json(
      { ok: false, error: `action must be one of: ${LIFECYCLE_ACTIONS.join(", ")}` },
      { status: 400 },
    );
  }
  return withPg(async (client) => {
    const tenant = resolveTenantId(req);
    // withPg converts a thrown error into a null (→ 503), so the
    // transition's coded errors are mapped to responses HERE, inside fn.
    try {
      const result = await transitionPayrollRun(client, tenant, id, action);
      return NextResponse.json({ ok: true, ...result });
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : "Transition failed";
      const code = msg.split(":")[0];
      const status =
        code === "RUN_NOT_FOUND" ? 404 :
        code === "INVALID_TRANSITION" || code === "RUN_EMPTY" || code === "RUN_ZERO_GROSS" ? 409 :
        code === "PAYROLL_BANK_NOT_CONNECTED" || code === "PAYEE_BANK_MISSING" ? 422 :
        500;
      return NextResponse.json({ ok: false, error: msg.replace(/^[A-Z_]+: /, ""), code }, { status });
    }
  }).then((r) => r ?? NextResponse.json({ error: "DB unavailable" }, { status: 503 }))
    .catch((e: any) => NextResponse.json({ error: e?.message }, { status: 500 }));
}
