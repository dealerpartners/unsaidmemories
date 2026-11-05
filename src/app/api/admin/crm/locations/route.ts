import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
export async function GET(req: NextRequest) {
  const g = await requireModuleApi("administration", "read"); if (g) return g;
  return withPg(async (c) => {
    const r = await c.query("SELECT id::text, name, code, address_line1, address_line2, city, state, postal_code, country, phone, email, is_active FROM public.crm_locations WHERE tenant_id = $1 ORDER BY name", [resolveTenantId(req)]);
    return NextResponse.json({ locations: r.rows, total: r.rows.length });
  }).then((r) => r ?? NextResponse.json({ error: "DB unavailable" }, { status: 503 })).catch((e) => NextResponse.json({ error: e?.message }, { status: 500 }));
}
