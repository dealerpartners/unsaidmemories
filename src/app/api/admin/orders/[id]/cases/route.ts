import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { loadOrder } from "@/lib/orders/lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// /api/admin/orders/[id]/cases — customer-issue cases on an order.
//   GET  → every case attached to this order (newest first).
//   POST { subject, reason?, note? } → open a case. The case is attached to
//        the order AND the customer (id + email copied from the order row),
//        so the same case shows on the customer profile.
// Table: public.order_cases (see supabase/migrations/20261013_order_cases.sql)
// ============================================================================

const CASE_COLS = `id::text AS id, order_id, customer_id, customer_email, subject, reason,
  note, status, resolution_note, created_by, created_at::text AS created_at,
  updated_at::text AS updated_at, closed_at::text AS closed_at, closed_by`;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireModuleApi("orders", "read");
  if (gate) return gate;

  const { id } = await params;
  const tenant = resolveTenantId(req);

  const rows = await withPg(async (client) => {
    const r = await client.query(
      `SELECT ${CASE_COLS} FROM public.order_cases
        WHERE tenant_id = $1 AND order_id = $2
        ORDER BY created_at DESC`,
      [tenant, id]
    );
    return r.rows;
  });

  return NextResponse.json({ data: rows || [], total: (rows || []).length });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireModuleApi("orders", "write");
  if (gate) return gate;

  const { id } = await params;
  const tenant = resolveTenantId(req);
  const body = await req.json().catch(() => ({}));
  const subject = String(body?.subject || "").trim();
  if (!subject) {
    return NextResponse.json({ error: "A case subject is required." }, { status: 400 });
  }
  const reason = String(body?.reason || "").trim() || null;
  const note = String(body?.note || "").trim() || null;

  const created = await withPg(async (client) => {
    const order = await loadOrder(client, tenant, id);
    if (!order) return null;
    const r = await client.query(
      `INSERT INTO public.order_cases
         (tenant_id, order_id, customer_id, customer_email, subject, reason, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${CASE_COLS}`,
      [
        tenant,
        id,
        order.customer_id || null,
        order.customer_email_resolved || null,
        subject.slice(0, 300),
        reason ? reason.slice(0, 120) : null,
        note ? note.slice(0, 4000) : null,
      ]
    );
    return r.rows[0] || null;
  });

  if (!created) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, data: created }, { status: 201 });
}
