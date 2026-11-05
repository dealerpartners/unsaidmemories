import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { getPgWithRetry } from "@/lib/pg";

// Pool-backed runner (fn(client) → result). Failures THROW: a failed
// read or write must surface as an error response, never as null —
// callers turned null into fabricated empty lists, false 404s and
// false 201s. A callback that legitimately finds nothing returns its
// own null/empty as a RESOLVED value. withPg's session-pooler Client
// cannot establish SSL from this runtime (the EMAXCONNSESSION/SSL
// failure class lib/pg was built to fix); the transaction pooler in
// lib/pg works everywhere and a checked-out PoolClient has the same
// .query() surface as a Client, so no call site below changes.
async function withPg<T>(fn: (client: any) => Promise<T>): Promise<T> {
  const client = await getPgWithRetry();
  try { return await fn(client); }
  finally { client.release(); }
}

export const dynamic = "force-dynamic";

// ============================================================================
// /api/admin/banking/transactions — bank transaction feed (manual entry).
// Reconciliation matches these against acct_journal_entries via match_status.
// ============================================================================

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  const tenant = resolveTenantId(req);
  const sp = req.nextUrl.searchParams;
  const accountId = sp.get("account_id");
  const status = sp.get("match_status"); // unreconciled | reconciled | all
  const search = (sp.get("search") || "").trim();

  const conds = ["t.tenant_id = $1"];
  const params: any[] = [tenant];
  if (accountId) { params.push(accountId); conds.push(`t.bank_account_id = $${params.length}`); }
  if (status === "reconciled") conds.push(`t.match_status = 'reconciled'`);
  else if (status === "unreconciled") conds.push(`COALESCE(t.match_status,'unmatched') <> 'reconciled'`);
  if (search) { params.push(`%${search.replace(/[%_]/g, "")}%`); conds.push(`(t.description ILIKE $${params.length} OR t.payee ILIKE $${params.length} OR t.reference ILIKE $${params.length})`); }

  const rows = await withPg(async (c) => {
    const { rows } = await c.query(
      `SELECT t.id, t.bank_account_id, a.name AS account_name,
              t.transaction_date, t.posted_date, t.amount, t.currency,
              t.description, t.payee, t.reference,
              COALESCE(t.match_status,'unmatched') AS match_status,
              t.matched_journal_line_id, t.created_at
         FROM public.acct_bank_transactions t
         JOIN public.acct_bank_accounts a ON a.id = t.bank_account_id AND a.tenant_id = t.tenant_id
        WHERE ${conds.join(" AND ")}
        ORDER BY t.transaction_date DESC NULLS LAST, t.created_at DESC
        LIMIT 300`,
      params
    );
    return rows;
  });
  return NextResponse.json({ transactions: rows ?? [] });
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "write");
  if (gate) return gate;
  const tenant = resolveTenantId(req);
  const body = await req.json().catch(() => ({}));
  if (!body.bank_account_id) return NextResponse.json({ error: "bank_account_id required" }, { status: 400 });
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount === 0) return NextResponse.json({ error: "non-zero amount required" }, { status: 400 });
  let row: any;
  try {
    row = await withPg(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO public.acct_bank_transactions
         (tenant_id, bank_account_id, transaction_date, posted_date, amount, currency, description, payee, reference, match_status)
       VALUES ($1,$2,COALESCE($3::date, CURRENT_DATE),COALESCE($4::date, CURRENT_DATE),$5,$6,$7,$8,$9,'unmatched')
       RETURNING id, transaction_date, amount, description, match_status`,
      [tenant, body.bank_account_id, body.transaction_date || null, body.posted_date || null,
       amount, body.currency || "USD", body.description || null, body.payee || null, body.reference || null]
    );
    if (!rows[0]) throw new Error("Bank transaction insert did not land");
    return rows[0];
  });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Bank transaction insert failed" }, { status: 500 });
  }
  if (!row) return NextResponse.json({ error: "Bank transaction insert did not land" }, { status: 500 });
  return NextResponse.json({ transaction: row }, { status: 201 });
}
