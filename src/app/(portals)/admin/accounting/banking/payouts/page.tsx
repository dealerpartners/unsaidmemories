import { createServerClient } from "@/lib/supabase";
import { tenantId, money, round2, fmtDate } from "@/lib/accounting";
import { PageHead, Kpis, Card, DataTable, Pill, statusTone } from "@/components/accounting/ui";

export const dynamic = "force-dynamic";

export default async function PayoutsPage() {
  const db = createServerClient();
  const tenant = await tenantId(db);
  const [{ data: apPayments }, { data: receipts }, { data: txns }] = await Promise.all([
    db.from("acct_ap_payments").select("*, acct_vendors(legal_name)").eq("tenant_id", tenant).order("payment_date", { ascending: false }).limit(200),
    db.from("acct_ar_receipts").select("*").eq("tenant_id", tenant).eq("processor", "stripe").order("receipt_date", { ascending: false }).limit(200),
    db.from("acct_bank_transactions").select("*").eq("tenant_id", tenant).limit(1000),
  ]);
  const pays = apPayments || [];
  const stripeIn = round2((receipts || []).reduce((s, r) => s + Number(r.amount), 0));
  const matched = (txns || []).filter(t => t.match_status !== "unmatched").length;
  const reconRate = (txns || []).length ? Math.round((matched / (txns || []).length) * 100) : 0;
  return (
    <div>
      <PageHead title="Payouts & Reconciliation" />
      <Kpis items={[
        { label: "Vendor Payouts", value: money(round2(pays.reduce((s, p) => s + Number(p.amount), 0))), foot: `${pays.length} payments` },
        { label: "Stripe Receipts", value: money(stripeIn), foot: `${(receipts || []).length} ecommerce payments` },
        { label: "Reconciliation Coverage", value: `${reconRate}%`, foot: `${matched} of ${(txns || []).length} bank transactions matched` },
        { label: "Unmatched", value: String((txns || []).filter(t => t.match_status === "unmatched").length), foot: "See Banking to match" },
      ]} />
      <Card title="Vendor Payout Register">
        <DataTable empty="No vendor payments yet." cols={[
          { key: "payment_number", label: "Payment" },
          { key: "vendor", label: "Vendor", render: (r) => r.acct_vendors?.legal_name || "—" },
          { key: "payment_date", label: "Date", render: (r) => fmtDate(r.payment_date) },
          { key: "payment_method", label: "Method" },
          { key: "reference", label: "Reference", render: (r) => r.reference || "—" },
          { key: "amount", label: "Amount", align: "right", render: (r) => money(r.amount) },
          { key: "status", label: "Status", render: (r) => <Pill tone={statusTone(r.status)}>{r.status}</Pill> },
        ]} rows={pays} />
      </Card>
      <Card title="Scheduled & Recent Stripe Payouts (Receipts Cleared)">
        <DataTable empty="No Stripe receipts yet." cols={[
          { key: "receipt_number", label: "Receipt" },
          { key: "receipt_date", label: "Date", render: (r) => fmtDate(r.receipt_date) },
          { key: "reference", label: "Reference", render: (r) => r.reference || "—" },
          { key: "amount", label: "Amount", align: "right", render: (r) => money(r.amount) },
        ]} rows={(receipts || []).slice(0, 12)} />
      </Card>
    </div>
  );
}
