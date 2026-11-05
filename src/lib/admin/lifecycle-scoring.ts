// ============================================================================
// Admin lifecycle scoring — pure computation over existing tables.
// Determines a customer's lifecycle health (1.7) and suggests lifecycle stage
// transitions (1.8) from visit cadence, payment history, and document status.
// No new tables. Failed reads throw — scores are never computed over a
// fabricated empty result.
// ============================================================================
import { withPgStrict, TENANT_ID } from "@/lib/crm/enterprise";
import {
  getCustomerMetrics,
  getOperationalFlags,
  type CustomerMetrics,
  type OperationalFlags,
} from "./customer-metrics";

export type LifecycleHealth = "healthy" | "needs_attention" | "at_risk";

export interface LifecycleScore {
  health: LifecycleHealth;
  reasons: string[];
  suggestedStage: string | null;
  daysSinceLastVisit: number | null;
  expectedCycleDays: number;
}

async function q<T = any>(sql: string, params: unknown[]): Promise<T[]> {
  // No fail-soft: a failed read throws (withPgStrict) so callers surface an
  // error instead of computing flags/metrics over a fabricated empty set.
  const rows = await withPgStrict<T[]>((client) =>
    client.query(sql, params).then((r: any) => (r?.rows ?? []) as T[]),
  );
  return rows;
}

const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);

/**
 * Score a customer's lifecycle health (1.7).
 *
 * Rules:
 * - at_risk: no visit in 2x expected cycle; multiple cancellations; no-show
 *   history (>=3); outstanding balance > $100; communication issues flag.
 * - needs_attention: due for rebooking (past 1x cycle); declining appointment
 *   frequency; missing document; single no-show/cancellation.
 * - healthy: regular visits (within cycle), good payment history, docs current.
 */
export async function scoreLifecycle(
  customerId: string,
  metrics?: CustomerMetrics,
  operational?: OperationalFlags,
): Promise<LifecycleScore> {
  const t = TENANT_ID();
  const m = metrics ?? (await getCustomerMetrics(customerId));
  const op = operational ?? (await getOperationalFlags(customerId));

  const expectedCycleDays = m.averageVisitFrequencyDays ?? 42;
  const daysSinceLastVisit = m.lastVisitAt
    ? Math.round((Date.now() - new Date(m.lastVisitAt).getTime()) / 86400000)
    : null;

  const reasons: string[] = [];
  let health: LifecycleHealth = "healthy";

  const escalate = (to: LifecycleHealth, reason: string) => {
    reasons.push(reason);
    if (to === "at_risk") health = "at_risk";
    else if (health !== "at_risk") health = "needs_attention";
  };

  // --- At-risk signals ---
  if (daysSinceLastVisit != null && daysSinceLastVisit > expectedCycleDays * 2 && m.totalVisits > 0) {
    escalate("at_risk", `No visit in ${daysSinceLastVisit} days (expected every ~${expectedCycleDays})`);
  }
  if (m.cancelledCount >= 3) {
    escalate("at_risk", `${m.cancelledCount} cancellations on record`);
  }
  if (m.noShowCount >= 3) {
    escalate("at_risk", `${m.noShowCount} no-shows on record`);
  }
  if (m.outstandingBalance > 100) {
    escalate("at_risk", `Outstanding balance $${m.outstandingBalance.toFixed(2)}`);
  }

  // Communication issues (audit §1.7.3e) — scored from crm_messages, the
  // store every CRM send writes: failed deliveries, and outbound threads
  // the customer never answers. (The header has named this rule since the
  // scorer was written; the signal itself was never computed.)
  {
    const [comms] = await q<{ failed: string; outbound60: string; inbound60: string; last_outbound_age_days: string | null }>(
      `SELECT COUNT(*) FILTER (WHERE (failed_at IS NOT NULL OR status = 'failed')
                                AND created_at >= NOW() - INTERVAL '90 days')::text AS failed,
              COUNT(*) FILTER (WHERE direction = 'outbound'
                                AND created_at >= NOW() - INTERVAL '60 days')::text AS outbound60,
              COUNT(*) FILTER (WHERE direction IN ('inbound', 'incoming')
                                AND created_at >= NOW() - INTERVAL '60 days')::text AS inbound60,
              (EXTRACT(EPOCH FROM (NOW() - MAX(created_at) FILTER (WHERE direction = 'outbound'))) / 86400)::text AS last_outbound_age_days
         FROM public.crm_messages
        WHERE tenant_id = $1 AND customer_id = $2::uuid`,
      [t, customerId],
    ).catch(() => [{ failed: "0", outbound60: "0", inbound60: "0", last_outbound_age_days: null }]);
    const failed = num(comms?.failed);
    const outbound60 = num(comms?.outbound60);
    const inbound60 = num(comms?.inbound60);
    const lastOutboundAge = comms?.last_outbound_age_days == null ? null : num(comms.last_outbound_age_days);
    if (failed >= 2) {
      escalate("at_risk", `Communication issues: ${failed} failed message deliveries in 90 days`);
    } else if (failed === 1) {
      escalate("needs_attention", "Communication issue: 1 failed message delivery in 90 days");
    }
    if (outbound60 >= 2 && inbound60 === 0 && lastOutboundAge != null && lastOutboundAge >= 7) {
      escalate("at_risk", `Communication issues: no reply to the last ${outbound60} messages (60 days)`);
    }
  }

  // --- Needs-attention signals ---
  if (
    daysSinceLastVisit != null &&
    daysSinceLastVisit > expectedCycleDays &&
    daysSinceLastVisit <= expectedCycleDays * 2 &&
    m.totalVisits > 0
  ) {
    escalate("needs_attention", `Due for rebooking (${daysSinceLastVisit}d since last visit)`);
  }
  if (op.hasMissingDocuments) {
    escalate("needs_attention", "Missing or expired documents");
  }
  if (m.noShowCount >= 1 && m.noShowCount < 3) {
    escalate("needs_attention", `${m.noShowCount} no-show${m.noShowCount > 1 ? "s" : ""} on record`);
  }
  if (m.cancelledCount >= 1 && m.cancelledCount < 3) {
    escalate("needs_attention", `${m.cancelledCount} cancellation${m.cancelledCount > 1 ? "s" : ""} on record`);
  }

  // Declining frequency: compare recent 6-month visit count vs prior 6 months.
  if (m.totalVisits >= 4) {
    const [trend] = await q<{ recent: string; prior: string }>(
      `SELECT COUNT(*) FILTER (WHERE starts_at >= NOW() - INTERVAL '6 months')::text AS recent,
              COUNT(*) FILTER (WHERE starts_at >= NOW() - INTERVAL '12 months' AND starts_at < NOW() - INTERVAL '6 months')::text AS prior
         FROM public.crm_appointments
        WHERE tenant_id=$1 AND customer_id=$2::uuid AND status='completed'`,
      [t, customerId],
    );
    const recent = num(trend?.recent);
    const prior = num(trend?.prior);
    if (prior >= 2 && recent < prior * 0.5) {
      escalate("needs_attention", `Visit frequency declining (${recent} recent vs ${prior} prior 6mo)`);
    }
  }

  // --- Healthy confirmations (only if no negative signals) ---
  if (health === "healthy") {
    if (m.totalVisits >= 2 && daysSinceLastVisit != null && daysSinceLastVisit <= expectedCycleDays) {
      reasons.push("Regular visits within expected cycle");
    }
    if (m.outstandingBalance === 0 && m.lifetimeValue > 0) {
      reasons.push("Good payment history");
    }
    if (!op.hasMissingDocuments && !op.hasVaccineExpiring) {
      reasons.push("Documents current");
    }
  }

  // --- Suggested stage (1.8) ---
  const suggestedStage = suggestStageFromMetrics(m, health, daysSinceLastVisit, expectedCycleDays);

  return { health, reasons, suggestedStage, daysSinceLastVisit, expectedCycleDays };
}

