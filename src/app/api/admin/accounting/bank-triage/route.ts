import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /api/admin/accounting/bank-triage
//
// Banking & Cash → Bank Feeds & Triage. The review queue for bank
// transactions in acct_bank_transactions that are not yet reconciled.
//
// GET returns every transaction grouped by match_status, and for each
// unreviewed one a list of SUGGESTED matches computed server-side from
// posted journal lines on the account's GL account: exact amount
// (debit − credit equals the transaction amount, sign included),
// ranked by entry-date proximity. Suggestions are labeled as
// suggestions in the UI — nothing is matched until a person accepts.
// It also returns the still-unmatched journal lines per account so a
// match can be picked by hand.
//
// POST actions (all writes are real):
//  accept  — sets the transaction matched + matched_journal_line_id
//            and records an acct_reconciliation_items row (item_type
//            'match') under the account's open reconciliation,
//            creating that reconciliation when none is open.
//  exclude — sets match_status 'excluded' (the design's Excluded tab).
//  restore — an excluded transaction goes back to 'unmatched'.
//  unmatch — a matched transaction goes back to 'unmatched' and its
//            triage match item is removed.

type TxnRow = {
  id: string; bank_account_id: string; transaction_date: string; posted_date: string | null;
  amount: string; description: string | null; payee: string | null; reference: string | null;
  match_status: string; matched_journal_line_id: string | null;
  account_name: string; gl_account_id: string | null;
};

type LineRow = {
  id: string; journal_entry_id: string; account_id: string; debit: string; credit: string;
  description: string | null; entry_date: string; entry_no: string; memo: string | null;
};

