// ---------------------------------------------------------------------------
// quick-actions/audit.ts — shared audit-trail helper for the four admin
// quick-action routes (finance, system, commerce, crm).
//
// The platform has FIVE per-domain audit tables (one per schema):
//   acct_audit_log       — accounting / payroll / invoicing / deposits / gift cards
//   commerce_audit_log   — orders / payments / inventory / purchase orders
//   crm_audit_log        — customers / pets / appointments / messages / notes
//   erp_audit_log        — inventory movements / purchase orders / warehouse ops
//   activity_log         — generic fallback (no actor_id column, just `actor` text)
//
// Each route picks the right table for its domain. We never let an audit-log
// failure break the main write — pgExec already swallows errors, but the
// helper also wraps everything in try/catch so callers can `await` without
// worrying.
// ---------------------------------------------------------------------------

import { pgExec, pgQuery } from "@/lib/pg";
import { TENANT_ID } from "@/lib/crm/enterprise";

export type AuditDomain = "acct" | "commerce" | "crm" | "erp";

interface AuditInput {
  /** Full registry action_code (e.g. "accts_add_value") — preserved for forensics. */
  action: string;
  /** Domain — picks which *_audit_log table to write to. */
  domain: AuditDomain;
  /** Table the main write touched (e.g. "commerce_gift_cards"). null when N/A. */
  tableName?: string | null;
  /** Primary key of the affected row. null for batch operations. */
  recordId?: string | null;
  /** After-state of the row, or full action payload. Stored as JSONB. */
  afterData?: Record<string, unknown> | null;
  /** Before-state, when available (updates/deletes). */
  beforeData?: Record<string, unknown> | null;
  /** IP / user-agent forwarded from the request, when available. */
  ipAddress?: string | null;
  /** Caller user id (auth.uid) when known. */
  actorUserId?: string | null;
}

const DOMAIN_TABLE: Record<AuditDomain, string> = {
  acct: "public.acct_audit_log",
  commerce: "public.commerce_audit_log",
  crm: "public.crm_audit_log",
  erp: "public.erp_audit_log",
};

/**
 * Append an entry to the per-domain audit log. never throws — if the audit
 * insert itself fails (e.g. RLS), we log to stderr and continue so the main
 * write already committed is not rolled back.
 *
 * IMPORTANT: most audit tables have entity_id/record_id typed as UUID, so
 * non-UUID identifiers (e.g. "PAY-AB12", "GC-XYZ") are coerced to NULL
 * rather than failing the insert. The action_code itself carries the
 * identifier info, so the forensic value is preserved.
 */
export async function auditAction(input: AuditInput): Promise<void> {
  const table = DOMAIN_TABLE[input.domain];
  const tid = TENANT_ID();
  const after = input.afterData ? JSON.stringify(input.afterData) : null;
  const before = input.beforeData ? JSON.stringify(input.beforeData) : null;
  // Coerce non-UUID record IDs to NULL — most audit tables have a uuid-typed
  // entity_id column. The action_code (passed separately) still records which
  // business-key was affected.
  const recordId = input.recordId && isUuid(input.recordId) ? input.recordId : null;
  try {
    if (input.domain === "acct") {
      // acct_audit_log: id uuid default gen_random_uuid(), table_name text, record_id text
      // record_id is TEXT here so we can pass any string — but for consistency
      // we still coerce non-UUIDs to NULL (the JSONB after_data has the detail).
      await pgExec(
        `INSERT INTO ${table} (id, tenant_id, actor_user_id, action, table_name, record_id, before_data, after_data, ip_address)
         VALUES (gen_random_uuid(), $1, $2::uuid, $3, $4, $5, $6::jsonb, $7::jsonb, $8::inet)`,
        [tid, input.actorUserId || null, input.action, input.tableName || null, input.recordId || null, before, after, input.ipAddress || null],
      );
    } else if (input.domain === "commerce") {
      // commerce_audit_log: id bigint (NOT uuid), entity_type text NOT NULL, entity_id uuid
      await pgExec(
        `INSERT INTO ${table} (tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data, ip_address)
         VALUES ($1, $2::uuid, $3, $4, $5::uuid, $6::jsonb, $7::jsonb, $8::inet)`,
        [tid, input.actorUserId || null, input.action, input.tableName || "unknown", recordId, before, after, input.ipAddress || null],
      );
    } else if (input.domain === "crm") {
      // crm_audit_log: id bigint, entity_type text NOT NULL, entity_id uuid
      await pgExec(
        `INSERT INTO ${table} (tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data, ip_address)
         VALUES ($1, $2::uuid, $3, $4::uuid, $5, $6::jsonb, $7::jsonb, $8::inet)`,
        [tid, input.actorUserId || null, input.tableName || "unknown", recordId, input.action, before, after, input.ipAddress || null],
      );
    } else {
      // erp_audit_log: id uuid, entity_type text NOT NULL, entity_id uuid
      await pgExec(
        `INSERT INTO ${table} (id, tenant_id, entity_type, entity_id, action, before_data, after_data, actor_id, ip_address)
         VALUES (gen_random_uuid(), $1, $2, $3::uuid, $4, $5::jsonb, $6::jsonb, $7::uuid, $8::inet)`,
        [tid, input.tableName || "unknown", recordId, input.action, before, after, input.actorUserId || null, input.ipAddress || null],
      );
    }
  } catch (e) {
    console.error(
      `[audit] failed to write to ${table} for action=${input.action}:`,
      e instanceof Error ? e.message : String(e),
    );
  }
}

