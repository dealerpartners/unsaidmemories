/**
 * Unsaid accounting core — adapted from UnSaid Memories src/lib/accounting/journal.ts.
 * Double-entry engine + shared reads over the acct_* tables (Supabase JS).
 * Contract: sum(debits) MUST equal sum(credits) or the post is rejected.
 */
import { createServerClient } from "@/lib/supabase";

export type DB = ReturnType<typeof createServerClient>;

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
export const money = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n) || 0);
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d.length <= 10 ? d + "T12:00:00" : d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

let tenantCache: string | null = null;
export async function tenantId(db: DB): Promise<string> {
  if (tenantCache) return tenantCache;
  const { data } = await db.from("tenants").select("id").order("created_at").limit(1).single();
  if (!data) throw new Error("NO_TENANT: tenants table is empty");
  tenantCache = data.id as string;
  return tenantCache;
}

/** Entity + book ids live on fiscal years / periods (no acct_entities table in this schema). */
export async function bookContext(db: DB, tenant: string) {
  const { data: fy } = await db
    .from("acct_fiscal_years").select("id, entity_id, fiscal_year").eq("tenant_id", tenant)
    .order("fiscal_year", { ascending: false }).limit(1).single();
  if (!fy) throw new Error("NO_FISCAL_YEAR: seed the books first");
  const { data: period } = await db
    .from("acct_periods").select("id, book_id").eq("tenant_id", tenant).eq("fiscal_year_id", fy.id)
    .order("period_no").limit(1).single();
  return { entityId: fy.entity_id as string, fiscalYearId: fy.id as string, bookId: (period?.book_id as string) || "" };
}

export async function accountByCode(db: DB, tenant: string, code: string) {
  const { data } = await db.from("acct_chart_of_accounts").select("*").eq("tenant_id", tenant).eq("code", code).single();
  return data;
}
export async function accountMap(db: DB, tenant: string) {
  const { data } = await db.from("acct_chart_of_accounts").select("*").eq("tenant_id", tenant).order("code");
  const rows = data || [];
  return { rows, byId: new Map(rows.map((a: any) => [a.id, a])), byCode: new Map(rows.map((a: any) => [String(a.code), a])) };
}

// ── Journal engine (UnSaid Memories postBalancedJournalEntry, adapted to Supabase JS) ──
const VALID_SOURCES = new Set([
  "manual", "invoice", "credit_memo", "customer_receipt", "vendor_bill",
  "vendor_credit", "vendor_payment", "bank", "expense", "payroll",
  "inventory", "fixed_asset", "lease", "revenue_recognition", "tax",
  "allocation", "intercompany", "consolidation", "opening_balance",
  "recurring", "import", "integration", "system", "order",
]);
const SOURCE_ALIASES: Record<string, string> = { invoice_paid: "customer_receipt", refund: "credit_memo" };
export const coerceSource = (s: string) => (VALID_SOURCES.has(s) ? s : SOURCE_ALIASES[s] ?? "integration");

export interface JournalLineInput { accountCode: string; debit: number; credit: number; memo?: string }
export interface JournalEntryInput {
  source: string; sourceId?: string | null; reference?: string | null;
  memo: string; entryDate?: string; lines: JournalLineInput[];
}

