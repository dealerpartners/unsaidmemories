import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"

export const dynamic = "force-dynamic"

// Audit log viewer API.
//
// Reads from public.acct_audit_log first (verified to exist with data) and
// falls back to public.activity_log when the primary query fails. Column
// names are introspected from information_schema at runtime, so the route
// survives schema drift — it only ever selects columns that exist.
//
// Known acct_audit_log shape (from src/lib/quick-actions/audit.ts):
//   id uuid, tenant_id, actor_user_id uuid, action text, table_name text,
//   record_id text, before_data jsonb, after_data jsonb, ip_address inet,
//   created_at timestamptz (typical)
const PAGE = 100

type Row = {
  ts: string | null
  actor: string | null
  action: string | null
  entity: string | null
  details: string | null
}

// Preferred column aliases per output field, in priority order.
const WANT: Record<keyof Row, string[]> = {
  ts: ["created_at", "timestamp", "logged_at", "occurred_at", "event_time", "inserted_at"],
  actor: ["actor", "actor_name", "actor_user_id", "user_id", "performed_by", "created_by"],
  action: ["action", "action_code", "event", "event_type", "operation"],
  entity: ["table_name", "entity_type", "entity", "entity_name", "record_type", "resource_type"],
  details: ["after_data", "details", "payload", "description", "record_id", "summary", "before_data"],
}

type PgClient = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
}

function truncate(v: unknown, max = 240): string | null {
  if (v === null || v === undefined) return null
  const s = typeof v === "string" ? v : JSON.stringify(v)
  return s.length > max ? s.slice(0, max) + "…" : s
}

