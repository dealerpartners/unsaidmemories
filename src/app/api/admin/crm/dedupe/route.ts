import { NextResponse } from "next/server";
import { requireCrmAdmin } from "@/lib/admin/gate";
import { getDb, getTenantId, customerName } from "@/lib/crm/data";

export const dynamic = "force-dynamic";

/**
 * Duplicate detection: groups of live customers sharing a normalized email
 * or phone, plus customers missing contact information entirely.
 */
export async function GET(req: Request) {
  const gate = await requireCrmAdmin(req);
  if ("response" in gate) return gate.response;
  const db = getDb();
  const tenantId = await getTenantId(db);
  const { data, error } = await db
    .from("crm_customers")
    .select("id, first_name, last_name, company_name, email, phone, mobile_phone, created_at, lifetime_value, last_activity_at")
    .eq("tenant_id", tenantId)
    .is("merged_into_customer_id", null)
    .order("created_at", { ascending: true })
    .limit(2000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data || []) as {
    id: string; first_name: string | null; last_name: string | null; company_name: string | null;
    email: string | null; phone: string | null; mobile_phone: string | null;
    created_at: string; lifetime_value: number | null; last_activity_at: string | null;
  }[];

  const byKey = new Map<string, typeof rows>();
  const missingContact: typeof rows = [];
  for (const r of rows) {
    const email = (r.email || "").trim().toLowerCase();
    const phone = (r.mobile_phone || r.phone || "").replace(/\D/g, "");
    if (email) {
      const arr = byKey.get(`email:${email}`) || [];
      arr.push(r);
      byKey.set(`email:${email}`, arr);
    }
    if (phone.length >= 7) {
      const arr = byKey.get(`phone:${phone}`) || [];
      arr.push(r);
      byKey.set(`phone:${phone}`, arr);
    }
    if (!email && !phone) missingContact.push(r);
  }
  const groups = [...byKey.entries()]
    .filter(([, arr]) => arr.length > 1)
    .map(([key, arr]) => ({
      key,
      match: key.split(":")[0],
      value: key.slice(key.indexOf(":") + 1),
      customers: arr.map((r) => ({ ...r, name: customerName(r as never) })),
    }));

  const missingEmail = rows.filter((r) => !r.email).length;
  const missingPhone = rows.filter((r) => !r.phone && !r.mobile_phone).length;
  return NextResponse.json({
    groups,
    missing_contact: missingContact.map((r) => ({ ...r, name: customerName(r as never) })),
    stats: { customers_scanned: rows.length, duplicate_groups: groups.length, missing_email: missingEmail, missing_phone: missingPhone, missing_both: missingContact.length },
  });
}
