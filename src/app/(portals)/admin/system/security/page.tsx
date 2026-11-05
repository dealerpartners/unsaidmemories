import { getAdminContext } from "@/lib/admin/gate";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";
import { listAuthUsers, listStaffWithGrants } from "@/lib/admin/data";
import { PageHead, StaffDenied, StatusBadge, fmtDate } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

/** System → Security (tree 8.2): two-factor status per staff member,
 *  recent sign-in activity, and impersonation sessions. */
export default async function SecurityPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;

  const [staff, authUsers] = await Promise.all([listStaffWithGrants(), listAuthUsers()]);
  const authById = new Map(authUsers.map((u) => [u.id, u]));
  const withMfa = staff.filter((s) => authById.get(s.user_id)?.mfaEnabled).length;

  const db = createServerClient();
  const { data: sessions } = await db
    .from("admin_impersonation_sessions")
    .select("admin_email, target_type, target_label, reason, status, started_at, ended_at")
    .eq("tenant_id", getTenantId())
    .order("started_at", { ascending: false })
    .limit(20);

  const recentSignIns = authUsers
    .filter((u) => u.last_sign_in_at)
    .sort((a, b) => new Date(b.last_sign_in_at as string).getTime() - new Date(a.last_sign_in_at as string).getTime())
    .slice(0, 12);

  return (
    <div>
      <PageHead title="Security & 2FA" />
      <div className="adm-grid adm-grid-3" style={{ marginBottom: 16 }}>
        <div className="adm-card"><div className="adm-kpi-label">Staff with 2FA enabled</div><div className="adm-kpi-value">{withMfa} / {staff.length}</div><div className="adm-kpi-foot">Authenticator-app factors on the auth account</div></div>
        <div className="adm-card"><div className="adm-kpi-label">Active impersonation sessions</div><div className="adm-kpi-value">{(sessions ?? []).filter((s) => s.status === "active").length}</div><div className="adm-kpi-foot">Support investigations in progress</div></div>
        <div className="adm-card"><div className="adm-kpi-label">Banned portal accounts</div><div className="adm-kpi-value">{authUsers.filter((u) => u.banned_until && new Date(u.banned_until) > new Date()).length}</div><div className="adm-kpi-foot">Managed under Customer Portal Accounts</div></div>
      </div>
      <div className="adm-grid adm-grid-2" style={{ alignItems: "start" }}>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead><tr><th>Staff member</th><th>2FA Security</th><th>Last sign-in</th></tr></thead>
            <tbody>
              {staff.map((s) => {
                const auth = authById.get(s.user_id);
                return (
                  <tr key={s.id}>
                    <td><strong>{s.display_name || s.email}</strong><br /><span style={{ color: "var(--muted-foreground)", fontSize: 12 }}>{s.role_type ?? ""}</span></td>
                    <td>{auth?.mfaEnabled ? <span className="adm-badge adm-badge-green">Enabled</span> : <span className="adm-badge adm-badge-amber">Not set up</span>}</td>
                    <td>{fmtDate(auth?.last_sign_in_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: "grid", gap: 16 }}>
          <div className="adm-card">
            <h2>Login &amp; security events</h2>
            {recentSignIns.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>No sign-ins recorded yet.</p>
            ) : (
              <table className="adm-table">
                <thead><tr><th>Account</th><th>Last sign-in</th></tr></thead>
                <tbody>
                  {recentSignIns.map((u) => (
                    <tr key={u.id}>
                      <td>{u.name || u.email || u.id.slice(0, 8)}</td>
                      <td>{fmtDate(u.last_sign_in_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="adm-card">
            <h2>Impersonation sessions</h2>
            {(sessions ?? []).length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>No impersonation sessions on record.</p>
            ) : (
              <table className="adm-table">
                <thead><tr><th>Admin</th><th>Target</th><th>Status</th><th>Started</th></tr></thead>
                <tbody>
                  {(sessions ?? []).map((s, i) => (
                    <tr key={i}>
                      <td>{s.admin_email as string}</td>
                      <td>{s.target_label as string} <span style={{ color: "var(--muted-foreground)" }}>({s.target_type as string})</span></td>
                      <td><StatusBadge value={s.status as string} /></td>
                      <td>{fmtDate(s.started_at as string)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
