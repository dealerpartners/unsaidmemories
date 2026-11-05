// ---------------------------------------------------------------------------
// onboarding/fsm-defs.ts — the partner-onboarding question-flow machines,
// as DATA (owner spec 2026-10-18). Every applicant type is a deterministic
// finite state machine M = (S, E, δ, s0, F): exactly one active state per
// case, and the next state is fully determined by (current state, event).
//
// This module is the AUTHORED source. The same definitions are materialized
// into the `fsm_transitions` SQL table (migration 20261149, generated from
// these rows) — flows as data, so a new state is an inserted row, not a
// deploy — and the runtime engine (fsm.ts) reads the TABLE for advance(),
// while the serving projection (steps.ts) walks THESE definitions. The
// FSM proof asserts the table and these definitions are identical, so the
// two materializations cannot silently fork.
//
// The backend lifecycle FSM (engine.ts: DRAFT → CLASSIFIED → … → ACTIVE)
// remains the OUTER machine. This question-flow FSM runs inside it
// (CLASSIFIED → … → READY_FOR_REVIEW): gates-config gates correspond to
// states (the age state is G1's outcome, IDENTITY_PENDING is G3,
// LICENSE_PENDING is G6, …) — one system, not a parallel one.
//
// Shared entry spine (every type): START ─[select_type]→ TYPE_SET
// ─[select_state]→ RULES_LOADED. RULES_LOADED looks the case's
// jurisdiction up in `jurisdiction_rules` (keyed (type, state): age of
// majority, telemedicine eligibility, required documents) and decides
// which chain the case enters and which states exist for it at all.
//
// ORDER IS FIXED ON PURPOSE (owner): payout sits after screening and
// tax — money never routes to anyone uncleared. No parallel states.
//
// Question sets: each state serves a set of EXISTING questions.ts
// questions (content unchanged). A state with an empty set is a
// backend-only state (its data arrives via vendor/admin channels). Every
// question of a type's legacy composition is claimed by exactly one
// state of that type's machine — the FSM proof asserts the union of a
// machine's state sets equals the type's served set, so no question can
// be lost or smuggled across types.
// ---------------------------------------------------------------------------

import { QUESTION_BY_ID } from "./questions";
import type { ApplicantType } from "./types";

/** Guard keys — the CLOSED guard vocabulary. A transition's guard is one
 *  of these keys (data in fsm_transitions.guard); fsm.ts maps each key to
 *  exactly one predicate over jurisdiction_rules + case facts. No
 *  arbitrary code can ride in a transition row. */
export type GuardKey =
  | "states_licensed_min_1"
  | "any_state_telemedicine_eligible"
  | "no_state_telemedicine_eligible"
  | "dob_meets_majority"
  | "dob_below_majority"
  | "attempts_lt_2"
  | "attempts_gte_2"
  | "locality_requires_license"
  | "locality_not_requires_license"
  | "is_mobile"
  | "not_mobile"
  | "entity_registered"
  | "entity_sole_prop"
  | "controlled_true"
  | "controlled_false"
  | "category_food"
  | "category_toys"
  | "category_healthcare"
  | "category_other"
  | "permit_required"
  | "permit_not_required"
  | "screening_clear_recorded"
  | "all_locations_ready"
  | "return_state_set";

/** Events only the backend may fire on behalf of applicant DATA (the
 *  applicant submits answers/documents; the intake layer translates data
 *  into these events). */
export const DATA_EVENTS = new Set([
  "select_type", "select_state", "states_submitted", "ops_states_submitted",
  "age_confirmed", "age_rejected", "profile_completed", "consent_given",
  "all_signed", "info_resubmitted", "state_opened", "auto",
]);

/** Pass/failure events are vendor-webhook or admin emissions (identity
 *  passed, license verified, screening clear, …). The applicant can never
 *  fire them; advance() refuses them for non-backend actors, and refuses
 *  EVERY event for an applicant actor — exactly the backend-only rule the
 *  lifecycle engine already enforces for its transitions. */
export const PASS_EVENTS = new Set([
  "id_passed", "id_failed", "license_verified", "license_failed",
  "screening_clear", "screening_hit", "coi_verified", "coi_failed",
  "tin_matched", "bank_verified", "assessment_passed", "approved",
  "rejected", "denied", "cleared", "entity_verified", "pic_verified",
  "dea_verified", "facility_verified", "facility_failed",
  "safety_verified", "safety_failed", "materials_verified",
  "materials_failed", "qms_verified", "qms_failed", "permit_verified",
  "fdd_acknowledged", "agreement_signed", "config_completed",
  "tenant_provisioned", "locations_ready", "vehicle_recorded",
  "payout_established", "renewed", "reinstated", "expired",
  "grace_elapsed", "terminated", "rescreen_hit", "expiry_30d",
]);

export interface FsmTransitionDef {
  type: ApplicantType | "*" | "franchise_location";
  from: string;
  event: string;
  guard?: GuardKey;
  to: string;
  note?: string;
}

