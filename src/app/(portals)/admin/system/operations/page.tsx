import { getAdminContext } from "@/lib/admin/gate";
import { getTenantRow } from "@/lib/admin/data";
import { createServerClient } from "@/lib/supabase";
import { PageHead, StaffDenied, StatusBadge, fmtMoney } from "@/components/admin/ui";
import SettingsForm from "@/components/admin/SettingsForm";

export const dynamic = "force-dynamic";

/** System → Operations Settings (tree 8.3, adapted from UnSaid Memories's booking
 *  rules to a print-on-demand operation): fulfillment defaults, order
 *  SLA, rush policy — plus the live shipping profiles orders price from. */
export default async function OperationsPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;
  const tenant = await getTenantRow();
  const ops = (tenant?.settings.operations as Record<string, unknown>) ?? {};

  const db = createServerClient();
  const { data: warehouses } = await db
    .from("erp_warehouses")
    .select("name")
    .eq("is_active", true)
    .order("name");
  const { data: profiles } = await db
    .from("shipping_profiles")
    .select("profile_name, method_name, origin_country, destination_countries, first_item_cost, additional_item_cost, currency, min_days, max_days, is_default")
    .order("profile_name")
    .limit(50);

  return (
    <div>
      <PageHead title="Operations Settings" />
      <div className="adm-grid adm-grid-2" style={{ alignItems: "start" }}>
        <div className="adm-card">
          <h2>Fulfillment rules</h2>
          <SettingsForm
            section="operations"
            initial={ops}
            fields={[
              { key: "default_warehouse", label: "Default fulfillment location", type: "select", options: (warehouses ?? []).map((w) => w.name as string) },
              { key: "sla_hours", label: "Order SLA (hours to production)", type: "number" },
              { key: "online_ordering", label: "Online ordering", type: "select", options: ["enabled", "paused", "disabled"] },
              { key: "rush_policy", label: "Rush order policy", type: "textarea", placeholder: "How rush orders are prioritized and priced…" },
              { key: "order_rules", label: "Order rules", type: "textarea", placeholder: "Holding, split-shipment and cancellation rules the fulfillment queue follows…", help: "Supplier routing itself is per-variant (variant_fulfillment_routes) — a paid order fires fulfillment to each line's supplier in priority order; there is no end-of-night settlement hold." },
            ]}
          />
        </div>
        <div className="adm-card">
          <h2>Shipping profiles</h2>
          <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 0 }}>
            The rate cards checkout estimates from (shipping_profiles). Managed in depth under Ecommerce → Shipping Settings.
          </p>
          {(profiles ?? []).length === 0 ? (
            <div className="adm-empty">No shipping profiles configured.</div>
          ) : (
            <div className="adm-table-wrap"><table className="adm-table">
              <thead>
                <tr><th>Profile</th><th>Method</th><th>First / Addl</th><th>Days</th><th>Default</th></tr>
              </thead>
              <tbody>
                {(profiles ?? []).map((p, i) => (
                  <tr key={i}>
                    <td>
                      <strong>{p.profile_name as string}</strong>
                      <br />
                      <span style={{ color: "var(--muted-foreground)", fontSize: 12 }}>
                        {(p.origin_country as string) || "—"} → {((p.destination_countries as string[]) ?? []).join(", ") || "—"}
                      </span>
                    </td>
                    <td>{p.method_name as string}</td>
                    <td>{fmtMoney(Number(p.first_item_cost ?? 0))} / {fmtMoney(Number(p.additional_item_cost ?? 0))}</td>
                    <td>{String(p.min_days ?? "—")}–{String(p.max_days ?? "—")}</td>
                    <td>{p.is_default ? <StatusBadge value="default" /> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>
      </div>
    </div>
  );
}
