import { getAdminContext } from "@/lib/admin/gate";
import { getTenantRow } from "@/lib/admin/data";
import { PageHead, StaffDenied } from "@/components/admin/ui";
import SettingsForm from "@/components/admin/SettingsForm";

export const dynamic = "force-dynamic";

/** Ecommerce → Ecommerce Taxes: how checkout calculates and presents
 *  tax for the storefront (the accounting module owns filings). */
export default async function EcommerceTaxesPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;
  const tenant = await getTenantRow();
  const eco = (tenant?.settings.ecommerce as Record<string, unknown>) ?? {};

  return (
    <div>
      <PageHead title="Ecommerce Taxes" />
      <div className="adm-grid adm-grid-2" style={{ alignItems: "start" }}>
        <div className="adm-card">
          <h2>Tax settings</h2>
          <SettingsForm
            section="ecommerce"
            initial={eco}
            fields={[
              { key: "tax_mode", label: "Tax collection mode", type: "select", options: ["stripe_tax", "manual_rates", "not_collected"], tip: "How checkout works out sales tax: Stripe Tax does it for you, manual rates uses your fallback percentage below, or not collected means no tax is added.", help: "stripe_tax computes at checkout from the Stripe Tax setup; manual_rates uses the fallback rate below." },
              { key: "tax_default_rate_pct", label: "Fallback tax rate (%)", type: "text", placeholder: "e.g. 8.25", tip: "The percentage used when manual rates are on — for example, 8.25 means $8.25 of tax on a $100 order." },
              { key: "tax_nexus_states", label: "Nexus states / regions", type: "text", placeholder: "TN, CA, NY…", tip: "The states where your business has a presence (“nexus”) and must collect tax. Your accountant can confirm the list." },
              { key: "tax_prices_include", label: "Prices shown include tax", type: "select", options: ["no", "yes"], tip: "“Yes” means the price on the product page already contains the tax; “no” means tax is added on top at checkout." },
            ]}
          />
        </div>
        <div className="adm-card">
          <h2>Where filings live</h2>
          <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
            Collection here is storefront behavior. Remittance, filings and tax liability accounts
            are managed in Accounting → Taxes; the store&apos;s overall tax posture is also recorded
            under System → Financial Settings.
          </p>
          <dl className="adm-dl">
            <dt>Current mode</dt>
            <dd>{String(eco.tax_mode ?? "Not set")}</dd>
            <dt>Fallback rate</dt>
            <dd>{eco.tax_default_rate_pct ? `${String(eco.tax_default_rate_pct)}%` : "Not set"}</dd>
            <dt>Nexus</dt>
            <dd>{String(eco.tax_nexus_states ?? "Not set")}</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}
