import { NextRequest, NextResponse } from "next/server";
import { adminList, adminQuery, resolveTenantId } from "@/lib/admin-api";
import { getPg } from "@/lib/pg";
import { requireModuleApi } from "@/lib/admin/gate";
import { postBalancedJournalEntry, clientQuery } from "@/lib/accounting/journal";

const TABLE = "acct_journal_entries";
const SCHEMA = "public";
const SEARCH_COLS = ["memo", "reference", "status"];

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  const tenant = resolveTenantId(req);
  const q = adminQuery(req);

  // ?include=lines attaches each entry's journal lines (with account codes).
  const includeLines = req.nextUrl.searchParams.get("include") === "lines";
  const listRes = await adminList(TABLE, {
    preGated: true,
    tenantId: tenant,
    schema: SCHEMA,
    search: q.search,
    searchCols: SEARCH_COLS,
    limit: q.limit,
    offset: q.offset,
    filters: q.filters,
    ...(q.order ? { order: q.order } : {}),
  });
  if (!includeLines) return listRes;
  // A failed list must surface with its real status — re-serialising the
  // error body at 200 made a broken ledger read as an empty one.
  if (!listRes.ok) return listRes;

  const listJson = await listRes.json();
  const entries: Record<string, unknown>[] = listJson.data || [];
  if (entries.length === 0) return NextResponse.json(listJson);

  const client = await getPg();
  try {
    const { rows: lines } = await client.query(
      `SELECT l.*, a.code AS account_code, a.name AS account_name
       FROM public.acct_journal_lines l
       JOIN public.acct_chart_of_accounts a ON a.id = l.account_id
       WHERE l.journal_entry_id = ANY($1::uuid[])
       ORDER BY l.journal_entry_id, l.line_no`,
      [entries.map((e) => String(e.id))],
    );
    const byEntry = new Map<string, unknown[]>();
    for (const ln of lines) {
      const key = String(ln.journal_entry_id);
      if (!byEntry.has(key)) byEntry.set(key, []);
      byEntry.get(key)!.push({
        id: ln.id,
        line_no: ln.line_no,
        account_id: ln.account_id,
        account_code: ln.account_code,
        account_name: ln.account_name,
        description: ln.description,
        debit: Number(ln.debit || 0),
        credit: Number(ln.credit || 0),
      });
    }
    for (const e of entries) e.lines = byEntry.get(String(e.id)) || [];
  } finally {
    client.release();
  }
  return NextResponse.json(listJson);
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "write");
  if (gate) return gate;
  const tenant = resolveTenantId(req);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (lines.length === 0) {
    return NextResponse.json(
      { error: "Journal entry requires at least one line (lines[])" },
      { status: 400 },
    );
  }
  for (const [i, l] of lines.entries()) {
    if (!l.accountCode && !l.account_code) {
      return NextResponse.json(
        { error: `Line ${i + 1}: accountCode is required` },
        { status: 400 },
      );
    }
    const d = Number(l.debit || 0);
    const c = Number(l.credit || 0);
    if (!(d > 0 || c > 0)) {
      return NextResponse.json(
        { error: `Line ${i + 1}: debit or credit must be greater than 0` },
        { status: 400 },
      );
    }
    if (d > 0 && c > 0) {
      return NextResponse.json(
        { error: `Line ${i + 1}: a line cannot have both debit and credit` },
        { status: 400 },
      );
    }
  }
  const totalDebit = Math.round(lines.reduce((s: number, l: { debit?: number }) => s + Number(l.debit || 0), 0) * 100) / 100;
  const totalCredit = Math.round(lines.reduce((s: number, l: { credit?: number }) => s + Number(l.credit || 0), 0) * 100) / 100;
  if (totalDebit !== totalCredit) {
    return NextResponse.json(
      { error: `Unbalanced journal entry: debits (${totalDebit}) != credits (${totalCredit})` },
      { status: 400 },
    );
  }

  const client = await getPg();
  try {
    const entryId = await postBalancedJournalEntry(clientQuery(client), tenant, {
      source: "manual",
      reference: body.reference || null,
      memo: String(body.memo || body.narrative || "Manual journal entry"),
      entryDate: body.entry_date || body.entryDate,
      lines: lines.map((l: Record<string, unknown>) => ({
        accountCode: String(l.accountCode || l.account_code),
        debit: Number(l.debit || 0),
        credit: Number(l.credit || 0),
        memo: String(l.memo || l.description || ""),
      })),
    });
    return NextResponse.json({ data: { id: entryId } }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.startsWith("JOURNAL_") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  } finally {
    client.release();
  }
}