/** Read up to PAGE rows from a table, mapping whatever columns exist onto the viewer shape. */
async function readTable(c: PgClient, table: string, q: string, tenant: string): Promise<Row[] | null> {
  const cols = (
    await c.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1`,
      [table],
    )
  ).rows.map((r) => String(r.column_name))
  if (!cols.length) return null // table does not exist
  const set = new Set(cols)
  const pick = (key: keyof Row) => WANT[key].find((n) => set.has(n))

  const select: string[] = []
  const keys: (keyof Row)[] = []
  for (const key of Object.keys(WANT) as (keyof Row)[]) {
    const col = pick(key)
    if (col) {
      select.push(`t."${col}" AS ${key}`)
      keys.push(key)
    }
  }
  if (!select.length) return null

  const tsCol = pick("ts")
  const hasTenant = set.has("tenant_id")
  const searchCols = (["actor", "action", "entity"] as (keyof Row)[])
    .map((k) => pick(k))
    .filter((c0): c0 is string => !!c0)

  const params: unknown[] = []
  const where: string[] = []
  if (hasTenant) {
    params.push(tenant)
    where.push(`t."tenant_id" = $${params.length}`)
  }
  if (q && searchCols.length) {
    const like = `%${q.replace(/[%_]/g, "")}%`
    params.push(like)
    where.push(`(${searchCols.map((c0) => `t."${c0}"::text ILIKE $${params.length}`).join(" OR ")})`)
  }

  try {
    const { rows } = await c.query(
      `SELECT ${select.join(", ")} FROM public."${table}" t
        ${where.length ? "WHERE " + where.join(" AND ") : ""}
        ${tsCol ? `ORDER BY t."${tsCol}" DESC NULLS LAST` : ""}
        LIMIT ${PAGE}`,
      params,
    )
    return rows.map((r) => ({
      ts: r.ts != null ? String(r.ts) : null,
      actor: r.actor != null ? truncate(r.actor, 80) : null,
      action: r.action != null ? truncate(r.action, 80) : null,
      entity: r.entity != null ? truncate(r.entity, 80) : null,
      details: truncate(r.details),
    }))
  } catch {
    return null
  }
}

type SellerRow = Row & { before: unknown; after: unknown }

/**
 * Seller governance lens — reads public.seller_audit_log (the trail written
 * by src/lib/sellers/audit.ts for seller / violation / appeal / investigation
 * / listing / fee-schedule mutations) mapped onto the same viewer shape.
 *
 * actor_id holds the AUTH user id (not crm_staff.id), so the display name is
 * resolved best-effort: crm_staff by user_id (display name, else name parts,
 * else staff email) → auth.users (profile name, else email) → the raw id →
 * actor_type. Seller shows as its business name (sellers.display_name /
 * legal_name). Name resolution lives in scalar subqueries so a missing
 * auth-schema grant degrades to the staff chain, then to raw ids — the
 * query is retried with fewer resolution hops instead of failing the lens.
 */
async function readSellerAudit(c: PgClient, q: string, tenant: string): Promise<Row[] | null> {
  const exists = (
    await c.query(
      `SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'seller_audit_log'`,
    )
  ).rows.length
  if (!exists) return null

  const params: unknown[] = [tenant]
  const where: string[] = [`a."tenant_id" = $1`]
  if (q) {
    params.push(`%${q.replace(/[%_]/g, "")}%`)
    const p = `$${params.length}`
    where.push(
      `(a."action" ILIKE ${p} OR a."entity_type" ILIKE ${p} OR a."actor_type" ILIKE ${p}` +
        ` OR s."display_name" ILIKE ${p} OR s."legal_name" ILIKE ${p})`,
    )
  }

  const STAFF_NAME = `(
    SELECT COALESCE(NULLIF(st."display_name", ''),
                    NULLIF(TRIM(CONCAT_WS(' ', st."first_name", st."last_name")), ''),
                    st."email")
      FROM public.crm_staff st
     WHERE st."user_id" = a."actor_id"
     ORDER BY (st."tenant_id" = a."tenant_id") DESC, st."created_at" ASC
     LIMIT 1)`
  const AUTH_NAME = `COALESCE(
    (SELECT NULLIF(au."raw_user_meta_data" ->> 'full_name', '') FROM auth.users au WHERE au."id" = a."actor_id"),
    (SELECT NULLIF(au."raw_user_meta_data" ->> 'name', '') FROM auth.users au WHERE au."id" = a."actor_id"),
    (SELECT au."email" FROM auth.users au WHERE au."id" = a."actor_id"))`

  const build = (actorExpr: string) => `
    SELECT a."created_at" AS ts, ${actorExpr} AS actor, a."action" AS action,
           CASE WHEN s."id" IS NOT NULL
                THEN COALESCE(NULLIF(a."entity_type", ''), 'seller') || ' · ' ||
                     COALESCE(NULLIF(s."display_name", ''), s."legal_name")
                ELSE a."entity_type" END AS entity,
           a."before_state" AS before, a."after_state" AS after
      FROM public.seller_audit_log a
      LEFT JOIN public.sellers s ON s."id" = a."seller_id"
     WHERE ${where.join(" AND ")}
     ORDER BY a."created_at" DESC NULLS LAST
     LIMIT ${PAGE}`

  const attempts = [
    `COALESCE(${STAFF_NAME}, ${AUTH_NAME}, a."actor_id"::text, a."actor_type")`,
    `COALESCE(${STAFF_NAME}, a."actor_id"::text, a."actor_type")`,
    `COALESCE(a."actor_id"::text, a."actor_type")`,
  ]
  let rows: SellerRow[] | null = null
  for (const actorExpr of attempts) {
    try {
      rows = (await c.query(build(actorExpr), params)).rows as unknown as SellerRow[]
      break
    } catch {
      rows = null
    }
  }
  if (!rows) return null

  return rows.map((r) => {
    const parts: string[] = []
    const hasKeys = (v: unknown) =>
      v !== null && typeof v === "object" && Object.keys(v as object).length > 0
    if (hasKeys(r.before)) parts.push(`before: ${JSON.stringify(r.before)}`)
    if (hasKeys(r.after)) parts.push(`after: ${JSON.stringify(r.after)}`)
    return {
      ts: r.ts != null ? String(r.ts) : null,
      actor: r.actor != null ? truncate(r.actor, 80) : null,
      action: r.action != null ? truncate(r.action, 80) : null,
      entity: r.entity != null ? truncate(r.entity, 80) : null,
      details: parts.length ? truncate(parts.join(" → ")) : null,
    }
  })
}

// ── K4: every log store on the platform, readable in this one viewer ──────
//
// The catalog enumeration (pg_catalog, 2026-10-14): the public schema holds
// 13 audit/activity logs and 18 event stores / histories (incl. the
// erp_inventory_movement_history view); the platform_audit schema holds 9
// audit-infrastructure relations. The viewer previously read 3 of these
// (acct_audit_log, activity_log, seller_audit_log). Column maps below are
// each store's REAL columns, read from information_schema — shapes differ
// per store, so normalization happens here, never by altering a store.
// Stores without tenant_id (analytics_events, commerce_subscription_events,
// all of platform_audit) read as the platform face they are. READ-ONLY:
// nothing in this route writes to any store.
type StoreDef = {
  key: string
  label: string
  group: "Audit logs" | "Event stores" | "Platform audit"
  schema: "public" | "platform_audit" | "clinical"
  table: string
  ts?: string
  actor?: string[]
  action?: string
  actionConst?: string
  entity?: string
  entityId?: string
  details?: string[]
  before?: string
  after?: string
  pair?: [string, string]
}

const STORES: StoreDef[] = [
  // Public audit / activity logs
  { key: "acct_audit_log", label: "Accounting audit log", group: "Audit logs", schema: "public", table: "acct_audit_log", ts: "event_time", actor: ["actor_user_id"], action: "action", entity: "table_name", entityId: "record_id", before: "before_data", after: "after_data" },
  { key: "activity_log", label: "Activity log", group: "Audit logs", schema: "public", table: "activity_log", ts: "createdAt", actor: ["actor"], action: "action", entity: "entity", entityId: "entityId", details: ["summary"] },
  { key: "commerce_audit_log", label: "Commerce audit log", group: "Audit logs", schema: "public", table: "commerce_audit_log", ts: "created_at", actor: ["actor_user_id"], action: "action", entity: "entity_type", entityId: "entity_id", before: "before_data", after: "after_data" },
  { key: "crm_audit_log", label: "CRM audit log", group: "Audit logs", schema: "public", table: "crm_audit_log", ts: "occurred_at", actor: ["actor_user_id", "actor_staff_id"], action: "action", entity: "entity_type", entityId: "entity_id", before: "before_data", after: "after_data" },
  { key: "crm_merge_log", label: "CRM merge log", group: "Audit logs", schema: "public", table: "crm_merge_log", ts: "merged_at", actor: ["merged_by"], actionConst: "merge", entity: "entity_type", entityId: "surviving_record_id", details: ["snapshot"] },
  { key: "dmca_takedown_log", label: "DMCA takedown log", group: "Audit logs", schema: "public", table: "dmca_takedown_log", ts: "created_at", actor: ["actor_staff_id"], action: "action", entity: "listing_ref", entityId: "ticket_id", details: ["detail"] },
  { key: "doc_audit_log", label: "Document audit log", group: "Audit logs", schema: "public", table: "doc_audit_log", ts: "created_at", actor: ["actor_email", "actor_user_id"], action: "action", entity: "entity_type", entityId: "entity_id", before: "before_data", after: "after_data" },
  { key: "erp_audit_log", label: "ERP audit log", group: "Audit logs", schema: "public", table: "erp_audit_log", ts: "occurred_at", actor: ["actor_id"], action: "action", entity: "entity_type", entityId: "entity_id", before: "before_data", after: "after_data" },
  { key: "pharmacy_audit_log", label: "Pharmacy audit log (PHI)", group: "Audit logs", schema: "clinical", table: "pharmacy_audit_log", ts: "created_at", actor: ["portal_user_id"], action: "action", entity: "prescription_id", details: ["reason"] },
  { key: "platform_admin_access_log", label: "Platform admin access log", group: "Audit logs", schema: "public", table: "platform_admin_access_log", ts: "accessed_at", actor: ["actor_user_id"], actionConst: "tenant_access", details: ["reason"] },
  { key: "portal_permission_audit_log", label: "Portal permission audit log", group: "Audit logs", schema: "public", table: "portal_permission_audit_log", ts: "created_at", actor: ["changed_by"], action: "change_type", entity: "key", before: "old_value", after: "new_value" },
  { key: "seller_audit_log", label: "Seller audit log", group: "Audit logs", schema: "public", table: "seller_audit_log", ts: "created_at", actor: ["actor_id"], action: "action", entity: "entity_type", entityId: "entity_id", before: "before_state", after: "after_state" },
  { key: "telemed_audit_log", label: "Telemedicine audit log (PHI)", group: "Audit logs", schema: "clinical", table: "telemed_audit_log", ts: "created_at", actor: ["actor_id"], action: "action", entity: "consultation_session_id", entityId: "patient_ref", details: ["details", "reason"] },
  // Public event stores / histories
  { key: "analytics_events", label: "Analytics events", group: "Event stores", schema: "public", table: "analytics_events", ts: "created_at", action: "event_name", entity: "page_path", details: ["event_data"] },
  { key: "commerce_channel_events", label: "Commerce channel events", group: "Event stores", schema: "public", table: "commerce_channel_events", ts: "created_at", action: "event_type", entity: "channel_id", entityId: "external_event_id", details: ["payload"] },
  { key: "commerce_fulfillment_events", label: "Commerce fulfillment events", group: "Event stores", schema: "public", table: "commerce_fulfillment_events", ts: "created_at", action: "event_type", entity: "order_id", pair: ["old_status", "new_status"], details: ["payload"] },
  { key: "commerce_inventory_events", label: "Commerce inventory events", group: "Event stores", schema: "public", table: "commerce_inventory_events", ts: "created_at", action: "event_type", entity: "sku_id", details: ["payload"] },
  { key: "commerce_order_events", label: "Commerce order events", group: "Event stores", schema: "public", table: "commerce_order_events", ts: "created_at", actor: ["created_by"], action: "event_type", entity: "erp_order_id", pair: ["old_status", "new_status"], details: ["payload"] },
  { key: "commerce_outbox_events", label: "Commerce outbox events", group: "Event stores", schema: "public", table: "commerce_outbox_events", ts: "created_at", action: "event_type", entity: "aggregate_type", entityId: "aggregate_id", details: ["payload"] },
  { key: "commerce_posting_events", label: "Commerce posting events", group: "Event stores", schema: "public", table: "commerce_posting_events", ts: "created_at", action: "status", entity: "source_type", entityId: "source_id", details: ["error_message", "idempotency_key"] },
  { key: "commerce_procurement_events", label: "Commerce procurement events", group: "Event stores", schema: "public", table: "commerce_procurement_events", ts: "created_at", actor: ["created_by"], action: "event_type", entity: "purchase_order_id", pair: ["old_status", "new_status"], details: ["payload"] },
  { key: "commerce_return_events", label: "Commerce return events", group: "Event stores", schema: "public", table: "commerce_return_events", ts: "created_at", actor: ["created_by"], action: "event_type", entity: "rma_id", pair: ["old_status", "new_status"], details: ["payload"] },
  { key: "commerce_subscription_events", label: "Commerce subscription events", group: "Event stores", schema: "public", table: "commerce_subscription_events", ts: "created_at", actor: ["created_by"], action: "event_type", entity: "subscription_id", pair: ["old_status", "new_status"], details: ["payload"] },
  { key: "commerce_webhook_events", label: "Commerce webhook events", group: "Event stores", schema: "public", table: "commerce_webhook_events", ts: "created_at", actor: ["provider"], action: "event_type", entity: "external_event_id", details: ["payload"] },
  { key: "crm_appointment_status_history", label: "Appointment status history", group: "Event stores", schema: "public", table: "crm_appointment_status_history", ts: "changed_at", actor: ["changed_by"], action: "to_status", entity: "appointment_id", pair: ["from_status", "to_status"], details: ["reason"] },
  { key: "crm_funnel_events", label: "CRM funnel events", group: "Event stores", schema: "public", table: "crm_funnel_events", ts: "occurred_at", action: "event_type", entity: "source", details: ["metadata"] },
  { key: "erp_inventory_movement_history", label: "Inventory movement history", group: "Event stores", schema: "public", table: "erp_inventory_movement_history", ts: "occurred_at", actor: ["performed_by"], action: "movement_type", entity: "sku", entityId: "source_id", details: ["reason", "reference"] },
  { key: "erp_order_status_history", label: "ERP order status history", group: "Event stores", schema: "public", table: "erp_order_status_history", ts: "changed_at", actor: ["changed_by"], action: "to_status", entity: "order_id", pair: ["from_status", "to_status"], details: ["reason"] },
  { key: "erp_tracking_events", label: "ERP tracking events", group: "Event stores", schema: "public", table: "erp_tracking_events", ts: "event_at", action: "event_status", entity: "shipment_id", details: ["location_text"] },
  { key: "seller_order_events", label: "Seller order events", group: "Event stores", schema: "public", table: "seller_order_events", ts: "created_at", actor: ["actor"], action: "event_type", entity: "order_id", details: ["notes", "metadata"] },
  { key: "support_ticket_events", label: "Support ticket events", group: "Event stores", schema: "public", table: "support_ticket_events", ts: "created_at", actor: ["actor_label", "actor_staff_id", "actor_id"], action: "event_type", entity: "ticket_id", details: ["detail", "payload"] },
  // platform_audit schema — the platform's own audit infrastructure
  { key: "pa_audit_runs", label: "Audit runs", group: "Platform audit", schema: "platform_audit", table: "audit_runs", ts: "started_at", actor: ["executor"], action: "overall_status", details: ["metadata"] },
  { key: "pa_control_catalog", label: "Control catalog", group: "Platform audit", schema: "platform_audit", table: "control_catalog", actor: ["owner"], action: "domain", entity: "control_id", details: ["name"] },
  { key: "pa_control_results", label: "Control results", group: "Platform audit", schema: "platform_audit", table: "control_results", ts: "observed_at", action: "status", entity: "control_id", details: ["evidence", "failure_detail"] },
  { key: "pa_foreign_key_index_audit", label: "Foreign-key index audit", group: "Platform audit", schema: "platform_audit", table: "foreign_key_index_audit", ts: "verified_at", entity: "table_name", entityId: "constraint_name", details: ["recommended_index_ddl"] },
  { key: "pa_function_security_audit", label: "Function security audit", group: "Platform audit", schema: "platform_audit", table: "function_security_audit", ts: "verified_at", action: "risk_level", entity: "function_name", details: ["remediation_status"] },
  { key: "pa_release_gates", label: "Release gates", group: "Platform audit", schema: "platform_audit", table: "release_gates", ts: "evaluated_at", action: "current_status", entity: "gate_name", details: ["notes"] },
  { key: "pa_rls_test_cases", label: "RLS test cases", group: "Platform audit", schema: "platform_audit", table: "rls_test_cases", ts: "tested_at", actor: ["actor_type"], action: "status", entity: "target_object", details: ["test_name", "evidence"] },
  { key: "pa_schema_contract", label: "Schema contract", group: "Platform audit", schema: "platform_audit", table: "schema_contract", action: "disposition", entity: "object_name", details: ["notes"] },
  { key: "pa_trigger_contract", label: "Trigger contract", group: "Platform audit", schema: "platform_audit", table: "trigger_contract", action: "event_manipulation", entity: "trigger_name", entityId: "table_name", details: ["required_behavior"] },
]

const storeList = () =>
  STORES.map((s) => ({ key: s.key, label: s.label, group: s.group, source: `${s.schema}.${s.table}` }))

type StoreRaw = Record<string, unknown>

async function readStore(c: PgClient, def: StoreDef, q: string, tenant: string): Promise<Row[] | null> {
  const cols = (
    await c.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2`,
      [def.schema, def.table],
    )
  ).rows.map((r) => String(r.column_name))
  if (!cols.length) return null
  const set = new Set(cols)
  const has = (n?: string): n is string => !!n && set.has(n)

  const select: string[] = []
  const tsCol = has(def.ts) ? def.ts : undefined
  if (tsCol) select.push(`t."${tsCol}" AS ts`)
  const actorCols = (def.actor || []).filter(has)
  if (actorCols.length)
    select.push(`COALESCE(${actorCols.map((a) => `t."${a}"::text`).join(", ")}) AS actor`)
  if (has(def.action)) select.push(`t."${def.action}"::text AS action`)
  else if (def.actionConst) select.push(`'${def.actionConst}' AS action`)
  const entityCol = has(def.entity) ? def.entity : undefined
  if (entityCol) select.push(`t."${entityCol}"::text AS entity`)
  const entityIdCol = has(def.entityId) ? def.entityId : undefined
  if (entityIdCol) select.push(`t."${entityIdCol}"::text AS entity_id`)
  const detailCols = (def.details || []).filter(has)
  if (detailCols.length)
    select.push(`COALESCE(${detailCols.map((d) => `t."${d}"::text`).join(", ")}) AS dval`)
  const beforeCol = has(def.before) ? def.before : undefined
  const afterCol = has(def.after) ? def.after : undefined
  if (beforeCol) select.push(`t."${beforeCol}" AS bval`)
  if (afterCol) select.push(`t."${afterCol}" AS aval`)
  const pairCols = def.pair && has(def.pair[0]) && has(def.pair[1]) ? def.pair : undefined
  if (pairCols) select.push(`t."${pairCols[0]}"::text AS p1, t."${pairCols[1]}"::text AS p2`)
  if (!select.length) return null

  const params: unknown[] = []
  const where: string[] = []
  if (set.has("tenant_id")) {
    params.push(tenant)
    where.push(`t."tenant_id" = $${params.length}`)
  }
  if (q) {
    const searchCols = [...actorCols, ...(has(def.action) ? [def.action!] : []), ...(entityCol ? [entityCol] : []), ...(entityIdCol ? [entityIdCol] : [])]
    if (searchCols.length) {
      params.push(`%${q.replace(/[%_]/g, "")}%`)
      where.push(`(${searchCols.map((c0) => `t."${c0}"::text ILIKE $${params.length}`).join(" OR ")})`)
    }
  }

  let rows: StoreRaw[]
  try {
    rows = (
      await c.query(
        `SELECT ${select.join(", ")} FROM "${def.schema}"."${def.table}" t
          ${where.length ? "WHERE " + where.join(" AND ") : ""}
          ${tsCol ? `ORDER BY t."${tsCol}" DESC NULLS LAST` : ""}
          LIMIT ${PAGE}`,
        params,
      )
    ).rows as StoreRaw[]
  } catch {
    return null
  }

  const hasContent = (v: unknown) =>
    v !== null && v !== undefined && v !== "" &&
    !(typeof v === "object" && Object.keys(v as object).length === 0)
  return rows.map((r) => {
    const parts: string[] = []
    if (pairCols && (hasContent(r.p1) || hasContent(r.p2)))
      parts.push(`${r.p1 ?? "—"} → ${r.p2 ?? "—"}`)
    const ba: string[] = []
    if (hasContent(r.bval)) ba.push(`before: ${typeof r.bval === "string" ? r.bval : JSON.stringify(r.bval)}`)
    if (hasContent(r.aval)) ba.push(`after: ${typeof r.aval === "string" ? r.aval : JSON.stringify(r.aval)}`)
    if (ba.length) parts.push(ba.join(" → "))
    if (hasContent(r.dval)) parts.push(String(r.dval))
    const entity =
      r.entity != null
        ? String(r.entity) + (r.entity_id != null ? ` · ${String(r.entity_id)}` : "")
        : r.entity_id != null
          ? String(r.entity_id)
          : null
    return {
      ts: r.ts != null ? String(r.ts) : null,
      actor: r.actor != null ? truncate(r.actor, 80) : null,
      action: r.action != null ? truncate(r.action, 80) : null,
      entity: entity != null ? truncate(entity, 80) : null,
      details: parts.length ? truncate(parts.join(" · ")) : null,
    }
  })
}

