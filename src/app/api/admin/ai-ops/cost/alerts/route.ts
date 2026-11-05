import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { checkAndAlertBudget, lastBudgetAlert } from "@/lib/ai/budget-alerts";

export const dynamic = "force-dynamic";

// J5 · Budget alert delivery. POST runs the check: when recorded 30-day AI
// spend is over the recorded monthly budget and the current period has no
// alert yet, it records the alert (ai_budget_alerts) and notifies the
// tenant's active staff via employee_notifications — once per period.
// GET returns the tenant's most recent recorded alert (or null).

export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("ai_ops", "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  try {
    const out = await withPg(async (c) => ({ lastAlert: await lastBudgetAlert(c, tenant) }));
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "budget alert read failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("ai_ops", "write");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  const actorId = await getActorIdFromRequest(req);
  try {
    const out = await withPg(async (c) => checkAndAlertBudget(c, tenant, actorId));
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "budget alert check failed (is migration 20261108 applied?)" },
      { status: 500 }
    );
  }
}