function suggestStageFromMetrics(
  m: CustomerMetrics,
  health: LifecycleHealth,
  daysSinceLastVisit: number | null,
  expectedCycleDays: number,
): string | null {
  if (m.totalVisits === 0 && m.totalAppointments === 0) return "new_lead";
  if (m.totalVisits <= 1) return "new_customer";
  if (health === "at_risk") {
    if (daysSinceLastVisit != null && daysSinceLastVisit > expectedCycleDays * 3) return "lost";
    return "at_risk";
  }
  if (health === "needs_attention") {
    if (daysSinceLastVisit != null && daysSinceLastVisit > expectedCycleDays * 1.5) return "lapsed";
    return null; // keep current stage
  }
  if (m.lifetimeValue >= 1000 && m.totalVisits >= 8) return "vip";
  if (daysSinceLastVisit != null && daysSinceLastVisit <= expectedCycleDays) return "active";
  return "returning";
}

/**
 * Batch-score many customers (for dashboard lists). Runs sequentially to
 * avoid hammering the DB; each customer is independent.
 */
export async function scoreLifecycleBatch(
  customerIds: string[],
): Promise<Record<string, LifecycleScore>> {
  const out: Record<string, LifecycleScore> = {};
  for (const id of customerIds) {
    out[id] = await scoreLifecycle(id);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1.7 scoreCustomer — spec-named wrapper
// Returns 'healthy'|'needs_attention'|'at_risk' + reasons[]
// Rules: no visit in 60d → needs_attention; no visit in 120d → at_risk;
//        2+ no-shows → at_risk; balance > 100 → needs_attention
// ---------------------------------------------------------------------------

export interface CustomerScore {
  health: LifecycleHealth;
  reasons: string[];
}

export async function scoreCustomer(customerId: string): Promise<CustomerScore> {
  const s = await scoreLifecycle(customerId);
  return { health: s.health, reasons: s.reasons };
}

// ---------------------------------------------------------------------------
// 1.8 suggestStage(customerId) — spec-named exported version
// Maps score → new_lead/new_customer/active/vip/returning/lapsed/at_risk/lost
// ---------------------------------------------------------------------------

export async function suggestStage(customerId: string): Promise<string | null> {
  const s = await scoreLifecycle(customerId);
  return s.suggestedStage;
}
