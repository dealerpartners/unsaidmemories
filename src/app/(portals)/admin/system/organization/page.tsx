import { getAdminContext } from "@/lib/admin/gate";
import { getTenantRow } from "@/lib/admin/data";
import { PageHead, StaffDenied } from "@/components/admin/ui";
import SettingsForm from "@/components/admin/SettingsForm";

export const dynamic = "force-dynamic";

const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Anchorage", "Pacific/Honolulu", "UTC", "Europe/London", "Europe/Berlin",
];

/** System → Organization (tree 8.1): Business Profile, Brand & Identity
 *  lives on its own page; Operating Hours ride in operations settings. */
export default async function OrganizationPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;
  const tenant = await getTenantRow();

  return (
    <div>
      <PageHead title="Organization" />
      <div className="adm-grid adm-grid-2" style={{ alignItems: "start" }}>
        <div className="adm-card">
          <h2>Business profile</h2>
          <SettingsForm
            section="organization"
            initial={{
              name: tenant?.name ?? "",
              domain: tenant?.domain ?? "",
              contact_email: tenant?.contact_email ?? "",
              timezone: tenant?.timezone ?? "",
              currency: tenant?.currency ?? "USD",
              status: tenant?.status ?? "active",
            }}
            fields={[
              { key: "name", label: "Business name" },
              { key: "domain", label: "Primary domain", placeholder: "unsaidmemories.com" },
              { key: "contact_email", label: "Contact email", type: "email" },
              { key: "timezone", label: "Timezone", type: "select", options: TIMEZONES },
              { key: "currency", label: "Currency", type: "select", options: ["USD", "EUR", "GBP", "CAD", "AUD"] },
              { key: "status", label: "Status", type: "select", options: ["active", "suspended", "closed"] },
            ]}
          />
        </div>
        <div className="adm-card">
          <h2>On record</h2>
          <dl className="adm-dl">
            <dt>Slug</dt>
            <dd>{tenant?.slug ?? "—"}</dd>
            <dt>Tenant ID</dt>
            <dd style={{ fontSize: 12 }}>{tenant?.id ?? "—"}</dd>
            <dt>Created</dt>
            <dd>{tenant ? new Date(tenant.created_at).toLocaleString() : "—"}</dd>
            <dt>Last updated</dt>
            <dd>{tenant ? new Date(tenant.updated_at).toLocaleString() : "—"}</dd>
          </dl>
          <p className="adm-help">
            Locations &amp; branches are managed under Locations; operating hours and fulfillment
            rules under Operations Settings.
          </p>
        </div>
      </div>
    </div>
  );
}
