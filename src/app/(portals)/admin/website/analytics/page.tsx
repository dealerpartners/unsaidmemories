import { getAdminContext } from "@/lib/admin/gate";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";
import { listAuthUsers } from "@/lib/admin/data";
import { PageHead, Kpi, StaffDenied, fmtDate } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

/** Website → Website Analytics: the measurable storefront funnel —
 *  accounts, newsletter signups, carts and orders. Page-view tracking
 *  is not stored in this database, so no visit numbers are invented;
 *  the funnel below is counted from real rows. */
export default async function WebsiteAnalyticsPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;

  const db = createServerClient();
  const tenantId = getTenantId();
  const since30 = new Date(Date.now() - 30 * 86400000);

  const [subsRes, cartsRes, ordersRes, authUsers] = await Promise.all([
    db.from("newsletter_subscribers").select("id, email, source, created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(200),
    db.from("carts").select("id, created_at").eq("tenant_id", tenantId).limit(2000),
    db.from("orders").select("id, created_at").eq("tenant_id", tenantId).limit(2000),
    listAuthUsers().catch(() => []),
  ]);
  const subs = subsRes.data ?? [];
  const subs30 = subs.filter((s) => new Date(s.created_at as string) >= since30).length;
  const accounts30 = authUsers.filter((u) => new Date(u.created_at) >= since30).length;
  const carts30 = (cartsRes.data ?? []).filter((c) => new Date(c.created_at as string) >= since30).length;
  const orders30 = (ordersRes.data ?? []).filter((o) => new Date(o.created_at as string) >= since30).length;
  const recentAccounts = [...authUsers].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 10);

  return (
    <div>
      <PageHead title="Website Analytics" />
      <div className="adm-grid adm-grid-4" style={{ marginBottom: 16 }}>
        <Kpi label="Accounts (30d)" value={accounts30} foot={`${authUsers.length} total accounts`} tip="New shopper accounts created on the storefront in the last 30 days." />
        <Kpi label="Newsletter Subscribers" value={subs.length} foot={`${subs30} new in 30 days`} tip="Everyone on your email list — people who asked to hear from the shop." />
        <Kpi label="Carts Started (30d)" value={carts30} foot="Checkout funnel entry" tip="Shopping carts started in the last 30 days — shoppers who began, whether or not they finished." />
        <Kpi label="Orders (30d)" value={orders30} foot={carts30 > 0 ? `${Math.round((orders30 / carts30) * 1000) / 10}% cart → order` : "No carts yet"} tip="Orders placed in the last 30 days, and how many carts turned into orders." />
      </div>
      <div className="adm-grid adm-grid-2" style={{ alignItems: "start" }}>
        <div className="adm-card">
          <h2>Newest accounts</h2>
          {recentAccounts.length === 0 ? (
            <div className="adm-empty">No accounts yet.</div>
          ) : (
            <div className="adm-table-wrap"><table className="adm-table">
              <thead><tr><th>Account</th><th>Created</th><th>Last sign-in</th></tr></thead>
              <tbody>
                {recentAccounts.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name || u.email || u.id.slice(0, 8)}</td>
                    <td>{fmtDate(u.created_at)}</td>
                    <td>{fmtDate(u.last_sign_in_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>
        <div className="adm-card">
          <h2>Recent subscribers</h2>
          {subs.length === 0 ? (
            <div className="adm-empty">No newsletter subscribers yet.</div>
          ) : (
            <div className="adm-table-wrap"><table className="adm-table">
              <thead><tr><th>Email</th><th>Source</th><th>Joined</th></tr></thead>
              <tbody>
                {subs.slice(0, 10).map((s) => (
                  <tr key={s.id as string}>
                    <td>{s.email as string}</td>
                    <td>{(s.source as string) ?? "—"}</td>
                    <td>{fmtDate(s.created_at as string)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
          <p className="adm-help">Visit and page-view analytics are not stored in this database; connect an analytics provider under System → Integrations to measure traffic.</p>
        </div>
      </div>
    </div>
  );
}
