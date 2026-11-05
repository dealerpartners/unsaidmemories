// ===========================================================================
// _shared.ts — the admin review console's shared layer over the onboarding
// engine contract (src/lib/onboarding, E1). ALL case/gate state writes go
// through the engine (transitionCase / setGateStatus / applyGateFailure /
// recordDetermination) with actor = the acting admin; this module only
// adds what the contract does not cover:
//   - adminActor() — who is acting (portal session / Supabase user);
//   - display normalization — applicant name/business/phone live in gate
//     answers (question ids U2/U6/BS1…) + case metadata, not case columns;
//   - insurance floor checks — G7 currency answers vs POLICY floors
//     (gates-config POLICY.insuranceFloorsDollars, dollars);
//   - capability reads + status writes on public.capabilities — the
//     engine lib itself writes this table directly (vet.ts markVetLicense-
//     Verified uses pgExec on capabilities), there is no generic contract
//     setter; noted as a contract gap in admin-review.md.
// ===========================================================================

import { cookies } from "next/headers";
import { pgQuery, pgExec } from "@/lib/pg";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/portal-auth";
import { getCurrentUser } from "@/lib/auth/server";
import {
  POLICY,
  type OnboardingCase,
  type OnboardingGate,
} from "@/lib/onboarding";

export {
  transitionCase,
  setGateStatus,
  applyGateFailure,
  getCaseWithGates,
  listCases,
  getCaseEvents,
  recordDetermination,
  GATE_DEFS,
  TYPE_GATES,
  CASE_STATES,
  APPLICANT_TYPES,
  requiredGateKeysForReview,
} from "@/lib/onboarding";
export type { OnboardingCase, OnboardingGate } from "@/lib/onboarding";

type AnyRow = Record<string, any>;

/** The acting admin's identity for event rows + decided_by stamps. */
export async function adminActor(): Promise<string> {
  try {
    const payload = verifySessionToken((await cookies()).get(SESSION_COOKIE_NAME)?.value);
    if (payload?.email) return payload.email;
  } catch { /* fall through */ }
  try {
    const u = await getCurrentUser();
    if (u?.email) return u.email;
    if (u?.id) return String(u.id);
  } catch { /* fall through */ }
  return "admin";
}

// ---------------------------------------------------------------------------
// Display normalization
// ---------------------------------------------------------------------------

