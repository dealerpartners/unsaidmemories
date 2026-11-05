import { getAdminContext } from "@/lib/admin/gate";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";
import { PageHead, StaffDenied, StatusBadge } from "@/components/admin/ui";
import { LocationCreateForm, LocationActiveToggle } from "@/components/admin/SystemWidgets";

export const dynamic = "force-dynamic";

/** System → Locations & Branches / Location Management (tree 8.1/8.4):
 *  erp_warehouses with zones and bin-location counts; inventory per
 *  location lives in the Inventory module. */
export default async function LocationsPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;

  const db = createServerClient();
  const { data: warehouses } = await db
    .from("erp_warehouses")
    .select("id, code, name, warehouse_type, address_line1, city, state, postal_code, country_code, timezone, is_active")
    .eq("tenant_id", getTenantId())
    .order("created_at", { ascending: true });
  const ids = (warehouses ?? []).map((w) => w.id as string);
  const zoneCounts = new Map<string, number>();
  const locCounts = new Map<string, number>();
  const invCounts = new Map<string, number>();
  if (ids.length) {
    const [zones, locs, inv] = await Promise.all([
      db.from("erp_warehouse_zones").select("warehouse_id").in("warehouse_id", ids),
      db.from("erp_warehouse_locations").select("warehouse_id").in("warehouse_id", ids),
      db.from("erp_inventory_balances").select("warehouse_id").in("warehouse_id", ids),
    ]);
    for (const z of zones.data ?? []) zoneCounts.set(z.warehouse_id as string, (zoneCounts.get(z.warehouse_id as string) ?? 0) + 1);
    for (const l of locs.data ?? []) locCounts.set(l.warehouse_id as string, (locCounts.get(l.warehouse_id as string) ?? 0) + 1);
    for (const b of inv.data ?? []) invCounts.set(b.warehouse_id as string, (invCounts.get(b.warehouse_id as string) ?? 0) + 1);
  }

  return (
    <div>
      <PageHead title="Locations & Branches" />
      <div className="adm-grid adm-grid-2" style={{ alignItems: "start" }}>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Location</th>
                <th>Type</th>
                <th>Zones / Bins</th>
                <th>Inventory Rows</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(warehouses ?? []).map((w) => (
                <tr key={w.id as string}>
                  <td>
                    <strong>{w.name as string}</strong> {w.code ? <span className="adm-badge">{w.code as string}</span> : null}
                    <br />
                    <span style={{ color: "var(--muted-foreground)", fontSize: 12 }}>
                      {[w.address_line1, w.city, w.state, w.postal_code, w.country_code].filter(Boolean).join(", ") || "No address on file"}
                      {w.timezone ? ` · ${w.timezone as string}` : ""}
                    </span>
                  </td>
                  <td>{w.warehouse_type as string}</td>
                  <td>{zoneCounts.get(w.id as string) ?? 0} / {locCounts.get(w.id as string) ?? 0}</td>
                  <td>{invCounts.get(w.id as string) ?? 0}</td>
                  <td><StatusBadge value={w.is_active ? "active" : "inactive"} /></td>
                  <td><LocationActiveToggle id={w.id as string} isActive={Boolean(w.is_active)} /></td>
                </tr>
              ))}
              {(warehouses ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} style={{ color: "var(--muted-foreground)" }}>No locations yet — add the first fulfillment center.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="adm-card">
          <h2>Add location</h2>
          <LocationCreateForm />
        </div>
      </div>
    </div>
  );
}
