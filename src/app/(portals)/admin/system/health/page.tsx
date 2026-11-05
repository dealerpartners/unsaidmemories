import { getAdminContext } from "@/lib/admin/gate";
import { PageHead, StaffDenied } from "@/components/admin/ui";
import { HealthPanel } from "@/components/admin/SystemWidgets";

export const dynamic = "force-dynamic";

/** System → System Health (tree 8.7): every status shown is a live
 *  probe — database round-trip, auth API, storage buckets, storefront
 *  fetch, payment/email/search configuration, supplier ordering. */
export default async function HealthPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;
  return (
    <div>
      <PageHead title="System Health" />
      <HealthPanel />
      <div className="adm-grid adm-grid-3" style={{ marginTop: 16 }}>
        <div className="adm-card">
          <h3>Background jobs &amp; queues</h3>
          <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
            Cron routes are CRON_SECRET-gated and registered in vercel.json. The Support Desk
            Operations page shows queue health, failed jobs and dead letters from the support
            engine&apos;s own tables.
          </p>
        </div>
        <div className="adm-card">
          <h3>Backups</h3>
          <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
            The database is Supabase-managed (daily backups + point-in-time recovery on the
            project). Design and print files land in Supabase Storage under the same project.
          </p>
        </div>
        <div className="adm-card">
          <h3>Customer portal status</h3>
          <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
            Portal sign-in rides the same Supabase Auth probed above; customer accounts are
            managed under Admin Users → Customer Portal Accounts.
          </p>
        </div>
      </div>
    </div>
  );
}
