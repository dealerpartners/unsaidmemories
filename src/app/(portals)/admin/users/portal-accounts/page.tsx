import { getAdminContext } from "@/lib/admin/gate";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";
import { listAuthUsers, listStaffWithGrants } from "@/lib/admin/data";
import { PageHead, StaffDenied, fmtDate } from "@/components/admin/ui";
import { PortalAccountActions } from "@/components/admin/StaffWidgets";

export const dynamic = "force-dynamic";

/** Admin Users — Customer Portal Accounts: every storefront account
 *  (Supabase Auth users without a staff record), with CRM link, order
 *  count, and ban / unban / confirm actions. */
export default async function PortalAccountsPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;

  const db = createServerClient();
  const [authUsers, staff] = await Promise.all([listAuthUsers(), listStaffWithGrants()]);
  const staffAuthIds = new Set(staff.map((s) => s.user_id));
  const customers = authUsers.filter((u) => !staffAuthIds.has(u.id));

  const emails = customers.map((u) => u.email).filter(Boolean) as string[];
  const crmByEmail = new Map<string, { id: string; name: string | null }>();
  if (emails.length) {
    const { data } = await db
      .from("crm_customers")
      .select("id, email, first_name, last_name")
      .eq("tenant_id", getTenantId())
      .in("email", emails);
    for (const c of data ?? []) {
      crmByEmail.set((c.email as string).toLowerCase(), {
        id: c.id as string,
        name: [c.first_name, c.last_name].filter(Boolean).join(" ") || null,
      });
    }
  }
  const ids = customers.map((u) => u.id);
  const orderCounts = new Map<string, number>();
  if (ids.length) {
    const { data } = await db.from("orders").select("customer_id").in("customer_id", ids);
    for (const o of data ?? []) {
      orderCounts.set(o.customer_id as string, (orderCounts.get(o.customer_id as string) ?? 0) + 1);
    }
  }

  return (
    <div>
      <PageHead
        title="Customer Portal Accounts"
      />
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Account</th>
              <th>CRM Customer</th>
              <th>Orders</th>
              <th>Email Confirmed</th>
              <th>Last Sign-in</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((u) => {
              const crm = u.email ? crmByEmail.get(u.email.toLowerCase()) : undefined;
              const banned = Boolean(u.banned_until) && new Date(u.banned_until as string) > new Date();
              return (
                <tr key={u.id}>
                  <td>
                    <strong>{u.name || u.email || u.id.slice(0, 8)}</strong>
                    <br />
                    <span style={{ color: "var(--muted-foreground)", fontSize: 12 }}>{u.email}</span>
                  </td>
                  <td>{crm ? crm.name || crm.id.slice(0, 8) : <span style={{ color: "var(--muted-foreground)" }}>No CRM record</span>}</td>
                  <td>{orderCounts.get(u.id) ?? 0}</td>
                  <td>{u.email_confirmed_at ? "Yes" : "No"}</td>
                  <td>{fmtDate(u.last_sign_in_at)}</td>
                  <td>{banned ? <span className="adm-badge adm-badge-red">Banned</span> : <span className="adm-badge adm-badge-green">Active</span>}</td>
                  <td>
                    <PortalAccountActions userId={u.id} banned={banned} confirmed={Boolean(u.email_confirmed_at)} />
                  </td>
                </tr>
              );
            })}
            {customers.length === 0 && (
              <tr>
                <td colSpan={7} style={{ color: "var(--muted-foreground)" }}>
                  No customer portal accounts yet. Accounts appear here when a shopper signs up on the storefront.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
