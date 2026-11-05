import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminContext } from "@/lib/admin/gate";
import { createServerClient } from "@/lib/supabase";
import { listStaffWithGrants, listAuthUsers } from "@/lib/admin/data";
import { MODULE_CODES, MODULE_LABELS } from "@/lib/admin/modules";
import { PageHead, StaffDenied, fmtDate } from "@/components/admin/ui";
import StaffEditForm from "@/components/admin/StaffEditForm";
import { StaffStatusButton } from "@/components/admin/StaffWidgets";

export const dynamic = "force-dynamic";

export default async function StaffDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;
  const { id } = await params;

  const staff = await listStaffWithGrants();
  const member = staff.find((s) => s.id === id);
  if (!member) notFound();
  const authUsers = await listAuthUsers();
  const auth = authUsers.find((u) => u.id === member.user_id);

  const db = createServerClient();
  const { data: audit } = await db
    .from("portal_permission_audit_log")
    .select("change_type, key, old_value, new_value, created_at")
    .eq("portal_user_id", id)
    .order("created_at", { ascending: false })
    .limit(12);

  return (
    <div>
      <PageHead
        title={member.display_name || member.email || "Staff member"}
      >
        <Link className="adm-btn adm-btn-ghost" href="/admin/users" data-tip="Back to the full list of staff accounts.">← All users</Link>
        {ctx.portalUserId !== member.id && <StaffStatusButton id={member.id} isActive={member.is_active} />}
      </PageHead>

      <div className="adm-grid adm-grid-2" style={{ alignItems: "start" }}>
        <div className="adm-card">
          <h2>Staff record</h2>
          <StaffEditForm
            id={member.id}
            initial={{
              display_name: member.display_name ?? "",
              phone: member.phone ?? "",
              role_type: member.role_type ?? "Staff",
              is_owner: member.is_owner,
            }}
          />
        </div>
        <div style={{ display: "grid", gap: 16 }}>
          <div className="adm-card">
            <h2>Sign-in &amp; security</h2>
            <dl className="adm-dl">
              <dt>Email</dt>
              <dd>{member.email ?? "—"}</dd>
              <dt>2FA security</dt>
              <dd>{auth?.mfaEnabled ? "Enabled" : "Not set up"}</dd>
              <dt>Email confirmed</dt>
              <dd>{auth?.email_confirmed_at ? fmtDate(auth.email_confirmed_at) : "No"}</dd>
              <dt>Last active</dt>
              <dd>{fmtDate(auth?.last_sign_in_at)}</dd>
              <dt>Invitation</dt>
              <dd>
                {member.invited_at ? `Sent ${fmtDate(member.invited_at)}` : "—"}
                {member.accepted_at ? ` · accepted ${fmtDate(member.accepted_at)}` : member.invited_at ? " · pending" : ""}
              </dd>
              <dt>Platform admin</dt>
              <dd>{member.isPlatformAdmin ? "Yes" : "No"}</dd>
            </dl>
          </div>
          <div className="adm-card">
            <h2>Module access</h2>
            {member.is_owner || member.isPlatformAdmin ? (
              <p style={{ fontSize: 13 }}>
                Full access to every module ({member.isPlatformAdmin ? "platform administrator" : "owner"}).
              </p>
            ) : (
              <div className="adm-table-wrap"><table className="adm-table">
                <tbody>
                  {MODULE_CODES.map((m) => (
                    <tr key={m}>
                      <td>{MODULE_LABELS[m]}</td>
                      <td style={{ textAlign: "right" }}>
                        <span className="adm-badge">{member.grants[m] ?? "none"}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
            <p className="adm-help">
              Change grants on the <Link href="/admin/users/roles" style={{ textDecoration: "underline" }} data-tip="Open the permissions matrix — the grid where you set what each person can do in each part of the admin.">Roles &amp; Permissions</Link> matrix.
            </p>
          </div>
          <div className="adm-card">
            <h2>Recent changes</h2>
            {(audit ?? []).length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>No recorded changes for this account yet.</p>
            ) : (
              <div className="adm-table-wrap"><table className="adm-table">
                <thead>
                  <tr><th>When</th><th>Change</th><th>Detail</th></tr>
                </thead>
                <tbody>
                  {(audit ?? []).map((a, i) => (
                    <tr key={i}>
                      <td>{fmtDate(a.created_at as string)}</td>
                      <td>{String(a.change_type)}</td>
                      <td>{String(a.key)}: {String(a.old_value ?? "—")} → {String(a.new_value ?? "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
