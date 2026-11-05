import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";

function toUiStaff(row: any) {
  return {
    id: String(row.id),
    displayName: row.display_name ?? "—",
    firstName: row.first_name ?? null,
    lastName: row.last_name ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    role: row.role ?? "staff",
    isGroomer: !!row.is_service_staff,
    isActive: !!row.is_active,
    colorLabel: row.color_label ?? null,
    hireDate: row.hire_date ? String(row.hire_date).slice(0, 10) : null,
    todayAppointmentCount: Number(row.today_appointment_count ?? 0),
  };
}

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("staff_groomer_management", "read");
  if (gate) return gate;
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";
  const limit = Math.min(parseInt(searchParams.get("limit") || "100") || 100, 500);

  return withPg(async (client) => {
    const tenant = resolveTenantId(req);
    const where = ["s.tenant_id = $1", "s.is_active = true"];
    const params: any[] = [tenant];
    let pi = 2;
    if (search) { where.push(`(s.display_name ILIKE $${pi} OR s.email ILIKE $${pi} OR s.role ILIKE $${pi})`); params.push(`%${search}%`); pi++; }
    const r = await client.query(
      `SELECT s.*, (SELECT count(*)::int FROM public.crm_appointments a WHERE a.tenant_id = s.tenant_id AND a.assigned_groomer_id = s.id AND DATE(a.starts_at) = CURRENT_DATE AND a.status NOT IN ('cancelled','no_show')) AS today_appointment_count FROM public.crm_staff s WHERE ${where.join(" AND ")} ORDER BY s.is_service_staff DESC, s.display_name LIMIT $${pi}`,
      [...params, limit],
    );
    return NextResponse.json({ staff: r.rows.map(toUiStaff), total: r.rows.length });
  }).then((r) => r ?? NextResponse.json({ error: "DB unavailable" }, { status: 503 }))
    .catch((e: any) => NextResponse.json({ error: e?.message }, { status: 500 }));
}
