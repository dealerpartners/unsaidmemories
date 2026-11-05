import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
export async function GET(req: NextRequest) {
  const g = await requireModuleApi("staff_groomer_management", "read"); if (g) return g;
  const { searchParams } = new URL(req.url);
  const staffId = searchParams.get("staffId") || "";
  return withPg(async (c) => {
    const where = ["tenant_id = $1"]; const params: any[] = [resolveTenantId(req)]; let pi = 2;
    if (staffId) { where.push(`staff_id = $${pi}::uuid`); params.push(staffId); pi++; }
    const r = await c.query(`SELECT id::text, staff_id::text, location_id::text, day_of_week, available_from, available_to, availability_type, effective_from, effective_to FROM public.crm_staff_availability WHERE ${where.join(" AND ")} ORDER BY day_of_week, available_from`, params);
    return NextResponse.json({ availability: r.rows, total: r.rows.length });
  }).then((r) => r ?? NextResponse.json({ error: "DB unavailable" }, { status: 503 })).catch((e) => NextResponse.json({ error: e?.message }, { status: 500 }));
}
