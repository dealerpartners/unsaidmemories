import { getAdminContext } from "@/lib/admin/gate";
import { getTenantRow } from "@/lib/admin/data";
import { PageHead, StaffDenied } from "@/components/admin/ui";
import SettingsForm from "@/components/admin/SettingsForm";

export const dynamic = "force-dynamic";

/** System → Brand & Identity (tree 8.1): the tenants.branding record the
 *  storefront and emails read. */
export default async function BrandPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;
  const tenant = await getTenantRow();
  const branding = tenant?.branding ?? {};

  return (
    <div>
      <PageHead title="Brand & Identity" />
      <div className="adm-grid adm-grid-2" style={{ alignItems: "start" }}>
        <div className="adm-card">
          <h2>Brand settings</h2>
          <SettingsForm
            section="branding"
            initial={branding}
            fields={[
              { key: "wordmark", label: "Wordmark", placeholder: "UnSaid" },
              { key: "tagline", label: "Tagline", placeholder: "Make the feeling tangible" },
              { key: "logo_url", label: "Logo URL", placeholder: "https://…" },
              { key: "primary_color", label: "Primary color", placeholder: "#007c7d" },
              { key: "accent_color", label: "Accent color", placeholder: "#aa3f15" },
              { key: "support_email", label: "Support email", type: "email" },
            ]}
          />
        </div>
        <div className="adm-card">
          <h2>Preview</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 0" }}>
            <div
              style={{
                width: 44, height: 44, borderRadius: 12, display: "grid", placeItems: "center",
                background: String(branding.accent_color || "#aa3f15"), color: "#fff",
                fontFamily: "Questrial, sans-serif", fontSize: 22,
              }}
            >
              {(String(branding.wordmark || tenant?.name || "U").charAt(0) || "U").toUpperCase()}
            </div>
            <div>
              <div style={{ fontFamily: "Questrial, sans-serif", fontSize: 22 }}>{String(branding.wordmark || tenant?.name || "UnSaid")}</div>
              <div style={{ color: "var(--muted-foreground)", fontSize: 12 }}>{String(branding.tagline || "Make the feeling tangible")}</div>
            </div>
          </div>
          <dl className="adm-dl">
            <dt>Primary color</dt>
            <dd>{String(branding.primary_color || "—")}</dd>
            <dt>Accent color</dt>
            <dd>{String(branding.accent_color || "—")}</dd>
            <dt>Logo</dt>
            <dd>{branding.logo_url ? "Set" : "Not set — wordmark is used"}</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}