/**
 * Person lenses (K4) — every recorded event for ONE person, across the
 * audit stores that key events to a person:
 *   activity_log              actor (email / auth id) or "entityId"
 *   acct_audit_log            actor_user_id
 *   seller_audit_log          actor_id (employee lens — staff act on
 *                             seller governance from there)
 *   portal_permission_audit_log  portal_user_id (via portal_users)
 *   support_ticket_events     actor_staff_id (employee lens)
 * The person is resolved first (customer: customers id / "userId" /
 * email; employee: crm_staff id / user_id / email) — an unresolved
 * person is an honest empty lens, and each store is read defensively:
 * a missing store narrows the lens, it never fails it.
 */
async function readPersonAudit(
  c: PgClient,
  kind: "customer" | "employee",
  person: string,
  tenant: string,
): Promise<{ rows: Row[]; note: string | null } | null> {
  const p = person.trim()
  if (!p) return { rows: [], note: "A person (id or email) is required for a person lens." }

  let personId: string | null = null
  let userId: string | null = null
  let email: string | null = null
  let staffId: string | null = null
  if (kind === "customer") {
    const { rows } = await c.query(
      `SELECT id::text AS id, "userId"::text AS user_id, email FROM public.customers
        WHERE (tenant_id = $1::uuid OR tenant_id IS NULL)
          AND (id::text = $2 OR "userId"::text = $2 OR lower(email) = lower($2))
        ORDER BY (tenant_id = $1::uuid) DESC LIMIT 1`,
      [tenant, p],
    ).catch(() => ({ rows: [] as any[] }))
    if (!rows[0]) return { rows: [], note: `No customer matches "${p}" in this tenant.` }
    personId = rows[0].id; userId = rows[0].user_id ?? null; email = rows[0].email ?? null
  } else {
    const { rows } = await c.query(
      `SELECT id::text AS id, user_id::text AS user_id, email FROM public.crm_staff
        WHERE tenant_id = $1::uuid
          AND (id::text = $2 OR user_id::text = $2 OR lower(email) = lower($2))
        LIMIT 1`,
      [tenant, p],
    ).catch(() => ({ rows: [] as any[] }))
    if (!rows[0]) return { rows: [], note: `No employee matches "${p}" in this tenant.` }
    staffId = rows[0].id; personId = rows[0].id; userId = rows[0].user_id ?? null; email = rows[0].email ?? null
  }

  const collected: Row[] = []
  const push = (r: Record<string, unknown>) => {
    collected.push({
      ts: r.ts != null ? String(r.ts) : null,
      actor: r.actor != null ? truncate(r.actor, 80) : null,
      action: r.action != null ? truncate(r.action, 80) : null,
      entity: r.entity != null ? truncate(r.entity, 80) : null,
      details: r.details != null ? truncate(r.details) : null,
    })
  }

  // activity_log — actor is an email or auth id; entityId may be the person.
  await c.query(
    `SELECT "createdAt" AS ts, actor, action, entity,
            summary AS details
       FROM public.activity_log
      WHERE tenant_id = $1::uuid
        AND (actor = $2 OR actor = $3 OR "entityId" = $4)
      ORDER BY "createdAt" DESC LIMIT ${PAGE}`,
    [tenant, email ?? "", userId ?? "", personId ?? ""],
  ).then((r) => r.rows.forEach(push)).catch(() => {})

  // acct_audit_log — actor_user_id.
  if (userId) {
    await c.query(
      `SELECT created_at AS ts, actor_user_id::text AS actor, action,
              table_name AS entity,
              COALESCE(after_data::text, before_data::text, record_id) AS details
         FROM public.acct_audit_log
        WHERE tenant_id = $1::uuid AND actor_user_id = $2::uuid
        ORDER BY created_at DESC LIMIT ${PAGE}`,
      [tenant, userId],
    ).then((r) => r.rows.forEach(push)).catch(() => {})
  }

  if (kind === "employee" && userId) {
    await c.query(
      `SELECT created_at AS ts, actor_id::text AS actor, action,
              entity_type AS entity, after_state::text AS details
         FROM public.seller_audit_log
        WHERE tenant_id = $1::uuid AND actor_id = $2::uuid
        ORDER BY created_at DESC LIMIT ${PAGE}`,
      [tenant, userId],
    ).then((r) => r.rows.forEach(push)).catch(() => {})
  }

  // portal_permission_audit_log — keyed by portal_users.id.
  const { rows: pu } = await c.query(
    `SELECT id::text AS id FROM public.portal_users
      WHERE ($1 <> '' AND user_id = $1::uuid) OR ($2 <> '' AND lower(email) = lower($2))
      ORDER BY created_at ASC LIMIT 1`,
    [userId ?? "", email ?? ""],
  ).catch(() => ({ rows: [] as any[] }))
  if (pu[0]?.id) {
    await c.query(
      `SELECT created_at AS ts, portal_user_id::text AS actor, action,
              'portal_permissions' AS entity, details::text AS details
         FROM public.portal_permission_audit_log
        WHERE tenant_id = $1::uuid AND portal_user_id = $2::uuid
        ORDER BY created_at DESC LIMIT ${PAGE}`,
      [tenant, pu[0].id],
    ).then((r) => r.rows.forEach(push)).catch(() => {})
  }

  if (kind === "employee" && staffId) {
    await c.query(
      `SELECT created_at AS ts, COALESCE(actor_label, actor_staff_id::text) AS actor,
              event_type AS action, 'support_ticket' AS entity, detail::text AS details
         FROM public.support_ticket_events
        WHERE tenant_id = $1::uuid AND actor_staff_id = $2::uuid
        ORDER BY created_at DESC LIMIT ${PAGE}`,
      [tenant, staffId],
    ).then((r) => r.rows.forEach(push)).catch(() => {})
  }

  collected.sort((a, b) => String(b.ts ?? "").localeCompare(String(a.ts ?? "")))
  return {
    rows: collected.slice(0, PAGE),
    note: `${kind} lens for ${email ?? personId ?? p} — ${collected.length} recorded event(s) across the audit stores.`,
  }
}

