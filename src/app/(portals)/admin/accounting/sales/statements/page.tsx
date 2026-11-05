import { createServerClient } from "@/lib/supabase";
import { tenantId, money, round2, fmtDate, custName } from "@/lib/accounting";
import { PageHead, Card, DataTable, Pill, statusTone } from "@/components/accounting/ui";

export const dynamic = "force-dynamic";

/** Customer Statement — chronological invoices + receipts with a running AR balance. */
export default async function StatementsPage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const { customer } = await searchParams;
  const db = createServerClient();
  const tenant = await tenantId(db);
  const { data: customers } = await db.from("crm_customers").select("id, first_name, last_name, company_name").eq("tenant_id", tenant).order("created_at");
  const named = (customers || []).map((c: any) => ({ ...c, display: custName(c) }));
  const selected = customer || named[0]?.id;
  const cust = named.find((c: any) => c.id === selected);
  const [{ data: invoices }, { data: receipts }] = selected
    ? await Promise.all([
        db.from("acct_ar_invoices").select("*").eq("tenant_id", tenant).eq("customer_id", selected).neq("status", "voided").order("invoice_date"),
        db.from("acct_ar_receipts").select("*").eq("tenant_id", tenant).eq("customer_id", selected).order("receipt_date"),
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }];
  let running = 0;
  const events = [
    ...(invoices || []).map((i: any) => ({ date: i.invoice_date, kind: "Invoice", ref: i.invoice_number, charge: Number(i.total), payment: 0, status: i.status })),
    ...(receipts || []).map((r: any) => ({ date: r.receipt_date, kind: "Payment", ref: r.receipt_number, charge: 0, payment: Number(r.amount), status: r.status })),
  ].sort((a, b) => String(a.date).localeCompare(String(b.date))).map((e) => {
    running = round2(running + e.charge - e.payment);
    return { ...e, id: `${e.kind}-${e.ref}`, running };
  });
  return (
    <div>
      <PageHead title="Customer Statements" />
      <div className="acct-filterbar">
        {named.map((c: any) => (
          <a key={c.id} href={`/admin/accounting/sales/statements?customer=${c.id}`} className={selected === c.id ? "active" : ""}>{c.display}</a>
        ))}
      </div>
      <Card title={`Statement — ${cust?.display || ""}`}>
        <DataTable empty="No activity for this customer." cols={[
          { key: "date", label: "Date", render: (r) => fmtDate(r.date) },
          { key: "kind", label: "Type" },
          { key: "ref", label: "Ref" },
          { key: "charge", label: "Charges", align: "right", render: (r) => (r.charge ? money(r.charge) : "—") },
          { key: "payment", label: "Payments", align: "right", render: (r) => (r.payment ? money(r.payment) : "—") },
          { key: "running", label: "Balance", align: "right", render: (r) => money(r.running) },
          { key: "status", label: "Status", render: (r) => <Pill tone={statusTone(r.status)}>{r.status}</Pill> },
        ]} rows={events} />
        <p style={{ marginTop: 10, fontSize: 13 }}><strong>Balance due: {money(running)}</strong> — UnSaid Memories · generated {fmtDate(new Date().toISOString().slice(0, 10))}</p>
      </Card>
    </div>
  );
}