export async function postJournal(db: DB, input: JournalEntryInput): Promise<string> {
  const tenant = await tenantId(db);
  const lines = (input.lines || []).filter((l) => round2(l.debit) !== 0 || round2(l.credit) !== 0);
  if (!lines.length) throw new Error("JOURNAL_EMPTY: no lines to post");
  const td = round2(lines.reduce((s, l) => s + Number(l.debit || 0), 0));
  const tc = round2(lines.reduce((s, l) => s + Number(l.credit || 0), 0));
  if (td !== tc) throw new Error(`JOURNAL_UNBALANCED: debits (${td}) != credits (${tc})`);

  const { byCode } = await accountMap(db, tenant);
  for (const l of lines) if (!byCode.get(l.accountCode)) throw new Error(`JOURNAL_BAD_ACCOUNT: no GL account ${l.accountCode}`);

  const { entityId, bookId } = await bookContext(db, tenant);
  const entryDate = input.entryDate || todayISO();
  const { data: period } = await db.from("acct_periods").select("id")
    .eq("tenant_id", tenant).eq("book_id", bookId)
    .lte("start_date", entryDate).gte("end_date", entryDate).limit(1).single();
  if (!period) throw new Error(`JOURNAL_NO_PERIOD: no open period covers ${entryDate}`);

  const stamp = Date.now().toString(36).toUpperCase();
  const { data: batch, error: bErr } = await db.from("acct_journal_batches").insert({
    tenant_id: tenant, entity_id: entityId, book_id: bookId,
    batch_no: `B-${stamp}`, source: coerceSource(input.source), status: "posted",
    description: input.memo, posted_at: new Date().toISOString(),
  }).select("id").single();
  if (bErr) throw new Error("BATCH_FAIL: " + bErr.message);

  const { data: maxRow } = await db.from("acct_journal_entries").select("entry_no")
    .eq("tenant_id", tenant).order("entry_no", { ascending: false }).limit(1).single();
  const entryNo = Number(maxRow?.entry_no || 0) + 1;

  const { data: entry, error: eErr } = await db.from("acct_journal_entries").insert({
    tenant_id: tenant, entity_id: entityId, book_id: bookId, batch_id: batch.id, period_id: period.id,
    entry_no: entryNo, entry_date: entryDate, posting_date: entryDate,
    source: coerceSource(input.source), source_id: input.sourceId || null,
    reference: input.reference || null, memo: input.memo,
    currency: "USD", total_debit: td, total_credit: tc, status: "posted",
    posted_at: new Date().toISOString(),
  }).select("id").single();
  if (eErr) { await db.from("acct_journal_batches").delete().eq("id", batch.id); throw new Error("ENTRY_FAIL: " + eErr.message); }

  const lineRows = lines.map((l, i) => ({
    tenant_id: tenant, entity_id: entityId, journal_entry_id: entry.id, line_no: i + 1,
    account_id: byCode.get(l.accountCode)!.id, description: l.memo || input.memo,
    debit: round2(l.debit), credit: round2(l.credit), dimensions: {},
  }));
  const { error: lErr } = await db.from("acct_journal_lines").insert(lineRows);
  if (lErr) {
    await db.from("acct_journal_entries").delete().eq("id", entry.id);
    await db.from("acct_journal_batches").delete().eq("id", batch.id);
    throw new Error("LINES_FAIL: " + lErr.message);
  }
  return entry.id as string;
}

/** Account balances from posted journal lines: map account_id -> {debit, credit, balance(debit-normal signed)}. */
export async function ledgerBalances(db: DB, tenant: string, through?: string) {
  let q = db.from("acct_journal_lines").select("account_id, debit, credit, acct_journal_entries!inner(entry_date, status)")
    .eq("tenant_id", tenant).eq("acct_journal_entries.status", "posted");
  if (through) q = q.lte("acct_journal_entries.entry_date", through);
  const { data } = await q.limit(10000);
  const map = new Map<string, { debit: number; credit: number }>();
  for (const r of data || []) {
    const cur = map.get(r.account_id) || { debit: 0, credit: 0 };
    cur.debit += Number(r.debit || 0); cur.credit += Number(r.credit || 0);
    map.set(r.account_id, cur);
  }
  return map;
}

export function signedBalance(acct: any, bal: { debit: number; credit: number } | undefined) {
  if (!bal) return 0;
  return acct?.normal_balance === "credit" ? round2(bal.credit - bal.debit) : round2(bal.debit - bal.credit);
}

export async function nextNumber(db: DB, table: string, column: string, prefix: string, tenant: string) {
  const { data } = await db.from(table).select(column).eq("tenant_id", tenant)
    .order("created_at", { ascending: false }).limit(1).single();
  const last = data ? parseInt(String((data as any)[column]).replace(/\D/g, ""), 10) : 1000;
  return `${prefix}-${(isNaN(last) ? 1000 : last) + 1}`;
}

/** Display name for a crm_customers row (accounting customer of record). */
export function custName(c: any): string {
  if (!c) return "—";
  if (c.company_name) return c.company_name;
  const person = [c.first_name, c.last_name].filter(Boolean).join(" ");
  return person || "—";
}

/**
 * The 2026102901 extension tables (acct_refunds, acct_disputes,
 * acct_estimates, acct_recurring_invoices) carry customer_id values but no
 * database FK to crm_customers, so PostgREST resource embeds of
 * crm_customers(...) fail and silently empty the parent query. Resolve the
 * names with a second query and attach them in the embedded shape the
 * pages already render.
 */
export async function attachCustomerNames(db: any, rows: any[] | null): Promise<any[]> {
  const list = rows || [];
  const ids = [...new Set(list.map((r) => r.customer_id).filter(Boolean))];
  if (!ids.length) return list;
  const { data: customers } = await db
    .from("crm_customers")
    .select("id, first_name, last_name, company_name")
    .in("id", ids);
  const byId = new Map((customers || []).map((c: any) => [c.id, c]));
  for (const r of list) r.crm_customers = byId.get(r.customer_id) || null;
  return list;
}
