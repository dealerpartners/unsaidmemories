// H2 · Policy Enforcement — pure evaluator. A policy's enforcement_rules
// (jsonb on seller_policies) is an array of structured rules over seller
// facts. evaluatePolicyEnforcement is deterministic and side-effect free;
// the marketplace route gathers facts, calls it, and writes
// seller_policy_enforcement records (and seller_violations when a matched
// rule says create_violation).
export const SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];
export const ENFORCEMENT_STAGES = ["notice", "warning", "restriction", "suspension_recommendation"] as const;
export type EnforcementStage = (typeof ENFORCEMENT_STAGES)[number];
export const RULE_OPERATORS = ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains", "exists"] as const;
// Fact fields the evaluate_seller path gathers (documented for the editor).
export const RULE_FIELDS = ["violations_count","open_violations_count","disputes_open_count","dmca_claims_count","listings_count","active_listings_count","acceptances_count","accepted_current_version","status","seller_type"] as const;

export interface EnforcementRule {
  field: string; operator: string; value?: unknown;
  action: string; // notice | warn_seller | restrict_listings | create_violation | recommend_suspension
  stage?: string; create_violation?: boolean;
  remediation_steps?: string[]; remediation_days?: number;
}
export interface SellerFacts { [k: string]: unknown }

export function validateEnforcementRules(v: unknown): { ok: true; rules: EnforcementRule[] } | { ok: false; error: string } {
  if (v === null || v === undefined) return { ok: true, rules: [] };
  if (!Array.isArray(v)) return { ok: false, error: "enforcement_rules must be a JSON array of rules" };
  if (v.length > 50) return { ok: false, error: "enforcement_rules is capped at 50 rules" };
  const rules: EnforcementRule[] = [];
  for (let i = 0; i < v.length; i++) {
    const r = v[i] as Record<string, unknown>;
    if (!r || typeof r !== "object") return { ok: false, error: `rule ${i}: must be an object` };
    if (!(RULE_FIELDS as readonly string[]).includes(String(r.field))) return { ok: false, error: `rule ${i}: field must be one of ${RULE_FIELDS.join(", ")}` };
    if (!(RULE_OPERATORS as readonly string[]).includes(String(r.operator))) return { ok: false, error: `rule ${i}: operator must be one of ${RULE_OPERATORS.join(", ")}` };
    if (typeof r.action !== "string" || !r.action.trim()) return { ok: false, error: `rule ${i}: action is required` };
    if (r.stage !== undefined && !(ENFORCEMENT_STAGES as readonly string[]).includes(String(r.stage))) return { ok: false, error: `rule ${i}: stage must be one of ${ENFORCEMENT_STAGES.join(", ")}` };
    rules.push({
      field: String(r.field), operator: String(r.operator), value: r.value,
      action: String(r.action).trim().slice(0, 80),
      stage: r.stage ? String(r.stage) : undefined,
      create_violation: r.create_violation === true,
      remediation_steps: Array.isArray(r.remediation_steps) ? r.remediation_steps.filter((s) => typeof s === "string").map((s) => String(s).slice(0, 500)).slice(0, 10) : undefined,
      remediation_days: Number.isFinite(Number(r.remediation_days)) ? Math.min(365, Math.max(1, Math.trunc(Number(r.remediation_days)))) : undefined,
    });
  }
  return { ok: true, rules };
}

function matches(rule: EnforcementRule, facts: SellerFacts): boolean {
  const actual = facts[rule.field];
  const v = rule.value;
  switch (rule.operator) {
    case "exists": return actual !== undefined && actual !== null;
    case "eq": return actual === v || String(actual) === String(v);
    case "neq": return !(actual === v || String(actual) === String(v));
    case "gt": return Number(actual) > Number(v);
    case "gte": return Number(actual) >= Number(v);
    case "lt": return Number(actual) < Number(v);
    case "lte": return Number(actual) <= Number(v);
    case "in": return Array.isArray(v) && v.map(String).includes(String(actual));
    case "contains": return typeof actual === "string" && typeof v === "string" && actual.includes(v);
    default: return false;
  }
}

export interface EnforcementMatch {
  ruleIndex: number; rule: EnforcementRule; stage: EnforcementStage;
  severity: Severity; action: string; createViolation: boolean;
  remediationSteps: string[]; remediationDays: number;
}

export function stageForPriorCount(prior: number): EnforcementStage {
  return ENFORCEMENT_STAGES[Math.min(Math.max(prior, 0), ENFORCEMENT_STAGES.length - 1)];
}

export function evaluatePolicyEnforcement(
  policy: { title?: string | null; severity?: string | null; enforcement_rules?: unknown },
  facts: SellerFacts,
  priorEnforcementCount = 0,
): EnforcementMatch[] {
  const parsed = validateEnforcementRules(policy.enforcement_rules);
  if (!parsed.ok) return [];
  const severity = (SEVERITIES as readonly string[]).includes(String(policy.severity)) ? (policy.severity as Severity) : "medium";
  const out: EnforcementMatch[] = [];
  parsed.rules.forEach((rule, i) => {
    if (!matches(rule, facts)) return;
    const stage = (rule.stage as EnforcementStage) || stageForPriorCount(priorEnforcementCount);
    out.push({
      ruleIndex: i, rule, stage, severity, action: rule.action,
      createViolation: rule.create_violation === true || rule.action === "create_violation",
      remediationSteps: rule.remediation_steps?.length ? rule.remediation_steps : [`Review the policy "${policy.title || "policy"}" and correct the condition flagged by rule ${i + 1} (${rule.field} ${rule.operator} ${JSON.stringify(rule.value ?? null)}).`],
      remediationDays: rule.remediation_days ?? 14,
    });
  });
  return out;
}
