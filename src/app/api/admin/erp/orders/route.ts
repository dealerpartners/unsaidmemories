import { NextRequest, NextResponse } from "next/server";
import { requireAdminActor } from "@/lib/admin/gate";
import { listOrders, createManualOrder } from "@/lib/orders/erp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/erp/orders?view=all|unfulfilled|ready|pickup|shipped|delivered&q=&page=
export async function GET(req: NextRequest) {
  const gate = await requireAdminActor();
  if ("error" in gate) return gate.error;
  const sp = req.nextUrl.searchParams;
  try {
    const result = await listOrders({
      view: sp.get("view") || "all",
      search: sp.get("q") || undefined,
      page: Number(sp.get("page") || 1),
    });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/admin/erp/orders — create a manual order.
export async function POST(req: NextRequest) {
  const gate = await requireAdminActor();
  if ("error" in gate) return gate.error;
  const body = await req.json().catch(() => null);
  if (!body?.customerEmail || !Array.isArray(body.lines) || !body.lines.length) {
    return NextResponse.json({ error: "customerEmail and at least one line are required" }, { status: 400 });
  }
  try {
    const order = await createManualOrder({
      customerEmail: body.customerEmail,
      fulfillmentMethod: body.fulfillmentMethod || "ship",
      lines: body.lines,
      actorId: gate.actor.userId,
    });
    return NextResponse.json({ order }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
