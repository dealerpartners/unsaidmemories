import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit";
import { snapshotAiVersion, readAiVersionHistory } from "@/lib/ai/version-history";

export const dynamic = "force-dynamic";

const STATUSES = ["active", "deprecated", "experimental"];

const MODEL_COLS = `id, name, provider, model_ref, version, status, config, created_at, updated_at`;

// GET /api/admin/ai-ops/models/[id] -> the model + its version history
// (J1: prior states snapshotted into activity_log before every change;
// the live row is the current version).
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireModuleApi("ai_ops", "read");
  if (denied) return denied;
  const { id } = await ctx.params;
  const tenant = resolveTenantId(req);
  try {
    const out = await withPg(async (c) => {
      const { rows } = await c.query(
        `SELECT ${MODEL_COLS} FROM public.ai_models WHERE tenant_id = $1 AND id = $2::uuid`,
        [tenant, id]
      );
      if (!rows[0]) return { missing: true as const };
      const history = await readAiVersionHistory(c, tenant, "ai_model", id);
      return { model: rows[0], version_history: history };
    });
    if (out === null) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    if (!out || "missing" in out) return NextResponse.json({ error: "model not found" }, { status: 404 });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "ai model read failed" }, { status: 500 });
  }
}

// PATCH /api/admin/ai-ops/models/[id] -> set model status and/or version.
// J1: a version change is a real edit, and the PRIOR row state is
// snapshotted into the version history before either field moves — the
// history above is complete from this build forward.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireModuleApi("ai_ops", "write");
  if (denied) return denied;
  const { id } = await ctx.params;
  const b = await req.json().catch(() => ({}));
  const status = b.status !== undefined ? String(b.status || "").trim() : null;
  const version = b.version !== undefined ? String(b.version || "").trim() : null;
  if (status !== null && !STATUSES.includes(status)) {
    return NextResponse.json({ error: `status must be one of: ${STATUSES.join(", ")}` }, { status: 400 });
  }
  if (version !== null && !version) {
    return NextResponse.json({ error: "version must be a non-empty string" }, { status: 400 });
  }
  if (status === null && version === null) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }
  const tenant = resolveTenantId(req);
  const actorId = await getActorIdFromRequest(req);
  try {
    const out = await withPg(async (c) => {
      const { rows: before } = await c.query(
        `SELECT ${MODEL_COLS} FROM public.ai_models WHERE tenant_id = $1 AND id = $2::uuid`,
        [tenant, id]
      );
      if (!before[0]) return { missing: true as const };
      await snapshotAiVersion(c, {
        tenant,
        entity: "ai_model",
        entityId: id,
        actorId,
        state: {
          name: before[0].name, provider: before[0].provider, model_ref: before[0].model_ref,
          version: before[0].version, status: before[0].status, config: before[0].config,
        },
      });
      const { rows } = await c.query(
        `UPDATE public.ai_models
            SET status = coalesce($3, status),
                version = coalesce($4, version),
                updated_at = now()
          WHERE tenant_id = $1 AND id = $2::uuid
          RETURNING ${MODEL_COLS}`,
        [tenant, id, status, version]
      );
      await writeSellerAudit(c, {
        tenantId: tenant,
        actorId,
        action: "ai_model.updated",
        entityType: "ai_model",
        entityId: id,
        beforeState: { status: before[0].status, version: before[0].version },
        afterState: { status: rows[0].status, version: rows[0].version },
        ipAddress: requestIp(req),
      });
      return rows[0];
    });
    if (out === null) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    if (!out || "missing" in (out as any)) return NextResponse.json({ error: "model not found" }, { status: 404 });
    return NextResponse.json({ model: out });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "ai model update failed" }, { status: 500 });
  }
}
