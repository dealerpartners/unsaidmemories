// ---------------------------------------------------------------------------
// sellers/audit.ts — the writer for public.seller_audit_log.
//
// The table existed (seller-schema build) with zero writers: every seller
// governance mutation (approve/suspend/reject, violation flags, appeal
// decisions, investigations, listing reviews, fee schedules) stamped its
// outcome in-row only, so the platform had no seller governance trail.
// This helper is the single write path. Call it AFTER the mutation commits
// (inside the same withPg callback, once the mutation's rows are known) —
// it is fail-soft by construction: any failure is logged to stderr and
// swallowed, so an audit write can never fail the governance action itself.
//
// Real schema (verified via information_schema, 2026-10-13):
//   id uuid PK default gen_random_uuid(), tenant_id uuid NOT NULL,
//   seller_id uuid NULL, actor_id uuid NULL, actor_type text NULL,
//   action text NOT NULL, entity_type text NULL, entity_id uuid NULL,
//   before_state jsonb DEFAULT '{}', after_state jsonb DEFAULT '{}',
//   ip_address text NULL, created_at timestamptz NOT NULL DEFAULT now().
// No CHECK constraints on action/entity_type — the vocabulary is ours:
//   seller.approve | seller.suspend | seller.reject | seller.set_type
//   violation.flagged | violation.status_changed
//   appeal.decided | appeal.reopened
//   investigation.updated
//   listing.approved | listing.rejected
//   fee_schedule.created
// ---------------------------------------------------------------------------

import { pgExec } from "@/lib/pg";

type PgClientLike = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

export interface SellerAuditInput {
  tenantId: string;
  /** The seller the action concerns (nullable: platform-default fee rows). */
  sellerId?: string | null;
  /** Auth user id of the actor (from getActorIdFromRequest), when known. */
  actorId?: string | null;
  /** Defaults to 'staff' when an actor id is present, else 'system'. */
  actorType?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** seller_audit_log's id columns are uuid — coerce anything else to NULL
 *  (the raw identifier still lands in before/after_state when it matters). */
const asUuid = (v?: string | null): string | null =>
  v && UUID_RE.test(v) ? v : null;

/** First hop of x-forwarded-for, when the request carries one. */
export function requestIp(req: Request): string | null {
  try {
    const xff = req.headers.get("x-forwarded-for");
    if (xff) return xff.split(",")[0].trim() || null;
    return req.headers.get("x-real-ip");
  } catch {
    return null;
  }
}

/**
 * Append one row to seller_audit_log. Pass the withPg client when the
 * caller is inside a withPg callback (the insert rides the same
 * connection, after the mutation); pass null to write via pgExec.
 * Never throws.
 */
export async function writeSellerAudit(
  client: PgClientLike | null,
  input: SellerAuditInput,
): Promise<void> {
  try {
    const sql = `INSERT INTO public.seller_audit_log
        (tenant_id, seller_id, actor_id, actor_type, action, entity_type,
         entity_id, before_state, after_state, ip_address)
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7::uuid, $8::jsonb, $9::jsonb, $10)`;
    const params: unknown[] = [
      input.tenantId,
      asUuid(input.sellerId),
      asUuid(input.actorId),
      input.actorType ?? (asUuid(input.actorId) ? "staff" : "system"),
      input.action,
      input.entityType ?? null,
      asUuid(input.entityId),
      input.beforeState ? JSON.stringify(input.beforeState) : "{}",
      input.afterState ? JSON.stringify(input.afterState) : "{}",
      input.ipAddress ?? null,
    ];
    if (client) await client.query(sql, params);
    else await pgExec(sql, params);
  } catch (e) {
    // Fail-soft: the governance action already committed; a missing
    // audit row is a gap to see in logs, never a reason to fail it.
    console.error("[seller-audit] write failed (non-fatal):", e);
  }
}
