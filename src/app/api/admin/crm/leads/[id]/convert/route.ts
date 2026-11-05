import { NextResponse } from "next/server";
import { requireCrmAdmin } from "@/lib/admin/gate";
import { getDb, getTenantId } from "@/lib/crm/data";

export const dynamic = "force-dynamic";

/** Convert a lead into a customer (or link it to the existing customer with the same email). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireCrmAdmin(req);
  if ("response" in gate) return gate.response;
  const { id } = await params;
  const db = getDb();
  const tenantId = await getTenantId(db);
  const { data: lead, error } = await db.from("crm_leads").select("*").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  const L = lead as {
    email: string | null; phone: string | null; contact_name: string | null;
    lead_source: string | null; customer_id: string | null; notes: string | null;
  };
  if (L.customer_id) return NextResponse.json({ ok: true, customer_id: L.customer_id, already: true });

  let customerId: string | null = null;
  if (L.email) {
    const { data: existing } = await db
      .from("crm_customers")
      .select("id")
      .eq("tenant_id", tenantId)
      .ilike("email", L.email)
      .is("merged_into_customer_id", null)
      .maybeSingle();
    if (existing) customerId = (existing as { id: string }).id;
  }
  if (!customerId) {
    const parts = (L.contact_name || "").trim().split(/\s+/);
    const { data: created, error: cErr } = await db
      .from("crm_customers")
      .insert({
        tenant_id: tenantId,
        first_name: parts[0] || null,
        last_name: parts.slice(1).join(" ") || null,
        email: L.email,
        phone: L.phone,
        customer_type: "individual",
        lifecycle_stage: "new_customer",
        lifecycle_status: "healthy",
        lead_status: "converted",
        conversion_date: new Date().toISOString().slice(0, 10),
        customer_since: new Date().toISOString().slice(0, 10),
        first_contact_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
        marketing_email_opt_in: true,
        transactional_email_opt_in: true,
        is_active: true,
      })
      .select("id")
      .single();
    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
    customerId = (created as { id: string }).id;
  }

  const now = new Date().toISOString();
  const { error: uErr } = await db
    .from("crm_leads")
    .update({ customer_id: customerId, status: "converted", booking_outcome: "booked", conversion_date: now, updated_at: now })
    .eq("id", id);
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });
  await db.from("crm_notes").insert({
    tenant_id: tenantId, customer_id: customerId, created_by: gate.admin.userId,
    note_type: "system", body: `Converted from lead (${L.lead_source || "unknown source"}).${L.notes ? ` Lead notes: ${L.notes}` : ""}`,
  });
  return NextResponse.json({ ok: true, customer_id: customerId });
}
