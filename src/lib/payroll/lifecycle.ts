// ---------------------------------------------------------------------------
// Payroll run lifecycle — BL-3 (payroll last mile).
//
// payroll_runs.status is the enum payroll_run_state:
//   draft → approved → paid → posted, plus void.
// Until this module existed every run was created 'draft' and no code path
// ever moved one: runs/[id] exposed GET only and journal_id stayed NULL.
//
// Transitions (each runs in its own transaction, run row locked):
//   approve  draft → approved. Guard: the run has per-employee items.
//   pay      approved → paid. The disbursement leg. Guards mirror the
//            NACHA route's own gates, because the NACHA file over Stripe's
//            rails IS the disbursement artifact: the tenant's bank must be
//            linked via Stripe Connect (tenant_stripe_accounts,
//            onboarding_complete) and every paid payee must carry bank
//            routing/account on their crm_staff record. On success the
//            quarter's Form 941 record is (re)written into
//            payroll_tax_forms from the paid/posted runs — the writer the
//            §3.11 taxes tab always lacked (it was a viewer over a table
//            nothing wrote). The form is recorded status 'draft': recorded
//            is not filed, and a row already marked 'filed' is never
//            clobbered.
//   post     paid → posted. Posts the balanced journal entry through the
//            shared accounting writer (src/lib/accounting/journal.ts):
//              Dr 6100 Wages Expense            gross
//              Cr 2400 Payroll Withholding Payable  tax_withheld
//              Cr 2410 Payroll Deductions Payable   post-tax deductions
//              Cr 1010 Checking Account         net_paid
//            gross = tax + deductions + net on every run by construction,
//            balances; the writer rejects it if it ever didn't. The two
//            payroll GL accounts are get-or-created per tenant (the chart
//            shipped without them — the old engine header named exactly
//            that as the reason no JE could post). payroll_runs.journal_id
//            is stamped with the entry id.
//   void     draft → void. Releases what creation consumed: commission
//            entries flip paid → pending and lose the run stamp, and the
//            period's processed timesheets return to approved. Only draft
//            can void — an approved/paid run needs reversal machinery that
//            does not exist, and pretending otherwise would strand money.
//
// Errors are thrown as "CODE: message"; the route maps codes to statuses.
// ---------------------------------------------------------------------------

import { postBalancedJournalEntry, clientQuery } from "@/lib/accounting/journal";
import { parseTaxProfile, type PayrollDbClient } from "@/lib/payroll/withholding";

export type PayrollRunAction = "approve" | "pay" | "post" | "void";

