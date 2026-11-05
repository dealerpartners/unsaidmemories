import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg, withPgStrict } from "@/lib/crm/enterprise";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit";

export const dynamic = "force-dynamic";

// B.11 Models — public.ai_models (exists live). Latency and cost figures are
// derived from the model's real rows in public.ai_invocations, never stored
// on the model row: avg latency over all invocations, and cost per 1k tokens
// = total cost / total tokens * 1000. NULL when the model has no invocations.
//
// Attribution (§J completion): an invocation counts toward a model when it
// is LINKED (model_id set by the invocation logger) or when its recorded
// metadata ref/label matches the model's model_ref or name — the same match
// lib/ai/log-invocation.ts makes at write time. Calls recorded before the
// registry held the model (model_id NULL) therefore still attribute.
// Cost honesty: cost_per_1k is NULL unless at least one attributed
// invocation actually RECORDED a cost — an unrecorded cost is not a $0 cost
// (the Kinnect gateway and the lib/ai router log cost as NULL today).

const MODEL_COLS = `m.id, m.name, m.provider, m.model_ref, m.version, m.status,
  m.config, m.created_at, m.updated_at,
  coalesce(a.invocations, 0)::int AS invocations,
  coalesce(a.costed_invocations, 0)::int AS costed_invocations,
  a.avg_latency_ms::float AS avg_latency_ms,
  CASE WHEN coalesce(a.costed_invocations, 0) > 0 AND coalesce(a.total_tokens, 0) > 0
       THEN (a.total_cost / a.total_tokens * 1000)::float END AS cost_per_1k`;

const MODEL_FROM = `FROM public.ai_models m
  LEFT JOIN LATERAL (
    SELECT count(*) AS invocations,
           count(i.cost) AS costed_invocations,
           avg(i.latency_ms) AS avg_latency_ms,
           sum(coalesce(i.input_tokens,0) + coalesce(i.output_tokens,0)) AS total_tokens,
           sum(coalesce(i.cost,0)) AS total_cost
      FROM public.ai_invocations i
     WHERE coalesce(i.model_id, (
             SELECT m2.id FROM public.ai_models m2
              WHERE m2.model_ref IN (i.metadata->>'model_ref', i.metadata->>'model_label')
                 OR m2.name IN (i.metadata->>'model_ref', i.metadata->>'model_label')
              ORDER BY m2.created_at ASC LIMIT 1
           )) = m.id
  ) a ON true`;

export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("ai_ops", "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  try {
    const out = await withPg(async (c) => {
      const { rows } = await c.query(
        `SELECT ${MODEL_COLS} ${MODEL_FROM} WHERE m.tenant_id = $1 ORDER BY m.created_at DESC LIMIT 200`,
        [tenant]
      );
      return { models: rows };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "ai models list failed" }, { status: 500 });
  }
}

// POST /api/admin/ai-ops/models -> register a model
export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("ai_ops", "write");
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const tenant = resolveTenantId(req);
  const name = String(b.name || "").trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const provider = b.provider ? String(b.provider).trim() : null;
  const modelRef = b.model_ref ? String(b.model_ref).trim() : null;
  const version = b.version ? String(b.version).trim() : null;
  const purpose = b.purpose ? String(b.purpose).trim() : null;
  const actorId = await getActorIdFromRequest(req);
  try {
    const out = await withPgStrict(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO public.ai_models (tenant_id, name, provider, model_ref, version, status, config)
         VALUES ($1, $2, $3, $4, $5, 'active', $6::jsonb) RETURNING id`,
        [tenant, name, provider, modelRef, version, JSON.stringify(purpose ? { purpose } : {})]
      );
      if (!rows[0]) throw new Error("AI model insert did not land");
      await writeSellerAudit(c, {
        tenantId: tenant,
        actorId,
        action: "ai_model.registered",
        entityType: "ai_model",
        entityId: rows[0].id,
        afterState: { name, provider, model_ref: modelRef },
        ipAddress: requestIp(req),
      });
      const { rows: full } = await c.query(
        `SELECT ${MODEL_COLS} ${MODEL_FROM} WHERE m.id = $1`,
        [rows[0].id]
      );
      return { model: full[0] };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "ai model create failed" }, { status: 500 });
  }
}
