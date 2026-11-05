// ---------------------------------------------------------------------------
// onboarding/gates-config.ts — gate definitions (spec §2), the per-type
// gate lists (spec §3 + pharmacy Phase 1 §5), and POLICY configuration
// (spec §6/§7 owner annotations). A user type is ONLY a configured list of
// the shared gates — there are no per-type state machines.
//
// CONFIG_VERSION is stamped onto every case at creation; bump it whenever
// GATE_DEFS / TYPE_GATES / POLICY change so in-flight cases keep the
// semantics they started under.
// ---------------------------------------------------------------------------

import type { ApplicantType, GateFailureMode, GateKey } from "./types";

export const CONFIG_VERSION = 1;

export interface GateDef {
  key: GateKey;
  name: string;
  /** Gates that must pass before this gate can pass (spec §2). */
  dependsOn: GateKey[];
  /**
   * G13 only: depends on ALL required gates for the case's type passing
   * (spec §2), which cannot be a fixed key list.
   */
  dependsOnAllRequired?: boolean;
  failureMode: GateFailureMode;
  /** Spec §2 "Why here" / failure detail, kept with the definition. */
  note: string;
}

export const GATE_DEFS: GateDef[] = [
  { key: "G0", name: "Classify", dependsOn: [], failureMode: "none",
    note: "U1 selects the gate list for the case's type." },
  { key: "G1", name: "Age", dependsOn: ["G0"], failureMode: "rejected",
    note: "Self-declared DOB; cheap, stops under-18s before sensitive data is collected. Under 18 → REJECTED (decided at answer time by the intake layer; applyGateFailure exposes the same semantics)." },
  { key: "G2", name: "Account and contact", dependsOn: ["G1"], failureMode: "retry",
    note: "Email OTP, SMS OTP, MFA — needed before any document upload. Failure = retry limits." },
  { key: "G3", name: "Identity", dependsOn: ["G2"], failureMode: "manual_review",
    note: "Government ID + liveness + name/DOB match; the anchor for every later name match. 1 retry → manual review." },
  { key: "G4", name: "Entity", dependsOn: ["G3"], failureMode: "manual_review",
    note: "KYB, UBO, authorized rep — entities only, needs the rep verified first. Mismatch → manual review; dissolved entity → REJECTED (explicit caller transition)." },
  { key: "G5", name: "Sanctions, PEP, adverse media", dependsOn: ["G3"], failureMode: "blocked",
    note: "Needs a verified legal name (G3, or G4 for entities); must run before any money moves. Hit → manual review + auto-block (BLOCKED_PENDING)." },
  { key: "G6", name: "Professional credentials", dependsOn: ["G3"], failureMode: "blocked",
    note: "The license/DEA/certification itself (per-state for vets). Expired/inactive → BLOCKED." },
  { key: "G7", name: "Insurance", dependsOn: ["G6"], failureMode: "needs_info",
    note: "COI, limits vs POLICY floors, expiry. Below limits → NEEDS_INFO." },
  { key: "G8", name: "Background check", dependsOn: ["G3"], failureMode: "manual_review",
    note: "Requires a verified identity + consent. Adverse → manual review." },
  { key: "G9", name: "Tax identity", dependsOn: ["G3"], failureMode: "retry",
    note: "W-9 or W-8 + TIN match against the verified identity (G3, or G4 entity). Retries, then backup withholding (gate-level)." },
  { key: "G10", name: "Payout account", dependsOn: ["G5", "G9"], failureMode: "retry",
    note: "Guard: no payout method until screening is clear (G5) and tax is verified (G9). Retries, then payouts locked (gate-level)." },
  { key: "G11", name: "Agreements and policy acceptance", dependsOn: ["G6", "G7"], failureMode: "blocked",
    note: "Sign after the facts are verified. Unsigned → blocks activation (BLOCKED_PENDING). For types without G6/G7 the dependency is on whichever of them the type runs." },
  { key: "G12", name: "Training and assessment", dependsOn: ["G11"], failureMode: "retry",
    note: "Last, so nobody trains who will be rejected. Retake rules are gate-level (attempts)." },
  { key: "G13", name: "Risk scoring and review", dependsOn: [], dependsOnAllRequired: true, failureMode: "rejected",
    note: "Human decision on flagged cases once every required gate has passed: APPROVED or REJECTED (reviewer drives it via transitionCase; applyGateFailure('G13') = REJECTED)." },
  { key: "G14", name: "Activation", dependsOn: ["G13"], failureMode: "none",
    note: "Per-capability activation (for vets: per-state capabilities, spec §4)." },
];

