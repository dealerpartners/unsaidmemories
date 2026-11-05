import { createServerClient } from "@/lib/supabase";
import { tenantId, money, round2, fmtDate } from "@/lib/accounting";
import { PageHead, Kpis, Card, DataTable, Pill, statusTone } from "@/components/accounting/ui";

export const dynamic = "force-dynamic";

/** Checkouts — storefront orders and their Stripe payment state, tied back to receipts. */
export default async function CheckoutsPage() {
  const db = createServerClient();
  const tenant = await tenantId(db);
  const [{ data: orders }, { data: erpOrders }, { data: receipts }] = await Promise.all([
    db.from("orders").select("*").eq("tenant_id", tenant).order("created_at", { ascending: false }).limit(200),
    db.from("erp_orders").select("*").eq("tenant_id", tenant).order("order_date", { ascending: false }).limit(200),
    db.from("acct_ar_receipts").select("reference, amount").eq("tenant_id", tenant).eq("processor", "stripe"),
  ]);
  const receiptRefs = new Set((receipts || []).map((r: any) => r.reference));
  const rows = [
    ...(orders || []).map((o: any) => ({
      id: o.id, ref: `WEB-${String(o.id).slice(0, 8)}`, date: o.created_at, total: o.total,
      status: o.status, pi: o.stripe_payment_intent_id || "—", channel: "Storefront",
      receipted: receiptRefs.has(o.stripe_payment_intent_id),
    })),
    ...(erpOrders || []).map((o: any) => ({
      id: o.id, ref: o.order_number, date: o.order_date, total: o.total,
      status: o.status, pi: o.source_order_id || "—", channel: "ERP / Admin",
      receipted: Number(o.amount_paid) > 0,
    })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const gross = round2(rows.reduce((s, r) => s + Number(r.total || 0), 0));
  return (
    <div>
      <PageHead title="Checkouts" />
      <Kpis items={[
        { label: "Checkouts", value: String(rows.length) },
        { label: "Gross Checkout Value", value: money(gross) },
        { label: "Paid & Receipted", value: String(rows.filter(r => r.receipted).length) },
        { label: "Awaiting Payment", value: String(rows.filter(r => !r.receipted && r.status !== "cancelled").length) },
      ]} />
      <Card title="Checkout Register">
        <DataTable empty="No checkouts yet." cols={[
          { key: "ref", label: "Order" },
          { key: "date", label: "Date", render: (r) => fmtDate(r.date) },
          { key: "channel", label: "Channel" },
          { key: "pi", label: "Payment Intent / Source", render: (r) => <span style={{ fontSize: 11 }}>{r.pi}</span> },
          { key: "total", label: "Total", align: "right", render: (r) => money(r.total) },
          { key: "status", label: "Status", render: (r) => <Pill tone={statusTone(r.status === "paid" ? "paid" : r.status)}>{r.status}</Pill> },
          { key: "receipted", label: "In Books", render: (r) => <Pill tone={r.receipted ? "green" : "amber"}>{r.receipted ? "Receipted" : "Not receipted"}</Pill> },
        ]} rows={rows} />
      </Card>
    </div>
  );
}
