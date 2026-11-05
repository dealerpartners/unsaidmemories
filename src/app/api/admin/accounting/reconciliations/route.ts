import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /api/admin/accounting/reconciliations
//
// Banking & Cash → Reconciliation workbench over acct_reconciliations
// and acct_reconciliation_items.
//
// Model: a cycle is started for one bank account with the statement
// balance and statement date (typed in, or taken from an imported
// acct_bank_statements row). Inside the cycle, both sides of the same
// money are ticked: bank transactions (acct_bank_transactions) and
// posted journal lines on the account's GL account. Every tick is a
// real acct_reconciliation_items write (status 'cleared'); unticking
// removes it. The readout compares the cleared bank total against
// the cleared book (journal) total — the difference is zero when the
// two sides agree item for item — and against the statement balance.
// Finish writes the cycle 'reconciled' with its totals and marks the
// cleared bank transactions reconciled.

async function glBalance(tenant: string, glAccountId: string | null, asOf?: string): Promise<number> {
  if (!glAccountId) return 0;
  const rows = await pgQuery<{ bal: string }>(
    `SELECT COALESCE(SUM(l.debit - l.credit), 0)::text AS bal
       FROM public.acct_journal_lines l
       JOIN public.acct_journal_entries e
         ON e.id = l.journal_entry_id AND e.tenant_id = l.tenant_id
      WHERE l.tenant_id = $1 AND l.account_id = $2 AND e.status = 'posted'
        ${asOf ? "AND e.entry_date <= $3" : ""}`,
    asOf ? [tenant, glAccountId, asOf] : [tenant, glAccountId],
  );
  return Number(rows[0]?.bal || 0);
}

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const accountId = req.nextUrl.searchParams.get("account") || "";
    const reconId = req.nextUrl.searchParams.get("reconciliation") || "";

    const accounts = await pgQuery<{ id: string; name: string; institution_name: string | null; gl_account_id: string | null }>(
      `SELECT id::text AS id, name, institution_name, gl_account_id::text AS gl_account_id
         FROM public.acct_bank_accounts WHERE tenant_id = $1 ORDER BY name ASC`,
      [tenant],
    );
    if (accounts.length === 0) {
      return NextResponse.json({ accounts: [], history: [], statements: [], active: null });
    }
    const account = accounts.find((a) => a.id === accountId) || accounts[0];

    const history = await pgQuery<{
      id: string; as_of_date: string; statement_balance: string; gl_balance: string;
      difference: string; status: string; completed_at: string | null;
    }>(
      `SELECT id::text AS id, as_of_date::text AS as_of_date, statement_balance::text AS statement_balance,
              gl_balance::text AS gl_balance, difference::text AS difference, status::text AS status,
              completed_at::text AS completed_at
         FROM public.acct_reconciliations
        WHERE tenant_id = $1 AND bank_account_id = $2
        ORDER BY as_of_date DESC, id DESC`,
      [tenant, account.id],
    );

    const statements = await pgQuery<{
      id: string; statement_start: string; statement_end: string; closing_balance: string;
    }>(
      `SELECT id::text AS id, statement_start::text AS statement_start,
              statement_end::text AS statement_end, closing_balance::text AS closing_balance
         FROM public.acct_bank_statements
        WHERE tenant_id = $1 AND bank_account_id = $2
        ORDER BY statement_end DESC`,
      [tenant, account.id],
    );

    let active: any = null;
    const activeRow = reconId
      ? history.find((h) => h.id === reconId && h.status !== "reconciled" && h.status !== "closed")
      : history.find((h) => h.status === "open" || h.status === "in_progress" || h.status === "reopened");

    if (activeRow) {
      const items = await pgQuery<{ bank_transaction_id: string | null; journal_line_id: string | null; status: string }>(
        `SELECT bank_transaction_id::text AS bank_transaction_id, journal_line_id::text AS journal_line_id, status
           FROM public.acct_reconciliation_items
          WHERE tenant_id = $1 AND reconciliation_id = $2 AND status = 'cleared'`,
        [tenant, activeRow.id],
      );
      const clearedBank = new Set(items.map((i) => i.bank_transaction_id).filter(Boolean));
      const clearedJournal = new Set(items.map((i) => i.journal_line_id).filter(Boolean));

      const bankTxns = await pgQuery<{
        id: string; transaction_date: string; amount: string; description: string | null;
        payee: string | null; reference: string | null; match_status: string;
      }>(
        `SELECT id::text AS id, transaction_date::text AS transaction_date, amount::text AS amount,
                description, payee, reference, match_status
           FROM public.acct_bank_transactions
          WHERE tenant_id = $1 AND bank_account_id = $2 AND match_status <> 'excluded'
          ORDER BY transaction_date ASC`,
        [tenant, account.id],
      );
      const journalLines = account.gl_account_id
        ? await pgQuery<{
            id: string; debit: string; credit: string; description: string | null;
            entry_date: string; entry_no: string; memo: string | null;
          }>(
            `SELECT l.id::text AS id, l.debit::text AS debit, l.credit::text AS credit,
                    l.description, e.entry_date::text AS entry_date, e.entry_no::text AS entry_no, e.memo
               FROM public.acct_journal_lines l
               JOIN public.acct_journal_entries e
                 ON e.id = l.journal_entry_id AND e.tenant_id = l.tenant_id
              WHERE l.tenant_id = $1 AND l.account_id = $2 AND e.status = 'posted'
              ORDER BY e.entry_date ASC`,
            [tenant, account.gl_account_id],
          )
        : [];

      active = {
        id: activeRow.id,
        asOfDate: activeRow.as_of_date,
        statementBalance: Number(activeRow.statement_balance),
        storedGlBalance: Number(activeRow.gl_balance),
        status: activeRow.status,
        bankItems: bankTxns.map((t) => ({
          id: t.id, kind: "bank" as const, date: t.transaction_date,
          reference: t.reference, label: t.payee || t.description || "Bank transaction",
          detail: t.payee && t.description ? t.description : null,
          amount: Number(t.amount),
          cleared: clearedBank.has(t.id),
          alreadyReconciled: t.match_status === "reconciled" && !clearedBank.has(t.id),
        })),
        journalItems: journalLines.map((l) => ({
          id: l.id, kind: "journal" as const, date: l.entry_date,
          reference: `#${l.entry_no}`, label: l.description || l.memo || "Journal line",
          detail: null,
          amount: Number(l.debit) - Number(l.credit),
          cleared: clearedJournal.has(l.id),
          alreadyReconciled: false,
        })),
      };
    }

    return NextResponse.json({
      accounts: accounts.map((a) => ({ id: a.id, name: a.name, institutionName: a.institution_name, glAccountId: a.gl_account_id })),
      accountId: account.id,
      currentGlBalance: await glBalance(tenant, account.gl_account_id),
      statements: statements.map((s) => ({
        id: s.id, start: s.statement_start, end: s.statement_end, closingBalance: Number(s.closing_balance),
      })),
      history: history.map((h) => ({
        id: h.id, asOfDate: h.as_of_date, statementBalance: Number(h.statement_balance),
        glBalance: Number(h.gl_balance), difference: Number(h.difference),
        status: h.status, completedAt: h.completed_at,
      })),
      active,
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/reconciliations]", e);
    return NextResponse.json({ error: e?.message || "Failed to load reconciliation" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "write");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const b = await req.json().catch(() => ({}));
    const action = String(b.action || "");

    if (action === "start") {
      const bankAccountId = String(b.bankAccountId || "");
      const statementBalance = Number(b.statementBalance);
      const asOfDate = String(b.asOfDate || "");
      if (!bankAccountId || !asOfDate || !Number.isFinite(statementBalance)) {
        throw new Error("Account, statement balance and statement date are required");
      }
      const [acct] = await pgQuery<{ gl_account_id: string | null }>(
        `SELECT gl_account_id::text AS gl_account_id FROM public.acct_bank_accounts WHERE id = $1 AND tenant_id = $2`,
        [bankAccountId, tenant],
      );
      if (!acct) throw new Error("Bank account not found");
      const [existing] = await pgQuery<{ id: string }>(
        `SELECT id::text AS id FROM public.acct_reconciliations
          WHERE tenant_id = $1 AND bank_account_id = $2 AND status IN ('open','in_progress','reopened')
          ORDER BY as_of_date DESC LIMIT 1`,
        [tenant, bankAccountId],
      );
      if (existing) return NextResponse.json({ ok: true, reconciliationId: existing.id, resumed: true });
      const gl = await glBalance(tenant, acct.gl_account_id, asOfDate);
      const created = await pgQuery<{ id: string }>(
        `INSERT INTO public.acct_reconciliations
           (tenant_id, bank_account_id, as_of_date, statement_balance, gl_balance,
            outstanding_deposits, outstanding_payments, adjustments, difference, status)
         VALUES ($1, $2, $3, $4, $5, 0, 0, 0, $6, 'in_progress')
         RETURNING id::text AS id`,
        [tenant, bankAccountId, asOfDate, statementBalance, gl, statementBalance - gl],
      );
      return NextResponse.json({ ok: true, reconciliationId: created[0].id });
    }

    const reconciliationId = String(b.reconciliationId || "");
    if (!reconciliationId) throw new Error("reconciliationId is required");
    const [recon] = await pgQuery<{ id: string; bank_account_id: string; statement_balance: string; status: string }>(
      `SELECT id::text AS id, bank_account_id::text AS bank_account_id,
              statement_balance::text AS statement_balance, status::text AS status
         FROM public.acct_reconciliations WHERE id = $1 AND tenant_id = $2`,
      [reconciliationId, tenant],
    );
    if (!recon) throw new Error("Reconciliation not found");

    if (action === "toggle") {
      if (recon.status === "reconciled" || recon.status === "closed") throw new Error("This cycle is finished — reopen it to change ticks");
      const kind = String(b.kind || "");
      const itemId = String(b.itemId || "");
      const cleared = !!b.cleared;
      if (!itemId || (kind !== "bank" && kind !== "journal")) throw new Error("kind and itemId are required");
      const col = kind === "bank" ? "bank_transaction_id" : "journal_line_id";
      if (!cleared) {
        await pgQuery(
          `DELETE FROM public.acct_reconciliation_items WHERE tenant_id = $1 AND reconciliation_id = $2 AND ${col} = $3`,
          [tenant, reconciliationId, itemId],
        );
        return NextResponse.json({ ok: true });
      }
      let amount = 0;
      if (kind === "bank") {
        const [t] = await pgQuery<{ amount: string }>(
          `SELECT amount::text AS amount FROM public.acct_bank_transactions WHERE id = $1 AND tenant_id = $2 AND bank_account_id = $3`,
          [itemId, tenant, recon.bank_account_id],
        );
        if (!t) throw new Error("Bank transaction not on this account");
        amount = Number(t.amount);
      } else {
        const [l] = await pgQuery<{ net: string }>(
          `SELECT (debit - credit)::text AS net FROM public.acct_journal_lines WHERE id = $1 AND tenant_id = $2`,
          [itemId, tenant],
        );
        if (!l) throw new Error("Journal line not found");
        amount = Number(l.net);
      }
      const [dupe] = await pgQuery<{ id: string }>(
        `SELECT id::text AS id FROM public.acct_reconciliation_items WHERE tenant_id = $1 AND reconciliation_id = $2 AND ${col} = $3 LIMIT 1`,
        [tenant, reconciliationId, itemId],
      );
      if (!dupe) {
        await pgQuery(
          `INSERT INTO public.acct_reconciliation_items
             (tenant_id, reconciliation_id, bank_transaction_id, journal_line_id, item_type, amount, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'cleared')`,
          [tenant, reconciliationId, kind === "bank" ? itemId : null, kind === "journal" ? itemId : null, kind === "bank" ? "bank_transaction" : "journal_line", amount],
        );
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "finish") {
      const sums = await pgQuery<{ bank_net: string; journal_net: string }>(
        `SELECT
           COALESCE(SUM(amount) FILTER (WHERE bank_transaction_id IS NOT NULL), 0)::text AS bank_net,
           COALESCE(SUM(amount) FILTER (WHERE journal_line_id IS NOT NULL), 0)::text AS journal_net
           FROM public.acct_reconciliation_items
          WHERE tenant_id = $1 AND reconciliation_id = $2 AND status = 'cleared'`,
        [tenant, reconciliationId],
      );
      const bankNet = Number(sums[0]?.bank_net || 0);
      const journalNet = Number(sums[0]?.journal_net || 0);
      const outstanding = await pgQuery<{ dep: string; pay: string }>(
        `SELECT
           COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0)::text AS dep,
           COALESCE(ABS(SUM(amount) FILTER (WHERE amount < 0)), 0)::text AS pay
           FROM public.acct_bank_transactions t
          WHERE t.tenant_id = $1 AND t.bank_account_id = $2 AND t.match_status <> 'excluded'
            AND NOT EXISTS (SELECT 1 FROM public.acct_reconciliation_items i
                             WHERE i.tenant_id = $1 AND i.reconciliation_id = $3
                               AND i.bank_transaction_id = t.id AND i.status = 'cleared')`,
        [tenant, recon.bank_account_id, reconciliationId],
      );
      const [acct] = await pgQuery<{ gl_account_id: string | null }>(
        `SELECT gl_account_id::text AS gl_account_id FROM public.acct_bank_accounts WHERE id = $1 AND tenant_id = $2`,
        [recon.bank_account_id, tenant],
      );
      const gl = await glBalance(tenant, acct?.gl_account_id ?? null);
      await pgQuery(
        `UPDATE public.acct_reconciliations
            SET status = 'reconciled', completed_at = NOW(), gl_balance = $3,
                outstanding_deposits = $4, outstanding_payments = $5, difference = $6
          WHERE id = $1 AND tenant_id = $2`,
        [reconciliationId, tenant, gl, Number(outstanding[0]?.dep || 0), Number(outstanding[0]?.pay || 0), bankNet - journalNet],
      );
      await pgQuery(
        `UPDATE public.acct_bank_transactions t
            SET match_status = 'reconciled'
           FROM public.acct_reconciliation_items i
          WHERE i.tenant_id = $1 AND i.reconciliation_id = $2 AND i.status = 'cleared'
            AND i.bank_transaction_id = t.id AND t.tenant_id = $1`,
        [tenant, reconciliationId],
      );
      return NextResponse.json({ ok: true, difference: bankNet - journalNet, clearedBank: bankNet, clearedJournal: journalNet });
    }

    if (action === "reopen") {
      await pgQuery(
        `UPDATE public.acct_reconciliations SET status = 'reopened', completed_at = NULL WHERE id = $1 AND tenant_id = $2`,
        [reconciliationId, tenant],
      );
      await pgQuery(
        `UPDATE public.acct_bank_transactions t
            SET match_status = 'matched'
           FROM public.acct_reconciliation_items i
          WHERE i.tenant_id = $1 AND i.reconciliation_id = $2 AND i.status = 'cleared'
            AND i.bank_transaction_id = t.id AND t.tenant_id = $1 AND t.match_status = 'reconciled'`,
        [tenant, reconciliationId],
      );
      return NextResponse.json({ ok: true });
    }

    throw new Error("Unknown action");
  } catch (e: any) {
    console.error("[POST /api/admin/accounting/reconciliations]", e);
    return NextResponse.json({ error: e?.message || "Action failed" }, { status: 400 });
  }
}