export interface FsmStateDef {
  state: string;
  /** Question ids served while the case is in this state (may be empty
   *  for backend-only states). Ids are validated against questions.ts. */
  questions: string[];
  /** Projection membership for branch-variant machines. "always" =
   *  every projection of the type. Vet: "tele" (full path states),
   *  "referral" (referral path states), "mixedExtra" (referral states
   *  that join a mixed projection). Seller: "entity" (states only a
   *  registered business enters). */
  include?: "always" | "tele" | "referral" | "mixedExtra" | "entity";
  /** The veterinarian branch-driver state (serves the licensed-states
   *  question; the wizard renders it as its own opening section). */
  branch?: boolean;
}

export interface FsmMachineDef {
  type: ApplicantType;
  states: FsmStateDef[];
}

const q = (ids: string[]): string[] => ids;
const range = (prefix: string, from: number, to: number): string[] => {
  const out: string[] = [];
  for (let i = from; i <= to; i++) out.push(`${prefix}${i}`);
  return out;
};

/** Question sets shared across types (the universal facts are states of
 *  every type's machine at the same spine positions — they are part of
 *  each type's own path, never a shared front-section of steps). */
const ENTRY_QUESTIONS = q(["U1", "U4", "U5", "U6", "U7", "U8"]); // TYPE_SET
const IDENTITY_QUESTIONS = q(["U2", "U9", "U10"]); // G3
const SCREENING_QUESTIONS = q(["U11"]); // G5 consent

// ---------------------------------------------------------------------------
// VETERINARIAN — the branch machine. RULES_LOADED serves the licensed-
// states question (V1); its answer routes the case: any licensed state
// telemedicine-eligible → the telemedicine chain; none → the referral
// chain. Per-state truth lives in `capabilities` (the vet_state_capability
// records); a mixed case follows the telemedicine chain at case level and
// its projection additionally carries the referral states.
// ---------------------------------------------------------------------------
const VET: FsmMachineDef = {
  type: "veterinarian",
  states: [
    { state: "START", questions: [] },
    { state: "TYPE_SET", questions: ENTRY_QUESTIONS },
    { state: "RULES_LOADED", questions: q(["V1"]), branch: true },
    { state: "ROUTED", questions: [], include: "tele" },
    { state: "PATH_TELE", questions: q(["U3"]), include: "tele" },
    { state: "IDENTITY_PENDING", questions: IDENTITY_QUESTIONS, include: "tele" },
    { state: "LICENSE_PENDING", questions: q(["V2", "V3", "V4", "V5", "V6", "V7", "V9", "V10", "V11", "V12"]), include: "tele" },
    { state: "SCREENING_PENDING", questions: [...SCREENING_QUESTIONS, "V8", "V13", "V14", "V15"], include: "tele" },
    { state: "INSURANCE_PENDING", questions: range("V", 16, 22), include: "tele" },
    { state: "AGREEMENTS_PENDING", questions: range("V", 23, 30), include: "tele" },
    { state: "TAX_PENDING", questions: [], include: "tele" },
    { state: "PAYOUT_PENDING", questions: [], include: "tele" },
    { state: "TRAINING", questions: q(["V32", "V33", "V34"]), include: "tele" },
    { state: "UNDER_REVIEW", questions: [], include: "tele" },
    { state: "ACTIVE_TELEMEDICINE", questions: [], include: "tele" },
    { state: "PATH_REFERRAL", questions: [], include: "referral" },
    // The referral chain's applicant state carries the universal facts
    // (age, identity, screening consent) alongside the practice profile:
    // the referral composition is U-facts + VR, ordered branch-first —
    // the facts are collected while the case sits in this state, and
    // profile_completed fires when the state's data is complete.
    { state: "PRACTICE_PROFILE", questions: ["U3", ...IDENTITY_QUESTIONS, ...SCREENING_QUESTIONS, ...range("VR", 1, 13)], include: "referral" },
    { state: "DIRECTORY_CONSENT", questions: q(["VR14", "VR15"]), include: "referral" },
    { state: "ACTIVE_REFERRAL_ONLY", questions: [], include: "referral" },
    // Mixed projection: the referral states join the telemedicine chain
    // (after TRAINING, before UNDER_REVIEW) for a case licensed in both
    // kinds of states; per-state status stays in capabilities.
    { state: "PRACTICE_PROFILE", questions: range("VR", 1, 13), include: "mixedExtra" },
    { state: "DIRECTORY_CONSENT", questions: q(["VR14", "VR15"]), include: "mixedExtra" },
  ],
};