export interface PayrollTransitionResult {
  runId: string;
  number: string;
  status: string;
  journalId: string | null;
  taxForm: { id: string; formType: string; year: number; quarter: number } | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function quarterOf(dateText: string): { year: number; quarter: number } {
  const [y, m] = dateText.split("-").map((x) => Number(x));
  return { year: y, quarter: Math.floor((m - 1) / 3) + 1 };
}

/**
 * (Re)write the quarter's Form 941 record from every paid/posted run whose
 * pay period starts in the quarter. Aggregates are recomputed from the
 * runs + items tables (recorded facts), never accumulated incrementally,
 * so re-paying or re-posting can never double-count.
 */
export async function refreshQuarterlyForm941(
  client: PayrollDbClient,
  tenant: string,
  year: number,
  quarter: number,
): Promise<{ id: string; formType: string; year: number; quarter: number } | null> {
  const qStartMonth = String((quarter - 1) * 3 + 1).padStart(2, "0");
  const qEndMonth = String(quarter * 3).padStart(2, "0");
  const qStart = `${year}-${qStartMonth}-01`;
  const qEnd = quarter === 4 ? `${year}-12-31` : `${year}-${qEndMonth}-${new Date(year, quarter * 3, 0).getDate()}`;

  const runs = await client.query(
    `SELECT id::text AS id, number,
            COALESCE(gross_wages, 0)::numeric AS gross_wages,
            COALESCE(tax_withheld, 0)::numeric AS tax_withheld,
            COALESCE(net_paid, 0)::numeric AS net_paid,
            COALESCE(employer_taxes, 0)::numeric AS employer_taxes
       FROM public.payroll_runs
      WHERE tenant_id = $1 AND status IN ('paid', 'posted')
        AND pay_period_start >= $2::date AND pay_period_start <= $3::date
      ORDER BY pay_period_start, created_at`,
    [tenant, qStart, qEnd],
  );
  if (runs.rows.length === 0) return null;

  const items = await client.query(
    `SELECT i.employee_id::text AS employee_id, s.display_name AS employee_name,
            SUM(COALESCE(i.gross_wages, 0))::numeric AS gross_wages,
            SUM(COALESCE(i.tax_withheld, 0))::numeric AS tax_withheld,
            SUM(COALESCE(i.net_paid, 0))::numeric AS net_paid
       FROM public.payroll_run_items i
       JOIN public.payroll_runs r ON r.id = i.payroll_run_id AND r.tenant_id = $1
       LEFT JOIN public.crm_staff s ON s.id = i.employee_id
      WHERE r.status IN ('paid', 'posted')
        AND r.pay_period_start >= $2::date AND r.pay_period_start <= $3::date
      GROUP BY i.employee_id, s.display_name
      ORDER BY s.display_name NULLS LAST`,
    [tenant, qStart, qEnd],
  );

  // Each employee's recorded withholding inputs, snapshotted into the form
  // payload so the form shows WHAT was withheld under WHICH profile.
  const staffIds = items.rows.map((r: any) => r.employee_id);
  const profiles = new Map<string, unknown>();
  if (staffIds.length > 0) {
    const prof = await client.query(
      `SELECT staff_id::text AS staff_id, tax_info FROM public.acct_payroll_employees
        WHERE tenant_id = $1 AND staff_id = ANY($2::uuid[])`,
      [tenant, staffIds],
    );
    for (const r of prof.rows) profiles.set(r.staff_id, parseTaxProfile(r.tax_info));
  }

  const payload = {
    source: "payroll_lifecycle",
    form: "941",
    year,
    quarter,
    run_ids: runs.rows.map((r: any) => r.id),
    run_numbers: runs.rows.map((r: any) => r.number),
    totals: {
      gross_wages: round2(runs.rows.reduce((s: number, r: any) => s + Number(r.gross_wages || 0), 0)),
      tax_withheld: round2(runs.rows.reduce((s: number, r: any) => s + Number(r.tax_withheld || 0), 0)),
      net_paid: round2(runs.rows.reduce((s: number, r: any) => s + Number(r.net_paid || 0), 0)),
      employer_taxes: round2(runs.rows.reduce((s: number, r: any) => s + Number(r.employer_taxes || 0), 0)),
      employees: items.rows.length,
    },
    per_employee: items.rows.map((r: any) => ({
      employee_id: r.employee_id,
      employee_name: r.employee_name ?? null,
      gross_wages: Number(r.gross_wages || 0),
      tax_withheld: Number(r.tax_withheld || 0),
      net_paid: Number(r.net_paid || 0),
      withholding_profile: profiles.get(r.employee_id) ?? null,
    })),
  };

  const existing = await client.query(
    `SELECT id::text AS id, status FROM public.payroll_tax_forms
      WHERE tenant_id = $1 AND form_type = '941' AND year = $2 AND quarter = $3
      ORDER BY created_at DESC LIMIT 1`,
    [tenant, year, quarter],
  );
  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    if (row.status === "filed") return { id: row.id, formType: "941", year, quarter };
    await client.query(
      `UPDATE public.payroll_tax_forms SET payload = $2::jsonb WHERE id = $1::uuid`,
      [row.id, JSON.stringify(payload)],
    );
    return { id: row.id, formType: "941", year, quarter };
  }
  const ins = await client.query(
    `INSERT INTO public.payroll_tax_forms (id, tenant_id, form_type, year, quarter, payload, status)
     VALUES (gen_random_uuid(), $1, '941', $2, $3, $4::jsonb, 'draft')
     RETURNING id::text AS id`,
    [tenant, year, quarter, JSON.stringify(payload)],
  );
  return { id: ins.rows[0].id, formType: "941", year, quarter };
}

