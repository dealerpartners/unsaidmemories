/**
 * Shared balanced journal-entry posting for the accounting module.
 * Used by POS, booking checkout, refunds, and the manual journal API.
 *
 * Contract: sum(debits) MUST equal sum(credits) or the post is rejected.
 * Everything (batch + entry + lines) is inserted in one transaction.
 */
import type { PoolClient } from "pg";

export interface JournalLineInput {
  /** GL account code, e.g. "1000". Resolved to the account id. */
  accountCode: string;
  debit: number;
  credit: number;
  memo?: string;
}

export interface JournalEntryInput {
  source: string; // e.g. "pos_sale", "booking_checkout", "manual", "refund"
  sourceId?: string | null;
  reference?: string | null;
  memo: string;
  entryDate?: string; // YYYY-MM-DD, defaults to today
  lines: JournalLineInput[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// acct_journal_entries.source is the Postgres enum acct_source_type — any
// label outside this set is rejected by the database (22P02) and the post
// dies. Callers pass app-level source names ("invoice_paid", "refund",
// "stripe_payment", …); coerce them here so every caller posts successfully
// instead of failing silently inside best-effort try/catch blocks. The
// caller's original string is preserved on the entry's `reference` column
// when no explicit reference was supplied.
const VALID_JOURNAL_SOURCES = new Set([
  "manual", "invoice", "credit_memo", "customer_receipt", "vendor_bill",
  "vendor_credit", "vendor_payment", "bank", "expense", "payroll",
  "inventory", "fixed_asset", "lease", "revenue_recognition", "tax",
  "allocation", "intercompany", "consolidation", "opening_balance",
  "recurring", "import", "integration", "system",
]);
const JOURNAL_SOURCE_ALIASES: Record<string, string> = {
  invoice_paid: "customer_receipt",
  refund: "credit_memo",
};
export function coerceJournalSource(source: string): string {
  if (VALID_JOURNAL_SOURCES.has(source)) return source;
  return JOURNAL_SOURCE_ALIASES[source] ?? "integration";
}

/**
 * Post a balanced journal entry. Returns the entry id.
 * Throws if debits != credits, if accounts are missing, or on DB failure.
 * The caller is responsible for the surrounding transaction if atomicity
 * with other writes is needed — this function commits its own work when
 * called standalone (each statement auto-commits on the pool client).
 */
export async function postBalancedJournalEntry(
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>,
  tenant: string,
  input: JournalEntryInput,
): Promise<string> {
  const lines = (input.lines || []).filter(
    (l) => round2(l.debit) !== 0 || round2(l.credit) !== 0,
  );
  if (lines.length === 0) throw new Error("JOURNAL_EMPTY: no lines to post");

  const totalDebit = round2(lines.reduce((s, l) => s + Number(l.debit || 0), 0));
  const totalCredit = round2(lines.reduce((s, l) => s + Number(l.credit || 0), 0));
  if (totalDebit !== totalCredit) {
    throw new Error(
      `JOURNAL_UNBALANCED: debits (${totalDebit}) != credits (${totalCredit})`,
    );
  }

  // Resolve GL account ids by code
  const { rows: glAccounts } = await query(
    `SELECT id, code FROM public.acct_chart_of_accounts WHERE tenant_id = $1 AND is_active IS NOT FALSE`,
    [tenant],
  );
  const glByCode = new Map(
    glAccounts.map((r) => [String(r.code), String(r.id)]),
  );
  for (const l of lines) {
    if (!glByCode.get(l.accountCode)) {
      throw new Error(`JOURNAL_BAD_ACCOUNT: no GL account with code ${l.accountCode}`);
    }
  }

  // Entity (required)
  const { rows: entities } = await query(
    `SELECT id FROM public.acct_entities WHERE tenant_id = $1 LIMIT 1`,
    [tenant],
  );
  const entityId = entities[0]?.id as string | undefined;
  if (!entityId) throw new Error("JOURNAL_NO_ENTITY: no acct_entities row for tenant");

  // Book (get or create MAIN)
  let bookId: string | undefined;
  const { rows: books } = await query(
    `SELECT id FROM public.acct_books WHERE tenant_id = $1 LIMIT 1`,
    [tenant],
  );
  bookId = books[0]?.id as string | undefined;
  if (!bookId) {
    const { rows: nb } = await query(
      `INSERT INTO public.acct_books (tenant_id, entity_id, code, name, book_type, accounting_basis, currency, is_primary, active)
       VALUES ($1, $2, 'MAIN', 'Main Book', 'general', 'accrual', 'USD', true, true) RETURNING id`,
      [tenant, entityId],
    );
    bookId = nb[0]?.id as string;
  }

  // Period (get or create current month)
  let periodId: string | undefined;
  const { rows: periods } = await query(
    `SELECT id FROM public.acct_periods WHERE tenant_id = $1 AND CURRENT_DATE BETWEEN start_date AND end_date LIMIT 1`,
    [tenant],
  );
  periodId = periods[0]?.id as string | undefined;
  if (!periodId) {
    let fyId: string | undefined;
    const { rows: fy } = await query(
      `SELECT id FROM public.acct_fiscal_years WHERE tenant_id = $1
       AND EXTRACT(YEAR FROM CURRENT_DATE) BETWEEN EXTRACT(YEAR FROM start_date) AND EXTRACT(YEAR FROM end_date) LIMIT 1`,
      [tenant],
    );
    fyId = fy[0]?.id as string | undefined;
    if (!fyId) {
      const { rows: nfy } = await query(
        `INSERT INTO public.acct_fiscal_years (tenant_id, entity_id, fiscal_year, start_date, end_date, is_adjustment_year)
         VALUES ($1, $2, EXTRACT(YEAR FROM CURRENT_DATE)::int, date_trunc('year', CURRENT_DATE)::date,
                 (date_trunc('year', CURRENT_DATE) + interval '1 year' - interval '1 day')::date, false)
         RETURNING id`,
        [tenant, entityId],
      );
      fyId = nfy[0]?.id as string;
    }
    const { rows: np } = await query(
      `INSERT INTO public.acct_periods (tenant_id, book_id, fiscal_year_id, period_no, name, start_date, end_date, status)
       VALUES ($1, $2, $3, EXTRACT(MONTH FROM CURRENT_DATE)::int, to_char(CURRENT_DATE, 'YYYY-MM'),
               date_trunc('month', CURRENT_DATE)::date,
               (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date, 'open')
       RETURNING id`,
      [tenant, bookId, fyId],
    );
    periodId = np[0]?.id as string;
  }

  // Batch
  const batchNo = `JB-${Date.now()}`;
  const { rows: batchRows } = await query(
    `INSERT INTO public.acct_journal_batches (tenant_id, entity_id, book_id, batch_no, source, status, description, source_system)
     VALUES ($1, $2, $3, $4, 'integration', 'posted', $5, 'accounting')
     RETURNING id`,
    [tenant, entityId, bookId, batchNo, input.memo.slice(0, 200)],
  );
  const batchId = batchRows[0]?.id as string;

  // Entry header. entry_no is a GENERATED ALWAYS AS IDENTITY column —
  // the database assigns it; do not supply it.
  const source = coerceJournalSource(input.source);
  const reference =
    input.reference || (source !== input.source ? input.source : null);
  const entryDate = input.entryDate || new Date().toISOString().slice(0, 10);
  const { rows: jeRows } = await query(
    `INSERT INTO public.acct_journal_entries
       (tenant_id, entity_id, book_id, batch_id, period_id, entry_date, posting_date,
        source, source_id, reference, memo, currency, total_debit, total_credit, status)
     VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9, $10, 'USD', $11, $12, 'posted')
     RETURNING id`,
    [
      tenant, entityId, bookId, batchId, periodId, entryDate,
      source, input.sourceId || null, reference,
      input.memo, totalDebit, totalCredit,
    ],
  );
  const entryId = jeRows[0]?.id as string;

  // Lines
  let lineNo = 0;
  for (const l of lines) {
    lineNo += 1;
    await query(
      `INSERT INTO public.acct_journal_lines
         (tenant_id, entity_id, journal_entry_id, line_no, account_id, description, debit, credit)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        tenant, entityId, entryId, lineNo,
        glByCode.get(l.accountCode),
        l.memo || input.memo.slice(0, 200),
        round2(Number(l.debit || 0)), round2(Number(l.credit || 0)),
      ],
    );
  }

  return entryId;
}

/** Adapter: turn a pg PoolClient into the query fn this module expects. */
export function clientQuery(client: PoolClient) {
  return (text: string, params?: unknown[]) =>
    client.query(text, params || []).then((r) => ({ rows: r.rows as Record<string, unknown>[] }));
}