// ---------------------------------------------------------------------------
// PHARMACY — Phase 1 (one national partner, manual path). The DEA
// decision defaults to controlled=false (Phase 1): the case skips
// DEA_PENDING unless a DEA registration is on file.
// ---------------------------------------------------------------------------
const PHARMACY: FsmMachineDef = {
  type: "pharmacy",
  states: [
    { state: "START", questions: [] },
    { state: "TYPE_SET", questions: ENTRY_QUESTIONS },
    { state: "RULES_LOADED", questions: q(["P5", "P6"]) },
    { state: "ENTITY_PENDING", questions: ["U3", ...IDENTITY_QUESTIONS, ...range("BS", 1, 12)] },
    { state: "PHARMACY_LICENSE_PENDING", questions: q(["P1", "P2", "P3", "P4"]) },
    { state: "PIC_PENDING", questions: range("P", 11, 16) },
    { state: "SCREENING_PENDING", questions: [...SCREENING_QUESTIONS, "P17", "P18"] },
    { state: "INSURANCE_PENDING", questions: range("P", 33, 37) },
    { state: "DEA_DECISION", questions: [] },
    { state: "DEA_PENDING", questions: range("P", 7, 10) },
    { state: "AGREEMENTS_PENDING", questions: ["P32", ...range("P", 38, 45)] },
    { state: "TAX_PENDING", questions: q(["BS13", "BS14"]) },
    { state: "PAYOUT_PENDING", questions: [] },
    { state: "UNDER_REVIEW", questions: [] },
    { state: "ACTIVE", questions: [] },
  ],
};

// ---------------------------------------------------------------------------
// GROOMER (third-party) — locality decides whether the license state
// exists at all; the mobile answer decides the vehicle state. A groomer
// operating as a registered business additionally enters the entity
// states (the conditional business block, guarded by GR1 as today).
// ---------------------------------------------------------------------------
const GROOMER: FsmMachineDef = {
  type: "groomer",
  states: [
    { state: "START", questions: [] },
    { state: "TYPE_SET", questions: ENTRY_QUESTIONS },
    { state: "RULES_LOADED", questions: [] },
    { state: "AGE_CONFIRMED", questions: q(["U3"]) },
    { state: "IDENTITY_PENDING", questions: IDENTITY_QUESTIONS },
    { state: "ENTITY_DECISION", questions: q(["GR1"]) },
    { state: "ENTITY_PENDING", questions: range("BS", 1, 12), include: "entity" },
    { state: "LOCAL_LICENSE_PENDING", questions: range("GR", 2, 7) },
    { state: "INSURANCE_PENDING", questions: range("GR", 8, 14) },
    { state: "SCREENING_PENDING", questions: [...SCREENING_QUESTIONS, "GR19"] },
    { state: "MOBILE_DECISION", questions: q(["GR15"]) },
    { state: "VEHICLE_PENDING", questions: q(["GR16", "GR17", "GR18", "GR21"]) },
    { state: "AGREEMENTS_PENDING", questions: range("GR", 23, 28) },
    { state: "TAX_PENDING", questions: q(["BS13", "BS14"]) },
    { state: "PAYOUT_PENDING", questions: [] },
    { state: "TRAINING", questions: [...range("GR", 29, 33), "GR20", "GR22"] },
    { state: "UNDER_REVIEW", questions: [] },
    { state: "ACTIVE", questions: [] },
  ],
};

// ---------------------------------------------------------------------------
// SELLER — one machine for both seller applicant types; ENTITY_DECISION
// branches on the entity form (sole proprietor skips the entity chain).
// The projection for individual_seller never includes the entity states;
// for business_seller the decision is pre-decided by the type itself.
// ---------------------------------------------------------------------------
const SELLER_STATES: FsmStateDef[] = [
  { state: "START", questions: [] },
  { state: "TYPE_SET", questions: [...ENTRY_QUESTIONS, "S15"] },
  { state: "RULES_LOADED", questions: [] },
  { state: "AGE_CONFIRMED", questions: q(["U3"]) },
  { state: "ENTITY_DECISION", questions: q(["S1"]) },
  { state: "ENTITY_PENDING", questions: range("BS", 1, 8), include: "entity" },
  { state: "UBO_PENDING", questions: q(["BS9", "BS10"]), include: "entity" },
  { state: "REP_PENDING", questions: q(["BS11", "BS12"]), include: "entity" },
  { state: "IDENTITY_PENDING", questions: IDENTITY_QUESTIONS },
  { state: "SCREENING_PENDING", questions: SCREENING_QUESTIONS },
  { state: "TAX_PENDING", questions: ["S2", "S3", "S4", "S5", "S6", "S13", "S14", "BS13", "BS14"] },
  { state: "NEXUS_PERMIT_DECISION", questions: [] },
  { state: "PERMIT_PENDING", questions: q(["S11", "S12"]) },
  { state: "PAYOUT_PENDING", questions: q(["S7", "S8", "S9", "S10", "S24"]) },
  { state: "AGREEMENTS_PENDING", questions: ["S16", ...range("S", 17, 23)] },
  { state: "UNDER_REVIEW", questions: [] },
  { state: "ACTIVE", questions: [] },
];