async function ensurePayrollGlAccounts(client: PayrollDbClient, tenant: string): Promise<void> {
  const wanted = [
    { code: "6100", name: "Wages Expense", account_type: "expense", normal_balance: "debit" },
    { code: "2400", name: "Payroll Withholding Payable", account_type: "liability", normal_balance: "credit" },
    { code: "2410", name: "Payroll Deductions Payable", account_type: "liability", normal_balance: "credit" },
  ];
  const existing = await client.query(
    `SELECT code FROM public.acct_chart_of_accounts WHERE tenant_id = $1 AND code = ANY($2::text[])`,
    [tenant, wanted.map((w) => w.code)],
  );
  const have = new Set(existing.rows.map((r: any) => String(r.code)));
  const missing = wanted.filter((w) => !have.has(w.code));
  if (missing.length === 0) return;
  const ent = await client.query(
    `SELECT id::text AS id FROM public.acct_entities WHERE tenant_id = $1 LIMIT 1`,
    [tenant],
  );
  const entityId = ent.rows[0]?.id;
  if (!entityId) throw new Error("JOURNAL_NO_ENTITY: no acct_entities row for tenant");
  for (const w of missing) {
    await client.query(
      `INSERT INTO public.acct_chart_of_accounts
         (tenant_id, entity_id, code, name, account_type, normal_balance, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       ON CONFLICT DO NOTHING`,
      [tenant, entityId, w.code, w.name, w.account_type, w.normal_balance],
    );
  }
}

