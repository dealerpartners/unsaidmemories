import { createServerClient } from "@/lib/supabase";
import { tenantId, todayISO, custName } from "@/lib/accounting";
import { PageHead, Card } from "@/components/accounting/ui";
import { LinesForm } from "@/components/accounting/actions";

export const dynamic = "force-dynamic";

export default async function NewInvoicePage() {
  const db = createServerClient();
  const tenant = await tenantId(db);
  const { data: customers } = await db.from("crm_customers").select("id, first_name, last_name, company_name").eq("tenant_id", tenant).eq("is_active", true).order("legal_name");
  const due = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  return (
    <div>
      <PageHead title="New Invoice" />
      <Card title="Invoice Details">
        <LinesForm
          url="/api/admin/accounting/invoices"
          redirectTo="/admin/accounting/invoices"
          submitLabel="Create Draft Invoice"
          extraFields={[
            { name: "customer_id", label: "Customer", options: (customers || []).map((c: any) => ({ value: c.id, label: custName(c) })) },
            { name: "invoice_date", label: "Invoice date", type: "date" },
            { name: "due_date", label: "Due date", type: "date" },
            { name: "terms", label: "Terms", placeholder: "Net 30" },
          ]}
        />
        <p style={{ color: "var(--muted)", fontSize: 12 }}>Dates default server-side to today / +30 days when the form fields are left unset by the browser ({todayISO()} → {due}). Sales tax is computed at 8.25% per line.</p>
      </Card>
    </div>
  );
}
