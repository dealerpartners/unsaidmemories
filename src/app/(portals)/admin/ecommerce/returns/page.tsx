import { getAdminContext } from "@/lib/admin/gate";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";
import { getTenantRow } from "@/lib/admin/data";
import { PageHead, StaffDenied, StatusBadge, fmtDate } from "@/components/admin/ui";
import SettingsForm from "@/components/admin/SettingsForm";

export const dynamic = "force-dynamic";

/** Ecommerce → Ecommerce Returns: return authorizations for storefront
 *  orders plus the returns policy shoppers see. */
export default async function EcommerceReturnsPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;
  const db = createServerClient();
  const tenant = await getTenantRow();
  const eco = (tenant?.settings.ecommerce as Record<string, unknown>) ?? {};

  const { data: rmas } = await db
    .from("erp_return_authorizations")
    .select("id, rma_number, status, reason_code, requested_at, created_at")
    .eq("tenant_id", getTenantId())
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div>
      <PageHead title="Ecommerce Returns" />
      <div className="adm-grid adm-grid-2" style={{ alignItems: "start" }}>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead><tr><th>RMA</th><th>Status</th><th>Reason</th><th>Requested</th></tr></thead>
            <tbody>
              {(rmas ?? []).map((r) => (
                <tr key={r.id as string}>
                  <td><strong>{r.rma_number as string}</strong></td>
                  <td><StatusBadge value={r.status as string} /></td>
                  <td>{(r.reason_code as string) ?? "—"}</td>
                  <td>{fmtDate((r.requested_at as string) ?? (r.created_at as string))}</td>
                </tr>
              ))}
              {(rmas ?? []).length === 0 && (
                <tr><td colSpan={4} style={{ color: "var(--muted-foreground)" }}>No return authorizations yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="adm-card">
          <h2>Returns policy (storefront)</h2>
          <SettingsForm
            section="ecommerce"
            initial={eco}
            fields={[
              { key: "returns_window_days", label: "Return window (days)", type: "number", tip: "How many days after delivery a customer has to ask for a return." },
              { key: "returns_policy", label: "Returns policy text", type: "textarea", tip: "The returns policy in plain words — shoppers read this on the shop’s returns page.", placeholder: "What shoppers read on the returns page — window, condition, who pays return shipping, how refunds land…" },
              { key: "returns_address", label: "Returns ship-to address", type: "textarea", tip: "The address customers send returned parcels back to." },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
