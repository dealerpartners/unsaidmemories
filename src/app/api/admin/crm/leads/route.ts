import { NextResponse } from "next/server";
import { requireCrmAdmin } from "@/lib/admin/gate";
import { getDb, getTenantId } from "@/lib/crm/data";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gate = await requireCrmAdmin(req);
  if ("response" in gate) return gate.response;
  const db = getDb();
  const tenantId = await getTenantId(db);
  const url = new URL(req.url);
  let query = db.from("crm_leads").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(200);
  const status = url.searchParams.get("status");
  const source = url.searchParams.get("source");
  const q = url.searchParams.get("q");
  if (status) query = query.eq("status", status);
  if (source) query = query.eq("lead_source", source);
  if (q) query = query.or(`contact_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ leads: data || [] });
}

export async function POST(req: Request) {
  const gate = await requireCrmAdmin(req);
  if ("response" in gate) return gate.response;
  const body = await req.json().catch(() => null);
  if (!body?.contact_name && !body?.email && !body?.phone) {
    return NextResponse.json({ error: "A contact name, email, or phone is required." }, { status: 400 });
  }
  const db = getDb();
  const tenantId = await getTenantId(db);
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("crm_leads")
    .insert({
      tenant_id: tenantId,
      contact_name: body.contact_name || null,
      email: body.email || null,
      phone: body.phone || null,
      lead_source: body.lead_source || "website",
      lead_type: body.lead_type || "custom_order",
      status: body.status || "new",
      notes: body.notes || null,
      first_contact_at: now,
      last_activity_at: now,
      next_follow_up_at: body.next_follow_up_at || null,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
