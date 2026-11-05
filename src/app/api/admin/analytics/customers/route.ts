import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { customerAnalytics } from "@/lib/analytics/platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/analytics/customers — Admin tree I3 · CUSTOMER ANALYTICS
// (Cohorts · Lifetime value · Churn · Search behavior — ADMIN PORTAL only
// per the tree). Computed at read from crm_customers + their real
// activity records; the Search behavior leaf reads public.search_events
// (recorded by the header search — migration 20261100; stated absence
// only until that store lands). Gate:
// 'reports' read, matching the existing analytics routes.
export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("reports", "read");
  if (gate) return gate;
  const tenant = resolveTenantId(req);
  const result = await withPg(async (client) => customerAnalytics(client, tenant));
  if (!result) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  return NextResponse.json({ section: "I3", tenant, ...result });
}
