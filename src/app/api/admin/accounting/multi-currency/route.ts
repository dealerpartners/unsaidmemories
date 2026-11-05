import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /api/admin/accounting/multi-currency
//
// Multi-currency data:
//  - currency register: acct_currencies
//  - FX rate table: acct_exchange_rates
//  - foreign-currency exposure: posted acct_journal_lines grouped by
//    transaction_currency (the foreign denomination each line was
//    booked in, with its functional-currency value alongside)
//  - revaluation runs: acct_fx_revaluation_runs
// POST actions: add_currency, add_rate (a manual spot override is
// just a rate row with source 'manual'), start_revaluation (opens a
// draft run for a period; its journal posts when the run executes).

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const [currencies, rates, runs, exposure] = await Promise.all([
      pgQuery(
        `SELECT code, name, symbol, minor_units, is_active
           FROM public.acct_currencies
          WHERE tenant_id = $1 OR tenant_id IS NULL
          ORDER BY code`,
        [tenant],
      ),
      pgQuery(
        `SELECT id::text AS id, rate_date::text AS rate_date, from_currency, to_currency,
                rate::text AS rate, rate_type, source
           FROM public.acct_exchange_rates
          WHERE tenant_id = $1
          ORDER BY rate_date DESC, from_currency, to_currency
          LIMIT 200`,
        [tenant],
      ),
      pgQuery(
        `SELECT r.id::text AS id, p.name AS period_name, r.revaluation_date::text AS revaluation_date,
                r.status, r.journal_id::text AS journal_id, r.created_at::text AS created_at
           FROM public.acct_fx_revaluation_runs r
           LEFT JOIN public.acct_periods p ON p.id = r.period_id
          WHERE r.tenant_id = $1
          ORDER BY r.created_at DESC
          LIMIT 50`,
        [tenant],
      ),
      pgQuery(
        `SELECT l.transaction_currency AS currency,
                COALESCE(SUM(l.transaction_debit), 0)::text AS foreign_debits,
                COALESCE(SUM(l.transaction_credit), 0)::text AS foreign_credits,
                COALESCE(SUM(l.debit), 0)::text AS book_debits,
                COALESCE(SUM(l.credit), 0)::text AS book_credits,
                COUNT(*)::int AS lines
           FROM public.acct_journal_lines l
           JOIN public.acct_journal_entries e ON e.id = l.journal_entry_id
          WHERE l.tenant_id = $1 AND e.status = 'posted'
            AND l.transaction_currency IS NOT NULL AND l.transaction_currency <> 'USD'
          GROUP BY l.transaction_currency
          ORDER BY l.transaction_currency`,
        [tenant],
      ),
    ]);
    return NextResponse.json({
      currencies,
      rates: (rates as any[]).map((r) => ({ ...r, rate: Number(r.rate || 0) })),
      runs,
      exposure: (exposure as any[]).map((x) => ({
        currency: x.currency,
        foreignDebits: Number(x.foreign_debits || 0),
        foreignCredits: Number(x.foreign_credits || 0),
        bookDebits: Number(x.book_debits || 0),
        bookCredits: Number(x.book_credits || 0),
        lines: x.lines,
      })),
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/multi-currency]", e);
    return NextResponse.json({ error: e?.message || "Failed to load multi-currency data" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "write");
  if (gate) return gate;
  const tenant = resolveTenantId(req);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const action = String(body.action || "");
  try {
    if (action === "add_currency") {
      const code = String(body.code || "").trim().toUpperCase();
      const name = String(body.name || "").trim();
      if (code.length !== 3 || !name) {
        return NextResponse.json({ error: "A 3-letter currency code and a name are required." }, { status: 400 });
      }
      const rows = await pgQuery<{ code: string }>(
        `INSERT INTO public.acct_currencies (code, name, symbol, minor_units, is_active, tenant_id)
         VALUES ($1, $2, $3, $4, true, $5)
         ON CONFLICT (code) DO NOTHING
         RETURNING code`,
        [code, name, body.symbol ? String(body.symbol) : null, Number.isFinite(Number(body.minorUnits)) ? Number(body.minorUnits) : 2, tenant],
      );
      if (!rows[0]) {
        return NextResponse.json({ error: `${code} is already on the currency register.` }, { status: 409 });
      }
      return NextResponse.json({ data: { code } }, { status: 201 });
    }

    if (action === "add_rate") {
      const from = String(body.fromCurrency || "").trim().toUpperCase();
      const to = String(body.toCurrency || "USD").trim().toUpperCase();
      const rate = Number(body.rate || 0);
      const rateDate = String(body.rateDate || new Date().toISOString().slice(0, 10));
      if (from.length !== 3 || to.length !== 3 || !(rate > 0)) {
        return NextResponse.json({ error: "A currency pair and a rate greater than 0 are required." }, { status: 400 });
      }
      const rows = await pgQuery<{ id: string }>(
        `INSERT INTO public.acct_exchange_rates (tenant_id, rate_date, from_currency, to_currency, rate, rate_type, source)
         VALUES ($1, $2::date, $3, $4, $5, $6, $7)
         RETURNING id::text AS id`,
        [tenant, rateDate, from, to, rate, String(body.rateType || "spot"), String(body.source || "manual")],
      );
      return NextResponse.json({ data: { id: rows[0]?.id } }, { status: 201 });
    }

    if (action === "start_revaluation") {
      const book = await pgQuery<{ id: string }>(
        `SELECT id::text AS id FROM public.acct_books WHERE tenant_id = $1 LIMIT 1`,
        [tenant],
      );
      if (!book[0]) {
        return NextResponse.json({ error: "No book exists for this tenant yet — a revaluation run needs a book to revalue." }, { status: 422 });
      }
      let periodId = body.periodId ? String(body.periodId) : "";
      if (!periodId) {
        const current = await pgQuery<{ id: string }>(
          `SELECT id::text AS id FROM public.acct_periods
            WHERE tenant_id = $1 AND CURRENT_DATE BETWEEN start_date AND end_date LIMIT 1`,
          [tenant],
        );
        periodId = current[0]?.id || "";
      }
      if (!periodId) {
        return NextResponse.json({ error: "No open period covers today — open a period before starting a revaluation run." }, { status: 422 });
      }
      const rows = await pgQuery<{ id: string }>(
        `INSERT INTO public.acct_fx_revaluation_runs (tenant_id, book_id, period_id, revaluation_date, status)
         VALUES ($1, $2, $3, CURRENT_DATE, 'draft')
         RETURNING id::text AS id`,
        [tenant, book[0].id, periodId],
      );
      return NextResponse.json({ data: { id: rows[0]?.id } }, { status: 201 });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (e: any) {
    console.error("[POST /api/admin/accounting/multi-currency]", e);
    return NextResponse.json({ error: e?.message || "Multi-currency action failed" }, { status: 500 });
  }
}
