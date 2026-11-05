// ---------------------------------------------------------------------------
// onboarding/engine.ts — the engine core (spec §1/§2/§7). Backend-only:
// every state change goes through here, is validated against
// CASE_TRANSITIONS, and writes its onboarding_events row in the SAME
// transaction as the state update. Status columns are never writable by
// applicants (§7) — there is no other writer in the codebase contract.
//
// Reads/writes use the house pg pool (src/lib/pg.ts) with explicit
// transactions via a checked-out client (the pool's pgQuery/pgExec helpers
// are single-statement and cannot hold a transaction). Tenant scoping
// follows the partner-applications pattern: tenantId() on every query.
// ---------------------------------------------------------------------------

import type { PoolClient } from "pg";
import { getPgWithRetry, pgQueryStrict } from "../pg";
import { tenantId } from "../partner-applications";
import {
  CONFIG_VERSION,
  GATE_DEF_BY_KEY,
  TYPE_GATES,
  requiredGateKeysForReview,
} from "./gates-config";
import {
  CASE_TRANSITIONS,
  FAILURE_CASE_STATE,
  isGateKey,
  isGateStatus,
  isLegalTransition,
  type ApplicantType,
  type CaseState,
  type DeterminationRecord,
  type GateKey,
  type GateStatus,
  type OnboardingCase,
  type OnboardingCaseWithGates,
  type OnboardingEvent,
  type OnboardingGate,
} from "./types";

export { CASE_TRANSITIONS, isLegalTransition };

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

interface CaseRow {
  id: string;
  tenant_id: string;
  user_id: string | null;
  applicant_email: string;
  type: ApplicantType;
  state: CaseState;
  config_version: number;
  metadata: Record<string, unknown>;
  created_at: string | Date;
  updated_at: string | Date;
}

interface GateRow {
  id: string;
  case_id: string;
  gate_key: GateKey;
  status: GateStatus;
  attempts: number;
  evidence_ref: string | null;
  decided_by: string | null;
  data: Record<string, unknown>;
  expires_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
}

interface EventRow {
  id: string;
  case_id: string;
  from_state: CaseState | null;
  to_state: CaseState;
  actor: string;
  reason: string | null;
  evidence_ref: string | null;
  created_at: string | Date;
}

const iso = (v: string | Date): string => (v instanceof Date ? v.toISOString() : String(v));
const isoOrNull = (v: string | Date | null): string | null => (v === null ? null : iso(v));

function mapCase(r: CaseRow): OnboardingCase {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    userId: r.user_id,
    applicantEmail: r.applicant_email,
    type: r.type,
    state: r.state,
    configVersion: r.config_version,
    metadata: r.metadata ?? {},
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

function mapGate(r: GateRow): OnboardingGate {
  return {
    id: r.id,
    caseId: r.case_id,
    gateKey: r.gate_key,
    status: r.status,
    attempts: r.attempts,
    evidenceRef: r.evidence_ref,
    decidedBy: r.decided_by,
    data: r.data ?? {},
    expiresAt: isoOrNull(r.expires_at),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

function mapEvent(r: EventRow): OnboardingEvent {
  return {
    id: r.id,
    caseId: r.case_id,
    fromState: r.from_state,
    toState: r.to_state,
    actor: r.actor,
    reason: r.reason,
    evidenceRef: r.evidence_ref,
    createdAt: iso(r.created_at),
  };
}

const CASE_COLS = `id::text AS id, tenant_id::text AS tenant_id, user_id::text AS user_id,
  applicant_email, type, state, config_version, metadata,
  current_fsm_state, fsm_return_state, fsm_jurisdiction,
  created_at, updated_at`;
const GATE_COLS = `id::text AS id, case_id::text AS case_id, gate_key, status, attempts,
  evidence_ref, decided_by, data, expires_at, created_at, updated_at`;
const EVENT_COLS = `id::text AS id, case_id::text AS case_id, from_state, to_state,
  actor, reason, evidence_ref, created_at`;

// ---------------------------------------------------------------------------
// Transaction helpers (operate on a checked-out client)
// ---------------------------------------------------------------------------

async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPgWithRetry();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* connection already gone; the pool will discard it */
    }
    throw e;
  } finally {
    client.release();
  }
}

async function lockCase(client: PoolClient, caseId: string): Promise<CaseRow> {
  const { rows } = await client.query(
    `SELECT ${CASE_COLS} FROM public.onboarding_cases
      WHERE id = $1::uuid AND tenant_id = $2::uuid FOR UPDATE`,
    [caseId, tenantId()],
  );
  const row = rows[0] as CaseRow | undefined;
  if (!row) throw new Error(`onboarding case not found: ${caseId}`);
  return row;
}

