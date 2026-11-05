import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
export async function GET(req: NextRequest) {
  const g = await requireModuleApi("customers", "read"); if (g) return g;
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "200") || 200, 500);
  return withPg(async (c) => {
    // Real columns only — this query previously selected event_data and
    // created_at, neither of which exists on crm_funnel_events (the
    // payload column is `metadata`, the timestamp is `occurred_at`), so
    // it 500'd on every call.
    const r = await c.query("SELECT id::text, customer_id::text, anonymous_session_id, event_type, source, landing_page, occurred_at::text AS occurred_at, metadata FROM public.crm_funnel_events WHERE tenant_id = $1 ORDER BY occurred_at DESC LIMIT $2", [resolveTenantId(req), limit]);
    return NextResponse.json({ events: r.rows, total: r.rows.length });
  }).then((r) => r ?? NextResponse.json({ error: "DB unavailable" }, { status: 503 })).catch((e) => NextResponse.json({ error: e?.message }, { status: 500 }));
}
