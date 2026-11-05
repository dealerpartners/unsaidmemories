import { NextRequest, NextResponse } from "next/server";
import { requireAdminActor } from "@/lib/admin/gate";
import { getOrderDetail, transitionOrder, addOrderNote } from "@/lib/orders/erp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/erp/orders/[id] — full order detail.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminActor();
  if ("error" in gate) return gate.error;
  const { id } = await params;
  const detail = await getOrderDetail(id);
  if (!detail) return NextResponse.json({ error: "order not found" }, { status: 404 });
  return NextResponse.json(detail);
}

// POST /api/admin/erp/orders/[id] { action: "transition"|"note", ... }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminActor();
  if ("error" in gate) return gate.error;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  try {
    if (body?.action === "transition") {
      if (!body.to) return NextResponse.json({ error: "to is required" }, { status: 400 });
      const result = await transitionOrder(id, body.to, gate.actor.userId, body.reason);
      return NextResponse.json(result);
    }
    if (body?.action === "note") {
      if (!body.body) return NextResponse.json({ error: "body is required" }, { status: 400 });
      await addOrderNote(id, String(body.body), gate.actor.userId, body.noteType || "internal");
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
