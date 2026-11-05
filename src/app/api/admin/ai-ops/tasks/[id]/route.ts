import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit";
import { AI_TASK_DECISIONS } from "@/lib/ai-ops/functions";

export const dynamic = "force-dynamic";

// PATCH /api/admin/ai-ops/tasks/[id] -> the HUMAN decision on an AI task.
// Only from state 'proposed' (a decided task does not re-decide — the
// guarded UPDATE matches 0 rows and the route answers 409). Deciding a
// task records that the function's desk used (applied), filed (recorded),
// or rejected (dismissed) the AI output; the consequential act itself
// (sending the reply, approving the application, publishing the
// description, changing the review) happens at the desk, never here.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireModuleApi("ai_ops", "write");
  if (denied) return denied;
  const { id } = await ctx.params;
  const b = await req.json().catch(() => ({}));
  const decision = String(b.decision || "").trim();
  if (!(AI_TASK_DECISIONS as readonly string[]).includes(decision)) {
    return NextResponse.json({ error: `decision must be one of: ${AI_TASK_DECISIONS.join(", ")}` }, { status: 400 });
  }
  const tenant = resolveTenantId(req);
  const actorId = await getActorIdFromRequest(req);
  try {
    const out = await withPg(async (c) => {
      const { rows } = await c.query(
        `UPDATE public.ai_tasks
            SET state = $3, decided_by = $4::uuid, decided_at = now(), updated_at = now()
          WHERE tenant_id = $1 AND id = $2::uuid AND state = 'proposed'
          RETURNING id, function, state, decided_by, decided_at`,
        [tenant, id, decision, actorId],
      );
      if (!rows[0]) return null;
      await writeSellerAudit(c, {
        tenantId: tenant,
        actorId,
        action: "ai_task.decided",
        entityType: "ai_task",
        entityId: id,
        afterState: { decision, function: rows[0].function },
        ipAddress: requestIp(req),
      });
      return rows[0];
    });
    if (out === null) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    if (!out) return NextResponse.json({ error: "task not found or already decided" }, { status: 409 });
    return NextResponse.json({ task: out });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "ai task decision failed" }, { status: 500 });
  }
}
