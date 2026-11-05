import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit";
import { snapshotAiVersion, readAiVersionHistory } from "@/lib/ai/version-history";

export const dynamic = "force-dynamic";

const STATUSES = ["draft", "active", "archived"];

const PROMPT_COLS = `id, name, feature, prompt_text, version, status, created_at, updated_at`;

// GET /api/admin/ai-ops/prompts/[id] -> the prompt + its version history
// (J2: every prior (version, prompt_text) snapshotted before an edit;
// the live row is the current version).
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireModuleApi("ai_ops", "read");
  if (denied) return denied;
  const { id } = await ctx.params;
  const tenant = resolveTenantId(req);
  try {
    const out = await withPg(async (c) => {
      const { rows } = await c.query(
        `SELECT ${PROMPT_COLS} FROM public.ai_prompts WHERE tenant_id = $1 AND id = $2::uuid`,
        [tenant, id]
      );
      if (!rows[0]) return { missing: true as const };
      const history = await readAiVersionHistory(c, tenant, "ai_prompt", id);
      return { prompt: rows[0], version_history: history };
    });
    if (out === null) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    if (!out || "missing" in out) return NextResponse.json({ error: "prompt not found" }, { status: 404 });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "ai prompt read failed" }, { status: 500 });
  }
}

// PATCH /api/admin/ai-ops/prompts/[id] -> edit text (bumps version) and/or status
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireModuleApi("ai_ops", "write");
  if (denied) return denied;
  const { id } = await ctx.params;
  const b = await req.json().catch(() => ({}));
  const tenant = resolveTenantId(req);

  const hasText = typeof b.prompt_text === "string";
  const status = b.status !== undefined ? String(b.status).trim() : null;
  if (status !== null && !STATUSES.includes(status)) {
    return NextResponse.json({ error: `status must be one of: ${STATUSES.join(", ")}` }, { status: 400 });
  }
  if (!hasText && status === null) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }
  const actorId = await getActorIdFromRequest(req);
  try {
    const out = await withPg(async (c) => {
      // J2: snapshot the PRIOR (version, prompt_text, status) before the
      // edit destroys it — the counter alone was not a version history.
      const { rows: before } = await c.query(
        `SELECT ${PROMPT_COLS} FROM public.ai_prompts WHERE tenant_id = $1 AND id = $2::uuid`,
        [tenant, id]
      );
      if (!before[0]) return { missing: true as const };
      await snapshotAiVersion(c, {
        tenant,
        entity: "ai_prompt",
        entityId: id,
        actorId,
        state: {
          name: before[0].name, feature: before[0].feature,
          version: before[0].version, prompt_text: before[0].prompt_text, status: before[0].status,
        },
      });
      const { rows } = await c.query(
        `UPDATE public.ai_prompts
            SET prompt_text = CASE WHEN $3 THEN $4 ELSE prompt_text END,
                version = CASE WHEN $3 THEN version + 1 ELSE version END,
                status = coalesce($5, status),
                updated_at = now()
          WHERE tenant_id = $1 AND id = $2::uuid
          RETURNING id, name, feature, prompt_text, version, status, created_at, updated_at`,
        [tenant, id, hasText, hasText ? String(b.prompt_text) : null, status]
      );
      if (rows[0]) {
        await writeSellerAudit(c, {
          tenantId: tenant,
          actorId,
          action: "ai_prompt.updated",
          entityType: "ai_prompt",
          entityId: id,
          afterState: { version: rows[0].version, status: rows[0].status, text_edited: hasText },
          ipAddress: requestIp(req),
        });
      }
      return rows[0];
    });
    if (out === null) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    if (!out || "missing" in (out as any)) return NextResponse.json({ error: "prompt not found" }, { status: 404 });
    return NextResponse.json({ prompt: out });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "ai prompt update failed" }, { status: 500 });
  }
}