function pick(obj: AnyRow, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

export interface DisplayCase {
  id: string;
  type: string;
  state: string;
  user_id: string | null;
  tenant_id: string;
  applicant_email: string;
  applicant_name: string | null;
  applicant_phone: string | null;
  business_name: string | null;
  source_application_id: string | null;
  config_version: number;
  metadata: AnyRow;
  /** All gate answers merged (question ids), determinations excluded. */
  answers: AnyRow;
  created_at: string;
  updated_at: string;
}

export function displayCase(c: OnboardingCase, gates: OnboardingGate[] = []): DisplayCase {
  const answers: AnyRow = {};
  for (const g of gates) Object.assign(answers, g.data || {});
  const meta = (c.metadata || {}) as AnyRow;
  const merged: AnyRow = { ...answers, ...meta };
  return {
    id: c.id,
    type: c.type,
    state: c.state,
    user_id: c.userId,
    tenant_id: c.tenantId,
    applicant_email: c.applicantEmail,
    applicant_name: pick(merged, ["applicant_name", "legal_name", "contact_name", "U2", "name", "PIC_name", "P11"]),
    applicant_phone: pick(merged, ["applicant_phone", "phone", "U6", "mobile", "S15"]),
    business_name: pick(merged, ["business_name", "BS1", "legal_business_name", "practice_name", "pharmacy_name", "VR1"]),
    source_application_id: pick(merged, ["source_application_id", "application_id", "vet_application_id", "pharmacy_application_id", "grooming_application_id", "seller_application_id"]),
    config_version: c.configVersion,
    metadata: meta,
    answers: merged,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

export function displayGate(g: OnboardingGate) {
  return {
    id: g.id,
    gate_key: g.gateKey,
    status: g.status,
    attempts: g.attempts,
    evidence_ref: g.evidenceRef,
    decided_by: g.decidedBy,
    reason: typeof g.data?.decision_reason === "string" ? g.data.decision_reason : null,
    expires_at: g.expiresAt,
    data: g.data || {},
    created_at: g.createdAt,
    updated_at: g.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Insurance floor check (G7 currency answers vs POLICY)
// ---------------------------------------------------------------------------

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export interface InsuranceCheck {
  checked: boolean;
  belowFloor: boolean;
  perOccurrence: number | null;
  aggregate: number | null;
  floorPerOccurrence: number | null;
  floorAggregate: number | null;
  detail: string | null;
}

export function checkInsurance(caseType: string, gate: OnboardingGate | undefined): InsuranceCheck {
  const floors = (POLICY.insuranceFloorsDollars as AnyRow)[caseType] as AnyRow | undefined;
  const floorPer = floors ? num(floors.perOccurrence ?? floors.productLiability) : null;
  const floorAgg = floors ? num(floors.aggregate ?? floors.generalLiability) : null;
  const empty: InsuranceCheck = {
    checked: false, belowFloor: false, perOccurrence: null, aggregate: null,
    floorPerOccurrence: floorPer, floorAggregate: floorAgg, detail: null,
  };
  if (!gate) return empty;
  const d = (gate.data || {}) as AnyRow;
  const nested = (d.answers && typeof d.answers === "object" ? d.answers : {}) as AnyRow;
  const src = { ...nested, ...d };
  const perOcc = num(src.per_occurrence ?? src.coverage_per_occurrence ?? src.perOccurrence ?? src.V19 ?? src.G11 ?? src.M26);
  const agg = num(src.aggregate ?? src.coverage_aggregate ?? src.aggregate_coverage ?? src.V20 ?? src.G12 ?? src.M28);
  if (perOcc === null && agg === null) return empty;
  const problems: string[] = [];
  if (floorPer !== null && perOcc !== null && perOcc < floorPer) {
    problems.push(`per-occurrence $${perOcc.toLocaleString()} < POLICY floor $${floorPer.toLocaleString()}`);
  }
  if (floorAgg !== null && agg !== null && agg < floorAgg) {
    problems.push(`aggregate $${agg.toLocaleString()} < POLICY floor $${floorAgg.toLocaleString()}`);
  }
  return {
    checked: true,
    belowFloor: problems.length > 0,
    perOccurrence: perOcc,
    aggregate: agg,
    floorPerOccurrence: floorPer,
    floorAggregate: floorAgg,
    detail: problems.length ? problems.join("; ") : null,
  };
}

// ---------------------------------------------------------------------------
// Flags for the queue
// ---------------------------------------------------------------------------

export function caseFlags(c: DisplayCase, gates: OnboardingGate[]) {
  const flags: { kind: string; label: string; detail?: string }[] = [];
  for (const g of gates) {
    const reason = typeof g.data?.decision_reason === "string" ? g.data.decision_reason : undefined;
    if (g.status === "failed") flags.push({ kind: "gate_failed", label: `${g.gateKey} failed`, detail: reason });
    if (g.status === "blocked") flags.push({ kind: "gate_blocked", label: `${g.gateKey} blocked`, detail: reason });
    if (g.status === "needs_info") flags.push({ kind: "gate_needs_info", label: `${g.gateKey} needs info`, detail: reason });
    if (g.expiresAt && new Date(g.expiresAt).getTime() < Date.now() && g.status === "passed") {
      flags.push({ kind: "gate_expired", label: `${g.gateKey} evidence expired`, detail: g.expiresAt });
    }
  }
  const ins = checkInsurance(c.type, gates.find((g) => g.gateKey === "G7"));
  if (ins.belowFloor) flags.push({ kind: "insurance_below_floor", label: "Insurance below POLICY floor", detail: ins.detail || undefined });
  return flags;
}

// ---------------------------------------------------------------------------
// Capabilities (public.capabilities — read + status write; see header note)
// ---------------------------------------------------------------------------

export interface DisplayCapability {
  id: string;
  capability: string;
  jurisdiction: string | null;
  status: string;
  license_no: string | null;
  expires_at: string | null;
  data: AnyRow;
}

export async function getCapabilities(caseId: string): Promise<DisplayCapability[]> {
  const rows = await pgQuery<AnyRow>(
    `SELECT id::text AS id, capability, jurisdiction, status, license_no, expires_at, data
       FROM public.capabilities WHERE case_id = $1::uuid
      ORDER BY jurisdiction, capability`,
    [caseId],
  ).catch(() => [] as AnyRow[]);
  return rows.map((r) => ({
    id: r.id,
    capability: r.capability,
    jurisdiction: r.jurisdiction ?? null,
    status: r.status,
    license_no: r.license_no ?? null,
    expires_at: r.expires_at ?? null,
    data: (r.data || {}) as AnyRow,
  }));
}

export async function setCapabilityStatus(
  capabilityId: string,
  status: string,
  note: AnyRow,
): Promise<void> {
  await pgExec(
    `UPDATE public.capabilities
        SET status = $2, data = COALESCE(data, '{}'::jsonb) || $3::jsonb, updated_at = now()
      WHERE id = $1::uuid`,
    [capabilityId, status, JSON.stringify(note)],
  );
}

async function stateTelemedicineEligible(jurisdiction: string): Promise<boolean | null> {
  const rows = await pgQuery<{ telemedicine_vcpr_allowed: boolean }>(
    `SELECT telemedicine_vcpr_allowed FROM public.state_rules WHERE jurisdiction = $1 LIMIT 1`,
    [jurisdiction],
  ).catch(() => [] as { telemedicine_vcpr_allowed: boolean }[]);
  return rows[0] ? !!rows[0].telemedicine_vcpr_allowed : null;
}

/** G14 per-capability activation: VERIFIED → ACTIVE_TELEMEDICINE, or
 *  ACTIVE_REFERRAL_ONLY where state_rules say telemedicine is not allowed
 *  (spec §4 — referral states stay referral-only). Non-vet capabilities
 *  flip VERIFIED → ACTIVE. Anything not VERIFIED is left untouched. */
export async function activateCapabilities(
  caseType: string,
  capabilities: DisplayCapability[],
  actor: string,
): Promise<{ activated: string[]; referralOnly: string[]; skipped: string[] }> {
  const out = { activated: [] as string[], referralOnly: [] as string[], skipped: [] as string[] };
  for (const cap of capabilities) {
    const label = `${cap.capability}${cap.jurisdiction ? ` (${cap.jurisdiction})` : ""}`;
    if (cap.status !== "VERIFIED") { out.skipped.push(`${label}: status ${cap.status}`); continue; }
    let next = "ACTIVE";
    if (caseType === "veterinarian" && cap.jurisdiction) {
      const eligible = await stateTelemedicineEligible(cap.jurisdiction);
      next = eligible === false ? "ACTIVE_REFERRAL_ONLY" : "ACTIVE_TELEMEDICINE";
    }
    await setCapabilityStatus(cap.id, next, { activated_by: actor, activated_at: new Date().toISOString() });
    if (next === "ACTIVE_REFERRAL_ONLY") out.referralOnly.push(label);
    else out.activated.push(`${label} → ${next}`);
  }
  return out;
}
