import { getAdminContext } from "@/lib/admin/gate";
import { createServerClient } from "@/lib/supabase";
import { PROVIDERS } from "@/lib/admin/integrations";
import { PageHead, StaffDenied } from "@/components/admin/ui";
import { SupplierEditor } from "@/components/admin/SystemWidgets";

export const dynamic = "force-dynamic";

/** System → Integrations (tree 8.6): Stripe, email, search, AI imagery
 *  and the six print suppliers. Configuration is read from the
 *  environment (names + presence only — values never render); supplier
 *  ordering state is edited on the suppliers table. */
export default async function IntegrationsPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;

  const db = createServerClient();
  const { data: suppliers } = await db
    .from("suppliers")
    .select("id, name, slug, kind, catalog_source, api_base_url, ordering_status")
    .order("name");
  const bySlug = new Map((suppliers ?? []).map((s) => [String(s.slug ?? "").toLowerCase(), s]));
  const knownSlugs = new Set(PROVIDERS.map((p) => p.supplierSlug).filter(Boolean));
  const others = (suppliers ?? []).filter((s) => !knownSlugs.has(String(s.slug ?? "").toLowerCase()));

  return (
    <div>
      <PageHead title="Integrations" />
      <div className="adm-grid adm-grid-2" style={{ alignItems: "start" }}>
        {PROVIDERS.map((p) => {
          const supplier = p.supplierSlug ? bySlug.get(p.supplierSlug) : undefined;
          const configured = p.env.every((name) => Boolean(process.env[name]?.trim()));
          const missing = p.env.filter((name) => !process.env[name]?.trim());
          return (
            <div className="adm-card" key={p.key}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h2 style={{ margin: 0 }}>{p.name}</h2>
                <span className="adm-badge">{p.kind}</span>
                {configured ? (
                  <span className="adm-badge adm-badge-green" style={{ marginLeft: "auto" }}>Configured</span>
                ) : (
                  <span className="adm-badge adm-badge-amber" style={{ marginLeft: "auto" }}>Missing keys</span>
                )}
              </div>
              <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>{p.note}</p>
              <div className="adm-table-wrap"><table className="adm-table">
                <tbody>
                  {p.env.map((name) => (
                    <tr key={name}>
                      <td><code style={{ fontSize: 12 }}>{name}</code></td>
                      <td style={{ textAlign: "right" }}>{process.env[name]?.trim() ? "Set" : <span style={{ color: "var(--destructive)" }}>Missing</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              {supplier && (
                <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                  <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 8 }}>
                    Supplier record: {(supplier.catalog_source as string) || "—"} · ordering
                  </div>
                  <SupplierEditor
                    id={supplier.id as string}
                    orderingStatus={(supplier.ordering_status as string) ?? null}
                    apiBaseUrl={(supplier.api_base_url as string) ?? null}
                  />
                </div>
              )}
              {missing.length > 0 && p.key === "stripe" && missing.includes("STRIPE_WEBHOOK_SECRET") && (
                <div className="adm-alert adm-alert-error" style={{ marginTop: 12, marginBottom: 0 }}>
                  STRIPE_WEBHOOK_SECRET is not set: the webhook route cannot verify signatures and
                  falls back to unauthenticated parsing. Set it in the deployment environment.
                </div>
              )}
            </div>
          );
        })}
      </div>
      {others.length > 0 && (
        <div className="adm-card" style={{ marginTop: 16 }}>
          <h2>Other registered suppliers</h2>
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr><th>Supplier</th><th>Kind</th><th>Catalog source</th><th>Ordering</th></tr></thead>
            <tbody>
              {others.map((s) => (
                <tr key={s.id as string}>
                  <td><strong>{s.name as string}</strong></td>
                  <td>{(s.kind as string) ?? "—"}</td>
                  <td>{(s.catalog_source as string) ?? "—"}</td>
                  <td>
                    <SupplierEditor id={s.id as string} orderingStatus={(s.ordering_status as string) ?? null} apiBaseUrl={(s.api_base_url as string) ?? null} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}
