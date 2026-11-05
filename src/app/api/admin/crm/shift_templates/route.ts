import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
export async function GET(req: NextRequest) {
  const g = await requireModuleApi("staff_groomer_management", "read"); if (g) return g;
  return withPg(async (c) => {
    const r = await c.query("SELECT id::text, name, location_id::text, day_of_week, starts_at, ends_at, break_minutes, role, required_headcount, color_label, is_active FROM public.crm_shift_templates WHERE tenant_id = $1 ORDER BY day_of_week, starts_at", [resolveTenantId(req)]);
    return NextResponse.json({ shifts: r.rows, total: r.rows.length });
  }).then((r) => r ?? NextResponse.json({ error: "DB unavailable" }, { status: 503 })).catch((e) => NextResponse.json({ error: e?.message }, { status: 500 }));
}
