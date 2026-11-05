import { NextResponse } from "next/server";
import { requireCrmAdmin } from "@/lib/admin/gate";
import { getDb, getTenantId } from "@/lib/crm/data";

export const dynamic = "force-dynamic";

const LOST_REASONS = ["price", "schedule", "location", "no_availability", "found_another_maker", "other"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireCrmAdmin(req);
  if ("response" in gate) return gate.response;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), last_activity_at: new Date().toISOString() };
  for (const k of ["status", "booking_outcome", "notes", "next_follow_up_at", "lead_source", "lead_type", "contact_name", "email", "phone"]) {
    if (k in body) patch[k] = body[k] === "" ? null : body[k];
  }
  if ("lost_reason" in body) {
    patch.lost_reason = LOST_REASONS.includes(body.lost_reason) ? body.lost_reason : "other";
    patch.status = "lost";
  }
  if (body.status === "lost" && !patch.lost_reason) patch.lost_reason = "other";
  const db = getDb();
  const tenantId = await getTenantId(db);
  const { error } = await db.from("crm_leads").update(patch).eq("tenant_id", tenantId).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireCrmAdmin(req);
  if ("response" in gate) return gate.response;
  const { id } = await params;
  const db = getDb();
  const tenantId = await getTenantId(db);
  const { error } = await db.from("crm_leads").delete().eq("tenant_id", tenantId).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