// ---------------------------------------------------------------------------
// MANUFACTURER / SUPPLIER — category decision routes to the FDA,
// product-safety, and (for healthcare/supplements) restricted-materials
// states; every route passes QMS before insurance.
// ---------------------------------------------------------------------------
const MANUFACTURER: FsmMachineDef = {
  type: "manufacturer",
  states: [
    { state: "START", questions: [] },
    { state: "TYPE_SET", questions: ENTRY_QUESTIONS },
    { state: "RULES_LOADED", questions: [] },
    { state: "ENTITY_PENDING", questions: ["U3", ...range("BS", 1, 8)] },
    { state: "UBO_PENDING", questions: q(["BS9", "BS10"]) },
    { state: "REP_PENDING", questions: [...IDENTITY_QUESTIONS, "BS11", "BS12"] },
    { state: "SCREENING_PENDING", questions: SCREENING_QUESTIONS },
    { state: "CATEGORY_DECISION", questions: q(["M1", "M2"]) },
    { state: "FDA_FACILITY_PENDING", questions: q(["M3", "M4", "M20", "M21"]) },
    { state: "PRODUCT_SAFETY_PENDING", questions: range("M", 5, 9) },
    { state: "RESTRICTED_MATERIALS_PENDING", questions: q(["M13", "M14"]) },
    { state: "QMS_PENDING", questions: ["M10", "M11", "M12", ...range("M", 15, 19)] },
    { state: "INSURANCE_PENDING", questions: range("M", 25, 28) },
    { state: "AGREEMENTS_PENDING", questions: ["M22", "M23", "M24", ...range("M", 29, 32)] },
    { state: "TAX_PENDING", questions: q(["BS13", "BS14"]) },
    { state: "PAYOUT_PENDING", questions: [] },
    { state: "UNDER_REVIEW", questions: [] },
    { state: "ACTIVE", questions: [] },
  ],
};

// ---------------------------------------------------------------------------
// FRANCHISE — locations are CHILD FSM instances (machine
// "franchise_location": LOCATION_LICENSE_PENDING →
// LOCATION_INSURANCE_PENDING → LOCATION_READY), one per location, stored
// in fsm_child_instances. The parent's LOCATIONS_LOOP advances only when
// every child is READY; one location's failure never rolls back others.
// ---------------------------------------------------------------------------
const FRANCHISE: FsmMachineDef = {
  type: "franchise",
  states: [
    { state: "START", questions: [] },
    { state: "TYPE_SET", questions: ENTRY_QUESTIONS },
    { state: "RULES_LOADED", questions: [] },
    { state: "ENTITY_PENDING", questions: ["U3", ...range("BS", 1, 8)] },
    { state: "UBO_PENDING", questions: q(["BS9", "BS10"]) },
    { state: "REP_PENDING", questions: [...IDENTITY_QUESTIONS, "BS11", "BS12"] },
    { state: "SCREENING_PENDING", questions: SCREENING_QUESTIONS },
    { state: "FDD_RECEIVED", questions: q(["F2", "F3"]) },
    { state: "FRANCHISE_AGREEMENT_SIGNED", questions: [...range("F", 4, 10), "F17"] },
    { state: "LOCATIONS_LOOP", questions: ["F1", "F11", "F12", "F13", "F14"] },
    { state: "SHARED_SERVICES_CONFIG", questions: ["F15", "F16", ...range("F", 18, 25)] },
    { state: "TAX_PENDING", questions: q(["BS13", "BS14"]) },
    { state: "PAYOUT_PENDING", questions: [] },
    { state: "UNDER_REVIEW", questions: [] },
    { state: "TENANT_CREATED", questions: [] },
    { state: "ACTIVE", questions: [] },
  ],
};

export const FSM_MACHINES: FsmMachineDef[] = [
  VET, PHARMACY, GROOMER,
  { type: "individual_seller", states: SELLER_STATES },
  { type: "business_seller", states: SELLER_STATES },
  MANUFACTURER, FRANCHISE,
];

export const FSM_MACHINE_BY_TYPE: Record<string, FsmMachineDef> = Object.fromEntries(
  FSM_MACHINES.map((m) => [m.type, m]),
);

// ---------------------------------------------------------------------------
// Transitions. Entry spine + review/failure exits are shared; each
// machine then declares its own chain exactly as the owner dictated.
// NEEDS_INFO / MANUAL_REVIEW store the raising state on the case
// (fsm_return_state); their exits target "RETURN", which the engine
// resolves to that stored state.
// ---------------------------------------------------------------------------

const ENTRY: FsmTransitionDef[] = [
  { type: "*", from: "START", event: "select_type", to: "TYPE_SET" },
  { type: "*", from: "TYPE_SET", event: "select_state", to: "RULES_LOADED" },
];

const REVIEW_EXITS: FsmTransitionDef[] = [
  { type: "*", from: "NEEDS_INFO", event: "info_resubmitted", guard: "return_state_set", to: "RETURN" },
  { type: "*", from: "MANUAL_REVIEW", event: "cleared", guard: "return_state_set", to: "RETURN" },
  { type: "*", from: "MANUAL_REVIEW", event: "denied", to: "REJECTED" },
];

/** The shared post-ACTIVE lifecycle (all types; maps onto the lifecycle
 *  engine's ACTIVE ⇄ RESTRICTED → SUSPENDED → OFFBOARDED states). For
 *  veterinarians the ACTIVE alias covers ACTIVE_TELEMEDICINE and
 *  ACTIVE_REFERRAL_ONLY — the engine resolves the alias at lookup. */