async function insertEvent(
  client: PoolClient,
  caseId: string,
  from: CaseState | null,
  to: CaseState,
  actor: string,
  reason?: string,
  evidenceRef?: string,
): Promise<void> {
  await client.query(
    `INSERT INTO public.onboarding_events (case_id, from_state, to_state, actor, reason, evidence_ref)
     VALUES ($1::uuid, $2, $3, $4, $5, $6)`,
    [caseId, from, to, actor, reason ?? null, evidenceRef ?? null],
  );
}

/** Validate + apply a transition on an already-locked case row. */
async function applyTransition(
  client: PoolClient,
  row: CaseRow,
  to: CaseState,
  actor: string,
  reason?: string,
  evidenceRef?: string,
): Promise<void> {
  if (!isLegalTransition(row.state, to)) {
    throw new Error(`illegal onboarding transition: ${row.state} -> ${to} (case ${row.id})`);
  }
  await client.query(
    `UPDATE public.onboarding_cases SET state = $2, updated_at = now() WHERE id = $1::uuid`,
    [row.id, to],
  );
  await insertEvent(client, row.id, row.state, to, actor, reason, evidenceRef);
  row.state = to;
}

async function insertGateInstances(client: PoolClient, caseId: string, type: ApplicantType): Promise<void> {
  for (const entry of TYPE_GATES[type]) {
    const data: Record<string, unknown> = {};
    if (entry.conditional) data.conditional = entry.conditional;
    if (entry.note) data.note = entry.note;
    await client.query(
      `INSERT INTO public.onboarding_gates (case_id, gate_key, status, data)
       VALUES ($1::uuid, $2, 'pending', $3::jsonb)
       ON CONFLICT (case_id, gate_key) DO NOTHING`,
      [caseId, entry.gateKey, JSON.stringify(data)],
    );
  }
}

async function fetchGates(client: PoolClient, caseId: string): Promise<OnboardingGate[]> {
  const { rows } = await client.query(
    `SELECT ${GATE_COLS} FROM public.onboarding_gates
      WHERE case_id = $1::uuid
      ORDER BY array_position(ARRAY['G0','G1','G2','G3','G4','G5','G6','G7','G8','G9','G10','G11','G12','G13','G14'], gate_key)`,
    [caseId],
  );
  return (rows as GateRow[]).map(mapGate);
}

/** Gate statuses that satisfy a required gate for review readiness. */
const SATISFYING: GateStatus[] = ["passed", "waived", "not_applicable"];

/**
 * If the (locked) case is IN_GATES and every required-for-review gate of
 * its type is passed/waived, auto-transition IN_GATES → READY_FOR_REVIEW
 * with its event row. Returns true when the transition happened.
 */
