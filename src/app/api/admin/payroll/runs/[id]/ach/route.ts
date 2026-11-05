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
import { generateNachaFile, AchEmployee, AchCompany } from "@/lib/payroll/nacha";

// Banking runs on Stripe's rails: each tenant (master or franchise) links
// their bank through Stripe Connect, and the connection state lives in
// public.tenant_stripe_accounts (written by the Connect flow in
// Admin → Stripe Connections). No connection / incomplete onboarding → 422.
// There are deliberately NO typed-in EIN / bank-routing settings.

// GET /api/admin/payroll/runs/[id]/ach — generate NACHA file for a payroll run
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireModuleApi("staff_groomer_management", "read");
  if (gate) return gate;
  const { id: runId } = await params;
  return withPg(async (client) => {
    const tenant = resolveTenantId(req);

    // Get the run
    const runRes = await client.query(
      `SELECT id::text AS id, number, pay_period_start::text AS pay_period_start,
              pay_period_end::text AS pay_period_end, pay_date::text AS pay_date, status
         FROM public.payroll_runs WHERE id = $1::uuid AND tenant_id = $2`,
      [runId, tenant],
    );
    if (runRes.rows.length === 0) {
      return NextResponse.json({ error: "Payroll run not found" }, { status: 404 });
    }
    const run = runRes.rows[0];

    // --- Stripe Connect gate: tenant must have a linked bank via Stripe ---
    const connRes = await client.query(
      `SELECT stripe_account_id, charges_enabled, payouts_enabled, onboarding_complete
         FROM public.tenant_stripe_accounts WHERE tenant_id = $1`,
      [tenant],
    );
    const conn = connRes.rows[0];
    if (!conn || !conn.onboarding_complete) {
      return NextResponse.json(
        {
          ok: false,
          error: "Connect your bank via Stripe first (Admin → Stripe Connections).",
          stripe_connected: false,
          onboarding_complete: false,
        },
        { status: 422 },
      );
    }
    const stripeAccountId = String(conn.stripe_account_id || "");

    // Company identity for the file: the tenant's own business name.
    const tenantRes = await client.query(
      `SELECT name, legal_name, dba_name FROM public.tenants WHERE id = $1`,
      [tenant],
    );
    const t = tenantRes.rows[0] || {};
    const companyName = String(t.dba_name || t.name || t.legal_name || "UnSaid Memories");

    // Check for bank columns
    const colCheck = await client.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'crm_staff'
          AND column_name IN ('bank_routing_number', 'bank_account_number', 'bank_account_type')`,
    );
    const hasBankCols = colCheck.rows.length === 3;

    // Amounts come from the run's own items (net_paid per employee, computed
    // from wage rates when the run was created) — not recomputed here.
    const itemsRes = await client.query(
      `SELECT i.employee_id::text AS employee_id, s.display_name AS employee_name,
              SUM(i.net_paid)::numeric AS net_paid
         ${hasBankCols ? `, s.bank_routing_number, s.bank_account_number, s.bank_account_type` : ""}
         FROM public.payroll_run_items i
         LEFT JOIN public.crm_staff s ON s.id = i.employee_id
        WHERE i.payroll_run_id = $1::uuid
        GROUP BY i.employee_id, s.display_name
        ${hasBankCols ? `, s.bank_routing_number, s.bank_account_number, s.bank_account_type` : ""}`,
      [runId],
    );

    const employees: AchEmployee[] = [];
    const skipped: string[] = [];
    for (const row of itemsRes.rows) {
      const routing = hasBankCols ? String(row.bank_routing_number || "").replace(/\D/g, "") : "";
      const account = hasBankCols ? String(row.bank_account_number || "") : "";
      if (routing.length !== 9 || !account) {
        skipped.push(String(row.employee_name || row.employee_id));
        continue;
      }
      employees.push({
        name: String(row.employee_name || "Employee"),
        routingNumber: routing,
        accountNumber: account,
        accountType: String(row.bank_account_type || "checking") === "savings" ? "savings" : "checking",
        amountCents: Math.round(Number(row.net_paid || 0) * 100),
        employeeId: String(row.employee_id).slice(0, 15),
      });
    }

    if (employees.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "No payable employees on this run",
          detail: itemsRes.rows.length === 0
            ? "This run has no payroll_run_items — create the run again so per-employee amounts are recorded."
            : "Every employee on this run is missing bank details (routing/account) on their staff record.",
          skipped,
        },
        { status: 422 },
      );
    }

    const company: AchCompany = {
      name: companyName.toUpperCase(),
      // The originator on Stripe's rails is the tenant's connected account.
      companyId: stripeAccountId,
      // No tenant ODFI routing exists in the Stripe Connect model — Stripe
      // originates the transfer. The generator zero-pads this field.
      originRouting: "",
      originName: companyName.toUpperCase(),
      destinationName: "STRIPE",
    };

    const nacha = generateNachaFile(company, employees, new Date(run.pay_date || run.pay_period_end));

    return new NextResponse(nacha, {
      headers: {
        "Content-Type": "text/plain",
        "Content-Disposition": `attachment; filename="ach-${run.number}.txt"`,
      },
    });
  }).then((r) => r ?? NextResponse.json({ error: "DB unavailable" }, { status: 503 }))
    .catch((e: any) => NextResponse.json({ error: e?.message }, { status: 500 }));
}
