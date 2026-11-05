// ---------------------------------------------------------------------------
// onboarding/types.ts — shared types for the ONE onboarding engine
// (ONBOARDING_ENGINE_SPEC.md, owner production guidance 2026-10-17).
//
// One case state machine and one set of gates (G0..G14) serve every
// applicant type; a type is only a configured gate list + question blocks
// (see gates-config.ts / questions.ts). There are no per-type state
// machines. Transitions are BACKEND-ONLY: callers go through
// transitionCase() in engine.ts, which validates against CASE_TRANSITIONS
// and writes the append-only onboarding_events row in the same transaction.
// ---------------------------------------------------------------------------

/** Applicant types — the U1 select values (spec §9). */
export type ApplicantType =
  | "individual_seller"
  | "business_seller"
  | "groomer"
  | "pharmacy"
  | "veterinarian"
  | "manufacturer"
  | "franchise";

export const APPLICANT_TYPES: ApplicantType[] = [
  "individual_seller",
  "business_seller",
  "groomer",
  "pharmacy",
  "veterinarian",
  "manufacturer",
  "franchise",
];

export function isApplicantType(v: unknown): v is ApplicantType {
  return typeof v === "string" && (APPLICANT_TYPES as string[]).includes(v);
}

/** Case states (spec §1). REJECTED is terminal. */
export type CaseState =
  | "DRAFT"
  | "CLASSIFIED"
  | "AGE_CLEARED"
  | "ACCOUNT_VERIFIED"
  | "IN_GATES"
  | "READY_FOR_REVIEW"
  | "UNDER_REVIEW"
  | "NEEDS_INFO"
  | "BLOCKED_PENDING"
  | "APPROVED"
  | "ACTIVE"
  | "RESTRICTED"
  | "SUSPENDED"
  | "OFFBOARDED"
  | "REJECTED";

export const CASE_STATES: CaseState[] = [
  "DRAFT",
  "CLASSIFIED",
  "AGE_CLEARED",
  "ACCOUNT_VERIFIED",
  "IN_GATES",
  "READY_FOR_REVIEW",
  "UNDER_REVIEW",
  "NEEDS_INFO",
  "BLOCKED_PENDING",
  "APPROVED",
  "ACTIVE",
  "RESTRICTED",
  "SUSPENDED",
  "OFFBOARDED",
  "REJECTED",
];

/**
 * Legal case transitions (spec §1). The happy path is
 * DRAFT → CLASSIFIED → AGE_CLEARED → ACCOUNT_VERIFIED → IN_GATES →
 * READY_FOR_REVIEW → UNDER_REVIEW → APPROVED → ACTIVE.
 * NEEDS_INFO and BLOCKED_PENDING are holding states reachable from every
 * pre-approval working state, and both loop back to IN_GATES (more gate
 * work) or UNDER_REVIEW (straight back to the reviewer). REJECTED is
 * reachable from every pre-approval state (under-18, confirmed sanctions,
 * dissolved entity, fraud, reviewer decision) and is terminal.
 * Post-activation: ACTIVE ⇄ RESTRICTED → SUSPENDED → OFFBOARDED
 * (a suspended case may return to RESTRICTED while it cures).
 */
export const CASE_TRANSITIONS: Record<CaseState, CaseState[]> = {
  DRAFT: ["CLASSIFIED", "REJECTED"],
  CLASSIFIED: ["AGE_CLEARED", "NEEDS_INFO", "BLOCKED_PENDING", "REJECTED"],
  AGE_CLEARED: ["ACCOUNT_VERIFIED", "NEEDS_INFO", "BLOCKED_PENDING", "REJECTED"],
  ACCOUNT_VERIFIED: ["IN_GATES", "NEEDS_INFO", "BLOCKED_PENDING", "REJECTED"],
  IN_GATES: ["READY_FOR_REVIEW", "NEEDS_INFO", "BLOCKED_PENDING", "REJECTED"],
  READY_FOR_REVIEW: ["UNDER_REVIEW", "IN_GATES", "NEEDS_INFO", "BLOCKED_PENDING", "REJECTED"],
  UNDER_REVIEW: ["APPROVED", "IN_GATES", "NEEDS_INFO", "BLOCKED_PENDING", "REJECTED"],
  NEEDS_INFO: ["IN_GATES", "UNDER_REVIEW", "BLOCKED_PENDING", "REJECTED"],
  BLOCKED_PENDING: ["IN_GATES", "UNDER_REVIEW", "NEEDS_INFO", "REJECTED"],
  APPROVED: ["ACTIVE"],
  ACTIVE: ["RESTRICTED", "SUSPENDED", "OFFBOARDED"],
  RESTRICTED: ["ACTIVE", "SUSPENDED", "OFFBOARDED"],
  SUSPENDED: ["RESTRICTED", "OFFBOARDED"],
  OFFBOARDED: [],
  REJECTED: [],
};

