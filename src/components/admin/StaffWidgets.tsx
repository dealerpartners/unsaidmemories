"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MODULE_CODES, MODULE_LABELS, type AccessLevel } from "@/lib/admin/modules";

/** Invite staff — POST /api/admin/users. If the API returns a one-time
 *  tempPassword (invite email unavailable), it is shown once here. */
export function InviteUserForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("Staff");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, display_name: name, role_type: role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Invite failed (${res.status})`);
      setMsg({
        kind: "ok",
        text: data.tempPassword
          ? `Account created for ${email}. One-time temporary password (shown once): ${data.tempPassword}`
          : `Invitation sent to ${email}.`,
      });
      setEmail("");
      setName("");
      router.refresh();
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Invite failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {msg && <div className={`adm-alert${msg.kind === "err" ? " adm-alert-error" : " adm-alert-ok"}`}>{msg.text}</div>}
      <div className="adm-field">
        <label className="adm-label">Email</label>
        <input className="adm-input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@unsaidmemories.com" data-tip="The new staff member’s email address — their invitation and their sign-in name both go there." />
      </div>
      <div className="adm-field">
        <label className="adm-label">Display name</label>
        <input className="adm-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" data-tip="Their full name — it’s shown around the admin next to everything they do." />
      </div>
      <div className="adm-field">
        <label className="adm-label">Role</label>
        <select className="adm-select" value={role} onChange={(e) => setRole(e.target.value)} data-tip="Their job title. What they can actually open and change is set separately, on the Roles & Permissions page.">
          {["Super Admin", "Manager", "Staff", "Support Agent", "Accountant", "Fulfillment"].map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <div className="adm-help">Module access is granted separately on the Roles &amp; Permissions page.</div>
      </div>
      <button className="adm-btn" type="submit" disabled={busy} data-tip="Create their account and send the invitation email. They set their own password from that email.">{busy ? "Sending…" : "Invite user"}</button>
    </form>
  );
}

/** Row actions for a staff record: activate/deactivate. */
export function StaffStatusButton({ id, isActive }: { id: string; isActive: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !isActive }),
    }).catch(() => null);
    setBusy(false);
    router.refresh();
  }
  return (
    <button type="button" className={`adm-btn adm-btn-sm ${isActive ? "adm-btn-ghost" : ""}`} disabled={busy} onClick={toggle} data-tip={isActive ? "Switch this staff account off. The person can no longer sign in to the admin — nothing is deleted, and you can switch it back on any time." : "Switch this staff account back on, so the person can sign in to the admin again."}>
      {isActive ? "Deactivate" : "Reactivate"}
    </button>
  );
}

/** The permissions matrix: one select per (staff × module). */
export function PermissionsMatrix({
  staff,
}: {
  staff: Array<{ id: string; display_name: string | null; email: string | null; is_owner: boolean; isPlatformAdmin: boolean; grants: Partial<Record<string, AccessLevel>> }>;
}) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string>("");
  const [error, setError] = useState("");

  async function setGrant(userId: string, moduleKey: string, level: string) {
    const k = `${userId}:${moduleKey}`;
    setBusyKey(k);
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${userId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module_key: moduleKey, level: level === "none" ? null : level }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Update failed");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyKey("");
    }
  }

  return (
    <div>
      {error && <div className="adm-alert adm-alert-error">{error}</div>}
      <div style={{ overflowX: "auto" }}>
        <table className="adm-matrix">
          <thead>
            <tr>
              <th>Staff member</th>
              {MODULE_CODES.map((m) => (
                <th key={m}>{MODULE_LABELS[m]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <td>
                  <strong>{s.display_name || s.email || s.id.slice(0, 8)}</strong>
                  <br />
                  <span style={{ color: "var(--muted-foreground)", fontSize: 12 }}>
                    {s.isPlatformAdmin ? "Platform Admin" : s.is_owner ? "Owner" : s.email}
                  </span>
                </td>
                {MODULE_CODES.map((m) => {
                  const full = s.isPlatformAdmin || s.is_owner;
                  const cur = full ? "full" : (s.grants[m] ?? "none");
                  return (
                    <td key={m}>
                      <select
                        className="adm-select"
                        style={{ minWidth: 92 }}
                        value={cur}
                        disabled={full || busyKey === `${s.id}:${m}`}
                        onChange={(e) => setGrant(s.id, m, e.target.value)}
                        aria-label={`${MODULE_LABELS[m]} access for ${s.display_name || s.email}`}
                        data-tip={`How much ${s.display_name || s.email} can do in ${MODULE_LABELS[m]}: None shuts the door, Read is look-only, Write allows everyday changes, Full includes the sensitive actions.`}
                      >
                        <option value="none">None</option>
                        <option value="read">Read</option>
                        <option value="write">Write</option>
                        <option value="full">Full</option>
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="adm-help">
        Owners and platform admins always hold full access. Changes are written to the permissions
        store and the audit log, and take effect on the member&apos;s next request.
      </p>
    </div>
  );
}

/** Ban / unban / confirm actions for a customer portal account. */
export function PortalAccountActions({ userId, banned, confirmed }: { userId: string; banned: boolean; confirmed: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function act(action: string) {
    setBusy(true);
    await fetch("/api/admin/users/portal-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action }),
    }).catch(() => null);
    setBusy(false);
    router.refresh();
  }
  return (
    <span style={{ display: "inline-flex", gap: 6 }}>
      {!confirmed && (
        <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" disabled={busy} onClick={() => act("confirm")} data-tip="Mark this customer’s email as confirmed for them, so they don’t have to click the link in their signup email.">Confirm email</button>
      )}
      {banned ? (
        <button type="button" className="adm-btn adm-btn-sm" disabled={busy} onClick={() => act("unban")} data-tip="Let this customer sign in to the shop again.">Unban</button>
      ) : (
        <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" disabled={busy} onClick={() => act("ban")} data-tip="Block this customer from signing in to the shop. Their account and order history stay on record, and you can unban them any time.">Ban</button>
      )}
    </span>
  );
}