async function maybeAdvanceToReview(client: PoolClient, row: CaseRow): Promise<boolean> {
  if (row.state !== "IN_GATES") return false;
  const required = requiredGateKeysForReview(row.type);
  if (required.length === 0) return false;
  const gates = await fetchGates(client, row.id);
  const byKey = new Map(gates.map((g) => [g.gateKey, g]));
  const allSatisfied = required.every((k) => {
    const gate = byKey.get(k);
    return gate !== undefined && SATISFYING.includes(gate.status);
  });
  if (!allSatisfied) return false;
  await applyTransition(client, row, "READY_FOR_REVIEW", "system", "all_required_gates_passed");
  return true;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CreateCaseInput {
  type: ApplicantType;
  email: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Create a case in DRAFT and instantiate the type's full gate list as
 * pending (G0 included — pre-instantiated like every other gate). The
 * creation itself is the first append-only event (null → DRAFT).
 * metadata.determinations always starts as an array (§7 records).
 */
export async function createOnboardingCase(input: CreateCaseInput): Promise<OnboardingCaseWithGates> {
  const metadata: Record<string, unknown> = { ...(input.metadata ?? {}) };
  if (!Array.isArray(metadata.determinations)) metadata.determinations = [];

  const caseId = await tx(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO public.onboarding_cases
         (tenant_id, user_id, applicant_email, type, state, config_version, metadata)
       VALUES ($1::uuid, $2::uuid, $3, $4, 'DRAFT', $5, $6::jsonb)
       RETURNING id::text AS id`,
      [tenantId(), input.userId ?? null, input.email, input.type, CONFIG_VERSION, JSON.stringify(metadata)],
    );
    const id = (rows[0] as { id: string }).id;
    await insertEvent(client, id, null, "DRAFT", "system", "case_created");
    await insertGateInstances(client, id, input.type);
    return id;
  });

  const created = await getCaseWithGates(caseId);
  if (!created) throw new Error(`onboarding case vanished after create: ${caseId}`);
  return created;
}

/**
 * Classify a DRAFT case (G0): stamp the (possibly corrected) type, make
 * sure that type's gates are instantiated, mark G0 passed, and transition
 * DRAFT → CLASSIFIED. Idempotent when the case is already CLASSIFIED with
 * the same type.
 */
export async function classifyCase(caseId: string, type: ApplicantType): Promise<OnboardingCaseWithGates> {
  await tx(async (client) => {
    const row = await lockCase(client, caseId);
    if (row.state === "CLASSIFIED" && row.type === type) return;
    if (row.state !== "DRAFT") {
      throw new Error(`classifyCase requires a DRAFT case (case ${caseId} is ${row.state})`);
    }
    if (row.type !== type) {
      await client.query(
        `UPDATE public.onboarding_cases SET type = $2, updated_at = now() WHERE id = $1::uuid`,
        [caseId, type],
      );
      row.type = type;
    }
    await insertGateInstances(client, caseId, type);
    await client.query(
      `UPDATE public.onboarding_gates
          SET status = 'passed', decided_by = 'system', updated_at = now()
        WHERE case_id = $1::uuid AND gate_key = 'G0'`,
      [caseId],
    );
    await applyTransition(client, row, "CLASSIFIED", "system", `classified_as_${type}`);
  });
  const updated = await getCaseWithGates(caseId);
  if (!updated) throw new Error(`onboarding case not found: ${caseId}`);
  return updated;
}

export interface TransitionOpts {
  actor: string;
  reason?: string;
  evidenceRef?: string;
}

/**
 * The ONLY way a case changes state. Validates against CASE_TRANSITIONS
 * (throws on illegal), updates the case and inserts the event row in one
 * transaction.
 */
export async function transitionCase(
  caseId: string,
  to: CaseState,
  opts: TransitionOpts,
): Promise<OnboardingCase> {
  const updated = await tx(async (client) => {
    const row = await lockCase(client, caseId);
    await applyTransition(client, row, to, opts.actor, opts.reason, opts.evidenceRef);
    return mapCase(row);
  });
  return updated;
}

export interface SetGateStatusOpts {
  actor?: string;
  evidenceRef?: string;
  data?: Record<string, unknown>;
  expiresAt?: string;
}

/**
 * Set one gate's status (merge `data` into the gate's jsonb). Afterwards,
 * case progress is recomputed: if the case is IN_GATES and every required
 * gate for its type is passed/waived, the case auto-transitions
 * IN_GATES → READY_FOR_REVIEW (with event). Gate failures do NOT move the
 * case here — that is applyGateFailure's job, so a worker can record a
 * failure and its case effect atomically and explicitly.
 */
export async function setGateStatus(
  caseId: string,
  gateKey: GateKey,
  status: GateStatus,
  opts: SetGateStatusOpts = {},
): Promise<OnboardingCaseWithGates> {
  if (!isGateKey(gateKey)) throw new Error(`unknown gate key: ${String(gateKey)}`);
  if (!isGateStatus(status)) throw new Error(`unknown gate status: ${String(status)}`);

  await tx(async (client) => {
    const row = await lockCase(client, caseId);
    const { rowCount } = await client.query(
      `UPDATE public.onboarding_gates
          SET status = $3,
              evidence_ref = COALESCE($4, evidence_ref),
              decided_by = COALESCE($5, decided_by),
              data = data || $6::jsonb,
              expires_at = COALESCE($7::timestamptz, expires_at),
              updated_at = now()
        WHERE case_id = $1::uuid AND gate_key = $2`,
      [
        caseId,
        gateKey,
        status,
        opts.evidenceRef ?? null,
        opts.actor ?? null,
        JSON.stringify(opts.data ?? {}),
        opts.expiresAt ?? null,
      ],
    );
    if (!rowCount) {
      throw new Error(`gate ${gateKey} is not instantiated for case ${caseId} (type ${row.type})`);
    }
    await maybeAdvanceToReview(client, row);
  });

  const updated = await getCaseWithGates(caseId);
  if (!updated) throw new Error(`onboarding case not found: ${caseId}`);
  return updated;
}

export interface ApplyGateFailureResult {
  case: OnboardingCaseWithGates;
  gate: OnboardingGate;
  /** The case state the gate's failure semantics drove, if it moved. */
  targetState: CaseState | null;
  caseTransitioned: boolean;
}

/**
 * Record a gate failure with its spec §2 case semantics: the gate is
 * marked failed and attempts incremented, then the case is driven to the
 * failure mode's state (REJECTED / NEEDS_INFO / BLOCKED_PENDING) when
 * that transition is legal from the case's current state. Retry-mode
 * gates (G2/G9/G10/G12) fail in place — the case does not move.
 */
export async function applyGateFailure(
  caseId: string,
  gateKey: GateKey,
  opts: { actor?: string; evidenceRef?: string; data?: Record<string, unknown> } = {},
): Promise<ApplyGateFailureResult> {
  if (!isGateKey(gateKey)) throw new Error(`unknown gate key: ${String(gateKey)}`);
  const def = GATE_DEF_BY_KEY[gateKey];
  const target = FAILURE_CASE_STATE[def.failureMode];
  const actor = opts.actor ?? "system";
  let caseTransitioned = false;

  await tx(async (client) => {
    const row = await lockCase(client, caseId);
    const { rowCount } = await client.query(
      `UPDATE public.onboarding_gates
          SET status = 'failed', attempts = attempts + 1,
              evidence_ref = COALESCE($3, evidence_ref),
              decided_by = COALESCE($4, decided_by),
              data = data || $5::jsonb,
              updated_at = now()
        WHERE case_id = $1::uuid AND gate_key = $2`,
      [caseId, gateKey, opts.evidenceRef ?? null, actor, JSON.stringify(opts.data ?? {})],
    );
    if (!rowCount) {
      throw new Error(`gate ${gateKey} is not instantiated for case ${caseId} (type ${row.type})`);
    }
    if (target && target !== row.state && isLegalTransition(row.state, target)) {
      await applyTransition(client, row, target, actor, `gate_${gateKey}_failed:${def.failureMode}`, opts.evidenceRef);
      caseTransitioned = true;
    }
  });

  const updated = await getCaseWithGates(caseId);
  if (!updated) throw new Error(`onboarding case not found: ${caseId}`);
  const gate = updated.gates.find((g) => g.gateKey === gateKey);
  if (!gate) throw new Error(`gate ${gateKey} missing after failure on case ${caseId}`);
  return { case: updated, gate, targetState: caseTransitioned ? target : null, caseTransitioned };
}

/** Fetch one case with its gates (tenant-scoped). Null when absent. */
export async function getCaseWithGates(caseId: string): Promise<OnboardingCaseWithGates | null> {
  const caseRows = await pgQueryStrict<CaseRow>(
    `SELECT ${CASE_COLS} FROM public.onboarding_cases
      WHERE id = $1::uuid AND tenant_id = $2::uuid`,
    [caseId, tenantId()],
  );
  if (!caseRows[0]) return null;
  const gateRows = await pgQueryStrict<GateRow>(
    `SELECT ${GATE_COLS} FROM public.onboarding_gates
      WHERE case_id = $1::uuid
      ORDER BY array_position(ARRAY['G0','G1','G2','G3','G4','G5','G6','G7','G8','G9','G10','G11','G12','G13','G14'], gate_key)`,
    [caseId],
  );
  return { ...mapCase(caseRows[0]), gates: gateRows.map(mapGate) };
}

export interface ListCasesFilter {
  state?: CaseState;
  type?: ApplicantType;
  limit?: number;
}

/** List cases for the tenant, newest first (default limit 100, max 500). */
export async function listCases(filter: ListCasesFilter = {}): Promise<OnboardingCase[]> {
  const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);
  const rows = await pgQueryStrict<CaseRow>(
    `SELECT ${CASE_COLS} FROM public.onboarding_cases
      WHERE tenant_id = $1::uuid
        AND ($2::text IS NULL OR state = $2)
        AND ($3::text IS NULL OR type = $3)
      ORDER BY created_at DESC
      LIMIT $4`,
    [tenantId(), filter.state ?? null, filter.type ?? null, limit],
  );
  return rows.map(mapCase);
}

/** The append-only event history for a case, oldest first. */
export async function getCaseEvents(caseId: string): Promise<OnboardingEvent[]> {
  const rows = await pgQueryStrict<EventRow>(
    `SELECT ${EVENT_COLS} FROM public.onboarding_events
      WHERE case_id = $1::uuid
      ORDER BY created_at ASC, id ASC`,
    [caseId],
  );
  return rows.map(mapEvent);
}

/**
 * Record a platform determination on the case (spec §7 — e.g. the V31
 * employment classification). Determinations are decided BY the platform
 * from the facts of the relationship and stored at
 * metadata.determinations[] with their basis; they are never applicant
 * answers. No state change and no event (this is not a transition).
 */
export async function recordDetermination(
  caseId: string,
  input: { kind: string; determination: string; basis: string; decidedBy: string },
): Promise<OnboardingCase> {
  const record: DeterminationRecord = {
    kind: input.kind,
    determination: input.determination,
    basis: input.basis,
    decided_by: input.decidedBy,
    at: new Date().toISOString(),
  };
  const updated = await tx(async (client) => {
    const row = await lockCase(client, caseId);
    const existing = Array.isArray(row.metadata.determinations) ? row.metadata.determinations : [];
    const metadata = { ...row.metadata, determinations: [...existing, record] };
    await client.query(
      `UPDATE public.onboarding_cases SET metadata = $2::jsonb, updated_at = now() WHERE id = $1::uuid`,
      [caseId, JSON.stringify(metadata)],
    );
    row.metadata = metadata;
    return mapCase(row);
  });
  return updated;
}
