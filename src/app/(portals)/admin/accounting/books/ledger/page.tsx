import { createServerClient } from "@/lib/supabase";
import { tenantId, accountMap, money, fmtDate, round2 } from "@/lib/accounting";
import { PageHead, Card, DataTable } from "@/components/accounting/ui";

export const dynamic = "force-dynamic";

/** General Ledger — pick an account, see every line with a running balance. */
export default async function GeneralLedgerPage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const { account } = await searchParams;
  const db = createServerClient();
  const tenant = await tenantId(db);
  const { rows: accounts, byId } = await accountMap(db, tenant);
  const selected = account || accounts.find((a: any) => String(a.code) === "1000")?.id || accounts[0]?.id;
  const acct = byId.get(selected);
  const { data: lines } = selected
    ? await db.from("acct_journal_lines")
        .select("*, acct_journal_entries!inner(entry_date, entry_no, memo)")
        .eq("tenant_id", tenant).eq("account_id", selected)
        .order("created_at", { ascending: true }).limit(1000)
    : { data: [] as any[] };
  let running = 0;
  const rows = (lines || []).map((l: any) => {
    const delta = acct?.normal_balance === "credit" ? Number(l.credit) - Number(l.debit) : Number(l.debit) - Number(l.credit);
    running = round2(running + delta);
    return { ...l, date: l.acct_journal_entries?.entry_date, entry_no: l.acct_journal_entries?.entry_no, memo: l.acct_journal_entries?.memo, running };
  });
  return (
    <div>
      <PageHead title="General Ledger" />
      <div className="acct-filterbar">
        {accounts.filter((a: any) => a.is_active).map((a: any) => (
          <a key={a.id} href={`/admin/accounting/books/ledger?account=${a.id}`} className={selected === a.id ? "active" : ""}>{a.code} {a.name}</a>
        ))}
      </div>
      <Card title="Ledger Lines">
        <DataTable empty="No lines in this account yet." cols={[
          { key: "date", label: "Date", render: (r) => fmtDate(r.date) },
          { key: "entry_no", label: "Entry" },
          { key: "memo", label: "Memo", render: (r) => r.description || r.memo || "—" },
          { key: "debit", label: "Debit", align: "right", render: (r) => (Number(r.debit) ? money(r.debit) : "—") },
          { key: "credit", label: "Credit", align: "right", render: (r) => (Number(r.credit) ? money(r.credit) : "—") },
          { key: "running", label: "Balance", align: "right", render: (r) => money(r.running) },
        ]} rows={rows} />
      </Card>
    </div>
  );
}
