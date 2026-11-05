import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";

// GET /api/admin/crm/staff/incidents — the admin read side of employee
// incident reports (§5.1, spec-tagged M13). Employees file via
// POST /api/employee/incidents into crm_staff_incident_reports; until
// this route existed (employee audit 2026-10-17) nothing on the admin
// side ever read that table, so filed incidents were invisible to the
// business. Tenant-scoped, newest first, optional ?severity= filter.
export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("staff_groomer_management", "read");
  if (gate) return gate;
  const { searchParams } = new URL(req.url);
  const severity = searchParams.get("severity") || "";
  const limit = Math.min(parseInt(searchParams.get("limit") || "100") || 100, 500);

  return withPg(async (client) => {
    const tenant = resolveTenantId(req);
    const where = ["i.tenant_id = $1"];
    const params: any[] = [tenant];
    let pi = 2;
    if (severity) { where.push(`i.severity = $${pi}`); params.push(severity); pi++; }
    const r = await client.query(
      `SELECT i.id::text AS id, i.severity, i.description, i.action_taken,
              i.created_at::text AS created_at,
              i.staff_id::text AS staff_id, s.display_name AS staff_name,
              i.appointment_id::text AS appointment_id, a.appointment_number,
              i.dependent_id::text AS dependent_id, p.name AS pet_name
         FROM public.crm_staff_incident_reports i
         JOIN public.crm_staff s ON s.id = i.staff_id AND s.tenant_id = i.tenant_id
         LEFT JOIN public.crm_appointments a ON a.id = i.appointment_id
         LEFT JOIN public.crm_pets p ON p.id = i.dependent_id
        WHERE ${where.join(" AND ")}
        ORDER BY i.created_at DESC
        LIMIT $${pi}`,
      [...params, limit],
    );
    return NextResponse.json({ incidents: r.rows, total: r.rows.length });
  }).then((r) => r ?? NextResponse.json({ error: "DB unavailable" }, { status: 503 }))
    .catch((e: any) => NextResponse.json({ error: e?.message }, { status: 500 }));
}
