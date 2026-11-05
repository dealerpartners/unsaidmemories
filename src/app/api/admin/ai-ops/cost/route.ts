import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg, TENANT_ID } from "@/lib/crm/enterprise";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit";
import { lastBudgetAlert } from "@/lib/ai/budget-alerts";

export const dynamic = "force-dynamic";

// B.11 Cost / J5 — spend is computed from public.ai_invocations (exists
// live): total over the last 30 days, broken down by model and by feature,
// plus the invocation rows themselves. Before this route the cost page
// hardcoded $0.00 with empty breakdowns.
//
// §J completion adds the two leaves the base did not carry:
//   · PER-TENANT COST — a cross-tenant rollup, served ONLY when the
//     resolved tenant is the platform (master) tenant: AI Ops is a
//     platform-ops seat (franchise tenants do not get AI Ops), and one
//     tenant's operator never sees another tenant's spend.
//   · BUDGET ALERTS — the monthly budget is a recorded policy_settings
//     value (scope 'ai_budget', key 'monthly_limit_usd', the platform's
//     scoped-settings idiom); the alert state is COMPUTED here from the
//     recorded 30-day spend against that limit (within / over / not set).
//     No notification is fabricated: the alert is this face's state.
//   · COST COVERAGE — totals sum RECORDED cost only. The Kinnect gateway
//     and the lib/ai router log cost as NULL today, so the response
//     carries how many of the period's invocations recorded a cost; a
//     total built on partial coverage says so instead of reading as $0.

export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("ai_ops", "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  const isPlatformTenant = tenant === TENANT_ID();
  try {
    const out = await withPg(async (c) => {
      const [total, byModel, byFeature, recent, byTenant, budgetRow] = await Promise.all([
        c.query(
          `SELECT coalesce(sum(cost), 0)::float AS total,
                  count(*)::int AS invocations,
                  count(cost)::int AS costed_invocations,
                  coalesce(sum(coalesce(input_tokens,0) + coalesce(output_tokens,0)), 0)::int AS tokens
             FROM public.ai_invocations
            WHERE tenant_id = $1 AND created_at >= now() - interval '30 days'`,
          [tenant]
        ),
        c.query(
          `SELECT coalesce(m.name, 'Unknown model') AS label, coalesce(sum(i.cost), 0)::float AS amount,
                  count(*)::int AS invocations
             FROM public.ai_invocations i
             LEFT JOIN public.ai_models m ON m.id = i.model_id
            WHERE i.tenant_id = $1 AND i.created_at >= now() - interval '30 days'
            GROUP BY m.name ORDER BY amount DESC`,
          [tenant]
        ),
        c.query(
          `SELECT feature AS label, coalesce(sum(cost), 0)::float AS amount, count(*)::int AS invocations
             FROM public.ai_invocations
            WHERE tenant_id = $1 AND created_at >= now() - interval '30 days'
            GROUP BY feature ORDER BY amount DESC`,
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
            ORDER BY i.created_at DESC LIMIT 25`,
          [tenant]
        ),
        isPlatformTenant
          ? c.query(
              `SELECT i.tenant_id, t.name AS tenant_name,
                      coalesce(sum(i.cost), 0)::float AS amount,
                      count(*)::int AS invocations,
                      count(i.cost)::int AS costed_invocations,
                      coalesce(sum(coalesce(i.input_tokens,0) + coalesce(i.output_tokens,0)), 0)::int AS tokens
                 FROM public.ai_invocations i
                 LEFT JOIN public.tenants t ON t.id = i.tenant_id
                WHERE i.created_at >= now() - interval '30 days'
                GROUP BY i.tenant_id, t.name ORDER BY amount DESC`
            )
          : Promise.resolve({ rows: [] as any[] }),
        c.query(
          `SELECT value FROM public.policy_settings
            WHERE tenant_id = $1 AND scope = 'ai_budget' AND key = 'monthly_limit_usd' LIMIT 1`,
          [tenant]
        ),
      ]);
      const spend30d = total.rows[0]?.total ?? 0;
      const limitRaw = budgetRow.rows[0]?.value;
      const limitUsd = limitRaw !== undefined && limitRaw !== null && Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : null;
      return {
        total30d: spend30d,
        invocations30d: total.rows[0]?.invocations ?? 0,
        costedInvocations30d: total.rows[0]?.costed_invocations ?? 0,
        tokens30d: total.rows[0]?.tokens ?? 0,
        byModel: byModel.rows,
        byFeature: byFeature.rows,
        byTenant: isPlatformTenant ? byTenant.rows : null,
        budget: {
          limitUsd,
          spend30d,
          state: limitUsd === null ? "not_set" : spend30d > limitUsd ? "over" : "within",
          pctUsed: limitUsd !== null && limitUsd > 0 ? Math.round((spend30d / limitUsd) * 1000) / 10 : null,
          lastAlert: await lastBudgetAlert(c, tenant),
        },
        recentInvocations: recent.rows,
      };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "ai cost failed" }, { status: 500 });
  }
}

// POST /api/admin/ai-ops/cost -> set (or clear, with null) the monthly AI
// budget for the resolved tenant. Recorded in policy_settings scope
// 'ai_budget'; audited. This records the threshold — the alert state is
// computed on read; nothing is sent anywhere by setting a budget.
export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("ai_ops", "write");
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const tenant = resolveTenantId(req);
  const raw = b.monthly_limit_usd;
  const limit = raw === null || raw === undefined || raw === "" ? null : Number(raw);
  if (limit !== null && (Number.isNaN(limit) || limit < 0)) {
    return NextResponse.json({ error: "monthly_limit_usd must be a non-negative number or null" }, { status: 400 });
  }
  const actorId = await getActorIdFromRequest(req);
  try {
    const out = await withPg(async (c) => {
      if (limit === null) {
        await c.query(
          `DELETE FROM public.policy_settings WHERE tenant_id = $1 AND scope = 'ai_budget' AND key = 'monthly_limit_usd'`,
          [tenant],
        );
      } else {
        const upd = await c.query(
          `UPDATE public.policy_settings SET value = $2, updated_at = now(), updated_by = $3::uuid
            WHERE tenant_id = $1 AND scope = 'ai_budget' AND key = 'monthly_limit_usd'`,
          [tenant, String(limit), actorId],
        );
        if (!upd.rowCount) {
          await c.query(
            `INSERT INTO public.policy_settings (tenant_id, scope, key, value, updated_by)
             VALUES ($1, 'ai_budget', 'monthly_limit_usd', $2, $3::uuid)`,
            [tenant, String(limit), actorId],
          );
        }
      }
      await writeSellerAudit(c, {
        tenantId: tenant,
        actorId,
        action: "ai_budget.updated",
        entityType: "policy_settings",
        entityId: null,
        afterState: { scope: "ai_budget", key: "monthly_limit_usd", limit_usd: limit },
        ipAddress: requestIp(req),
      });
      return { limitUsd: limit };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json({ budget: out });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "ai budget update failed" }, { status: 500 });
  }
}
