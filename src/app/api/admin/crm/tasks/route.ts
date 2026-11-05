import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgExec, pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /api/admin/crm/tasks — the crm_tasks store's read/manage legs.
// Audit §1.4.6i: crm_tasks existed with no writer and no reader on any
// leg. The writer is the appointments `follow_up` action; open follow-up
// tasks also surface in the needs-attention feed. This route is the
// management surface: list the tenant's tasks and move them through
// their lifecycle (open → in_progress → completed / snoozed).
//
// GET  ?status=open&customer_id=<uuid>&limit=100
// PATCH { id, status: 'in_progress'|'completed'|'snoozed'|'open',
//         snoozed_until?, due_at?, assigned_to? }

const PATCHABLE_STATUSES = ["open", "in_progress", "completed", "cancelled", "snoozed"];

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("appointments", "read");
  if (gate) return gate;
  const tenant = resolveTenantId(req);
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const customerId = searchParams.get("customer_id");
  const limit = Math.min(Number(searchParams.get("limit") || 100) || 100, 500);
  try {
    const rows = await pgQuery(
      `SELECT t.id::text AS id, t.customer_id::text AS customer_id,
              t.lead_id::text AS lead_id, t.appointment_id::text AS appointment_id,
              t.assigned_to::text AS assigned_to, t.task_type, t.priority,
              t.title, t.description, t.due_at, t.status, t.completed_at,
              t.snoozed_until, t.created_at, t.updated_at,
              NULLIF(trim(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), '') AS customer_name
         FROM public.crm_tasks t
         LEFT JOIN public.crm_customers c ON c.id = t.customer_id AND c.tenant_id = t.tenant_id
        WHERE t.tenant_id = $1
          AND ($2::text IS NULL OR t.status = $2)
          AND ($3::uuid IS NULL OR t.customer_id = $3)
        ORDER BY (t.status IN ('open','in_progress')) DESC, t.due_at ASC NULLS LAST, t.created_at DESC
        LIMIT $4`,
      [tenant, status, customerId, limit],
    );
    return NextResponse.json({ data: rows, total: rows.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to list tasks" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireModuleApi("appointments", "write");
  if (gate) return gate;
  const tenant = resolveTenantId(req);
  const body = await req.json().catch(() => null);
  const id = body?.id ? String(body.id) : "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const status = body?.status ? String(body.status) : null;
  if (status && !PATCHABLE_STATUSES.includes(status)) {
    return NextResponse.json({ error: `status must be one of ${PATCHABLE_STATUSES.join(", ")}` }, { status: 400 });
  }
  try {
    const updated = await pgExec(
      `UPDATE public.crm_tasks
          SET status = COALESCE($3, status),
              completed_at = CASE WHEN $3 = 'completed' THEN now() WHEN $3 IN ('open','in_progress') THEN NULL ELSE completed_at END,
              snoozed_until = CASE WHEN $3 = 'snoozed' THEN COALESCE($4::timestamptz, now() + interval '1 day') WHEN $3 IN ('open','in_progress','completed') THEN NULL ELSE snoozed_until END,
              due_at = COALESCE($5::timestamptz, due_at),
              assigned_to = COALESCE($6::uuid, assigned_to),
              updated_at = now()
        WHERE id = $1::uuid AND tenant_id = $2`,
      [id, tenant, status, body?.snoozed_until ?? null, body?.due_at ?? null, body?.assigned_to ?? null],
    );
    if (!updated) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    return NextResponse.json({ ok: true, id, status });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to update task" }, { status: 500 });
  }
}
