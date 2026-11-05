import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";

// GET /api/admin/crm/lead-sources — list active lead sources (1.14)
export async function GET(req: NextRequest) {
  const g = await requireModuleApi("customers", "read");
  if (g) return g;
  return withPg(async (c) => {
    const r = await c.query(
      "SELECT id::text AS id, name FROM public.crm_lead_sources WHERE tenant_id = $1 AND is_active = true ORDER BY name",
      [resolveTenantId(req)]
    );
    return NextResponse.json({ data: r.rows, total: r.rows.length });
  })
    .then((r) => r ?? NextResponse.json({ error: "DB unavailable" }, { status: 503 }))
    .catch((e: any) => NextResponse.json({ error: e?.message }, { status: 500 }));
}