const SHARED_LIFECYCLE: FsmTransitionDef[] = [
  { type: "*", from: "ACTIVE", event: "expiry_30d", to: "ACTIVE", note: "Reminder only; no state change." },
  { type: "*", from: "ACTIVE", event: "expired", to: "RESTRICTED" },
  { type: "*", from: "RESTRICTED", event: "renewed", to: "ACTIVE" },
  { type: "*", from: "RESTRICTED", event: "grace_elapsed", to: "SUSPENDED" },
  { type: "*", from: "SUSPENDED", event: "reinstated", to: "ACTIVE" },
  { type: "*", from: "SUSPENDED", event: "terminated", to: "OFFBOARDED" },
  { type: "*", from: "ACTIVE", event: "terminated", to: "OFFBOARDED" },
  { type: "*", from: "ACTIVE", event: "rescreen_hit", to: "RESTRICTED" },
];

const VET_TRANSITIONS: FsmTransitionDef[] = [
  { type: "veterinarian", from: "RULES_LOADED", event: "states_submitted", guard: "states_licensed_min_1", to: "ROUTED" },
  { type: "veterinarian", from: "ROUTED", event: "auto", guard: "any_state_telemedicine_eligible", to: "PATH_TELE" },
  { type: "veterinarian", from: "ROUTED", event: "auto", guard: "no_state_telemedicine_eligible", to: "PATH_REFERRAL" },
  { type: "veterinarian", from: "PATH_TELE", event: "age_confirmed", guard: "dob_meets_majority", to: "IDENTITY_PENDING" },
  { type: "veterinarian", from: "PATH_TELE", event: "age_rejected", guard: "dob_below_majority", to: "REJECTED" },
  { type: "veterinarian", from: "IDENTITY_PENDING", event: "id_passed", to: "LICENSE_PENDING" },
  { type: "veterinarian", from: "IDENTITY_PENDING", event: "id_failed", guard: "attempts_lt_2", to: "IDENTITY_PENDING", note: "First failure: retry in place." },
  { type: "veterinarian", from: "IDENTITY_PENDING", event: "id_failed", guard: "attempts_gte_2", to: "MANUAL_REVIEW" },
  { type: "veterinarian", from: "LICENSE_PENDING", event: "license_verified", to: "SCREENING_PENDING" },
  { type: "veterinarian", from: "LICENSE_PENDING", event: "license_failed", to: "NEEDS_INFO" },
  { type: "veterinarian", from: "SCREENING_PENDING", event: "screening_clear", to: "INSURANCE_PENDING" },
  { type: "veterinarian", from: "SCREENING_PENDING", event: "screening_hit", to: "MANUAL_REVIEW" },
  { type: "veterinarian", from: "INSURANCE_PENDING", event: "coi_verified", to: "AGREEMENTS_PENDING" },
  { type: "veterinarian", from: "INSURANCE_PENDING", event: "coi_failed", to: "NEEDS_INFO" },
  { type: "veterinarian", from: "AGREEMENTS_PENDING", event: "all_signed", to: "TAX_PENDING" },
  { type: "veterinarian", from: "TAX_PENDING", event: "tin_matched", to: "PAYOUT_PENDING" },
  { type: "veterinarian", from: "PAYOUT_PENDING", event: "bank_verified", guard: "screening_clear_recorded", to: "TRAINING" },
  { type: "veterinarian", from: "TRAINING", event: "assessment_passed", to: "UNDER_REVIEW" },
  { type: "veterinarian", from: "UNDER_REVIEW", event: "approved", to: "ACTIVE_TELEMEDICINE" },
  { type: "veterinarian", from: "UNDER_REVIEW", event: "rejected", to: "REJECTED" },
  { type: "veterinarian", from: "PATH_REFERRAL", event: "auto", to: "PRACTICE_PROFILE" },
  { type: "veterinarian", from: "PRACTICE_PROFILE", event: "profile_completed", to: "DIRECTORY_CONSENT" },
  { type: "veterinarian", from: "DIRECTORY_CONSENT", event: "consent_given", to: "ACTIVE_REFERRAL_ONLY" },
  { type: "veterinarian", from: "ACTIVE_REFERRAL_ONLY", event: "state_opened", to: "LICENSE_PENDING", note: "A licensed state opened for telemedicine: resume the tele chain at the license state — nothing already verified is asked again." },
];

