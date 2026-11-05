import { getAdminContext } from "@/lib/admin/gate";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";
import { getTenantRow, listStaffWithGrants } from "@/lib/admin/data";
import { PageHead, StaffDenied, fmtDate } from "@/components/admin/ui";
import SettingsForm from "@/components/admin/SettingsForm";

export const dynamic = "force-dynamic";

/** System → Audit & Data Governance (tree 8.8): the global permission
 *  audit log, change-type rollups, and the retention/deletion settings
 *  the platform enforces. */
export default async function AuditPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;

  const db = createServerClient();
  const tenant = await getTenantRow();
  const gov = (tenant?.settings.governance as Record<string, unknown>) ?? {};
  const staff = await listStaffWithGrants();
  const nameById = new Map(staff.map((s) => [s.id, s.display_name || s.email || s.id.slice(0, 8)]));

  const { data: log } = await db
    .from("portal_permission_audit_log")
    .select("id, portal_user_id, changed_by, change_type, key, old_value, new_value, created_at")
    .eq("tenant_id", getTenantId())
    .order("created_at", { ascending: false })
    .limit(100);

  const byType = new Map<string, number>();
  for (const row of log ?? []) byType.set(row.change_type as string, (byType.get(row.change_type as string) ?? 0) + 1);

  return (
    <div>
      <PageHead title="Audit & Data Governance" />
      <div className="adm-grid adm-grid-4" style={{ marginBottom: 16 }}>
        <div className="adm-card"><div className="adm-kpi-label">Audit events (latest 100)</div><div className="adm-kpi-value">{(log ?? []).length}</div></div>
        <div className="adm-card"><div className="adm-kpi-label">Grants</div><div className="adm-kpi-value">{byType.get("grant") ?? 0}</div></div>
        <div className="adm-card"><div className="adm-kpi-label">Revocations</div><div className="adm-kpi-value">{byType.get("revoke") ?? 0}</div></div>
        <div className="adm-card"><div className="adm-kpi-label">Role / status changes</div><div className="adm-kpi-value">{(byType.get("role") ?? 0) + (byType.get("status") ?? 0)}</div></div>
      </div>
      <div className="adm-grid adm-grid-2" style={{ alignItems: "start" }}>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr><th>When</th><th>Subject</th><th>Change</th><th>Key</th><th>From → To</th><th>By</th></tr>
            </thead>
            <tbody>
              {(log ?? []).map((row) => (
                <tr key={row.id as string}>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtDate(row.created_at as string)}</td>
                  <td>{nameById.get(row.portal_user_id as string) ?? (row.portal_user_id as string).slice(0, 8)}</td>
                  <td><span className="adm-badge">{row.change_type as string}</span></td>
                  <td>{row.key as string}</td>
                  <td>{String(row.old_value ?? "—")} → {String(row.new_value ?? "—")}</td>
                  <td>{row.changed_by ? nameById.get(row.changed_by as string) ?? (row.changed_by as string).slice(0, 8) : "system"}</td>
                </tr>
              ))}
              {(log ?? []).length === 0 && (
                <tr><td colSpan={6} style={{ color: "var(--muted-foreground)" }}>No audit events recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ display: "grid", gap: 16 }}>
          <div className="adm-card">
            <h2>Data retention</h2>
            <SettingsForm
              section="governance"
              initial={gov}
              fields={[
                { key: "audit_retention_days", label: "Audit log retention (days)", type: "number" },
                { key: "data_retention_days", label: "Customer data retention (days)", type: "number", help: "How long inactive customer records are kept before review for deletion." },
                { key: "deletion_request_email", label: "Deletion requests inbox", type: "email", help: "Where data deletion requests are routed; requests are worked from the Support Desk and closed in this log." },
                { key: "export_approval", label: "Data exports require approval", type: "select", options: ["required", "not_required"] },
              ]}
            />
          </div>
          <div className="adm-card">
            <h2>Log coverage</h2>
            <dl className="adm-dl">
              <dt>Global audit log</dt>
              <dd>Permission &amp; account changes (this page)</dd>
              <dt>Permission change log</dt>
              <dd>Grant / revoke / role / status rows above</dd>
              <dt>Integration event log</dt>
              <dd>Supplier + secrets activity under Integrations</dd>
              <dt>Data export log</dt>
              <dd>Exports requested from tickets are actioned through Support Desk approvals</dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