export const GATE_DEF_BY_KEY: Record<GateKey, GateDef> = Object.fromEntries(
  GATE_DEFS.map((d) => [d.key, d]),
) as Record<GateKey, GateDef>;

/** One gate instance in a type's configured list. */
export interface TypeGateConfig {
  gateKey: GateKey;
  /**
   * Required gates block the IN_GATES → READY_FOR_REVIEW auto-transition
   * until passed/waived (G13/G14 are required for the case overall but
   * are the review/activation steps themselves — see
   * requiredGateKeysForReview).
   */
  required: boolean;
  /**
   * Condition under which this gate applies, for gates that exist in a
   * type's list but only sometimes apply (e.g. groomer G4 "if
   * registered"). A conditional gate is instantiated as pending with the
   * condition recorded in its data; the intake layer marks it
   * not_applicable when the condition does not hold.
   */
  conditional?: string;
  note?: string;
}

const g = (gateKey: GateKey, extra?: Partial<TypeGateConfig>): TypeGateConfig => ({
  gateKey,
  required: true,
  ...extra,
});

/**
 * Per-type gate lists (spec §3 matrix). Every list includes G0
 * (pre-instantiated at case creation like every other gate).
 */
export const TYPE_GATES: Record<ApplicantType, TypeGateConfig[]> = {
  individual_seller: [
    g("G0"), g("G1"), g("G2"), g("G3"), g("G5"),
    g("G6", { required: false, conditional: "permit_if_required", note: "State seller's permit, only if the seller's state requires one (§3)." }),
    g("G9"), g("G10"), g("G11"), g("G13"), g("G14"),
  ],
  business_seller: [
    g("G0"), g("G1"), g("G2"), g("G3"), g("G4"), g("G5"),
    g("G6", { required: false, conditional: "permit_if_required", note: "State seller's permit, only if required (§3)." }),
    g("G9"), g("G10"), g("G11"), g("G13"), g("G14"),
  ],
  groomer: [
    g("G0"), g("G1"), g("G2"), g("G3"),
    g("G4", { required: false, conditional: "if_registered", note: "Entity + UBO only if the groomer operates as a registered business (GR1, §3)." }),
    g("G5"), g("G6"), g("G7"), g("G8"),
    g("G9"), g("G10"), g("G11"), g("G12"), g("G13"), g("G14"),
  ],
  // Pharmacy PHASE 1 (§5): one national partner, manual path. Required =
  // G1–G5 for the rep, G4 entity, G6 (state + non-resident licenses, DEA
  // only if controlled), G7, G11 (partner agreement, DPA,
  // non-circumvention, liability matrix), G13, G14. G9/G10/G12 exist in
  // the §3 matrix for pharmacies but are NOT Phase-1 required: tax/payout
  // run through the partner agreement and training is optional (§3) —
  // they are instantiated non-required so the rows exist when Phase 2
  // turns them on. The P19–P31 due-diligence survey and PIC background
  // checks (G8) are a LATER phase and are not in this list at all (§5).
  pharmacy: [
    g("G0"), g("G1"), g("G2"), g("G3"), g("G4"), g("G5"),
    g("G6"), g("G7"),
    g("G9", { required: false, note: "Phase 1: handled via the partner agreement/manual path (§5); in the §3 matrix for later phases." }),
    g("G10", { required: false, note: "Phase 1: handled via the partner agreement/manual path (§5); in the §3 matrix for later phases." }),
    g("G11"),
    g("G12", { required: false, note: "Optional for pharmacy (§3)." }),
    g("G13"), g("G14"),
  ],
  veterinarian: [
    g("G0"), g("G1"), g("G2"), g("G3"),
    g("G4", { required: false, conditional: "practice_entity_if_applicable", note: "Optional: practice entity (§3)." }),
    g("G5"), g("G6"), g("G7"), g("G8"),
    g("G9"), g("G10"), g("G11"),
    g("G12", { note: "Short training (§3)." }),
    g("G13"), g("G14"),
  ],
  manufacturer: [
    g("G0"), g("G1"), g("G2"), g("G3"), g("G4"), g("G5"),
    g("G6"), g("G7"),
    g("G9"), g("G10"), g("G11"), g("G13"), g("G14"),
  ],
  franchise: [
    g("G0"), g("G1"), g("G2"), g("G3"), g("G4"), g("G5"),
    g("G6", { note: "Per-location licenses (§3)." }),
    g("G7", { note: "Per location (§3)." }),
    g("G9"), g("G10"),
    g("G11", { note: "Plus FDD receipt + franchise agreement (§3)." }),
    g("G13"), g("G14"),
  ],
};