const PHARMACY_TRANSITIONS: FsmTransitionDef[] = [
  { type: "pharmacy", from: "RULES_LOADED", event: "ops_states_submitted", to: "ENTITY_PENDING" },
  { type: "pharmacy", from: "ENTITY_PENDING", event: "entity_verified", to: "PHARMACY_LICENSE_PENDING" },
  { type: "pharmacy", from: "PHARMACY_LICENSE_PENDING", event: "license_verified", to: "PIC_PENDING" },
  { type: "pharmacy", from: "PHARMACY_LICENSE_PENDING", event: "license_failed", to: "NEEDS_INFO" },
  { type: "pharmacy", from: "PIC_PENDING", event: "pic_verified", to: "SCREENING_PENDING" },
  { type: "pharmacy", from: "PIC_PENDING", event: "license_failed", to: "NEEDS_INFO" },
  { type: "pharmacy", from: "SCREENING_PENDING", event: "screening_clear", to: "INSURANCE_PENDING" },
  { type: "pharmacy", from: "SCREENING_PENDING", event: "screening_hit", to: "MANUAL_REVIEW" },
  { type: "pharmacy", from: "INSURANCE_PENDING", event: "coi_verified", to: "DEA_DECISION" },
  { type: "pharmacy", from: "INSURANCE_PENDING", event: "coi_failed", to: "NEEDS_INFO" },
  { type: "pharmacy", from: "DEA_DECISION", event: "auto", guard: "controlled_false", to: "AGREEMENTS_PENDING", note: "Phase 1 default: no controlled substances, no DEA state." },
  { type: "pharmacy", from: "DEA_DECISION", event: "auto", guard: "controlled_true", to: "DEA_PENDING" },
  { type: "pharmacy", from: "DEA_PENDING", event: "dea_verified", to: "AGREEMENTS_PENDING" },
  { type: "pharmacy", from: "AGREEMENTS_PENDING", event: "all_signed", to: "TAX_PENDING" },
  { type: "pharmacy", from: "TAX_PENDING", event: "tin_matched", to: "PAYOUT_PENDING" },
  { type: "pharmacy", from: "PAYOUT_PENDING", event: "payout_established", guard: "screening_clear_recorded", to: "UNDER_REVIEW", note: "Phase 1: payout runs through the partner agreement." },
  { type: "pharmacy", from: "UNDER_REVIEW", event: "approved", to: "ACTIVE" },
  { type: "pharmacy", from: "UNDER_REVIEW", event: "rejected", to: "REJECTED" },
];

const GROOMER_TRANSITIONS: FsmTransitionDef[] = [
  { type: "groomer", from: "RULES_LOADED", event: "auto", to: "AGE_CONFIRMED", note: "State + city are recorded at entry; the rules lookup routes the case straight into its chain." },
  { type: "groomer", from: "AGE_CONFIRMED", event: "age_confirmed", guard: "dob_meets_majority", to: "IDENTITY_PENDING" },
  { type: "groomer", from: "AGE_CONFIRMED", event: "age_rejected", guard: "dob_below_majority", to: "REJECTED" },
  { type: "groomer", from: "IDENTITY_PENDING", event: "id_passed", to: "ENTITY_DECISION" },
  { type: "groomer", from: "IDENTITY_PENDING", event: "id_failed", guard: "attempts_lt_2", to: "IDENTITY_PENDING" },
  { type: "groomer", from: "IDENTITY_PENDING", event: "id_failed", guard: "attempts_gte_2", to: "MANUAL_REVIEW" },
  { type: "groomer", from: "ENTITY_DECISION", event: "auto", guard: "entity_registered", to: "ENTITY_PENDING" },
  { type: "groomer", from: "ENTITY_DECISION", event: "auto", guard: "entity_sole_prop", to: "LOCAL_LICENSE_PENDING" },
  { type: "groomer", from: "ENTITY_PENDING", event: "entity_verified", to: "LOCAL_LICENSE_PENDING" },
  { type: "groomer", from: "LOCAL_LICENSE_PENDING", event: "auto", guard: "locality_not_requires_license", to: "INSURANCE_PENDING", note: "The license state exists only where the locality requires one." },
  { type: "groomer", from: "LOCAL_LICENSE_PENDING", event: "license_verified", to: "INSURANCE_PENDING" },
  { type: "groomer", from: "LOCAL_LICENSE_PENDING", event: "license_failed", to: "NEEDS_INFO" },
  { type: "groomer", from: "INSURANCE_PENDING", event: "coi_verified", to: "SCREENING_PENDING" },
  { type: "groomer", from: "INSURANCE_PENDING", event: "coi_failed", to: "NEEDS_INFO" },
  { type: "groomer", from: "SCREENING_PENDING", event: "screening_clear", to: "MOBILE_DECISION" },
  { type: "groomer", from: "SCREENING_PENDING", event: "screening_hit", to: "MANUAL_REVIEW" },
  { type: "groomer", from: "MOBILE_DECISION", event: "auto", guard: "is_mobile", to: "VEHICLE_PENDING" },
  { type: "groomer", from: "MOBILE_DECISION", event: "auto", guard: "not_mobile", to: "AGREEMENTS_PENDING" },
  { type: "groomer", from: "VEHICLE_PENDING", event: "vehicle_recorded", to: "AGREEMENTS_PENDING" },
  { type: "groomer", from: "AGREEMENTS_PENDING", event: "all_signed", to: "TAX_PENDING" },
  { type: "groomer", from: "TAX_PENDING", event: "tin_matched", to: "PAYOUT_PENDING" },
  { type: "groomer", from: "PAYOUT_PENDING", event: "bank_verified", guard: "screening_clear_recorded", to: "TRAINING" },
  { type: "groomer", from: "TRAINING", event: "assessment_passed", to: "UNDER_REVIEW" },
  { type: "groomer", from: "UNDER_REVIEW", event: "approved", to: "ACTIVE" },
  { type: "groomer", from: "UNDER_REVIEW", event: "rejected", to: "REJECTED" },
];

