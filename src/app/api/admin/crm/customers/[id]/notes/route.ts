import { NextResponse } from "next/server";
import { requireCrmAdmin } from "@/lib/admin/gate";
import { getDb, getTenantId } from "@/lib/crm/data";

export const dynamic = "force-dynamic";

const NOTE_TYPES = ["internal", "customer", "system"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireCrmAdmin(req);
  if ("response" in gate) return gate.response;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body?.body?.trim()) return NextResponse.json({ error: "Note body is required." }, { status: 400 });
  const db = getDb();
  const tenantId = await getTenantId(db);
  const { data, error } = await db
    .from("crm_notes")
    .insert({
      tenant_id: tenantId,
      customer_id: id,
      created_by: gate.admin.userId,
      note_type: NOTE_TYPES.includes(body.note_type) ? body.note_type : "internal",
      body: body.body.trim(),
      is_pinned: Boolean(body.is_pinned),
      order_id: body.order_id || null,
    })
    .select("id, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await db.from("crm_customers").update({ last_activity_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ id: data.id, created_at: data.created_at }, { status: 201 });
}
