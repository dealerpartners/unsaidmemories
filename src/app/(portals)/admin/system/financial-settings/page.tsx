import { getAdminContext } from "@/lib/admin/gate";
import { getTenantRow } from "@/lib/admin/data";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";
import { PageHead, StaffDenied } from "@/components/admin/ui";
import SettingsForm from "@/components/admin/SettingsForm";

export const dynamic = "force-dynamic";

/** System → Financial Settings (tree 8.5): currencies, taxes posture,
 *  sales & payment settings, deposit and refund policies — plus the
 *  accounting calendar (fiscal years & periods) the books run on. */
export default async function FinancialSettingsPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;
  const tenant = await getTenantRow();
  const fin = (tenant?.settings.financial as Record<string, unknown>) ?? {};

  const db = createServerClient();
  const [{ data: currencies }, { data: years }, { data: periods }] = await Promise.all([
    db.from("acct_currencies").select("*").eq("tenant_id", getTenantId()).limit(20),
    db.from("acct_fiscal_years").select("*").eq("tenant_id", getTenantId()).order("created_at", { ascending: false }).limit(5),
    db.from("acct_periods").select("*").eq("tenant_id", getTenantId()).order("created_at", { ascending: false }).limit(12),
  ]);

  return (
    <div>
      <PageHead title="Financial Settings" />
      <div className="adm-grid adm-grid-2" style={{ alignItems: "start" }}>
        <div style={{ display: "grid", gap: 16 }}>
          <div className="adm-card">
            <h2>Sales &amp; payment settings</h2>
            <SettingsForm
              section="financial"
              initial={fin}
              fields={[
                { key: "default_currency", label: "Default currency", type: "select", options: ["USD", "EUR", "GBP", "CAD", "AUD"] },
                { key: "payment_terms_days", label: "Standard payment terms (days)", type: "number" },
                { key: "tax_mode", label: "Tax collection", type: "select", options: ["stripe_tax", "manual_rates", "not_collected"], help: "How checkout calculates tax; rates themselves live under Accounting → Taxes and Ecommerce → Taxes." },
                { key: "deposit_policy", label: "Deposit policy", type: "textarea", placeholder: "When deposits are collected, applied, released or forfeited…" },
                { key: "refund_policy", label: "Refund policy", type: "textarea", placeholder: "The store's refund terms — shown at checkout and enforced in Refunds & Disputes…" },
              ]}
            />
          </div>
          <div className="adm-card">
            <h2>Payment setup</h2>
            <dl className="adm-dl">
              <dt>Stripe</dt>
              <dd>{process.env.STRIPE_SECRET_KEY ? (process.env.STRIPE_SECRET_KEY.startsWith("sk_test") ? "Connected — sandbox keys" : "Connected") : "Not connected"}</dd>
              <dt>Webhook secret</dt>
              <dd>{process.env.STRIPE_WEBHOOK_SECRET ? "Set" : "Missing — see Integrations"}</dd>
              <dt>Store currency</dt>
              <dd>{tenant?.currency ?? "USD"}</dd>
            </dl>
          </div>
        </div>
        <div style={{ display: "grid", gap: 16 }}>
          <div className="adm-card">
            <h2>Currencies</h2>
            {(currencies ?? []).length === 0 ? (
              <div className="adm-empty">No accounting currencies seeded yet — the Accounting module seeds them with the chart of accounts.</div>
            ) : (
              <div className="adm-table-wrap"><table className="adm-table">
                <thead><tr><th>Code</th><th>Name</th><th>Active</th></tr></thead>
                <tbody>
                  {(currencies ?? []).map((c, i) => (
                    <tr key={i}>
                      <td>{String((c as Record<string, unknown>).code ?? (c as Record<string, unknown>).currency_code ?? "—")}</td>
                      <td>{String((c as Record<string, unknown>).name ?? "—")}</td>
                      <td>{String((c as Record<string, unknown>).is_active ?? "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </div>
          <div className="adm-card">
            <h2>Fiscal calendar</h2>
            {(years ?? []).length === 0 ? (
              <div className="adm-empty">No fiscal years opened yet — Accounting opens the first year with its books.</div>
            ) : (
              <div className="adm-table-wrap"><table className="adm-table">
                <thead><tr><th>Fiscal year</th><th>Start</th><th>End</th><th>Adjustment year</th></tr></thead>
                <tbody>
                  {(years ?? []).map((y, i) => {
                    const row = y as Record<string, unknown>;
                    return (
                      <tr key={i}>
                        <td>FY {String(row.fiscal_year ?? "—")}</td>
                        <td>{String(row.start_date ?? "—")}</td>
                        <td>{String(row.end_date ?? "—")}</td>
                        <td>{row.is_adjustment_year ? "Yes" : "No"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
            )}
            {(periods ?? []).length > 0 && (
              <p className="adm-help">{(periods ?? []).length} accounting periods on record (managed in Accounting → Books).</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
