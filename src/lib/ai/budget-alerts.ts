// J5 · AI budget alerts — evaluation + delivery.
// The budget itself is a recorded policy_settings value (scope 'ai_budget',
// key 'monthly_limit_usd'); spend is the same 30-day ai_invocations sum the
// cost route reports. A check that finds spend OVER the limit, with no
// alert yet recorded for the current period, does two real things in one
// pass: inserts the alert row (public.ai_budget_alerts, migration
// 20261092 — its UNIQUE (tenant_id, period) is the dedupe) and delivers an
// employee_notifications row to every active staff member of the tenant
// (the platform's broadcast idiom). Within/not-set states record nothing
// and notify nobody.

type PgClient = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;
};

export interface BudgetState {
  limitUsd: number | null;
  spend30d: number;
  state: "not_set" | "within" | "over";
  period: string;
}

export async function evaluateBudget(c: PgClient, tenant: string): Promise<BudgetState> {
  const { rows: spendRows } = await c.query(
    `SELECT coalesce(sum(cost), 0)::float AS total
       FROM public.ai_invocations
      WHERE tenant_id = $1 AND created_at >= now() - interval '30 days'`,
    [tenant],
  );
  const { rows: budgetRows } = await c.query(
    `SELECT value FROM public.policy_settings
      WHERE tenant_id = $1 AND scope = 'ai_budget' AND key = 'monthly_limit_usd' LIMIT 1`,
    [tenant],
  );
  const spend30d = Number(spendRows[0]?.total ?? 0);
  const limitRaw = budgetRows[0]?.value;
  const limitUsd =
    limitRaw !== undefined && limitRaw !== null && Number.isFinite(Number(limitRaw))
      ? Number(limitRaw)
      : null;
  const { rows: periodRows } = await c.query(`SELECT to_char(now(), 'YYYY-MM') AS period`);
  return {
    limitUsd,
    spend30d,
    state: limitUsd === null ? "not_set" : spend30d > limitUsd ? "over" : "within",
    period: String(periodRows[0]?.period ?? ""),
  };
}

export interface BudgetAlertRow {
  id: string;
  period: string;
  limit_usd: number;
  observed_spend: number;
  notified_count: number;
  created_at: string;
}

export async function lastBudgetAlert(c: PgClient, tenant: string): Promise<BudgetAlertRow | null> {
  // Null means only "no alert recorded". A failed read throws: callers must
  // not present a store failure as the absence of an alert.
  const { rows } = await c.query(
    `SELECT id, period, limit_usd::float AS limit_usd, observed_spend::float AS observed_spend,
            notified_count, created_at
       FROM public.ai_budget_alerts
      WHERE tenant_id = $1
      ORDER BY created_at DESC LIMIT 1`,
    [tenant],
  );
  return rows[0] ?? null;
}

export interface BudgetCheckResult extends BudgetState {
  alerted: boolean;
  alreadyAlerted: boolean;
  notifiedCount: number;
  alert: BudgetAlertRow | null;
}

export async function checkAndAlertBudget(
  c: PgClient,
  tenant: string,
  actorId: string | null,
): Promise<BudgetCheckResult> {
  const state = await evaluateBudget(c, tenant);
  if (state.state !== "over" || state.limitUsd === null) {
    return { ...state, alerted: false, alreadyAlerted: false, notifiedCount: 0, alert: await lastBudgetAlert(c, tenant) };
  }
  const existing = await c.query(
    `SELECT id FROM public.ai_budget_alerts WHERE tenant_id = $1 AND period = $2 LIMIT 1`,
    [tenant, state.period],
  );
  if (existing.rows[0]) {
    return { ...state, alerted: false, alreadyAlerted: true, notifiedCount: 0, alert: await lastBudgetAlert(c, tenant) };
  }
  const title = "AI budget exceeded";
  const body = `Recorded AI spend over the last 30 days is $${state.spend30d.toFixed(2)}, over the monthly budget of $${state.limitUsd.toFixed(2)}.`;
  const { rows: notified } = await c.query(
    `INSERT INTO public.employee_notifications (tenant_id, staff_id, notification_type, title, body, link)
     SELECT $1::uuid, s.id, 'ai_budget_alert', $2, $3, '/admin/ai-ops/cost'
       FROM public.crm_staff s
      WHERE s.tenant_id = $1::uuid AND s.is_active
     RETURNING id`,
    [tenant, title, body],
  );
  const { rows: alertRows } = await c.query(
    `INSERT INTO public.ai_budget_alerts (tenant_id, period, limit_usd, observed_spend, notified_count, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (tenant_id, period) DO NOTHING
     RETURNING id, period, limit_usd::float AS limit_usd, observed_spend::float AS observed_spend, notified_count, created_at`,
    [tenant, state.period, state.limitUsd, state.spend30d, notified.length, actorId],
  );
  return {
    ...state,
    alerted: alertRows.length > 0,
    alreadyAlerted: false,
    notifiedCount: notified.length,
    alert: alertRows[0] ?? (await lastBudgetAlert(c, tenant)),
  };
}
