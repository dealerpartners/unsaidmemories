import { NextResponse } from "next/server";
import { requireAdmin, isError } from "@/lib/admin/gate";
import { db, T, logEvent } from "@/lib/trust/support";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(req);
  if (isError(gate)) return gate;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const minutes = Number(body.minutes);
  if (!minutes || minutes <= 0) return NextResponse.json({ error: "minutes must be positive" }, { status: 400 });
  const sb = db();
  const { data: ticket } = await sb.from("support_tickets").select("time_spent_seconds").eq("id", id).eq("tenant_id", T()).single();
  if (!ticket) return NextResponse.json({ error: "ticket not found" }, { status: 404 });
  const total = (ticket.time_spent_seconds ?? 0) + Math.round(minutes * 60);
  await sb.from("support_tickets").update({ time_spent_seconds: total, updated_at: new Date().toISOString() }).eq("id", id);
  await logEvent(id, "time_logged", { summary: `${minutes}m logged (total ${Math.round(total / 60)}m)`, minutes }, { staffId: gate.portalUserId, label: gate.displayName || gate.email });
  return NextResponse.json({ ok: true, time_spent_seconds: total });
}
