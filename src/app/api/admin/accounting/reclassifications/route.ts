import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { getPg, pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /api/admin/accounting/reclassifications
//
// A reclassification is a balanced journal entry that moves an amount
// from one GL account to another, recorded with
// source = 'reclassification' on acct_journal_entries (the live source
// column is text; checkpoint-2 verdict, 2026-11-01). Every
// reclassification must carry its audit justification in the memo —
// the register refuses to post one without it.
//
// GET: the register — every reclassification entry with its lines
// resolved to account codes/names (the credited line is the account
// the amount moves FROM, the debited line is where it lands).
// POST { fromAccountCode, toAccountCode, amount, entryDate?, memo }:
// posts batch + entry + the two lines in one transaction.

type LineRow = {
  entry_id: string;
  account_code: string;
  account_name: string;
  account_subtype: string | null;
  description: string | null;
  debit: string;
  credit: string;
};

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const entries = await pgQuery<{
      id: string; entry_no: number; entry_date: string; memo: string | null;
      reference: string | null; status: string; total_debit: string; total_credit: string;
    }>(
      `SELECT id::text AS id, entry_no, entry_date::text AS entry_date, memo, reference,
              status, total_debit::text AS total_debit, total_credit::text AS total_credit
         FROM public.acct_journal_entries
        WHERE tenant_id = $1 AND source = 'reclassification'
        ORDER BY entry_date DESC, entry_no DESC
        LIMIT 200`,
      [tenant],
    );
    if (entries.length === 0) return NextResponse.json({ reclassifications: [], total: 0 });
    const lines = await pgQuery<LineRow>(
      `SELECT l.journal_entry_id::text AS entry_id, a.code AS account_code,
              a.name AS account_name, a.subtype AS account_subtype,
              l.description, l.debit::text AS debit, l.credit::text AS credit
         FROM public.acct_journal_lines l
         JOIN public.acct_chart_of_accounts a ON a.id = l.account_id
        WHERE l.journal_entry_id = ANY($1::uuid[])
        ORDER BY l.journal_entry_id, l.line_no`,
      [entries.map((e) => e.id)],
    );
    const byEntry = new Map<string, LineRow[]>();
    for (const l of lines) {
      const arr = byEntry.get(l.entry_id) || [];
      arr.push(l);
      byEntry.set(l.entry_id, arr);
    }
    return NextResponse.json({
      reclassifications: entries.map((e) => {
        const ls = byEntry.get(e.id) || [];
        const from = ls.find((l) => Number(l.credit) > 0) || null;
        const to = ls.find((l) => Number(l.debit) > 0) || null;
        return {
          id: e.id,
          entryNo: e.entry_no,
          date: e.entry_date,
          memo: e.memo,
          reference: e.reference,
          status: e.status,
          amount: Number(e.total_debit || 0),
          fromAccount: from ? { code: from.account_code, name: from.account_name, subtype: from.account_subtype } : null,
          toAccount: to ? { code: to.account_code, name: to.account_name, subtype: to.account_subtype } : null,
          lines: ls.map((l) => ({
            accountCode: l.account_code,
            accountName: l.account_name,
            description: l.description,
            debit: Number(l.debit || 0),
            credit: Number(l.credit || 0),
          })),
        };
      }),
      total: entries.length,
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/reclassifications]", e);
    return NextResponse.json({ error: e?.message || "Failed to load reclassifications" }, { status: 500 });
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "write");
  if (gate) return gate;
  const tenant = resolveTenantId(req);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const fromCode = String(body.fromAccountCode || body.from_account_code || "").trim();
  const toCode = String(body.toAccountCode || body.to_account_code || "").trim();
  const amount = round2(Number(body.amount || 0));
  const memo = String(body.memo || "").trim();
  const entryDate = String(body.entryDate || body.entry_date || new Date().toISOString().slice(0, 10));
  if (!fromCode || !toCode) {
    return NextResponse.json({ error: "Pick the account the amount moves from and the account it moves to." }, { status: 400 });
  }
  if (fromCode === toCode) {
    return NextResponse.json({ error: "The from and to accounts must be different." }, { status: 400 });
  }
  if (!(amount > 0)) {
    return NextResponse.json({ error: "Amount must be greater than 0." }, { status: 400 });
  }
  if (!memo) {
    return NextResponse.json(
      { error: "An audit justification note is required — every reclassification must say why the money moved." },
      { status: 400 },
    );
  }

  const client = await getPg();
  try {
    await client.query("BEGIN");
    const q = async (text: string, params?: unknown[]) => client.query(text, params as any);

    const { rows: accounts } = await q(
      `SELECT id, code FROM public.acct_chart_of_accounts WHERE tenant_id = $1 AND code = ANY($2::text[]) AND is_active IS NOT FALSE`,
      [tenant, [fromCode, toCode]],
    );
    const byCode = new Map(accounts.map((r: any) => [String(r.code), String(r.id)]));
    if (!byCode.get(fromCode)) throw new Error(`No active GL account with code ${fromCode}`);
    if (!byCode.get(toCode)) throw new Error(`No active GL account with code ${toCode}`);

    const { rows: entities } = await q(`SELECT id FROM public.acct_entities WHERE tenant_id = $1 LIMIT 1`, [tenant]);
    const entityId = entities[0]?.id as string | undefined;
    if (!entityId) throw new Error("No accounting entity exists for this tenant yet");

    let bookId = (await q(`SELECT id FROM public.acct_books WHERE tenant_id = $1 LIMIT 1`, [tenant])).rows[0]?.id as string | undefined;
    if (!bookId) {
      const { rows: nb } = await q(
        `INSERT INTO public.acct_books (tenant_id, entity_id, code, name, book_type, accounting_basis, currency, is_primary, active)
         VALUES ($1, $2, 'MAIN', 'Main Book', 'general', 'accrual', 'USD', true, true) RETURNING id`,
        [tenant, entityId],
      );
      bookId = nb[0]?.id as string;
    }

    let periodId = (await q(
      `SELECT id FROM public.acct_periods WHERE tenant_id = $1 AND $2::date BETWEEN start_date AND end_date LIMIT 1`,
      [tenant, entryDate],
    )).rows[0]?.id as string | undefined;
    if (!periodId) {
      let fyId = (await q(
        `SELECT id FROM public.acct_fiscal_years WHERE tenant_id = $1 AND $2::date BETWEEN start_date AND end_date LIMIT 1`,
        [tenant, entryDate],
      )).rows[0]?.id as string | undefined;
      if (!fyId) {
        const { rows: nfy } = await q(
          `INSERT INTO public.acct_fiscal_years (tenant_id, entity_id, fiscal_year, start_date, end_date, is_adjustment_year)
           VALUES ($1, $2, EXTRACT(YEAR FROM $3::date)::int, date_trunc('year', $3::date)::date,
                   (date_trunc('year', $3::date) + interval '1 year' - interval '1 day')::date, false)
           RETURNING id`,
          [tenant, entityId, entryDate],
        );
        fyId = nfy[0]?.id as string;
      }
      const { rows: np } = await q(
        `INSERT INTO public.acct_periods (tenant_id, book_id, fiscal_year_id, period_no, name, start_date, end_date, status)
         VALUES ($1, $2, $3, EXTRACT(MONTH FROM $4::date)::int, to_char($4::date, 'YYYY-MM'),
                 date_trunc('month', $4::date)::date,
                 (date_trunc('month', $4::date) + interval '1 month' - interval '1 day')::date, 'open')
         RETURNING id`,
        [tenant, bookId, fyId, entryDate],
      );
      periodId = np[0]?.id as string;
    }

    const { rows: batchRows } = await q(
      `INSERT INTO public.acct_journal_batches (tenant_id, entity_id, book_id, batch_no, source, status, description, source_system)
       VALUES ($1, $2, $3, $4, 'reclassification', 'posted', $5, 'accounting') RETURNING id`,
      [tenant, entityId, bookId, `JB-${Date.now()}`, memo.slice(0, 200)],
    );
    const batchId = batchRows[0]?.id as string;

    const { rows: entryRows } = await q(
      `INSERT INTO public.acct_journal_entries
         (tenant_id, entity_id, book_id, batch_id, period_id, entry_date, posting_date,
          source, source_id, reference, memo, currency, total_debit, total_credit, status, posted_at)
       VALUES ($1, $2, $3, $4, $5, $6::date, $6::date, 'reclassification', NULL, 'RECLASS', $7, 'USD', $8, $8, 'posted', now())
       RETURNING id`,
      [tenant, entityId, bookId, batchId, periodId, entryDate, memo, amount],
    );
    const entryId = entryRows[0]?.id as string;

    await q(
      `INSERT INTO public.acct_journal_lines (tenant_id, entity_id, journal_entry_id, line_no, account_id, description, debit, credit)
       VALUES ($1, $2, $3, 1, $4, $5, $6, 0), ($1, $2, $3, 2, $7, $5, 0, $6)`,
      [tenant, entityId, entryId, byCode.get(toCode), memo, amount, byCode.get(fromCode)],
    );

    await client.query("COMMIT");
    return NextResponse.json({ data: { id: entryId } }, { status: 201 });
  } catch (e: any) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("[POST /api/admin/accounting/reclassifications]", e);
    return NextResponse.json({ error: e?.message || "Failed to post reclassification" }, { status: 500 });
  } finally {
    client.release();
  }
}
