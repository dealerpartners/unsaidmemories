import { NextResponse } from "next/server";
import { requireCrmAdmin } from "@/lib/admin/gate";
import { getDb, getTenantId } from "@/lib/crm/data";

export const dynamic = "force-dynamic";

/** Opt-in / opt-out settings + communication preferences for one customer. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireCrmAdmin(req);
  if ("response" in gate) return gate.response;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  const db = getDb();
  const tenantId = await getTenantId(db);

  const flags = [
    "marketing_email_opt_in", "marketing_sms_opt_in", "transactional_email_opt_in",
    "transactional_sms_opt_in", "do_not_call", "do_not_contact",
  ];
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const f of flags) if (f in body) patch[f] = Boolean(body[f]);
  if (Object.keys(patch).length > 1) {
    const { error } = await db.from("crm_customers").update(patch).eq("tenant_id", tenantId).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const prefFields = [
    "preferred_payment_method", "communication_notes", "special_handling_notes",
    "preferred_style_notes", "notification_frequency",
  ];
  const prefPatch: Record<string, unknown> = {};
  for (const f of prefFields) if (f in body) prefPatch[f] = body[f] || null;
  if (Object.keys(prefPatch).length) {
    const { error } = await db
      .from("crm_customer_preferences")
      .upsert(
        { customer_id: id, tenant_id: tenantId, updated_at: new Date().toISOString(), ...prefPatch },
        { onConflict: "customer_id" }
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
