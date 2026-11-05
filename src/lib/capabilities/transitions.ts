// ===========================================================================
// lib/capabilities/transitions.ts — M3 (DOCX §3.3): who may move a
// commitment, with the conditions on the capability row, not the button.
//
// The matrix below is the code mirror of
// platform_capabilities.conditions for commitment.transition (migration
// 20261187); the DB row is the auditable authority, this module is the
// enforcement. They must agree — /api/capabilities diffs them at
// runtime and reports any drift instead of silently enforcing one.
//
// STATES: the DOCX table says draft/requested/held/scheduled/
// checked_in/in_service/ready/completed. The machine (M4) calls
// 'requested' PRECHECK, so normalizeTransitionState maps requested ↔
// precheck to the same state. Legacy values normalize through
// commitmentStatusFromBooking (M4's one vocabulary): confirmed and
// assigned are NOT states (a flag and a relation), waiting_checkin is
// derived, deposit_paid is a money fact, hold is held, rescheduled is
// an event. Callers that write those legacy values go through the
// route's own branches (confirm flag, assign relation, deposit → held),
// not through this matrix — see the notes on the special cases below.
//
// LENSES (M2 audiences): owner, provider, operator, manager, platform,
// agent. Role → lens is resolved in guards.ts (a salon admin acts
// through the manager lens for transitions, a salon operator through
// the operator lens, a groomer through provider, a customer through
// owner, a platform admin through platform).
//
// CONDITION KEYS (DOCX §3.3 ◐): self — the actor's own booking (owner)
// or assigned visit (provider); confirm — an explicit confirmation
// flag on the request; policy — the tenant cancellation policy, which
// M3 encodes as: before check-in only (once checked in, in service or
// ready, the owner no longer cancels — the salon does); limit — a
// money limit the caller supplies and the guard compares.
// A conditional that its caller cannot evidence FAILS CLOSED (denied
// with the condition named) — never silently allowed.
//
// SPECIAL CASES (documented, not matrix rows):
//   · confirm: writes the legacy 'confirmed' flag value, not a machine
//     move. Allowed for operator/manager/platform only (the Actions
//     sheet's Confirm rows are admin/platform). The vet confirm path
//     (vet calendar, confirmed_by_vet_at) is a separate route and is
//     untouched by M3.
//   · assigned: writes the 'assigned' relation value. Allowed for
//     operator/manager/platform from any non-terminal state.
//   · hold (employee route): the groomer's pause flag (M4: hold → held
//     on write). Allowed for provider/operator/manager/platform from
//     checked_in/in_service; resume returns to in_service for the same
//     lenses. These are flag acts, not matrix moves, and the employee
//     route's own from-lists stay the authority for them.
//   · employee complete: the groomer route collapses in_service →
//     ready → completed into one act (complete + release-to-front-desk
//     is the lived flow; the front-desk release is the operator-visible
//     ready moment). The matrix provider cell for ready → completed
//     is ○, so the collapse is a deliberate, documented exception for
//     the employee route ONLY, gated on assigned-to-me (self).
//   · booked-equivalence (employee check-in): the employee route's
//     from-list treats precheck/held/assigned as check-in entry points
//     alongside scheduled. The matrix's scheduled → checked_in row
//     covers that booked family for the provider lens when self.
//   · M2's provider price_balance HIDDEN cell is preserved: this module
//     decides allow/deny only and never touches field visibility — the
//     lens projector (M2) remains the only render path.
//   · ADMIN-ROUTE exceptions (in appointments/actions/route.ts, not
//     here, because they are console acts, not matrix rows): intake
//     corrections (early states back to precheck/scheduled, working
//     lenses only), hold-as-flag, complete-collapse, and check-in
//     booked-equivalence — each documented at its call site.
// ===========================================================================

// commitmentStatusFromBooking was removed (booking/ directory deleted).
// The transition matrix is retained for the LensAudience type export
// used by guards.ts. The commitment transition logic is pet-salon
// legacy and not exercised by e-commerce flows.

export type LensAudience = "owner" | "provider" | "operator" | "manager" | "platform" | "agent";

export type MatrixVerdict = "allowed" | "denied" | "conditional";

export interface TransitionCondition {
  key: "self" | "confirm" | "policy" | "limit" | "request";
  detail: string;
}

export interface TransitionCheck {
  allowed: boolean;
  verdict: MatrixVerdict;
  condition?: TransitionCondition;
  reason: string;
}