export function isLegalTransition(from: CaseState, to: CaseState): boolean {
  return (CASE_TRANSITIONS[from] ?? []).includes(to);
}

/** Gate keys G0..G14 (spec §2). */
export type GateKey =
  | "G0" | "G1" | "G2" | "G3" | "G4" | "G5" | "G6" | "G7" | "G8"
  | "G9" | "G10" | "G11" | "G12" | "G13" | "G14";

export const GATE_KEYS: GateKey[] = [
  "G0", "G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8",
  "G9", "G10", "G11", "G12", "G13", "G14",
];

export function isGateKey(v: unknown): v is GateKey {
  return typeof v === "string" && (GATE_KEYS as string[]).includes(v);
}

/** Gate statuses (engine contract). */
export type GateStatus =
  | "pending"
  | "in_progress"
  | "passed"
  | "failed"
  | "blocked"
  | "needs_info"
  | "waived"
  | "not_applicable"
  | "pending_vendor";

export const GATE_STATUSES: GateStatus[] = [
  "pending",
  "in_progress",
  "passed",
  "failed",
  "blocked",
  "needs_info",
  "waived",
  "not_applicable",
  "pending_vendor",
];

export function isGateStatus(v: unknown): v is GateStatus {
  return typeof v === "string" && (GATE_STATUSES as string[]).includes(v);
}

/**
 * What a gate failure does to the case (spec §2 "On failure" column):
 *  - none:            no case effect (G0, G14).
 *  - rejected:        case → REJECTED (G1 under-18; G13 reviewer reject).
 *  - retry:           gate fails, case does not move — the applicant
 *                     retries within attempt limits (G2 OTP, G9 TIN,
 *                     G10 payout, G12 retakes). Payout/TIN lockouts are
 *                     gate-level (attempts), not case states.
 *  - manual_review:   case → NEEDS_INFO — a human must look before the
 *                     gate can pass (G3 identity, G4 entity mismatch,
 *                     G8 adverse background). A dissolved entity under
 *                     G4 is REJECTED explicitly by the caller, not here.
 *  - blocked:         case → BLOCKED_PENDING (G5 sanctions hit —
 *                     manual review + auto-block; G6 expired/inactive
 *                     credential; G11 agreements block activation).
 *  - needs_info:      case → NEEDS_INFO (G7 insurance below limits).
 */
export type GateFailureMode =
  | "none"
  | "rejected"
  | "retry"
  | "manual_review"
  | "blocked"
  | "needs_info";

/** The case state a failure mode drives, or null when the case stays put. */
export const FAILURE_CASE_STATE: Record<GateFailureMode, CaseState | null> = {
  none: null,
  rejected: "REJECTED",
  retry: null,
  manual_review: "NEEDS_INFO",
  blocked: "BLOCKED_PENDING",
  needs_info: "NEEDS_INFO",
};

/**
 * A platform determination record (spec §7: V31 employment classification
 * must NOT be an acknowledgment checkbox — the platform records its
 * determination and its basis). Stored on the case at
 * metadata.determinations[] via recordDetermination() in engine.ts.
 */
export interface DeterminationRecord {
  kind: "employment_classification" | string;
  determination: string;
  basis: string;
  decided_by: string;
  /** ISO timestamp. */
  at: string;
}

export interface OnboardingCase {
  id: string;
  tenantId: string;
  userId: string | null;
  applicantEmail: string;
  type: ApplicantType;
  state: CaseState;
  configVersion: number;
  metadata: Record<string, unknown> & { determinations?: DeterminationRecord[] };
  createdAt: string;
  updatedAt: string;
}

export interface OnboardingGate {
  id: string;
  caseId: string;
  gateKey: GateKey;
  status: GateStatus;
  attempts: number;
  evidenceRef: string | null;
  decidedBy: string | null;
  data: Record<string, unknown>;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OnboardingEvent {
  id: string;
  caseId: string;
  fromState: CaseState | null;
  toState: CaseState;
  actor: string;
  reason: string | null;
  evidenceRef: string | null;
  createdAt: string;
}

export interface OnboardingCaseWithGates extends OnboardingCase {
  gates: OnboardingGate[];
}

/** Capability statuses for vets (spec §4); other types may use their own. */
export type VetCapabilityStatus =
  | "UNVERIFIED"
  | "LICENSE_PENDING"
  | "VERIFIED"
  | "ACTIVE_TELEMEDICINE"
  | "ACTIVE_REFERRAL_ONLY"
  | "LAPSED";

export interface Capability {
  id: string;
  caseId: string;
  capability: string;
  jurisdiction: string;
  status: string;
  licenseNo: string | null;
  expiresAt: string | null;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
