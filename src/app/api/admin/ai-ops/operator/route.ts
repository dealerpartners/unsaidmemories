import { NextRequest, NextResponse } from "next/server";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { resolveTenantId } from "@/lib/admin-api";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import {
  getOperatorOverview,
  runFraudScan,
  OperatorRefusal,
} from "@/lib/ai-ops/operator";

// ---------------------------------------------------------------------------
// /api/admin/ai-ops/operator — the AI operator (§J's deepening).
//
// GET: the operator overview — the last scan run, the open detections
// (each with its evidence + cited policy), the register responses, the
// citation seats, the taxonomy parents for the category builder, the
// seller list for the risk files, and the watch state (reviews live;
// social comments NOT connected — named, never faked).
//
// POST { act: "run_scan" }: the fraud scanner pass. Deterministic
// signals over recorded facts; each detection lands as an ai_tasks
// fraud_scan row in state 'proposed', plus the run record.
// ---------------------------------------------------------------------------

function refusalResponse(e: unknown) {
  if (e instanceof OperatorRefusal) {
    const status = e.kind === "missing" ? 404 : e.kind === "state" ? 409 : 400;
    return NextResponse.json({ error: e.message }, { status });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("ai_ops", "read");
  if (denied) return denied;
  const data = await withPg(async (c) => {
    const tenant = await resolveTenantId(c as any);
    return getOperatorOverview(c as any, tenant);
  });
  if (!data) return NextResponse.json({ error: "Operator read failed." }, { status: 500 });
  return NextResponse.json({ ok: true, ...data });
}

export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("ai_ops", "write");
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  if (body?.act !== "run_scan") {
    return NextResponse.json(
      { error: "act must be 'run_scan'." },
      { status: 400 },
    );
  }
  const actorId = await getActorIdFromRequest(req);
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  try {
    const result = await withPg(async (c) => {
      const tenant = await resolveTenantId(c as any);
      return runFraudScan(c as any, tenant, actorId, ip);
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const r = refusalResponse(e);
    if (r) return r;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Scan failed." },
      { status: 500 },
    );
  }
}
