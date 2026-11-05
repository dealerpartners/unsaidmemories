import { createServerClient } from "@/lib/supabase";
import { tenantId, money, fmtDate, custName } from "@/lib/accounting";
import { PageHead, Card } from "@/components/accounting/ui";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

/** Printable receipt view (Print Receipts action target). */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createServerClient();
  const tenant = await tenantId(db);
  const { data: r } = await db.from("acct_ar_receipts").select("*, crm_customers(first_name, last_name, company_name, email)")
    .eq("id", id).eq("tenant_id", tenant).single();
  if (!r) notFound();
  return (
    <div>
      <PageHead title={`Receipt ${r.receipt_number}`} />
      <Card title="UnSaid Memories — Payment Receipt">
        <table className="adm-table acct-table">
          <tbody>
            <tr><td>Received from</td><td>{custName(r.crm_customers)}</td></tr>
            <tr><td>Date</td><td>{fmtDate(r.receipt_date)}</td></tr>
            <tr><td>Amount</td><td><strong>{money(r.amount)}</strong></td></tr>
            <tr><td>Method</td><td>{r.payment_method}{r.processor ? ` · ${r.processor}` : ""}</td></tr>
            <tr><td>Reference</td><td>{r.reference || "—"}</td></tr>
            <tr><td>Status</td><td>{r.status}</td></tr>
            <tr><td>Journal entry</td><td>{r.posted_journal_id ? "Posted to the general ledger" : "—"}</td></tr>
          </tbody>
        </table>
      </Card>
    </div>
  );
}
