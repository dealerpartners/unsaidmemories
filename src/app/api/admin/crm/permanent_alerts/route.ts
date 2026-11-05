import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";

// /api/admin/crm/permanent_alerts — permanent (pet handling) alerts (1.18)
// Real columns on crm_permanent_alerts: severity ('info'|'warning'|'critical'),
// title, body — there is NO alert_type column (the old GET selected it and
// could only 500). GET lists active alerts for a customer and/or pet;
// POST creates one.

const SEVERITIES = new Set(["info", "warning", "critical"]);
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v || "");

export async function GET(req: NextRequest) {
  const g = await requireModuleApi("customers", "read"); if (g) return g;
  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get("customerId") || "";
  const petId = searchParams.get("petId") || "";
  return withPg(async (c) => {
    const where = ["tenant_id = $1"]; const params: any[] = [resolveTenantId(req)]; let pi = 2;
    if (customerId && isUuid(customerId)) { where.push(`customer_id = $${pi}::uuid`); params.push(customerId); pi++; }
    if (petId && isUuid(petId)) { where.push(`dependent_id = $${pi}::uuid`); params.push(petId); pi++; }
    const r = await c.query(`SELECT id::text, customer_id::text, dependent_id::text, severity, title, body, is_active, created_at FROM public.crm_permanent_alerts WHERE ${where.join(" AND ")} ORDER BY created_at DESC`, params);
    return NextResponse.json({ alerts: r.rows, total: r.rows.length });
  }).then((r) => r ?? NextResponse.json({ error: "DB unavailable" }, { status: 503 })).catch((e) => NextResponse.json({ error: e?.message }, { status: 500 }));
}

export async function POST(req: NextRequest) {
  const g = await requireModuleApi("customers", "write"); if (g) return g;
  const body = await req.json().catch(() => null);
  const title = String(body?.title || "").trim();
  const text = String(body?.body || "").trim();
  if (!title || !text) return NextResponse.json({ error: "title and body required" }, { status: 400 });
  const customerId = body?.customer_id && isUuid(String(body.customer_id)) ? String(body.customer_id) : null;
  const petId = body?.dependent_id && isUuid(String(body.dependent_id)) ? String(body.dependent_id) : null;
  if (!customerId && !petId) return NextResponse.json({ error: "customer_id or dependent_id required" }, { status: 400 });
  const severity = SEVERITIES.has(String(body?.severity || "")) ? String(body.severity) : "warning";
  return withPg(async (c) => {
    const r = await c.query(
      `INSERT INTO public.crm_permanent_alerts (tenant_id, customer_id, dependent_id, severity, title, body)
       VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6)
       RETURNING id::text, customer_id::text, dependent_id::text, severity, title, body, is_active, created_at`,
      [resolveTenantId(req), customerId, petId, severity, title, text]
    );
    // Failed-insert honesty: an empty RETURNING result must never reach 201.
    if (!r.rows[0]) return NextResponse.json({ error: "Alert could not be created" }, { status: 500 });
    return NextResponse.json({ alert: r.rows[0] }, { status: 201 });
  }).then((r) => r ?? NextResponse.json({ error: "DB unavailable" }, { status: 503 })).catch((e) => NextResponse.json({ error: e?.message }, { status: 500 }));
}
