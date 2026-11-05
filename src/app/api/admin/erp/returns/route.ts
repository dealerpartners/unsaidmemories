import { NextRequest, NextResponse } from "next/server";
import { requireAdminActor } from "@/lib/admin/gate";
import { listReturns, actOnReturn } from "@/lib/orders/erp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/erp/returns?view=all|action_required|awaiting_package|completed
export async function GET(req: NextRequest) {
  const gate = await requireAdminActor();
  if ("error" in gate) return gate.error;
  try {
    const rows = await listReturns(req.nextUrl.searchParams.get("view") || "all");
    return NextResponse.json({ returns: rows });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/admin/erp/returns { rmaId, action: "approve" | "receive" | "complete" }
export async function POST(req: NextRequest) {
  const gate = await requireAdminActor();
  if ("error" in gate) return gate.error;
  const body = await req.json().catch(() => null);
  if (!body?.rmaId || !["approve", "receive", "complete"].includes(body.action)) {
    return NextResponse.json({ error: "rmaId and a valid action are required" }, { status: 400 });
  }
  try {
    const result = await actOnReturn(body.rmaId, body.action, gate.actor.userId);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