export async function GET(req: NextRequest) {
  const tenant = resolveTenantId(req);
  const denied = await requireModuleApi("administration", "read")
  if (denied) return denied
  const q = (req.nextUrl.searchParams.get("q") || "").trim()
  const lens = (req.nextUrl.searchParams.get("source") || "accounting").trim()
  const stores = storeList()

  const storeKey = (req.nextUrl.searchParams.get("store") || "").trim()
  if (storeKey) {
    const def = STORES.find((s) => s.key === storeKey)
    if (!def)
      return NextResponse.json({
        pageSize: PAGE,
        stores,
        source: null,
        rows: [] as Row[],
        note: `Unknown audit store "${storeKey}".`,
      })
    const out = await withPg(async (c) => {
      // seller_audit_log keeps its name-resolving reader (same as the lens).
      const rows =
        def.key === "seller_audit_log"
          ? await readSellerAudit(c, q, tenant)
          : await readStore(c, def, q, tenant)
      if (rows) return { source: `${def.schema}.${def.table}`, rows, note: null as string | null }
      return {
        source: null,
        rows: [] as Row[],
        note: `${def.schema}.${def.table} is unavailable — this store cannot be read right now.`,
      }
    })
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
    return NextResponse.json({ pageSize: PAGE, stores, ...out })
  }

  if (lens === "customer" || lens === "employee") {
    const person = (req.nextUrl.searchParams.get("person") || q).trim()
    const out = await withPg(async (c) => {
      const res = await readPersonAudit(c, lens, person, tenant)
      if (res) return { source: `person_lens:${lens}`, rows: res.rows, note: res.note }
      return {
        source: null,
        rows: [] as Row[],
        note: "The person lens could not be read right now.",
      }
    })
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
    return NextResponse.json({ pageSize: PAGE, stores, ...out })
  }

  if (lens === "seller") {
    const out = await withPg(async (c) => {
      const rows = await readSellerAudit(c, q, tenant)
      if (rows) return { source: "seller_audit_log", rows, note: null as string | null }
      return {
        source: null,
        rows: [] as Row[],
        note: "seller_audit_log is unavailable — the seller governance trail cannot be read right now.",
      }
    })
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
    return NextResponse.json({ pageSize: PAGE, stores, ...out })
  }

  const out = await withPg(async (c) => {
    const primary = await readTable(c, "acct_audit_log", q, tenant)
    if (primary) return { source: "acct_audit_log", rows: primary, note: null as string | null }
    const fallback = await readTable(c, "activity_log", q, tenant)
    if (fallback)
      return {
        source: "activity_log",
        rows: fallback,
        note: "acct_audit_log was unavailable — showing the generic activity_log instead.",
      }
    return {
      source: null,
      rows: [] as Row[],
      note: "No audit tables are available — both acct_audit_log and activity_log are missing or unreadable.",
    }
  })

  if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
  return NextResponse.json({ pageSize: PAGE, stores, ...out })
}