/** Cheap UUID shape check — used to coerce non-UUID record IDs to NULL. */
function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/**
 * Pull the actor user id from a Next.js Request — reads the portal_session
 * cookie and returns the sub claim. null when no signed session.
 */
export async function getActorIdFromRequest(req: Request): Promise<string | null> {
  try {
    const cookie = req.headers.get("cookie") || "";
    const match = cookie.match(/portal_session=([^;]+)/);
    if (!match) return null;
    // Import lazily to avoid circular dependency at module-load time.
    const { verifySessionToken } = await import("@/lib/portal-auth");
    const payload = verifySessionToken(match[1]);
    return payload?.sub || null;
  } catch {
    return null;
  }
}

/**
 * Convenience helper: insert a row in commerce_store_credits and return the
 * generated credit_number. Used by add_value, issue_store_credit, register_credits,
 * convert_gc.
 */
export async function issueStoreCredit(params: {
  customerId: string | null;
  amount: number;
  status?: string;
  expiresAt?: string | null;
}): Promise<string | null> {
  const creditNumber = `SC-${Date.now().toString(36).toUpperCase()}`;
  const tid = TENANT_ID();
  const rows = await pgQuery<{ id: string; credit_number?: string }>(
    `INSERT INTO public.commerce_store_credits
       (id, tenant_id, credit_number, customer_id, original_amount, balance, currency, status, issued_at, expires_at)
     VALUES (gen_random_uuid(), $1, $2, $3::uuid, $4, $4, 'USD', $5, now(), $6)
     RETURNING credit_number`,
    [tid, creditNumber, params.customerId || null, params.amount, params.status || "active", params.expiresAt || null],
  );
  return rows[0]?.credit_number ?? null;
}

/**
 * Convenience: insert a crm_notes row for a system-generated audit-style note
 * tied to a customer (e.g. "Payment reminder sent", "Gift card reminder sent").
 *
 * NOTE: crm_notes.note_type has a CHECK constraint allowing only
 * 'internal', 'customer_visible', 'appointment', 'pet_handling', 'system'.
 * Any other value is silently rejected by Postgres. We always coerce to
 * 'system' for these automated reminders — the body text itself carries
 * the semantic of the reminder.
 */
export async function logCustomerNote(params: {
  customerId: string | null;
  body: string;
  noteType?: string;
}): Promise<void> {
  if (!params.customerId) return;
  // CHECK ((note_type = ANY (ARRAY['internal','customer_visible','appointment','pet_handling','system'])))
  const ALLOWED = new Set(["internal", "customer_visible", "appointment", "pet_handling", "system"]);
  const noteType = ALLOWED.has(params.noteType || "") ? params.noteType! : "system";
  await pgExec(
    `INSERT INTO public.crm_notes (id, tenant_id, customer_id, note_type, body, is_pinned)
     VALUES (gen_random_uuid(), $1, $2::uuid, $3, $4, false)`,
    [TENANT_ID(), params.customerId, noteType, params.body],
  );
}
