import Link from "next/link";
import { getAdminContext } from "@/lib/admin/gate";
import { getTenantRow } from "@/lib/admin/data";
import { PageHead, StaffDenied } from "@/components/admin/ui";
import SettingsForm from "@/components/admin/SettingsForm";
import SettingsImageUpload from "@/components/admin/SettingsImageUpload";

export const dynamic = "force-dynamic";

/** Website — settings for the public storefront: domain posture, SEO
 *  defaults and cookie/privacy copy. Payments do NOT live here — they
 *  are managed in Integrations → Connections & Keys. */
export default async function WebsiteSettingsPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;
  const tenant = await getTenantRow();
  const web = (tenant?.settings.website as Record<string, unknown>) ?? {};
  const org = (tenant?.settings.organization as Record<string, unknown>) ?? {};

  return (
    <div>
      <PageHead title="Website Settings" />
      <div className="adm-grid adm-grid-2" style={{ alignItems: "start" }}>
        <div className="adm-card">
          <h2>Site &amp; SEO</h2>
          <SettingsForm
            section="website"
            initial={web}
            fields={[
              { key: "seo_title", label: "Default page title", type: "text", tip: "The words shown in the browser tab and as the headline in Google results, for pages that don’t set their own title.", placeholder: "UnSaid — Say what photos can't", help: "The words in the browser tab and as the headline in search results, for any page that doesn’t set its own title." },
              { key: "seo_description", label: "Default meta description", type: "textarea", tip: "The short sentence Google shows under your link in search results — write the one you’d want a stranger to read first.", placeholder: "The sentence search results show for the home page…", help: "The sentence search results show under your shop’s link — the first words a stranger reads about the shop." },
              { key: "cookie_consent_text", label: "Cookie consent text", type: "textarea", tip: "The words in the cookie notice bar shoppers see on their first visit.", help: "The words inside the cookie notice bar at the bottom of every storefront page, shown once to each new visitor." },
              { key: "privacy_policy_url", label: "Privacy policy URL", type: "text", placeholder: "/privacy", tip: "Where your privacy policy lives — usually just /privacy on your own shop.", help: "The page a shopper lands on when they tap “Privacy” in the footer — usually just /privacy on your own shop." },
              { key: "terms_url", label: "Terms URL", type: "text", placeholder: "/terms", tip: "Where your terms of service live — usually just /terms on your own shop.", help: "The page a shopper lands on when they tap “Terms” in the footer — usually just /terms on your own shop." },
            ]}
          />
          <SettingsImageUpload
            section="website"
            settingKey="og_image_url"
            slot="share-image"
            label="Social share image"
            initialUrl={web.og_image_url == null ? "" : String(web.og_image_url)}
            tip="Upload the picture shown when someone shares your shop — it is saved for you; no web address to paste."
            help="The picture shown when someone shares your shop on Facebook, Pinterest or in a text message — the image beside your shop’s name and link."
          />
        </div>
        <div style={{ display: "grid", gap: 16 }}>
          <div className="adm-card">
            <h2>Domain &amp; identity</h2>
            <dl className="adm-dl">
              <dt>Store</dt>
              <dd>{tenant?.name ?? "—"}</dd>
              <dt>Domain</dt>
              <dd>{String(org.domain ?? tenant?.domain ?? "Set under System → Organization")}</dd>
              <dt>Slug</dt>
              <dd>{tenant?.slug ?? "—"}</dd>
              <dt>Status</dt>
              <dd>{tenant?.is_active ? "Active" : "Inactive"}</dd>
            </dl>
          </div>
          <p className="adm-help">
            Payments are managed in{" "}
            <Link href="/admin/integrations/connections">Integrations → Connections &amp; Keys</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}
