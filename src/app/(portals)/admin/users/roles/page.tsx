import { getAdminContext } from "@/lib/admin/gate";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";
import { listStaffWithGrants } from "@/lib/admin/data";
import { PageHead, StaffDenied } from "@/components/admin/ui";
import { PermissionsMatrix } from "@/components/admin/StaffWidgets";

export const dynamic = "force-dynamic";

/** Admin Users — Roles & Permissions Matrix (tree: Permission Capability
 *  × Super Admin / Manager / …). Rows are the actual staff accounts;
 *  capabilities come from platform_permission_registry. */
export default async function RolesPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;

  const staff = await listStaffWithGrants();
  const db = createServerClient();
  const { data: registry } = await db
    .from("platform_permission_registry")
    .select("permission_code, module, description")
    .eq("tenant_id", getTenantId())
    .order("module")
    .order("permission_code");

  const byModule = new Map<string, Array<{ permission_code: string; description: string | null }>>();
  for (const r of registry ?? []) {
    const list = byModule.get(r.module as string) ?? [];
    list.push({ permission_code: r.permission_code as string, description: r.description as string | null });
    byModule.set(r.module as string, list);
  }

  return (
    <div>
      <PageHead
        title="Roles & Permissions"
      />
      <div className="adm-card" style={{ marginBottom: 16 }}>
        <h2>Permission matrix</h2>
        <PermissionsMatrix staff={staff} />
      </div>
      <div className="adm-card">
        <h2>Permission capabilities</h2>
        <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 0 }}>
          The registered capabilities the matrix grants map to (platform_permission_registry).
        </p>
        {byModule.size === 0 ? (
          <div className="adm-empty">No capabilities registered for this tenant.</div>
        ) : (
          <div className="adm-grid adm-grid-3">
            {[...byModule.entries()].map(([module, caps]) => (
              <div key={module}>
                <h3 style={{ textTransform: "capitalize" }}>{module.replace(/_/g, " ")}</h3>
                <div className="adm-table-wrap"><table className="adm-table">
                  <tbody>
                    {caps.map((c) => (
                      <tr key={c.permission_code}>
                        <td>
                          <code style={{ fontSize: 12 }}>{c.permission_code}</code>
                          {c.description && (
                            <>
                              <br />
                              <span style={{ color: "var(--muted-foreground)", fontSize: 12 }}>{c.description}</span>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
