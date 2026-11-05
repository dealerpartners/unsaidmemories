import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { platformMetrics } from "@/lib/analytics/platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/analytics/platform — Admin tree I1 · PLATFORM METRICS
// (GMV · Orders · Returns · Refunds · Revenue). Computed at read from the
// real commerce rows; every figure carries its derivation. Gate matches
// the gate the existing analytics routes run on ('reports', per
// /api/admin/reports and /api/admin/analytics/actions). Census + source
// populations: src/lib/analytics/platform.ts header.
export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("reports", "read");
  if (gate) return gate;
  const tenant = resolveTenantId(req);
  const result = await withPg(async (client) => platformMetrics(client, tenant));
  if (!result) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  return NextResponse.json({ section: "I1", tenant, ...result });
}