export function typeGateConfig(type: ApplicantType, gateKey: GateKey): TypeGateConfig | undefined {
  return TYPE_GATES[type].find((t) => t.gateKey === gateKey);
}

/** Gate keys instantiated for a type, in configured order. */
export function gateKeysForType(type: ApplicantType): GateKey[] {
  return TYPE_GATES[type].map((t) => t.gateKey);
}

/**
 * The required gates that must be passed/waived before a case can move
 * IN_GATES → READY_FOR_REVIEW: the type's required gates minus G13 (the
 * review itself — it runs AT review) and G14 (activation, after
 * approval). Conditional/non-required gates never block.
 */
export function requiredGateKeysForReview(type: ApplicantType): GateKey[] {
  return TYPE_GATES[type]
    .filter((t) => t.required && t.gateKey !== "G13" && t.gateKey !== "G14")
    .map((t) => t.gateKey);
}

// ---------------------------------------------------------------------------
// POLICY configuration (spec §6/§7 owner annotations). These are POLICY
// values chosen by the platform — NOT rule-derived — and are marked as
// such; the owner asked for them to be confirmed intentional before
// launch. Insurance floors are in DOLLARS (commerce amounts elsewhere in
// the app are dollars at this boundary too).
// ---------------------------------------------------------------------------

export const POLICY = {
  /** Insurance floors in DOLLARS. POLICY values — confirm intentional. */
  insuranceFloorsDollars: {
    veterinarian: { perOccurrence: 1_000_000, aggregate: 3_000_000 },
    groomer: { perOccurrence: 1_000_000, aggregate: 2_000_000 },
    manufacturer: { productLiability: 1_000_000, generalLiability: 1_000_000 },
  },
  /** Post-activation monitoring (spec §6). POLICY values. */
  monitoring: {
    /** Send expiry reminders this many days before an expiry. */
    reminderDaysBeforeExpiry: [30, 14, 7],
    /** After expiry with no renewal: ACTIVE → RESTRICTED, then after the
     * grace period SUSPENDED. */
    graceDays: { default: 30 },
  },
} as const;

/**
 * U9/U10 identity (photo ID + liveness) scope for entities (spec §7 owner
 * annotation): asked of the authorized representative AND each UBO, not
 * just the account creator. BS9/BS10 carry the matching per-question
 * flags in questions.ts.
 */
export const IDENTITY_VERIFICATION_SCOPE = {
  questionIds: ["U9", "U10"],
  appliesTo: ["applicant", "authorized_rep", "each_ubo", "controlling_person"],
  note: "For entity types, U9/U10 are collected from the authorized representative and from each beneficial owner (BS9) / controlling person (BS10), via vendor hosted fields — never platform forms.",
} as const;
