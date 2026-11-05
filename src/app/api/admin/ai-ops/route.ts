import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";

export const dynamic = "force-dynamic";

// GET /api/admin/ai-ops -> B.11 overview: real counts from the five AI Ops
// tables (ai_models, ai_prompts, ai_evals, ai_incidents, ai_invocations —
// all exist live, verified 2026-10-13) plus spend (30d) and the most recent
// invocations. Before this route the overview page rendered hardcoded '0'
// stats and a permanent "logging is not enabled" panel.
export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("ai_ops", "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  try {
    const out = await withPg(async (c) => {
      const [counts, spend, recent] = await Promise.all([
        c.query(
          `SELECT
             (SELECT count(*)::int FROM public.ai_models WHERE tenant_id = $1) AS models,
             (SELECT count(*)::int FROM public.ai_prompts WHERE tenant_id = $1) AS prompts,
             (SELECT count(*)::int FROM public.ai_evals WHERE tenant_id = $1) AS evals,
             (SELECT count(*)::int FROM public.ai_incidents WHERE tenant_id = $1 AND status <> 'resolved') AS open_incidents,
             (SELECT count(*)::int FROM public.ai_invocations WHERE tenant_id = $1) AS invocations,
             (SELECT count(*)::int FROM public.ai_tasks WHERE tenant_id = $1 AND state = 'proposed') AS tasks_proposed,
             (SELECT count(*)::int FROM public.ai_disclosures WHERE tenant_id IS NULL OR tenant_id = $1) AS disclosures`,
          [tenant]
        ),
        c.query(
          `SELECT coalesce(sum(cost), 0)::float AS spend_30d
             FROM public.ai_invocations
            WHERE tenant_id = $1 AND created_at >= now() - interval '30 days'`,
          [tenant]
        ),
        c.query(
          `SELECT i.id, i.feature, i.status, i.input_tokens, i.output_tokens,
                  i.cost::float AS cost, i.latency_ms, i.created_at,
                  m.name AS model_name, p.name AS prompt_name
             FROM public.ai_invocations i
             LEFT JOIN public.ai_models m ON m.id = i.model_id
             LEFT JOIN public.ai_prompts p ON p.id = i.prompt_id
            WHERE i.tenant_id = $1
            ORDER BY i.created_at DESC LIMIT 10`,
          [tenant]
        ),
      ]);
      // J2 A/B tests count — fail-soft until migration 20261101 lands.
      let abTests = 0;
      try {
        const { rows } = await c.query(
          `SELECT count(*)::int AS n FROM public.ai_ab_tests WHERE tenant_id = $1`,
          [tenant]
        );
        abTests = rows[0]?.n ?? 0;
      } catch { /* table not applied yet */ }
      // J6 agent registry count — fail-soft until migration 20261110 lands.
      let agents = 0;
      try {
        const { rows } = await c.query(
          `SELECT count(*)::int AS n FROM public.ai_agents WHERE tenant_id IS NULL OR tenant_id = $1`,
          [tenant]
        );
        agents = rows[0]?.n ?? 0;
      } catch { /* table not applied yet */ }
      return {
        counts: { ...counts.rows[0], ab_tests: abTests, agents },
        spend30d: spend.rows[0]?.spend_30d ?? 0,
        recentInvocations: recent.rows,
      };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "ai-ops overview failed" }, { status: 500 });
  }
}
