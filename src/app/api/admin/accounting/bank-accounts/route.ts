import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/accounting/bank-accounts
//
// Banking & Cash → Cards & Bank Accounts: the full account register.
// One row per acct_bank_accounts record with:
//  - GL code/name from acct_chart_of_accounts (gl_account_id)
//  - ledger balance = posted journal activity on that GL account
//    (SUM debit − credit over posted entries)
//  - bank balance = latest statement closing balance when a statement
//    exists, otherwise the sum of bank transactions on file
//    (bankBalanceSource says which — never presented as a live feed
//    figure when it is not one)
//  - last reconciliation (latest completed acct_reconciliations row)
//  - feed health from provider / provider_connection_id / last_sync_at:
//    a feed is only "connected" when a provider connection id exists.

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const rows = await pgQuery<{
      id: string; name: string; institution_name: string | null; account_type: string;
      masked_account_number: string | null; currency: string; is_active: boolean;
      provider: string | null; provider_connection_id: string | null; last_sync_at: string | null;
      gl_account_id: string | null; gl_code: string | null; gl_name: string | null;
      ledger_balance: string; txn_total: string; txn_count: number;
      statement_balance: string | null; statement_end: string | null;
      last_reconciled_at: string | null; open_recon_status: string | null;
    }>(
      `SELECT a.id::text AS id, a.name, a.institution_name, a.account_type,
              a.masked_account_number, a.currency, a.is_active,
              a.provider, a.provider_connection_id, a.last_sync_at::text AS last_sync_at,
              a.gl_account_id::text AS gl_account_id,
              coa.code AS gl_code, coa.name AS gl_name,
              COALESCE((SELECT SUM(l.debit - l.credit)
                          FROM public.acct_journal_lines l
                          JOIN public.acct_journal_entries e
                            ON e.id = l.journal_entry_id AND e.tenant_id = a.tenant_id
                         WHERE l.account_id = a.gl_account_id
                           AND e.status = 'posted'), 0)::text AS ledger_balance,
              COALESCE((SELECT SUM(t.amount) FROM public.acct_bank_transactions t
                         WHERE t.bank_account_id = a.id AND t.tenant_id = a.tenant_id), 0)::text AS txn_total,
              COALESCE((SELECT COUNT(*) FROM public.acct_bank_transactions t
                         WHERE t.bank_account_id = a.id AND t.tenant_id = a.tenant_id), 0)::int AS txn_count,
              (SELECT s.closing_balance::text FROM public.acct_bank_statements s
                WHERE s.bank_account_id = a.id AND s.tenant_id = a.tenant_id
                ORDER BY s.statement_end DESC LIMIT 1) AS statement_balance,
              (SELECT s.statement_end::text FROM public.acct_bank_statements s
                WHERE s.bank_account_id = a.id AND s.tenant_id = a.tenant_id
                ORDER BY s.statement_end DESC LIMIT 1) AS statement_end,
              (SELECT MAX(r.as_of_date)::text FROM public.acct_reconciliations r
                WHERE r.bank_account_id = a.id AND r.tenant_id = a.tenant_id
                  AND r.status IN ('reconciled','closed')) AS last_reconciled_at,
              (SELECT r.status::text FROM public.acct_reconciliations r
                WHERE r.bank_account_id = a.id AND r.tenant_id = a.tenant_id
                  AND r.status IN ('open','in_progress','reopened')
                ORDER BY r.as_of_date DESC LIMIT 1) AS open_recon_status
         FROM public.acct_bank_accounts a
         LEFT JOIN public.acct_chart_of_accounts coa
           ON coa.id = a.gl_account_id AND coa.tenant_id = a.tenant_id
        WHERE a.tenant_id = $1
        ORDER BY a.is_active DESC, a.name ASC`,
      [tenant],
    );

    const glAccounts = await pgQuery<{ id: string; code: string; name: string; account_type: string }>(
      `SELECT id::text AS id, code, name, account_type
         FROM public.acct_chart_of_accounts
        WHERE tenant_id = $1 AND is_active = true AND is_posting_allowed = true
        ORDER BY code ASC`,
      [tenant],
    );

    return NextResponse.json({
      accounts: rows.map((r) => {
        const statementBalance = r.statement_balance != null ? Number(r.statement_balance) : null;
        const txnTotal = Number(r.txn_total || 0);
        return {
          id: r.id,
          name: r.name,
          institutionName: r.institution_name,
          accountType: r.account_type,
          maskedNumber: r.masked_account_number,
          currency: r.currency || "USD",
          isActive: r.is_active,
          glAccountId: r.gl_account_id,
          glCode: r.gl_code,
          glName: r.gl_name,
          ledgerBalance: Number(r.ledger_balance || 0),
          bankBalance: statementBalance != null ? statementBalance : txnTotal,
          bankBalanceSource: statementBalance != null ? "statement" : "transactions",
          statementEnd: r.statement_end,
          transactionCount: Number(r.txn_count || 0),
          lastReconciledAt: r.last_reconciled_at,
          openReconStatus: r.open_recon_status,
          feed: {
            provider: r.provider,
            connected: !!r.provider_connection_id,
            lastSyncAt: r.last_sync_at,
          },
        };
      }),
      glAccounts,
      total: rows.length,
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/bank-accounts]", e);
    return NextResponse.json({ error: e?.message || "Failed to load bank accounts" }, { status: 500 });
  }
}
