// ---------------------------------------------------------------------------
// onboarding/steps.ts — the ONE applicant question-serving contract, now a
// façade over the per-type finite state machines (fsm-defs.ts; owner
// spec 2026-10-18).
//
// Serving is STATE-DRIVEN, not a static gate-ordered list. Each applicant
// type is a deterministic machine M = (S, E, δ, s0, F); this module
// PROJECTS the machine for a case — the states on the case's actual path,
// in machine order — and a case's served questions are the current
// projection's state question sets. The projection is deterministic in
// (type, vet branch): decision states whose branch is not yet decidable
// at plan time contribute all their branches' states (the applicant's
// answers then drive the runtime machine through exactly one of them),
// while decided branches (the veterinarian's state_rules branch, the
// seller's entity form) project only their own states.
//
// The applicant API serves steps from here, the answers route accepts
// answers ONLY from here, and submit-gates validates completeness
// against here — so a question from another type's blocks is
// structurally impossible to serve, accept, or require for a case: every
// state's question set is intersected with the type's own composed set
// from questions.ts (the single content source), and platform
// determinations (e.g. V31) are never served.
// ---------------------------------------------------------------------------

import { GATE_DEF_BY_KEY } from "./gates-config";
import { FSM_MACHINE_BY_TYPE, type FsmStateDef } from "./fsm-defs";
import {
  CONDITIONAL_BLOCKS,
  QUESTION_BY_ID,
  questionsForType,
  type OnboardingQuestion,
} from "./questions";
import type { ApplicantType, GateKey } from "./types";

export type VetPath = "full" | "referral" | "mixed";

export const GATE_ORDER: GateKey[] = [
  "G0", "G1", "G2", "G3", "G4", "G5", "G6", "G7",
  "G8", "G9", "G10", "G11", "G12", "G13", "G14",
];

/** The type's own composed question set (questions.ts is the content
 *  source) — the purity bound every machine projection is intersected
 *  with. Mirrors the branch composition the engine has always used:
 *  full = U+V, referral = U+VR+V1, mixed = U+V+VR. */
function composedQuestions(type: ApplicantType, vetPath?: VetPath | null): OnboardingQuestion[] {
  let qs: OnboardingQuestion[];
  if (type === "veterinarian" && vetPath === "referral") {
    qs = questionsForType(type, { vetPath: "referral", includeConditionalBlocks: true });
    const v1 = QUESTION_BY_ID["V1"];
    if (v1 && !qs.some((q) => q.id === "V1")) qs = [v1, ...qs];
  } else if (type === "veterinarian" && vetPath === "mixed") {
    const full = questionsForType(type, { includeConditionalBlocks: true });
    const seen = new Set(full.map((q) => q.id));
    const referralOnly = questionsForType(type, { vetPath: "referral", includeConditionalBlocks: true })
      .filter((q) => !seen.has(q.id));
    qs = [...full, ...referralOnly];
  } else {
    qs = questionsForType(type, { includeConditionalBlocks: true });
  }
  const blockConditions = CONDITIONAL_BLOCKS.filter((cb) => cb.type === type);
  const out: OnboardingQuestion[] = [];
  const seen = new Set<string>();
  for (const q of qs) {
    if (q.type === "determination") continue; // platform record, never served
    if (seen.has(q.id)) continue;
    seen.add(q.id);
    const cb = blockConditions.find((c) => c.block === q.block);
    out.push(cb && !q.condition ? { ...q, condition: cb.condition } : q);
  }
  return out;
}

export interface ProjectedState {
  state: string;
  /** The branch-driver state (veterinarian RULES_LOADED). */
  branch?: boolean;
  questions: OnboardingQuestion[];
}

/** State selection for a projection: which of the machine's state
 *  definitions lie on this case's path. */
function stateOnPath(def: FsmStateDef, type: ApplicantType, vetPath?: VetPath | null): boolean {
  const include: string = def.include ?? "always";
  if (type === "veterinarian") {
    if (vetPath === "referral") return include === "always" || include === "referral";
    if (vetPath === "mixed") return include === "always" || include === "tele" || include === "mixedExtra";
    return include === "always" || include === "tele"; // full + unevaluated
  }
  if (include === "entity") {
    // The seller machine's entity states belong only to the registered
    // branch: business_seller always; individual_seller never (its
    // entity decision resolves to the sole-proprietor route). Groomer's
    // entity state is conditional-block content (GR1) and stays.
    if (type === "individual_seller") return false;
    return true;
  }
  return include === "always" || include === "entity";
}

