import { createServerClient } from "@/lib/supabase";
import { tenantId, money, fmtDate, round2, custName } from "@/lib/accounting";
import { PageHead, Kpis, Card, DataTable, Pill, statusTone } from "@/components/accounting/ui";
import { ApiButton } from "@/components/accounting/actions";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function InvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createServerClient();
  const tenant = await tenantId(db);
  const { data: inv } = await db.from("acct_ar_invoices").select("*, crm_customers(first_name, last_name, company_name, email)")
    .eq("id", id).eq("tenant_id", tenant).single();
  if (!inv) notFound();
  const { data: lines } = await db.from("acct_ar_invoice_lines").select("*").eq("invoice_id", id).order("line_no");
  const { data: receipts } = await db.from("acct_ar_receipts").select("*")
    .eq("tenant_id", tenant).eq("reference", inv.invoice_number).order("receipt_date");
  const balance = round2(Number(inv.total) - Number(inv.amount_paid) - Number(inv.amount_credited));
  const url = `/api/admin/accounting/invoices/${id}`;
  return (
    <div>
      <PageHead title={`Invoice ${inv.invoice_number}`} >
        <span className="acct-row-actions">
          {inv.status === "draft" ? <ApiButton url={url} body={{ action: "send" }} className="adm-btn">Send Invoice</ApiButton> : null}
          {["sent", "partially_paid"].includes(inv.status) ? <ApiButton url={url} body={{ action: "mark_paid" }} className="adm-btn">Mark as Paid</ApiButton> : null}
          {["sent", "partially_paid"].includes(inv.status) ? <ApiButton url={url} body={{ action: "remind" }}>Send Reminder</ApiButton> : null}
          <ApiButton url={url} body={{ action: "duplicate" }}>Duplicate</ApiButton>
          {inv.status !== "voided" && inv.status !== "paid" ? <ApiButton url={url} body={{ action: "void" }} promptField="reason" promptLabel="Void reason" confirm="Void this invoice?">Void</ApiButton> : null}
        </span>
      </PageHead>
      <Kpis items={[
        { label: "Total", value: money(inv.total), foot: `Subtotal ${money(inv.subtotal)} · Tax ${money(inv.tax_total)}` },
        { label: "Paid", value: money(inv.amount_paid) },
        { label: "Balance Due", value: money(balance) },
        { label: "Status", value: inv.status, foot: `Sent ${inv.sent_at ? fmtDate(inv.sent_at) : "—"} · ${inv.reminder_count || 0} reminders` },
      ]} />
      <Card title="Line Items">
        <DataTable empty="No lines." cols={[
          { key: "description", label: "Description" },
          { key: "quantity", label: "Qty", align: "right" },
          { key: "unit_price", label: "Unit Price", align: "right", render: (r) => money(r.unit_price) },
          { key: "tax_amount", label: "Tax", align: "right", render: (r) => money(r.tax_amount) },
          { key: "line_subtotal", label: "Amount", align: "right", render: (r) => money(r.line_subtotal) },
        ]} rows={lines || []} />
      </Card>
      <Card title="Payments Against This Invoice">
        <DataTable empty="No payments recorded yet." cols={[
          { key: "receipt_number", label: "Receipt" },
          { key: "receipt_date", label: "Date", render: (r) => fmtDate(r.receipt_date) },
          { key: "payment_method", label: "Method" },
          { key: "amount", label: "Amount", align: "right", render: (r) => money(r.amount) },
          { key: "status", label: "Status", render: (r) => <Pill tone={statusTone(r.status)}>{r.status}</Pill> },
        ]} rows={receipts || []} />
      </Card>
      {inv.notes ? <Card title="Notes"><p>{inv.notes}</p></Card> : null}
      {inv.status === "voided" ? <Card title="Void Record"><p>Voided {fmtDate(inv.voided_at)} — {inv.void_reason || "no reason recorded"}. A reversing journal entry was posted.</p></Card> : null}
    </div>
  );
}