const SELLER_TRANSITIONS = (type: "individual_seller" | "business_seller"): FsmTransitionDef[] => [
  { type, from: "RULES_LOADED", event: "auto", to: "AGE_CONFIRMED", note: "The seller's state is recorded at entry; the rules lookup routes the case straight into its chain." },
  { type, from: "AGE_CONFIRMED", event: "age_confirmed", guard: "dob_meets_majority", to: "ENTITY_DECISION" },
  { type, from: "AGE_CONFIRMED", event: "age_rejected", guard: "dob_below_majority", to: "REJECTED" },
  { type, from: "ENTITY_DECISION", event: "auto", guard: "entity_sole_prop", to: "IDENTITY_PENDING" },
  { type, from: "ENTITY_DECISION", event: "auto", guard: "entity_registered", to: "ENTITY_PENDING" },
  { type, from: "ENTITY_PENDING", event: "entity_verified", to: "UBO_PENDING" },
  { type, from: "UBO_PENDING", event: "entity_verified", to: "REP_PENDING", note: "UBO verification is part of the entity verification emission." },
  { type, from: "REP_PENDING", event: "entity_verified", to: "IDENTITY_PENDING" },
  { type, from: "IDENTITY_PENDING", event: "id_passed", to: "SCREENING_PENDING" },
  { type, from: "IDENTITY_PENDING", event: "id_failed", guard: "attempts_lt_2", to: "IDENTITY_PENDING" },
  { type, from: "IDENTITY_PENDING", event: "id_failed", guard: "attempts_gte_2", to: "MANUAL_REVIEW" },
  { type, from: "SCREENING_PENDING", event: "screening_clear", to: "TAX_PENDING" },
  { type, from: "SCREENING_PENDING", event: "screening_hit", to: "MANUAL_REVIEW" },
  { type, from: "TAX_PENDING", event: "tin_matched", to: "NEXUS_PERMIT_DECISION" },
  { type, from: "NEXUS_PERMIT_DECISION", event: "auto", guard: "permit_required", to: "PERMIT_PENDING" },
  { type, from: "NEXUS_PERMIT_DECISION", event: "auto", guard: "permit_not_required", to: "PAYOUT_PENDING" },
  { type, from: "PERMIT_PENDING", event: "permit_verified", to: "PAYOUT_PENDING" },
  { type, from: "PAYOUT_PENDING", event: "bank_verified", guard: "screening_clear_recorded", to: "AGREEMENTS_PENDING" },
  { type, from: "AGREEMENTS_PENDING", event: "all_signed", to: "UNDER_REVIEW" },
  { type, from: "UNDER_REVIEW", event: "approved", to: "ACTIVE" },
  { type, from: "UNDER_REVIEW", event: "rejected", to: "REJECTED" },
];

const MANUFACTURER_TRANSITIONS: FsmTransitionDef[] = [
  { type: "manufacturer", from: "RULES_LOADED", event: "auto", to: "ENTITY_PENDING", note: "State + country recorded at entry; the rules lookup routes the case straight into its chain." },
  { type: "manufacturer", from: "ENTITY_PENDING", event: "entity_verified", to: "UBO_PENDING" },
  { type: "manufacturer", from: "UBO_PENDING", event: "entity_verified", to: "REP_PENDING" },
  { type: "manufacturer", from: "REP_PENDING", event: "id_passed", to: "SCREENING_PENDING", note: "The rep's identity pass exits the rep state." },
  { type: "manufacturer", from: "SCREENING_PENDING", event: "screening_clear", to: "CATEGORY_DECISION" },
  { type: "manufacturer", from: "SCREENING_PENDING", event: "screening_hit", to: "MANUAL_REVIEW" },
  { type: "manufacturer", from: "CATEGORY_DECISION", event: "auto", guard: "category_food", to: "FDA_FACILITY_PENDING" },
  { type: "manufacturer", from: "CATEGORY_DECISION", event: "auto", guard: "category_toys", to: "PRODUCT_SAFETY_PENDING" },
  { type: "manufacturer", from: "CATEGORY_DECISION", event: "auto", guard: "category_healthcare", to: "FDA_FACILITY_PENDING" },
  { type: "manufacturer", from: "CATEGORY_DECISION", event: "auto", guard: "category_other", to: "QMS_PENDING" },
  { type: "manufacturer", from: "FDA_FACILITY_PENDING", event: "facility_verified", guard: "category_healthcare", to: "RESTRICTED_MATERIALS_PENDING" },
  { type: "manufacturer", from: "FDA_FACILITY_PENDING", event: "facility_verified", to: "QMS_PENDING", note: "Food route: facility verified, straight to QMS (the healthcare-guarded row above wins first when it applies)." },
  { type: "manufacturer", from: "FDA_FACILITY_PENDING", event: "facility_failed", to: "NEEDS_INFO" },
  { type: "manufacturer", from: "PRODUCT_SAFETY_PENDING", event: "safety_verified", to: "QMS_PENDING" },
  { type: "manufacturer", from: "PRODUCT_SAFETY_PENDING", event: "safety_failed", to: "NEEDS_INFO" },
  { type: "manufacturer", from: "RESTRICTED_MATERIALS_PENDING", event: "materials_verified", to: "QMS_PENDING" },
  { type: "manufacturer", from: "RESTRICTED_MATERIALS_PENDING", event: "materials_failed", to: "NEEDS_INFO" },
  { type: "manufacturer", from: "QMS_PENDING", event: "qms_verified", to: "INSURANCE_PENDING" },
  { type: "manufacturer", from: "QMS_PENDING", event: "qms_failed", to: "NEEDS_INFO" },
  { type: "manufacturer", from: "INSURANCE_PENDING", event: "coi_verified", to: "AGREEMENTS_PENDING" },
  { type: "manufacturer", from: "INSURANCE_PENDING", event: "coi_failed", to: "NEEDS_INFO" },
  { type: "manufacturer", from: "AGREEMENTS_PENDING", event: "all_signed", to: "TAX_PENDING" },
  { type: "manufacturer", from: "TAX_PENDING", event: "tin_matched", to: "PAYOUT_PENDING" },
  { type: "manufacturer", from: "PAYOUT_PENDING", event: "bank_verified", guard: "screening_clear_recorded", to: "UNDER_REVIEW" },
  { type: "manufacturer", from: "UNDER_REVIEW", event: "approved", to: "ACTIVE" },
  { type: "manufacturer", from: "UNDER_REVIEW", event: "rejected", to: "REJECTED" },
];