export interface TransitionContext {
  /** Owner: this is the actor's own booking. Provider: assigned to them. */
  isSelf?: boolean;
  /** An explicit confirmation flag rode on the request. */
  confirmed?: boolean;
  /** Refund amount in cents (for the limit condition). */
  amountCents?: number;
  /** Refund cap in cents for operator/manager (for the limit condition). */
  limitCents?: number;
}

/** DOCX 'requested' is the machine's 'precheck'; everything else passes
 *  through M4's one vocabulary. */
export function normalizeTransitionState(raw: unknown): string {
  const s = String(raw || "").toLowerCase().replace(/[\s-]+/g, "_");
  if (s === "requested") return "precheck";
  // M4: 'confirmed' is a flag, not a state — the state is scheduled
  // (same fold as M2's normalizeLensState). 'assigned' stays its own
  // value: it is a relation, and the policy window treats it as
  // pre-service (see the policy branch below).
  if (s === "confirmed") return "scheduled";
  const mapped = String(raw ?? ""); // booking normalization removed — passthrough
  return mapped === "rescheduled" ? "scheduled" : mapped;
}

const TERMINALS = new Set(["cancelled", "no_show", "completed", "expired"]);

type Cell = "●" | "◐" | "○";
type Row = Partial<Record<LensAudience, Cell>>;

const CONDITION_FOR: Record<string, TransitionCondition> = {
  self: { key: "self", detail: "only the actor's own booking (owner) or assigned visit (provider)" },
  confirm: { key: "confirm", detail: "requires an explicit confirmation flag on the request" },
  policy: { key: "policy", detail: "tenant cancellation policy: before check-in only" },
  limit: { key: "limit", detail: "refund must sit under the operator/manager money limit" },
  request: { key: "request", detail: "owner refunds are requests, not executions" },
};

/** The §3.3 matrix. Key: "from>to". "*" as a from means any
 *  non-terminal from-state (the DOCX's "→ cancelled" / "→ no_show" /
 *  "refund" rows). */
const MATRIX: Record<string, Row & { condition?: keyof typeof CONDITION_FOR }> = {
  "draft>precheck": { owner: "●", operator: "●", platform: "●", agent: "●" },
  "precheck>held": { owner: "●", operator: "●", platform: "●", agent: "◐", condition: "confirm" },
  "held>scheduled": { operator: "●", manager: "●", platform: "●", agent: "◐", condition: "confirm" },
  "scheduled>checked_in": { owner: "◐", provider: "◐", operator: "●", manager: "●", platform: "●", condition: "self" },
  "checked_in>in_service": { provider: "●", operator: "●", manager: "●", platform: "●" },
  "in_service>ready": { provider: "●", operator: "●", manager: "●", platform: "●" },
  "ready>completed": { operator: "●", manager: "●", platform: "●" },
  "*>cancelled": { owner: "◐", operator: "●", manager: "●", platform: "●", agent: "◐", condition: "policy" },
  "*>no_show": { operator: "●", manager: "●", platform: "●" },
};

function cellFor(from: string, to: string, lens: LensAudience): { cell: Cell; condition?: keyof typeof CONDITION_FOR } {
  const row = MATRIX[`${from}>${to}`] ?? (to === "cancelled" || to === "no_show" ? MATRIX[`*>${to}`] : undefined);
  if (!row) return { cell: "○" };
  // The *>cancelled row carries two conditions: policy for the owner,
  // confirm for the agent. Resolve per lens.
  if (row === MATRIX["*>cancelled"]) {
    if (lens === "agent") return { cell: row.agent ?? "○", condition: "confirm" };
    if (lens === "owner") return { cell: row.owner ?? "○", condition: "policy" };
    return { cell: row[lens] ?? "○" };
  }
  return { cell: row[lens] ?? "○", condition: row.condition };
}

/**
 * The one transition verdict for a commitment move. Callers pass the
 * RAW from/to values; normalization happens here, once.
 */