export async function transitionPayrollRun(
  client: PayrollDbClient,
  tenant: string,
  runId: string,
  action: PayrollRunAction,
): Promise<PayrollTransitionResult> {
  await client.query("BEGIN");
  try {
    const rr = await client.query(
      `SELECT id::text AS id, number, status,
              pay_period_start::text AS pay_period_start,
              pay_period_end::text AS pay_period_end, pay_date::text AS pay_date,
              COALESCE(gross_wages, 0)::numeric AS gross_wages,
              COALESCE(tax_withheld, 0)::numeric AS tax_withheld,
              COALESCE(net_paid, 0)::numeric AS net_paid,
              journal_id::text AS journal_id
         FROM public.payroll_runs
        WHERE id = $1::uuid AND tenant_id = $2
        FOR UPDATE`,
      [runId, tenant],
    );
    if (rr.rows.length === 0) throw new Error("RUN_NOT_FOUND: Payroll run not found");
    const run = rr.rows[0];
    const from = String(run.status);
    const invalid = (want: string) =>
      new Error(`INVALID_TRANSITION: run ${run.number} is '${from}'; '${action}' requires status '${want}'`);
    let taxForm: PayrollTransitionResult["taxForm"] = null;
    let journalId: string | null = run.journal_id ?? null;

    if (action === "approve") {
      if (from !== "draft") throw invalid("draft");
      const cnt = await client.query(
        `SELECT COUNT(*)::int AS n FROM public.payroll_run_items WHERE payroll_run_id = $1::uuid`,
        [runId],
      );
      if (Number(cnt.rows[0]?.n || 0) === 0) {
        throw new Error("RUN_EMPTY: this run recorded no per-employee items, so there is nothing to approve. Create the run again so per-employee amounts are recorded.");
      }
      await client.query(
        `UPDATE public.payroll_runs SET status = 'approved', updated_at = now() WHERE id = $1::uuid`,
        [runId],
      );
    } else if (action === "pay") {
      if (from !== "approved") throw invalid("approved");
      // Disbursement gate 1 — the tenant's bank link (same gate and same
      // words as the NACHA route: banking runs on Stripe's rails).
      const conn = await client.query(
        `SELECT onboarding_complete FROM public.tenant_stripe_accounts WHERE tenant_id = $1`,
        [tenant],
      );
      if (!conn.rows[0]?.onboarding_complete) {
        throw new Error("PAYROLL_BANK_NOT_CONNECTED: Connect your bank via Stripe first (Admin → Stripe Connections).");
      }
      // Disbursement gate 2 — every payee with money owed carries bank
      // details; the NACHA generator skips payees without them, and a run
      // must never report 'paid' while a payee was silently skipped.
      const payees = await client.query(
        `SELECT s.display_name AS employee_name,
                regexp_replace(COALESCE(s.bank_routing_number, ''), '\\D', '', 'g') AS routing,
                COALESCE(s.bank_account_number, '') AS account
           FROM public.payroll_run_items i
           LEFT JOIN public.crm_staff s ON s.id = i.employee_id
          WHERE i.payroll_run_id = $1::uuid AND COALESCE(i.net_paid, 0) > 0`,
        [runId],
      );
      const missing = payees.rows
        .filter((r: any) => String(r.routing || "").length !== 9 || !String(r.account || ""))
        .map((r: any) => String(r.employee_name || "Unknown employee"));
      if (missing.length > 0) {
        throw new Error(`PAYEE_BANK_MISSING: no bank details on file for: ${missing.join(", ")}. Add routing/account on each staff record (or the employee's own Direct Deposit surface) before paying.`);
      }
      await client.query(
        `UPDATE public.payroll_runs SET status = 'paid', updated_at = now() WHERE id = $1::uuid`,
        [runId],
      );
      const { year, quarter } = quarterOf(String(run.pay_period_start));
      taxForm = await refreshQuarterlyForm941(client, tenant, year, quarter);
    } else if (action === "post") {
      if (from !== "paid") throw invalid("paid");
      const gross = Number(run.gross_wages || 0);
      const tax = Number(run.tax_withheld || 0);
      const net = Number(run.net_paid || 0);
      if (gross <= 0) {
        throw new Error("RUN_ZERO_GROSS: this run totals $0.00 gross — there is nothing to post to the books.");
      }
      await ensurePayrollGlAccounts(client, tenant);
      // Post-tax deductions sit inside net_paid's arithmetic
      // (gross − tax − deductions = net); the residual is owed to the
      // deduction recipients, so it posts to its own payable — that is
      // what keeps the entry balanced on every run shape.
      const deductionsPayable = round2(gross - tax - net);
      journalId = await postBalancedJournalEntry(clientQuery(client as any), tenant, {
        source: "payroll",
        sourceId: runId,
        reference: String(run.number),
        memo: `Payroll run ${run.number} (${run.pay_period_start} → ${run.pay_period_end})`,
        entryDate: String(run.pay_date || run.pay_period_end),
        lines: [
          { accountCode: "6100", debit: gross, credit: 0, memo: `Wages expense — run ${run.number}` },
          { accountCode: "2400", debit: 0, credit: tax, memo: `Withholding payable — run ${run.number}` },
          ...(deductionsPayable > 0
            ? [{ accountCode: "2410", debit: 0, credit: deductionsPayable, memo: `Deductions payable — run ${run.number}` }]
            : []),
          { accountCode: "1010", debit: 0, credit: net, memo: `Net pay disbursed — run ${run.number}` },
        ],
      });
      await client.query(
        `UPDATE public.payroll_runs SET status = 'posted', journal_id = $2::uuid, updated_at = now() WHERE id = $1::uuid`,
        [runId, journalId],
      );
    } else if (action === "void") {
      if (from !== "draft") throw invalid("draft");
      await client.query(
        `UPDATE public.crm_commission_entries
            SET status = 'pending', payroll_run_id = NULL, updated_at = now()
          WHERE tenant_id = $1 AND payroll_run_id = $2::uuid`,
        [tenant, runId],
      );
      await client.query(
        `UPDATE public.payroll_timesheets SET status = 'approved'
          WHERE tenant_id = $1 AND status = 'processed'
            AND week_start >= $2::date AND week_start <= $3::date`,
        [tenant, run.pay_period_start, run.pay_period_end],
      );
      await client.query(
        `UPDATE public.payroll_runs SET status = 'void', updated_at = now() WHERE id = $1::uuid`,
        [runId],
      );
    }

    const after = await client.query(
      `SELECT status, journal_id::text AS journal_id FROM public.payroll_runs WHERE id = $1::uuid`,
      [runId],
    );
    await client.query("COMMIT");
    return {
      runId,
      number: String(run.number),
      status: String(after.rows[0]?.status || from),
      journalId: after.rows[0]?.journal_id ?? journalId,
      taxForm,
    };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
}
