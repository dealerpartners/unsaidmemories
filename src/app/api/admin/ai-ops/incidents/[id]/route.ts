import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit";

export const dynamic = "force-dynamic";

const STATUSES = ["open", "investigating", "resolved"];
const TEXT_FIELDS = ["root_cause", "remediation", "post_mortem"] as const;

// PATCH /api/admin/ai-ops/incidents/[id] -> move incident status and/or
// record the J4 fields (root cause · remediation · post-mortem). A text
// field set to a string records it; set to null clears it. At least one
// change is required.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireModuleApi("ai_ops", "write");
  if (denied) return denied;
  const { id } = await ctx.params;
  const b = await req.json().catch(() => ({}));
  const status = b.status !== undefined ? String(b.status || "").trim() : null;
  if (status !== null && !STATUSES.includes(status)) {
    return NextResponse.json({ error: `status must be one of: ${STATUSES.join(", ")}` }, { status: 400 });
  }
  const textUpdates = TEXT_FIELDS.filter((f) => b[f] !== undefined);
  for (const f of textUpdates) {
    if (b[f] !== null && typeof b[f] !== "string") {
      return NextResponse.json({ error: `${f} must be a string or null` }, { status: 400 });
    }
  }
  if (status === null && textUpdates.length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }
  const tenant = resolveTenantId(req);
  const actorId = await getActorIdFromRequest(req);
  try {
    const out = await withPg(async (c) => {
      const sets = ["updated_at = now()"];
      const params: unknown[] = [tenant, id];
      if (status !== null) { params.push(status); sets.push(`status = $${params.length}`); }
      for (const f of textUpdates) {
        params.push(b[f] === null ? null : String(b[f]));
        sets.push(`${f} = $${params.length}`);
      }
      const { rows } = await c.query(
        `UPDATE public.ai_incidents SET ${sets.join(", ")}
          WHERE tenant_id = $1 AND id = $2::uuid
          RETURNING id, status, root_cause, remediation, post_mortem`,
        params,
      );
      if (rows[0]) {
        await writeSellerAudit(c, {
          tenantId: tenant,
          actorId,
          action: "ai_incident.updated",
          entityType: "ai_incident",
          entityId: id,
          afterState: { status: rows[0].status, fields: textUpdates },
          ipAddress: requestIp(req),
        });
      }
      return rows[0] || null;
    });
    if (out === null) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    if (!out) return NextResponse.json({ error: "incident not found" }, { status: 404 });
    return NextResponse.json({ incident: out });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "ai incident update failed" }, { status: 500 });
  }
}
