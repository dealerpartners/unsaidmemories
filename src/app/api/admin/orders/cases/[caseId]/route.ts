import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// PATCH /api/admin/orders/cases/[caseId] — update an order case from either
// surface (order detail or customer profile); both write the same row.
//   { status: "closed", resolution_note? } → closes (stamps closed_at)
//   { status: "open" }                     → reopens (clears closed_at)
//   { note }                               → replaces the case note
// ============================================================================

const CASE_COLS = `id::text AS id, order_id, customer_id, customer_email, subject, reason,
  note, status, resolution_note, created_by, created_at::text AS created_at,
  updated_at::text AS updated_at, closed_at::text AS closed_at, closed_by`;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  const gate = await requireModuleApi("orders", "write");
  if (gate) return gate;

  const { caseId } = await params;
  const tenant = resolveTenantId(req);
  const body = await req.json().catch(() => ({}));

  const sets: string[] = ["updated_at = now()"];
  const vals: any[] = [];
  const push = (sql: string, v: any) => {
    vals.push(v);
    sets.push(sql.replace("?", `$${vals.length}`));
  };

  if (body?.status === "closed") {
    sets.push("status = 'closed'", "closed_at = now()");
    if (body?.resolution_note != null) push("resolution_note = ?", String(body.resolution_note).slice(0, 4000));
  } else if (body?.status === "open") {
    sets.push("status = 'open'", "closed_at = NULL");
  } else if (body?.status != null) {
    return NextResponse.json({ error: `Unknown case status "${body.status}"` }, { status: 400 });
  }
  if (body?.note != null) push("note = ?", String(body.note).slice(0, 4000));
  if (body?.resolution_note != null && body?.status !== "closed") {
    push("resolution_note = ?", String(body.resolution_note).slice(0, 4000));
  }

  const row = await withPg(async (client) => {
    vals.push(caseId, tenant);
    const r = await client.query(
      `UPDATE public.order_cases SET ${sets.join(", ")}
        WHERE id = $${vals.length - 1}::uuid AND tenant_id = $${vals.length}
        RETURNING ${CASE_COLS}`,
      vals
    );
    return r.rows[0] || null;
  });

  if (!row) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, data: row });
}