const FRANCHISE_TRANSITIONS: FsmTransitionDef[] = [
  { type: "franchise", from: "RULES_LOADED", event: "auto", to: "ENTITY_PENDING", note: "The rules lookup routes the case straight into its chain." },
  { type: "franchise", from: "ENTITY_PENDING", event: "entity_verified", to: "UBO_PENDING" },
  { type: "franchise", from: "UBO_PENDING", event: "entity_verified", to: "REP_PENDING" },
  { type: "franchise", from: "REP_PENDING", event: "id_passed", to: "SCREENING_PENDING" },
  { type: "franchise", from: "SCREENING_PENDING", event: "screening_clear", to: "FDD_RECEIVED" },
  { type: "franchise", from: "SCREENING_PENDING", event: "screening_hit", to: "MANUAL_REVIEW" },
  { type: "franchise", from: "FDD_RECEIVED", event: "fdd_acknowledged", to: "FRANCHISE_AGREEMENT_SIGNED" },
  { type: "franchise", from: "FRANCHISE_AGREEMENT_SIGNED", event: "agreement_signed", to: "LOCATIONS_LOOP" },
  { type: "franchise", from: "LOCATIONS_LOOP", event: "locations_ready", guard: "all_locations_ready", to: "SHARED_SERVICES_CONFIG" },
  { type: "franchise", from: "SHARED_SERVICES_CONFIG", event: "config_completed", to: "TAX_PENDING" },
  { type: "franchise", from: "TAX_PENDING", event: "tin_matched", to: "PAYOUT_PENDING" },
  { type: "franchise", from: "PAYOUT_PENDING", event: "bank_verified", guard: "screening_clear_recorded", to: "UNDER_REVIEW" },
  { type: "franchise", from: "UNDER_REVIEW", event: "approved", to: "TENANT_CREATED" },
  { type: "franchise", from: "UNDER_REVIEW", event: "rejected", to: "REJECTED" },
  { type: "franchise", from: "TENANT_CREATED", event: "tenant_provisioned", to: "ACTIVE" },
];

/** Child machine: one instance per franchise location. */
const FRANCHISE_LOCATION_TRANSITIONS: FsmTransitionDef[] = [
  { type: "franchise_location", from: "LOCATION_LICENSE_PENDING", event: "license_verified", to: "LOCATION_INSURANCE_PENDING" },
  { type: "franchise_location", from: "LOCATION_LICENSE_PENDING", event: "license_failed", to: "NEEDS_INFO" },
  { type: "franchise_location", from: "LOCATION_INSURANCE_PENDING", event: "coi_verified", to: "LOCATION_READY" },
  { type: "franchise_location", from: "LOCATION_INSURANCE_PENDING", event: "coi_failed", to: "NEEDS_INFO" },
  { type: "franchise_location", from: "NEEDS_INFO", event: "info_resubmitted", guard: "return_state_set", to: "RETURN" },
];

export const FSM_TRANSITIONS: FsmTransitionDef[] = [
  ...ENTRY,
  ...REVIEW_EXITS,
  ...SHARED_LIFECYCLE,
  ...VET_TRANSITIONS,
  ...PHARMACY_TRANSITIONS,
  ...GROOMER_TRANSITIONS,
  ...SELLER_TRANSITIONS("individual_seller"),
  ...SELLER_TRANSITIONS("business_seller"),
  ...MANUFACTURER_TRANSITIONS,
  ...FRANCHISE_TRANSITIONS,
  ...FRANCHISE_LOCATION_TRANSITIONS,
];

/** Sanity at module load: every question id named by a state exists in
 *  questions.ts (content can never drift from the question registry). */
for (const m of FSM_MACHINES) {
  for (const s of m.states) {
    for (const id of s.questions) {
      if (!QUESTION_BY_ID[id]) throw new Error(`fsm-defs: unknown question ${id} in ${m.type}/${s.state}`);
    }
  }
}
