import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg, withPgStrict } from "@/lib/crm/enterprise";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit";

export const dynamic = "force-dynamic";

// B.11 Evals — public.ai_evals (exists live): one row per eval run, linked to
// the model and/or prompt it exercised. Pass rate rides in results jsonb
// (results.pass_rate) when the runner reports it; score is the run's score.

const COLS = `e.id, e.eval_name, e.dataset_ref, e.score::float AS score, e.status,
  e.results, e.created_at, e.model_id, e.prompt_id,
  m.name AS model_name, p.name AS prompt_name`;

const FROM = `FROM public.ai_evals e
  LEFT JOIN public.ai_models m ON m.id = e.model_id
  LEFT JOIN public.ai_prompts p ON p.id = e.prompt_id`;

export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("ai_ops", "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  try {
    const out = await withPg(async (c) => {
      const { rows } = await c.query(
        `SELECT ${COLS} ${FROM} WHERE e.tenant_id = $1 ORDER BY e.created_at DESC LIMIT 200`,
        [tenant]
      );
      // Regression tracking (J3): per suite + model, the scored-run series
      // — latest score against the previous scored run, computed from the
      // recorded runs only. A suite with one scored run has no delta yet.
      const { rows: series } = await c.query(
        `WITH scored AS (
           SELECT e.eval_name, e.model_id, e.score::float AS score, e.created_at,
                  row_number() OVER (PARTITION BY e.eval_name, e.model_id ORDER BY e.created_at DESC) AS rn,
                  count(*) OVER (PARTITION BY e.eval_name, e.model_id) AS runs
             FROM public.ai_evals e
            WHERE e.tenant_id = $1 AND e.score IS NOT NULL
         )
         SELECT s.eval_name, s.model_id, m.name AS model_name, s.runs::int AS runs,
                max(CASE WHEN s.rn = 1 THEN s.score END) AS latest_score,
                max(CASE WHEN s.rn = 1 THEN s.created_at END) AS latest_at,
                max(CASE WHEN s.rn = 2 THEN s.score END) AS previous_score
           FROM scored s LEFT JOIN public.ai_models m ON m.id = s.model_id
          GROUP BY s.eval_name, s.model_id, m.name, s.runs
          ORDER BY s.eval_name`,
        [tenant]
      );
      const regressions = (series as any[]).map((s) => {
        const latest = s.latest_score !== null ? Number(s.latest_score) : null;
        const previous = s.previous_score !== null ? Number(s.previous_score) : null;
        const delta = latest !== null && previous !== null ? latest - previous : null;
        return {
          eval_name: s.eval_name, model_id: s.model_id, model_name: s.model_name,
          runs: s.runs, latest_score: latest, latest_at: s.latest_at, previous_score: previous,
          delta, regressed: delta !== null && delta < 0,
        };
      });
      // Suites (J3): the suite-level read model — suites are emergent
      // from run naming (no suite store exists), so the suite list is
      // derived from the runs themselves: one row per eval_name with
      // its datasets, run count, models exercised, and latest run.
      const { rows: suites } = await c.query(
        `SELECT e.eval_name,
                count(*)::int AS runs,
                count(DISTINCT e.dataset_ref)::int AS datasets,
                array_remove(array_agg(DISTINCT e.dataset_ref), NULL) AS dataset_refs,
                count(DISTINCT e.model_id)::int AS models,
                count(DISTINCT e.prompt_id)::int AS prompts,
                max(e.created_at) AS last_run_at,
                (array_agg(e.status ORDER BY e.created_at DESC))[1] AS last_status,
                (array_agg(e.score ORDER BY e.created_at DESC) FILTER (WHERE e.score IS NOT NULL))[1]::float AS latest_score
           FROM public.ai_evals e
          WHERE e.tenant_id = $1
          GROUP BY e.eval_name
          ORDER BY e.eval_name`,
        [tenant]
      );
      return { evals: rows, regressions, suites };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "ai evals list failed" }, { status: 500 });
  }
}

// POST /api/admin/ai-ops/evals -> record an eval run
export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("ai_ops", "write");
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const tenant = resolveTenantId(req);
  const evalName = String(b.eval_name || "").trim();
  if (!evalName) return NextResponse.json({ error: "eval_name is required" }, { status: 400 });
  const score = b.score === null || b.score === undefined || b.score === "" ? null : Number(b.score);
  if (score !== null && Number.isNaN(score)) return NextResponse.json({ error: "score must be a number" }, { status: 400 });
  const passRate = b.pass_rate === null || b.pass_rate === undefined || b.pass_rate === "" ? null : Number(b.pass_rate);
  if (passRate !== null && (Number.isNaN(passRate) || passRate < 0 || passRate > 1)) {
    return NextResponse.json({ error: "pass_rate must be between 0 and 1" }, { status: 400 });
  }
  const status = ["pending", "running", "passed", "failed"].includes(String(b.status)) ? String(b.status) : "pending";
  const modelId = b.model_id ? String(b.model_id) : null;
  const promptId = b.prompt_id ? String(b.prompt_id) : null;
  const datasetRef = b.dataset_ref ? String(b.dataset_ref).trim() : null;
  const actorId = await getActorIdFromRequest(req);
  try {
    const out = await withPgStrict(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO public.ai_evals (tenant_id, model_id, prompt_id, eval_name, dataset_ref, score, status, results)
         VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, $7, $8::jsonb) RETURNING id`,
        [tenant, modelId, promptId, evalName, datasetRef, score, status, JSON.stringify(passRate !== null ? { pass_rate: passRate } : {})]
      );
      if (!rows[0]) throw new Error("AI eval insert did not land");
      await writeSellerAudit(c, {
        tenantId: tenant,
        actorId,
        action: "ai_eval.recorded",
        entityType: "ai_eval",
        entityId: rows[0].id,
        afterState: { eval_name: evalName, status, score },
        ipAddress: requestIp(req),
      });
      const { rows: full } = await c.query(`SELECT ${COLS} ${FROM} WHERE e.id = $1`, [rows[0].id]);
      return { eval: full[0] };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "ai eval create failed" }, { status: 500 });
  }
}
