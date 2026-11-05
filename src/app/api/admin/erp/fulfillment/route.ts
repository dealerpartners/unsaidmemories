import { NextRequest, NextResponse } from "next/server";
import { requireAdminActor } from "@/lib/admin/gate";
import { listFulfillment, advanceFulfillment } from "@/lib/orders/erp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/erp/fulfillment?queue=unfulfilled|rush|ready|packed|pickup|shipped_today|dispatched
export async function GET(req: NextRequest) {
  const gate = await requireAdminActor();
  if ("error" in gate) return gate.error;
  try {
    const rows = await listFulfillment(req.nextUrl.searchParams.get("queue") || "unfulfilled");
    return NextResponse.json({ fulfillments: rows });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/admin/erp/fulfillment { fulfillmentId, to }
export async function POST(req: NextRequest) {
  const gate = await requireAdminActor();
  if ("error" in gate) return gate.error;
  const body = await req.json().catch(() => null);
  if (!body?.fulfillmentId || !body?.to) {
    return NextResponse.json({ error: "fulfillmentId and to are required" }, { status: 400 });
  }
  try {
    const result = await advanceFulfillment(body.fulfillmentId, body.to);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