/**
 * The deterministic machine projection for a case: its path's states in
 * machine order, each carrying the questions that state serves. For a
 * mixed veterinarian the referral states join the telemedicine chain
 * just before UNDER_REVIEW (per-state truth stays in capabilities).
 */
export function projectStates(type: ApplicantType, vetPath?: VetPath | null): ProjectedState[] {
  const machine = FSM_MACHINE_BY_TYPE[type];
  if (!machine) return [];
  const allowed = new Map(composedQuestions(type, vetPath).map((q) => [q.id, q]));
  const selected = machine.states.filter((s) => stateOnPath(s, type, vetPath));
  if (type === "veterinarian" && vetPath === "mixed") {
    const extras = selected.filter((s) => s.include === "mixedExtra");
    const rest = selected.filter((s) => s.include !== "mixedExtra");
    const idx = rest.findIndex((s) => s.state === "UNDER_REVIEW");
    selected.length = 0;
    selected.push(...rest.slice(0, idx < 0 ? rest.length : idx), ...extras, ...rest.slice(idx < 0 ? rest.length : idx));
  }
  const out: ProjectedState[] = [];
  const claimed = new Set<string>();
  for (const def of selected) {
    const questions: OnboardingQuestion[] = [];
    for (const id of def.questions) {
      if (claimed.has(id)) continue; // a question is served by exactly one state
      const q = allowed.get(id);
      if (!q) continue; // not in this path's own set — never served
      claimed.add(id);
      questions.push(q);
    }
    out.push({ state: def.state, ...(def.branch ? { branch: true } : {}), questions });
  }
  return out;
}

/** The flat, type-pure question list for a case — the projection's
 *  state question sets flattened in machine order. */
export function planQuestions(type: ApplicantType, vetPath?: VetPath | null): OnboardingQuestion[] {
  return projectStates(type, vetPath).flatMap((s) => s.questions);
}

export interface PlanStep {
  gate: GateKey;
  /** Engine gate name (spec vocabulary for staff surfaces). */
  name: string;
  questions: OnboardingQuestion[];
  /** FSM state(s) this step's questions belong to (machine order). */
  states: string[];
  /** The veterinarian branch-driver step (licensed states). */
  branch?: boolean;
  /** The step holding the case's current FSM state, when known. */
  current?: boolean;
}

/**
 * The case's steps: one per (machine state × gate) segment, in machine
 * order. A state's questions group by their own gate (a state can span
 * two gates — e.g. screening spans G5+G8); adjacent segments of the same
 * gate merge into one step, as the wizard's sections are gate-shaped.
 * The branch-driver step never merges.
 */
export function buildStepPlan(type: ApplicantType, vetPath?: VetPath | null): PlanStep[] {
  const steps: PlanStep[] = [];
  for (const projected of projectStates(type, vetPath)) {
    if (projected.questions.length === 0) continue;
    const byGate = new Map<GateKey, OnboardingQuestion[]>();
    for (const q of projected.questions) {
      const list = byGate.get(q.gate) ?? [];
      list.push(q);
      byGate.set(q.gate, list);
    }
    for (const gate of GATE_ORDER) {
      const qs = byGate.get(gate);
      if (!qs) continue;
      const last = steps[steps.length - 1];
      if (last && last.gate === gate && !last.branch && !projected.branch) {
        last.questions.push(...qs);
        last.states.push(projected.state);
      } else {
        steps.push({
          gate,
          name: GATE_DEF_BY_KEY[gate].name,
          questions: qs,
          states: [projected.state],
          ...(projected.branch ? { branch: true } : {}),
        });
      }
    }
  }
  return steps;
}

/** The closed set of question ids a case may be served / may answer. */
export function planQuestionIds(type: ApplicantType, vetPath?: VetPath | null): Set<string> {
  return new Set(planQuestions(type, vetPath).map((q) => q.id));
}
