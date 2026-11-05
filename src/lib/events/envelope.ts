// ---------------------------------------------------------------------------
// The §1.1 Event Envelope (portals.md Layer 1) — types, the application-
// level emit helper for producers that run inside a pg transaction, and
// the outbox-row → envelope reader the drain consumes.
//
// Producers come in two forms on this platform (see the I-1 migration
// header for the full reasoning):
//   • Trigger producers (the first five) — public.outbox_emit() writes
//     the envelope into commerce_outbox_events inside the domain write's
//     own transaction, for every writer including PostgREST writers that
//     have no client transaction to ride.
//   • Application producers (later slices) — code already holding a pg
//     transaction calls emitEvent(client, …) so the outbox INSERT rides
//     that SAME transaction. Calling emitEvent outside a transaction
//     breaks the invariant and is a defect, not a shortcut.
//
// Envelope → outbox mapping (kept identical in SQL and here):
//   id → outbox.id · type → event_type · subject_type → aggregate_type ·
//   subject_id → payload.subject_id verbatim (orders/dogs use TEXT ids)
//   and aggregate_id (uuid cast, else a deterministic md5-derived uuid —
//   the join key must be stable across replays) · tenant_id → tenant_id ·
//   all remaining §1.1 fields ride in payload.
// ---------------------------------------------------------------------------

import { createHash, randomUUID } from "crypto";

export interface EventEnvelope {
  id: string;
  type: string;
  version: number;
  produced_by: string;
  produced_at: string;
  tenant_id: string;
  actor_id: string | null;
  actor_role: "buyer" | "seller" | "employee" | "vet" | "admin" | "system";
  subject_type: string;
  subject_id: string;
  correlation_id: string;
  causation_id: string | null;
  schema_url: string;
  data: Record<string, unknown>;
}

/** Minimal pg surface the events lib needs — accepts a PoolClient, a
 *  dedicated pg.Client (withPg), or any compatible executor. */
export interface PgExecutor {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The aggregate join key: the subject id itself when it is a uuid, else
 *  the same deterministic md5-derived uuid the SQL producer computes. */
export function aggregateIdFor(subjectType: string, subjectId: string): string {
  if (UUID_RE.test(subjectId)) return subjectId;
  const h = createHash("md5").update(`${subjectType}:${subjectId}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export interface EmitInput {
  type: string;
  producedBy: string;
  tenantId: string;
  subjectType: string;
  subjectId: string;
  actorId?: string | null;
  actorRole?: EventEnvelope["actor_role"];
  correlationId?: string;
  causationId?: string | null;
  data?: Record<string, unknown>;
}

/** Build the §1.1 envelope object (no persistence). */
export function buildEnvelope(input: EmitInput): EventEnvelope {
  const id = randomUUID();
  return {
    id,
    type: input.type,
    version: 1,
    produced_by: input.producedBy,
    produced_at: new Date().toISOString(),
    tenant_id: input.tenantId,
    actor_id: input.actorId ?? null,
    actor_role: input.actorRole ?? "system",
    subject_type: input.subjectType,
    subject_id: input.subjectId,
    correlation_id: input.correlationId ?? id,
    causation_id: input.causationId ?? null,
    schema_url: `/events/${input.type}.v1.json`,
    data: input.data ?? {},
  };
}

/**
 * Emit an event into the outbox ON THE CALLER'S pg executor. The caller
 * owns the transaction: call this between BEGIN and COMMIT of the domain
 * write so both land or neither does. Returns the envelope written.
 */
export async function emitEvent(client: PgExecutor, input: EmitInput): Promise<EventEnvelope> {
  const envelope = buildEnvelope(input);
  await client.query(
    `INSERT INTO public.commerce_outbox_events
       (id, tenant_id, aggregate_type, aggregate_id, event_type, payload)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      envelope.id,
      envelope.tenant_id,
      envelope.subject_type,
      aggregateIdFor(envelope.subject_type, envelope.subject_id),
      envelope.type,
      JSON.stringify(envelope),
    ],
  );
  return envelope;
}

/** Read an outbox row back into its envelope (the drain's input shape). */
export function envelopeFromRow(row: {
  id: string;
  tenant_id: string;
  event_type: string;
  payload: Record<string, unknown>;
}): EventEnvelope {
  return row.payload as unknown as EventEnvelope;
}
