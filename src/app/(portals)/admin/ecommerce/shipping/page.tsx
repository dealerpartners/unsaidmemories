import { getAdminContext } from "@/lib/admin/gate";
import { createServerClient } from "@/lib/supabase";
import { PageHead, StaffDenied, StatusBadge } from "@/components/admin/ui";
import { ShippingProfileEditor } from "@/components/admin/EcommerceWidgets";

export const dynamic = "force-dynamic";

/** Ecommerce → Shipping Settings: the shipping_profiles rate cards
 *  checkout estimates from — first/additional item costs and delivery
 *  windows, one default profile. */
export default async function EcommerceShippingPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;

  const db = createServerClient();
  const [{ data: profiles }, { data: suppliers }] = await Promise.all([
    db.from("shipping_profiles")
      .select("id, supplier_id, profile_name, method_name, origin_country, destination_countries, first_item_cost, additional_item_cost, currency, min_days, max_days, is_default")
      .order("profile_name"),
    db.from("suppliers").select("id, name"),
  ]);
  const supplierName = new Map((suppliers ?? []).map((s) => [s.id as string, s.name as string]));

  return (
    <div>
      <PageHead title="Shipping Settings" />
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr><th>Profile</th><th>Supplier</th><th>Route</th><th>Default</th><th>First $ / Addl $ / Days min–max / Save</th></tr>
          </thead>
          <tbody>
            {(profiles ?? []).map((p) => (
              <tr key={p.id as string}>
                <td>
                  <strong>{p.profile_name as string}</strong>
                  <br />
                  <span style={{ color: "var(--muted-foreground)", fontSize: 12 }}>{p.method_name as string} · {p.currency as string}</span>
                </td>
                <td>{p.supplier_id ? supplierName.get(p.supplier_id as string) ?? "—" : "—"}</td>
                <td style={{ fontSize: 12 }}>{(p.origin_country as string) || "—"} → {((p.destination_countries as string[]) ?? []).join(", ") || "—"}</td>
                <td>{p.is_default ? <StatusBadge value="default" /> : "—"}</td>
                <td>
                  <ShippingProfileEditor
                    id={p.id as string}
                    first={Number(p.first_item_cost ?? 0)}
                    additional={Number(p.additional_item_cost ?? 0)}
                    minDays={p.min_days as number | null}
                    maxDays={p.max_days as number | null}
                    isDefault={Boolean(p.is_default)}
                  />
                </td>
              </tr>
            ))}
            {(profiles ?? []).length === 0 && (
              <tr><td colSpan={5} style={{ color: "var(--muted-foreground)" }}>No shipping profiles — supplier syncs create them.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