async function loadLines(tenant: string, glIds: string[]): Promise<LineRow[]> {
  if (glIds.length === 0) return [];
  const placeholders = glIds.map((_, i) => `$${i + 2}`).join(", ");
  return pgQuery<LineRow>(
    `SELECT l.id::text AS id, l.journal_entry_id::text AS journal_entry_id,
            l.account_id::text AS account_id, l.debit::text AS debit, l.credit::text AS credit,
            l.description, e.entry_date::text AS entry_date, e.entry_no::text AS entry_no, e.memo
       FROM public.acct_journal_lines l
       JOIN public.acct_journal_entries e
         ON e.id = l.journal_entry_id AND e.tenant_id = l.tenant_id
      WHERE l.tenant_id = $1 AND e.status = 'posted' AND l.account_id IN (${placeholders})
      ORDER BY e.entry_date DESC
      LIMIT 1000`,
    [tenant, ...glIds],
  );
}

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const accounts = await pgQuery<{ id: string; name: string; gl_account_id: string | null }>(
      `SELECT id::text AS id, name, gl_account_id::text AS gl_account_id
         FROM public.acct_bank_accounts WHERE tenant_id = $1 ORDER BY name ASC`,
      [tenant],
    );
    const glIds = [...new Set(accounts.map((a) => a.gl_account_id).filter(Boolean) as string[])];

    const txns = await pgQuery<TxnRow>(
      `SELECT t.id::text AS id, t.bank_account_id::text AS bank_account_id,
              t.transaction_date::text AS transaction_date, t.posted_date::text AS posted_date,
              t.amount::text AS amount, t.description, t.payee, t.reference,
              t.match_status, t.matched_journal_line_id::text AS matched_journal_line_id,
              a.name AS account_name, a.gl_account_id::text AS gl_account_id
         FROM public.acct_bank_transactions t
         JOIN public.acct_bank_accounts a
           ON a.id = t.bank_account_id AND a.tenant_id = t.tenant_id
        WHERE t.tenant_id = $1
        ORDER BY t.transaction_date DESC, t.created_at DESC
        LIMIT 500`,
      [tenant],
    );

    const lines = await loadLines(tenant, glIds);
    const usedLineIds = new Set(txns.map((t) => t.matched_journal_line_id).filter(Boolean) as string[]);
    const linesByAccount = new Map<string, LineRow[]>();
    for (const l of lines) {
      const arr = linesByAccount.get(l.account_id) || [];
      arr.push(l);
      linesByAccount.set(l.account_id, arr);
    }

    const dayMs = 86400000;
    const out = txns.map((t) => {
      const amount = Number(t.amount);
      const candidates = t.gl_account_id ? linesByAccount.get(t.gl_account_id) || [] : [];
      const suggestions = candidates
        .filter((l) => !usedLineIds.has(l.id))
        .map((l) => {
          const net = Number(l.debit) - Number(l.credit);
          const amountDiff = Math.abs(net - amount);
          const days = Math.abs(new Date(l.entry_date).getTime() - new Date(t.transaction_date).getTime()) / dayMs;
          return { line: l, net, amountDiff, days };
        })
        .filter((s) => s.amountDiff < 0.005)
        .sort((a, b) => a.days - b.days)
        .slice(0, 3)
        .map((s) => ({
          journalLineId: s.line.id,
          entryNo: s.line.entry_no,
          entryDate: s.line.entry_date,
          description: s.line.description || s.line.memo || 'Journal line',
          amount: s.net,
          reason: s.days <= 1 ? 'Same amount · same day' : `Same amount · ${Math.round(s.days)} day(s) apart`,
        }));
      return {
        id: t.id,
        bankAccountId: t.bank_account_id,
        accountName: t.account_name,
        date: t.transaction_date,
        postedDate: t.posted_date,
        amount,
        description: t.description,
        payee: t.payee,
        reference: t.reference,
        matchStatus: t.match_status,
        matchedJournalLineId: t.matched_journal_line_id,
        suggestions,
      };
    });

    // Unmatched posted journal lines per bank account, for hand-picking.
    const manualLines: Record<string, { journalLineId: string; entryNo: string; entryDate: string; description: string; amount: number }[]> = {};
    for (const a of accounts) {
      if (!a.gl_account_id) continue;
      manualLines[a.id] = (linesByAccount.get(a.gl_account_id) || [])
        .filter((l) => !usedLineIds.has(l.id))
        .slice(0, 100)
        .map((l) => ({
          journalLineId: l.id,
          entryNo: l.entry_no,
          entryDate: l.entry_date,
          description: l.description || l.memo || 'Journal line',
          amount: Number(l.debit) - Number(l.credit),
        }));
    }

    return NextResponse.json({
      accounts: accounts.map((a) => ({ id: a.id, name: a.name, glAccountId: a.gl_account_id })),
      transactions: out,
      manualLines,
      counts: {
        review: out.filter((t) => t.matchStatus === 'unmatched' || t.matchStatus === 'pending').length,
        matched: out.filter((t) => t.matchStatus === 'matched' || t.matchStatus === 'reconciled').length,
        excluded: out.filter((t) => t.matchStatus === 'excluded').length,
      },
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/bank-triage]", e);
    return NextResponse.json({ error: e?.message || "Failed to load triage queue" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "write");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const b = await req.json().catch(() => ({}));
    const action = String(b.action || "");
    const transactionId = String(b.transactionId || "");
    if (!transactionId) throw new Error("transactionId is required");

    const [txn] = await pgQuery<{ id: string; bank_account_id: string; amount: string; match_status: string }>(
      `SELECT id::text AS id, bank_account_id::text AS bank_account_id, amount::text AS amount, match_status
         FROM public.acct_bank_transactions WHERE id = $1 AND tenant_id = $2`,
      [transactionId, tenant],
    );
    if (!txn) throw new Error("Transaction not found");

    if (action === "exclude") {
      await pgQuery(
        `UPDATE public.acct_bank_transactions SET match_status = 'excluded' WHERE id = $1 AND tenant_id = $2`,
        [transactionId, tenant],
      );
      return NextResponse.json({ ok: true });
    }

    if (action === "restore") {
      await pgQuery(
        `UPDATE public.acct_bank_transactions SET match_status = 'unmatched' WHERE id = $1 AND tenant_id = $2`,
        [transactionId, tenant],
      );
      return NextResponse.json({ ok: true });
    }

    if (action === "unmatch") {
      await pgQuery(
        `DELETE FROM public.acct_reconciliation_items
          WHERE tenant_id = $1 AND bank_transaction_id = $2 AND item_type = 'match' AND status = 'matched'`,
        [tenant, transactionId],
      );
      await pgQuery(
        `UPDATE public.acct_bank_transactions
            SET match_status = 'unmatched', matched_journal_line_id = NULL
          WHERE id = $1 AND tenant_id = $2`,
        [transactionId, tenant],
      );
      return NextResponse.json({ ok: true });
    }

    if (action === "accept") {
      const journalLineId = String(b.journalLineId || "");
      if (!journalLineId) throw new Error("journalLineId is required");
      const [line] = await pgQuery<{ id: string; account_id: string }>(
        `SELECT l.id::text AS id, l.account_id::text AS account_id
           FROM public.acct_journal_lines l
           JOIN public.acct_journal_entries e
             ON e.id = l.journal_entry_id AND e.tenant_id = l.tenant_id
          WHERE l.id = $1 AND l.tenant_id = $2 AND e.status = 'posted'`,
        [journalLineId, tenant],
      );
      if (!line) throw new Error("Journal line not found");
      const [acct] = await pgQuery<{ gl_account_id: string | null }>(
        `SELECT gl_account_id::text AS gl_account_id FROM public.acct_bank_accounts
          WHERE id = $1 AND tenant_id = $2`,
        [txn.bank_account_id, tenant],
      );
      if (!acct?.gl_account_id || acct.gl_account_id !== line.account_id) {
        throw new Error("That journal line is not on this bank account's GL account");
      }

      // Find or create the account's open reconciliation to hold the item.
      let [recon] = await pgQuery<{ id: string }>(
        `SELECT id::text AS id FROM public.acct_reconciliations
          WHERE tenant_id = $1 AND bank_account_id = $2 AND status IN ('open','in_progress','reopened')
          ORDER BY as_of_date DESC LIMIT 1`,
        [tenant, txn.bank_account_id],
      );
      if (!recon) {
        const [gl] = await pgQuery<{ bal: string }>(
          `SELECT COALESCE(SUM(l.debit - l.credit), 0)::text AS bal
             FROM public.acct_journal_lines l
             JOIN public.acct_journal_entries e
               ON e.id = l.journal_entry_id AND e.tenant_id = l.tenant_id
            WHERE l.tenant_id = $1 AND l.account_id = $2 AND e.status = 'posted'`,
          [tenant, acct.gl_account_id],
        );
        const created = await pgQuery<{ id: string }>(
          `INSERT INTO public.acct_reconciliations
             (tenant_id, bank_account_id, as_of_date, statement_balance, gl_balance,
              outstanding_deposits, outstanding_payments, adjustments, difference, status)
           VALUES ($1, $2, CURRENT_DATE, 0, $3, 0, 0, 0, 0, 'in_progress')
           RETURNING id::text AS id`,
          [tenant, txn.bank_account_id, Number(gl?.bal || 0)],
        );
        recon = created[0];
      }

      await pgQuery(
        `INSERT INTO public.acct_reconciliation_items
           (tenant_id, reconciliation_id, bank_transaction_id, journal_line_id, item_type, amount, status, notes)
         VALUES ($1, $2, $3, $4, 'match', $5, 'matched', 'Matched in Bank Feeds Triage')`,
        [tenant, recon.id, transactionId, journalLineId, Number(txn.amount)],
      );
      await pgQuery(
        `UPDATE public.acct_bank_transactions
            SET match_status = 'matched', matched_journal_line_id = $3
          WHERE id = $1 AND tenant_id = $2`,
        [transactionId, tenant, journalLineId],
      );
      return NextResponse.json({ ok: true, reconciliationId: recon.id });
    }

    throw new Error("Unknown action");
  } catch (e: any) {
    console.error("[POST /api/admin/accounting/bank-triage]", e);
    return NextResponse.json({ error: e?.message || "Action failed" }, { status: 400 });
  }
}
