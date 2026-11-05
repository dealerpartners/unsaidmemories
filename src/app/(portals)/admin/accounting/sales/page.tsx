import { createServerClient } from "@/lib/supabase";
import { tenantId, money, round2, custName } from "@/lib/accounting";
import { PageHead, Card, DataTable, Pill } from "@/components/accounting/ui";
import { MiniForm, ApiButton } from "@/components/accounting/actions";
import Link from "next/link";

export const dynamic = "force-dynamic";

/** Customer Accounts (Sales) — crm_customers (the FK target of every AR table) with live AR balances. */
export default async function CustomerAccountsPage() {
  const db = createServerClient();
  const tenant = await tenantId(db);
  const { data: customers } = await db.from("crm_customers").select("*").eq("tenant_id", tenant).order("created_at");
  const { data: invoices } = await db.from("acct_ar_invoices").select("customer_id, total, amount_paid, amount_credited, status")
    .eq("tenant_id", tenant).neq("status", "voided");
  const bal = new Map<string, number>();
  for (const i of invoices || []) {
    if (!i.customer_id) continue;
    bal.set(i.customer_id, round2((bal.get(i.customer_id) || 0) + Number(i.total) - Number(i.amount_paid) - Number(i.amount_credited)));
  }
  const rows = (customers || []).map((c: any) => ({ ...c, display_name: custName(c), balance: bal.get(c.id) || 0 }));
  const url = "/api/admin/accounting/customers";
  return (
    <div>
      <PageHead title="Customer Accounts" />
      <Card title="New Customer Account">
        <MiniForm url={url} submitLabel="Create Customer" fields={[
          { name: "legal_name", label: "Customer / company name", required: true },
          { name: "email", label: "Email", type: "email" },
          { name: "phone", label: "Phone" },
        ]} />
      </Card>
      <Card title="Customer Register">
        <DataTable empty="No customers on the books yet." cols={[
          { key: "display_name", label: "Customer" },
          { key: "email", label: "Email", render: (r) => r.email || "—" },
          { key: "customer_type", label: "Type" },
          { key: "lifecycle_stage", label: "Lifecycle", render: (r) => r.lifecycle_stage || "—" },
          { key: "balance", label: "AR Balance", align: "right", render: (r) => money(r.balance) },
          { key: "is_active", label: "Status", render: (r) => <Pill tone={r.is_active ? "green" : "gray"}>{r.is_active ? "Active" : "Inactive"}</Pill> },
          {
            key: "actions", label: "Actions", render: (r) => (
              <span className="acct-row-actions">
                <Link className="adm-btn adm-btn-sm" href={`/admin/accounting/sales/statements?customer=${r.id}`}>Statement</Link>
                <ApiButton url={url} body={{ action: "toggle_active", id: r.id, is_active: !r.is_active }}>{r.is_active ? "Deactivate" : "Activate"}</ApiButton>
              </span>
            ),
          },
        ]} rows={rows} />
      </Card>
    </div>
  );
}
