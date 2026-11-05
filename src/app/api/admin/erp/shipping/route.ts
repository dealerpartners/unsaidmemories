import { NextRequest, NextResponse } from "next/server";
import { requireAdminActor } from "@/lib/admin/gate";
import { listShipments, createShipmentLabel } from "@/lib/orders/erp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/erp/shipping — label station list.
export async function GET() {
  const gate = await requireAdminActor();
  if ("error" in gate) return gate.error;
  try {
    const shipments = await listShipments();
    return NextResponse.json({ shipments });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/admin/erp/shipping { fulfillmentId, carrier, trackingNumber }
// Records a purchased label. A fulfillment that already carries a label is
// refused — a second label would overwrite paid tracking (UnSaid Memories label rule).
export async function POST(req: NextRequest) {
  const gate = await requireAdminActor();
  if ("error" in gate) return gate.error;
  const body = await req.json().catch(() => null);
  if (!body?.fulfillmentId || !body?.carrier || !body?.trackingNumber) {
    return NextResponse.json({ error: "fulfillmentId, carrier and trackingNumber are required" }, { status: 400 });
  }
  try {
    const shipment = await createShipmentLabel({
      fulfillmentId: body.fulfillmentId, carrier: body.carrier,
      trackingNumber: body.trackingNumber, actorId: gate.actor.userId,
    });
    return NextResponse.json({ shipment }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
