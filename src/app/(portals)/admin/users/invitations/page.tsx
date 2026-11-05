import { getAdminContext } from "@/lib/admin/gate";
import { listStaffWithGrants } from "@/lib/admin/data";
import { PageHead, StaffDenied, fmtDate } from "@/components/admin/ui";
import { InviteUserForm, StaffStatusButton } from "@/components/admin/StaffWidgets";

export const dynamic = "force-dynamic";

/** Admin Users — Pending Invitations: staff records whose invitation
 *  has not been accepted yet (accepted_at is stamped on first gated
 *  sign-in), plus the full invitation history. */
export default async function InvitationsPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;

  const staff = await listStaffWithGrants();
  const pending = staff.filter((s) => s.invited_at && !s.accepted_at);
  const history = staff.filter((s) => s.invited_at);

  return (
    <div>
      <PageHead title="Pending Invitations" />
      <div className="adm-grid adm-grid-2" style={{ alignItems: "start" }}>
        <div style={{ display: "grid", gap: 16 }}>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Invitee</th>
                  <th>Role</th>
                  <th>Invited</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.display_name || s.email}</strong>
                      <br />
                      <span style={{ color: "var(--muted-foreground)", fontSize: 12 }}>{s.email}</span>
                    </td>
                    <td>{s.role_type ?? "—"}</td>
                    <td>{fmtDate(s.invited_at)}</td>
                    <td>
                      {s.is_active ? (
                        <span className="adm-badge adm-badge-amber">Pending acceptance</span>
                      ) : (
                        <span className="adm-badge adm-badge-red">Revoked</span>
                      )}
                    </td>
                    <td>{ctx.portalUserId !== s.id && <StaffStatusButton id={s.id} isActive={s.is_active} />}</td>
                  </tr>
                ))}
                {pending.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ color: "var(--muted-foreground)" }}>
                      No pending invitations — every invited staff member has accepted.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="adm-card">
            <h2>Invitation history</h2>
            {history.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>No invitations have been sent yet.</p>
            ) : (
              <table className="adm-table">
                <thead>
                  <tr><th>Invitee</th><th>Invited</th><th>Accepted</th></tr>
                </thead>
                <tbody>
                  {history.map((s) => (
                    <tr key={s.id}>
                      <td>{s.display_name || s.email}</td>
                      <td>{fmtDate(s.invited_at)}</td>
                      <td>{s.accepted_at ? fmtDate(s.accepted_at) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <div className="adm-card">
          <h2>Send an invitation</h2>
          <InviteUserForm />
        </div>
      </div>
    </div>
  );
}
