import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
export async function GET(req: NextRequest) {
  const g = await requireModuleApi("customers", "read"); if (g) return g;
  const scope = new URL(req.url).searchParams.get("scope"); // customer | pet — filters crm_tags.description
  return withPg(async (c) => {
    const params: any[] = [resolveTenantId(req)];
    let sql = "SELECT id::text AS id, name, color, description FROM public.crm_tags WHERE tenant_id = $1";
    if (scope === "customer" || scope === "pet") {
      sql += " AND description = $2";
      params.push(scope);
    }
    sql += " ORDER BY name";
    const r = await c.query(sql, params);
    return NextResponse.json({ tags: r.rows, total: r.rows.length });
  }).then((r) => r ?? NextResponse.json({ error: "DB unavailable" }, { status: 503 })).catch((e) => NextResponse.json({ error: e?.message }, { status: 500 }));
}
