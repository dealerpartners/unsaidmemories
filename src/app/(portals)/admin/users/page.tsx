import Link from "next/link";
import { getAdminContext } from "@/lib/admin/gate";
import { listStaffWithGrants, listAuthUsers } from "@/lib/admin/data";
import { PageHead, StaffDenied, fmtDate } from "@/components/admin/ui";
import { InviteUserForm, StaffStatusButton } from "@/components/admin/StaffWidgets";

export const dynamic = "force-dynamic";

/** Avatar background palette — hashed from the name so each row picks a
 *  stable tint (matches the varied avatar colors in the reference). */
const AVATAR_BG = ["#dbeafe", "#e0f2f2", "#ede9fe", "#fdf0e0", "#e6f4ea", "#fde8e8"];
const AVATAR_FG = ["#2563eb", "#00595a", "#0e7490", "#b45309", "#15803d", "#b91c1c"];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarTint(name: string): { bg: string; fg: string } {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const idx = h % AVATAR_BG.length;
  return { bg: AVATAR_BG[idx], fg: AVATAR_FG[idx] };
}

/** Admin Users — Users tab. Table to the owner's reference spec: USER
 *  (avatar + name + email + badges), ASSIGNED ROLE (styled select),
 *  CRM RECORDS, 2FA, STATUS (pill), LAST ACTIVE, ACTIONS. Sub-tabs:
 *  Users | Module Access | Pending Invitations. Toolbar: search + Invite. */
export default async function AdminUsersPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;

  const [staff, authUsers] = await Promise.all([listStaffWithGrants(), listAuthUsers()]);
  const authById = new Map(authUsers.map((u) => [u.id, u]));

  return (
    <div>
      <PageHead
        title="Admin Users"
      >
        <input
          type="search"
          className="adm-input"
          placeholder="Search settings…"
          style={{ width: 260, height: 38 }}
          aria-label="Search users"
        />
        <Link className="adm-btn" href="/admin/users/invitations" data-tip="Invite a new staff member by email.">
          + Add Team Member
        </Link>
      </PageHead>

      {/* Sub-tabs — Users | Module Access | Pending Invitations */}
      <div className="adm-tabs" role="tablist" aria-label="Admin Users sections">
        <Link role="tab" aria-selected="true" className="adm-tab active" href="/admin/users">Users</Link>
        <Link role="tab" className="adm-tab" href="/admin/users/roles">Module Access</Link>
        <Link role="tab" className="adm-tab" href="/admin/users/invitations">Pending Invitations</Link>
      </div>

      <div className="adm-table-wrap" style={{ marginBottom: 18 }}>
        <table className="adm-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Assigned Role</th>
              <th>CRM Records</th>
              <th>2FA</th>
              <th>Status</th>
              <th>Last Active</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => {
              const auth = authById.get(s.user_id);
              const status = !s.is_active ? "Inactive" : !s.accepted_at ? "Invited" : "Active";
              const name = s.display_name || s.email || "—";
              const tint = avatarTint(name);
              return (
                <tr key={s.id}>
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                      <span
                        aria-hidden="true"
                        style={{
                          width: 34, height: 34, borderRadius: "50%", flex: "0 0 34px",
                          display: "grid", placeItems: "center",
                          background: tint.bg, color: tint.fg,
                          font: '600 13px var(--font-display, "DM Sans")',
                        }}
                      >
                        {initials(name)}
                      </span>
                      <span style={{ display: "inline-flex", flexDirection: "column", lineHeight: 1.2 }}>
                        <Link
                          href={`/admin/users/${s.id}`}
                          style={{ fontWeight: 600, color: "var(--foreground)" }}
                          data-tip="Open this person's staff record — details, security, and module access."
                        >
                          {name}
                        </Link>
                        <span style={{ display: "inline-flex", gap: 6, marginTop: 2 }}>
                          {s.isPlatformAdmin && <span className="adm-badge adm-badge-brand">Platform Admin</span>}
                          {s.is_owner && <span className="adm-badge adm-badge-teal">Owner</span>}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td style={{ color: "var(--muted-foreground)" }}>{s.email || "—"}</td>
                  <td>
                    <Link
                      href={`/admin/users/${s.id}`}
                      className="adm-role-select"
                      data-tip="Open the record to change this person's role."
                    >
                      {s.role_type ?? "Staff"}
                      <span aria-hidden="true">▾</span>
                    </Link>
                  </td>
                  <td style={{ color: "var(--muted-foreground)" }}>—</td>
                  <td>
                    {auth?.mfaEnabled ? (
                      <span className="adm-badge adm-badge-green">Enabled</span>
                    ) : (
                      <span className="adm-badge adm-badge-amber">Not set up</span>
                    )}
                  </td>
                  <td>
                    <span
                      className={`adm-badge ${ status === "Active" ? "adm-badge-green" : status === "Invited" ? "adm-badge-amber" : "adm-badge-red" }`}
                    >
                      {status}
                    </span>
                  </td>
                  <td style={{ color: "var(--muted-foreground)" }}>{fmtDate(auth?.last_sign_in_at)}</td>
                  <td>
                    <span style={{ display: "inline-flex", gap: 6 }}>
                      <Link
                        className="adm-btn adm-btn-ghost adm-btn-sm"
                        href={`/admin/users/${s.id}`}
                        data-tip="Open this person's staff record to change their details or role."
                      >
                        Edit
                      </Link>
                      {ctx.portalUserId !== s.id && (
                        <StaffStatusButton id={s.id} isActive={s.is_active} />
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
            {staff.length === 0 && (
              <tr>
                <td colSpan={8} style={{ color: "var(--muted-foreground)", textAlign: "center", padding: 28 }}>
                  No staff accounts yet — invite the first one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="adm-card">
        <h2>Invite a user</h2>
        <p style={{ color: "var(--muted-foreground)", fontSize: 13, marginTop: 0 }}>
          Creates the sign-in account and the staff record. Module access is granted
          afterwards under Roles &amp; Permissions.
        </p>
        <InviteUserForm />
      </div>
    </div>
  );
}
