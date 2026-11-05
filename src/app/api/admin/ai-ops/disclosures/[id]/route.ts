import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit";

export const dynamic = "force-dynamic";

const STATUSES = ["active", "archived"];
const COLS = `id, tenant_id, tag, audience, title, body, version, status, created_at, updated_at`;

// PATCH /api/admin/ai-ops/disclosures/[id] -> edit copy (bumps version)
// and/or status. A body or title edit bumps version by 1: the version is
// the registry's record of which disclosure text was in force, so an
// acceptance recorded against a feature can be read against the version
// history this counter represents.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireModuleApi("ai_ops", "write");
  if (denied) return denied;
  const { id } = await ctx.params;
  const b = await req.json().catch(() => ({}));
  const tenant = resolveTenantId(req);

  const hasBody = typeof b.body === "string";
  const hasTitle = typeof b.title === "string";
  const status = b.status !== undefined ? String(b.status).trim() : null;
  if (status !== null && !STATUSES.includes(status)) {
    return NextResponse.json({ error: `status must be one of: ${STATUSES.join(", ")}` }, { status: 400 });
  }
  if (!hasBody && !hasTitle && status === null) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }
  const actorId = await getActorIdFromRequest(req);
  try {
    const out = await withPg(async (c) => {
      const { rows } = await c.query(
        `UPDATE public.ai_disclosures
            SET body = CASE WHEN $2 THEN $3 ELSE body END,
                title = CASE WHEN $4 THEN $5 ELSE title END,
                version = CASE WHEN $2 OR $4 THEN version + 1 ELSE version END,
                status = coalesce($6, status),
                updated_at = now()
          WHERE id = $1::uuid AND (tenant_id IS NULL OR tenant_id = $7)
          RETURNING ${COLS}`,
        [id, hasBody, hasBody ? String(b.body) : null, hasTitle, hasTitle ? String(b.title) : null, status, tenant],
      );
      if (!rows[0]) return null;
      await writeSellerAudit(c, {
        tenantId: tenant,
        actorId,
        action: "ai_disclosure.updated",
        entityType: "ai_disclosure",
        entityId: id,
        afterState: { version: rows[0].version, status: rows[0].status, edited: hasBody || hasTitle },
        ipAddress: requestIp(req),
      });
      return rows[0];
    });
    if (out === null) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    if (!out) return NextResponse.json({ error: "disclosure not found" }, { status: 404 });
    return NextResponse.json({ disclosure: out });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "ai disclosure update failed" }, { status: 500 });
  }
}