export function checkCommitmentTransition(
  fromRaw: unknown,
  toRaw: unknown,
  lens: LensAudience,
  ctx: TransitionContext = {},
): TransitionCheck {
  const from = normalizeTransitionState(fromRaw);
  const to = normalizeTransitionState(toRaw);
  if (TERMINALS.has(from)) {
    return { allowed: false, verdict: "denied", reason: `A ${from} commitment is terminal and cannot move to ${to}.` };
  }
  if (from === to) {
    // Idempotent reaffirm (e.g. the 'scheduled' action on a scheduled
    // row): allowed for the lenses that work the booking, never for
    // the owner/agent re-stating someone else's state.
    const ok = lens === "operator" || lens === "manager" || lens === "platform" || lens === "provider";
    return ok
      ? { allowed: true, verdict: "allowed", reason: `Already ${to}; reaffirmed.` }
      : { allowed: false, verdict: "denied", reason: `The ${lens} lens may not reaffirm ${to}.` };
  }
  const { cell, condition } = cellFor(from, to, lens);
  if (cell === "●") return { allowed: true, verdict: "allowed", reason: `${lens} may move ${from} → ${to}.` };
  if (cell === "○") {
    return { allowed: false, verdict: "denied", reason: `The ${lens} lens may not move ${from} → ${to} (DOCX §3.3).` };
  }
  // ◐ — the condition must be evidenced, or the move fails closed.
  const cond = CONDITION_FOR[condition ?? "confirm"];
  if (cond.key === "self" && ctx.isSelf) {
    return { allowed: true, verdict: "conditional", condition: cond, reason: `Self move ${from} → ${to} (assigned/own booking).` };
  }
  if (cond.key === "confirm" && ctx.confirmed) {
    return { allowed: true, verdict: "conditional", condition: cond, reason: `Confirmed move ${from} → ${to}.` };
  }
  if (cond.key === "policy" && lens === "owner") {
    // Policy, encoded: the owner cancels before check-in only. The
    // caller supplies from-state; checked_in/in_service/ready are
    // already past the policy window, so they never reach this branch
    // as allowed — they fall through to denied below.
    const beforeCheckin = ["draft", "precheck", "held", "scheduled", "assigned"].includes(from);
    if (beforeCheckin) {
      return { allowed: true, verdict: "conditional", condition: cond, reason: `Owner cancellation inside the policy window (${from} → cancelled).` };
    }
  }
  if (cond.key === "limit" && ctx.amountCents !== undefined && ctx.limitCents !== undefined) {
    if (ctx.amountCents <= ctx.limitCents) {
      return { allowed: true, verdict: "conditional", condition: cond, reason: `Refund under the limit (${ctx.amountCents} ≤ ${ctx.limitCents} cents).` };
    }
    return { allowed: false, verdict: "conditional", condition: cond, reason: `Refund ${ctx.amountCents} cents exceeds the ${lens} limit of ${ctx.limitCents} cents.` };
  }
  return { allowed: false, verdict: "conditional", condition: cond, reason: `Move ${from} → ${to} requires: ${cond.detail}.` };
}

/** The §3.3 refund row (money, not a state move). */
export function checkCommitmentRefund(
  lens: LensAudience,
  ctx: TransitionContext = {},
): TransitionCheck {
  if (lens === "platform") return { allowed: true, verdict: "allowed", reason: "Platform may refund." };
  if (lens === "owner") {
    return { allowed: false, verdict: "conditional", condition: CONDITION_FOR.request, reason: "An owner refund is a request to the salon, not an execution." };
  }
  if (lens === "operator" || lens === "manager") {
    if (ctx.amountCents !== undefined && ctx.limitCents !== undefined) {
      if (ctx.amountCents <= ctx.limitCents) {
        return { allowed: true, verdict: "conditional", condition: CONDITION_FOR.limit, reason: `Refund under the limit.` };
      }
      return { allowed: false, verdict: "conditional", condition: CONDITION_FOR.limit, reason: `Refund exceeds the ${lens} limit.` };
    }
    return { allowed: false, verdict: "conditional", condition: CONDITION_FOR.limit, reason: "A refund limit must be supplied to evidence an operator/manager refund." };
  }
  return { allowed: false, verdict: "denied", reason: `The ${lens} lens may not refund (DOCX §3.3).` };
}

/** Flag/relation acts that are not matrix moves (see header). */
export function checkCommitmentFlagAction(
  action: "confirm" | "assigned" | "hold" | "resume",
  lens: LensAudience,
): TransitionCheck {
  const allowedLenses: Record<string, LensAudience[]> = {
    confirm: ["operator", "manager", "platform"],
    assigned: ["operator", "manager", "platform"],
    hold: ["provider", "operator", "manager", "platform"],
    resume: ["provider", "operator", "manager", "platform"],
  };
  const ok = (allowedLenses[action] ?? []).includes(lens);
  return ok
    ? { allowed: true, verdict: "allowed", reason: `${lens} may ${action}.` }
    : { allowed: false, verdict: "denied", reason: `The ${lens} lens may not ${action} (not a ${lens} act).` };
}
