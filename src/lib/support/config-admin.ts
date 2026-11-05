// ============================================================================
// Support §10 configuration management — the writer side of the config
// tables the step-5 engines read (spec: support-desk-enterprise-tree §10,
// §0 inheritance, §18 admin-configuration change log).
//
// Until this module, every §10 table had readers (routing.ts, sla.ts,
// escalation.ts, automations.ts, macros.ts, templates.ts — all through
// loadEffectiveConfig) and NO writer: the tables held 0 rows and the
// engines ran inert. This module is the management surface's data layer.
//
// Scope model (§0): inheritable config rows carry scope + tenant_id +
// inherits_from_id + locked_by_master. Resolution is the engines' own
// resolveEffectiveRows (tenant override, else master default). Writes
// follow the same model:
//   · scope='tenant' rows belong to the acting tenant (resolveTenantId).
//   · scope='master' rows are platform defaults — writable ONLY when the
//     acting tenant IS the platform master tenant (the same test the
//     desk queue uses for scope=all). Other tenants see master rows
//     read-only and refine them by writing a tenant row whose
//     inherits_from_id points at the master row.
//   · A master row with locked_by_master = true cannot be edited by a
//     tenant actor and cannot be refined (no tenant row may inherit
//     from it). Templates carry the §10 statutory lock on top: a tenant
//     template whose code has ANY locked master row is refused — the
//     resolver (templates.ts resolveTemplate) removes tenant rows for
//     a locked code from contention entirely, so storing one would be
//     a silent no-op; the writer refuses it loudly instead.
//   · support_categories is the global registry (migration 20261028
//     header: code is GLOBALLY unique so tickets.category can FK to
//     it; registry rows are master-scope). Category writes are
//     therefore master-actor only, and categories are deactivated,
//     never deleted — tickets reference the code.
//
// Operational tables (team members, staff skills, signatures,
// notification prefs) are tenant-only by design (migration 20261028:
// "Personal/operational tables carry tenant_id only"). Their rows are
// writable only by their own tenant. Leaf rows with no config identity
// of their own (members, skills, holidays, signatures, prefs) may be
// deleted; named configuration is deactivated, never hard-deleted.
//
// Audit (§18): every mutation appends to public.crm_audit_log — the
// platform's per-domain audit store for the CRM domain the desk lives
// in — with entity_type = the config table, action =
// support_config_<verb>, and before/after row images. Like the
// platform's auditAction helper, an audit failure never breaks the
// write; it is logged to stderr.
// ============================================================================

import { parseActions } from "./actions"

/** The pg-shaped client withPg hands its callback (same shape the engines take). */
export interface ConfigDb {
  query<T = any>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
}

type Db = ConfigDb

export type ConfigResource =
  | "teams" | "teamMembers" | "staffSkills" | "categories"
  | "businessHours" | "holidays" | "slaPolicies" | "escalationRules"
  | "routingRules" | "channels" | "macros" | "cannedReplies"
  | "templates" | "signatures" | "automations" | "notificationPrefs"

type FieldType = "text" | "int" | "bigint" | "bool" | "json" | "text[]" | "date" | "uuid"

interface FieldDef {
  name: string
  type: FieldType
  required?: boolean
  enum?: string[]
  min?: number
  max?: number
  /** Writable at create, frozen afterwards (registry codes). */
  createOnly?: boolean
}

interface ResourceDef {
  table: string
  kind: "config" | "ops" | "registry"
  deleteMode: "deactivate" | "delete"
  fields: FieldDef[]
}

const PRIORITIES = ["low", "normal", "high", "urgent"]
const STRATEGIES = ["round_robin", "least_loaded", "skills_based", "manual"]
const ESCALATION_TRIGGERS = ["sla_warning", "breached", "unassigned_age", "reopened_n"]
const ESCALATION_ACTIONS = ["notify", "reassign", "raise_priority", "add_watcher"]
const AUTOMATION_TRIGGERS = ["ticket_created", "ticket_updated", "message_received", "time_based"]
const CHANNEL_CODES = ["email", "web_form", "in_app", "api", "chat", "phone", "sms"]
const TEMPLATE_CHANNELS = ["email", "sms", "in_app"]
const PREF_CHANNELS = ["in_app", "email", "push"]

export const CONFIG_RESOURCES: Record<ConfigResource, ResourceDef> = {
  teams: {
    table: "support_teams", kind: "config", deleteMode: "deactivate",
    fields: [
      { name: "code", type: "text", required: true },
      { name: "name", type: "text", required: true },
      { name: "description", type: "text" },
    ],
  },
  teamMembers: {
    table: "support_team_members", kind: "ops", deleteMode: "delete",
    fields: [
      { name: "team_id", type: "uuid", required: true },
      { name: "staff_id", type: "uuid", required: true },
      { name: "role", type: "text" },
      { name: "max_concurrent", type: "int", min: 0 },
      { name: "is_available", type: "bool" },
    ],
  },
  staffSkills: {
    table: "support_staff_skills", kind: "ops", deleteMode: "delete",
    fields: [
      { name: "staff_id", type: "uuid", required: true },
      { name: "skill_code", type: "text", required: true },
      { name: "level", type: "int", min: 1, max: 5 },
    ],
  },
  categories: {
    table: "support_categories", kind: "registry", deleteMode: "deactivate",
    fields: [
      { name: "code", type: "text", required: true, createOnly: true },
      { name: "name", type: "text", required: true },
      { name: "parent_code", type: "text" },
      { name: "default_team_id", type: "uuid" },
      { name: "default_sla_policy_id", type: "uuid" },
      { name: "regulated", type: "bool" },
      { name: "sort_order", type: "int" },
    ],
  },
  businessHours: {
    table: "support_business_hours", kind: "config", deleteMode: "deactivate",
    fields: [
      { name: "name", type: "text", required: true },
      { name: "timezone", type: "text", required: true },
      { name: "schedule", type: "json", required: true },
      { name: "is_default", type: "bool" },
    ],
  },
  holidays: {
    table: "support_holidays", kind: "config", deleteMode: "delete",
    fields: [
      { name: "business_hours_id", type: "uuid", required: true },
      { name: "holiday_date", type: "date", required: true },
      { name: "name", type: "text", required: true },
    ],
  },
  slaPolicies: {
    table: "support_sla_policies", kind: "config", deleteMode: "deactivate",
    fields: [
      { name: "name", type: "text", required: true },
      { name: "first_response_minutes", type: "int", min: 0 },
      { name: "next_reply_minutes", type: "int", min: 0 },
      { name: "resolution_minutes", type: "int", min: 0 },
      { name: "uses_business_hours", type: "bool" },
      { name: "business_hours_id", type: "uuid" },
      { name: "is_default", type: "bool" },
    ],
  },
  escalationRules: {
    table: "support_escalation_rules", kind: "config", deleteMode: "deactivate",
    fields: [
      { name: "name", type: "text", required: true },
      { name: "trigger_type", type: "text", required: true, enum: ESCALATION_TRIGGERS },
      { name: "condition", type: "json" },
      { name: "action", type: "text", required: true, enum: ESCALATION_ACTIONS },
      { name: "action_config", type: "json" },
    ],
  },
  routingRules: {
    table: "support_routing_rules", kind: "config", deleteMode: "deactivate",
    fields: [
      { name: "name", type: "text", required: true },
      { name: "rule_order", type: "int" },
      { name: "conditions", type: "json" },
      { name: "strategy", type: "text", enum: STRATEGIES },
      { name: "target_team_id", type: "uuid" },
      { name: "target_staff_id", type: "uuid" },
      { name: "set_priority", type: "text", enum: PRIORITIES },
      { name: "set_tags", type: "text[]" },
      { name: "sla_policy_id", type: "uuid" },
    ],
  },
  channels: {
    table: "support_channels", kind: "config", deleteMode: "deactivate",
    fields: [
      { name: "code", type: "text", required: true, enum: CHANNEL_CODES, createOnly: true },
      { name: "name", type: "text", required: true },
      { name: "sending_domain", type: "text" },
      { name: "allow_list", type: "json" },
      { name: "block_list", type: "json" },
      { name: "spam_quarantine", type: "bool" },
      { name: "reopen_window_days", type: "int", min: 0 },
      { name: "max_attachment_bytes", type: "bigint", min: 1 },
      { name: "max_ticket_attachment_bytes", type: "bigint", min: 1 },
      { name: "blocked_extensions", type: "text[]" },
      { name: "config", type: "json" },
    ],
  },
  macros: {
    table: "support_macros", kind: "config", deleteMode: "deactivate",
    fields: [
      { name: "name", type: "text", required: true },
      { name: "description", type: "text" },
      { name: "actions", type: "json", required: true },
    ],
  },
  cannedReplies: {
    table: "support_canned_replies", kind: "config", deleteMode: "deactivate",
    fields: [
      { name: "title", type: "text", required: true },
      { name: "body", type: "text", required: true },
      { name: "category_code", type: "text" },
      { name: "locale", type: "text" },
    ],
  },
  templates: {
    table: "support_templates", kind: "config", deleteMode: "deactivate",
    fields: [
      { name: "code", type: "text", required: true },
      { name: "name", type: "text", required: true },
      { name: "channel", type: "text", enum: TEMPLATE_CHANNELS },
      { name: "subject", type: "text" },
      { name: "body", type: "text", required: true },
      { name: "locale", type: "text" },
      { name: "locked", type: "bool" },
    ],
  },
  signatures: {
    table: "support_signatures", kind: "ops", deleteMode: "delete",
    fields: [
      { name: "staff_id", type: "uuid", required: true },
      { name: "team_id", type: "uuid" },
      { name: "body", type: "text", required: true },
      { name: "is_default", type: "bool" },
    ],
  },
  automations: {
    table: "support_automations", kind: "config", deleteMode: "deactivate",
    fields: [
      { name: "name", type: "text", required: true },
      { name: "trigger_event", type: "text", required: true, enum: AUTOMATION_TRIGGERS },
      { name: "conditions", type: "json" },
      { name: "actions", type: "json", required: true },
      { name: "dry_run", type: "bool" },
      { name: "kill_switch", type: "bool" },
    ],
  },
  notificationPrefs: {
    table: "support_notification_prefs", kind: "ops", deleteMode: "delete",
    fields: [
      { name: "staff_id", type: "uuid", required: true },
      { name: "event_kind", type: "text", required: true },
      { name: "channel", type: "text", required: true, enum: PREF_CHANNELS },
      { name: "enabled", type: "bool" },
      { name: "digest", type: "bool" },
    ],
  },
}

export function isConfigResource(v: unknown): v is ConfigResource {
  return typeof v === "string" && v in CONFIG_RESOURCES
}

/** The platform master tenant test — mirrors the desk queue's scope=all. */
export function isMasterActor(tenantId: string): boolean {
  const master = process.env.SUPABASE_TENANT_ID || ""
  return master !== "" && tenantId === master
}

// ── Validation ──────────────────────────────────────────────────────

export class ConfigError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]

function validateSchedule(v: unknown): void {
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    throw new ConfigError("schedule must be a JSON object keyed by day (sun..sat)")
  }
  for (const [day, intervals] of Object.entries(v as Record<string, unknown>)) {
    if (!DAY_KEYS.includes(day)) throw new ConfigError(`schedule day '${day}' is not one of ${DAY_KEYS.join(", ")}`)
    if (!Array.isArray(intervals)) throw new ConfigError(`schedule.${day} must be an array of [startHour, endHour) pairs`)
    for (const pair of intervals) {
      if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== "number" || typeof pair[1] !== "number") {
        throw new ConfigError(`schedule.${day} entries must be [startHour, endHour) number pairs`)
      }
    }
  }
}

function coerceField(def: FieldDef, raw: unknown, resource: ConfigResource): unknown {
  if (raw === undefined) return undefined
  if (raw === null) {
    if (def.required) throw new ConfigError(`${def.name} is required`)
    return null
  }
  switch (def.type) {
    case "text": {
      if (typeof raw !== "string") throw new ConfigError(`${def.name} must be text`)
      if (def.required && raw.trim() === "") throw new ConfigError(`${def.name} is required`)
      if (def.enum && !def.enum.includes(raw)) {
        throw new ConfigError(`${def.name} must be one of: ${def.enum.join(", ")}`)
      }
      return raw
    }
    case "int":
    case "bigint": {
      const n = typeof raw === "number" ? raw : Number(raw)
      if (!Number.isInteger(n)) throw new ConfigError(`${def.name} must be an integer`)
      if (def.min != null && n < def.min) throw new ConfigError(`${def.name} must be >= ${def.min}`)
      if (def.max != null && n > def.max) throw new ConfigError(`${def.name} must be <= ${def.max}`)
      return n
    }
    case "bool": {
      if (typeof raw !== "boolean") throw new ConfigError(`${def.name} must be true or false`)
      return raw
    }
    case "json": {
      // actions / allow_list / block_list are JSON arrays; every other
      // json field on these tables is a JSON object.
      const arrayValued = def.name === "actions" || def.name === "allow_list" || def.name === "block_list"
      if (arrayValued) {
        if (!Array.isArray(raw)) throw new ConfigError(`${def.name} must be a JSON array`)
      } else if (typeof raw !== "object" || Array.isArray(raw)) {
        throw new ConfigError(`${def.name} must be a JSON object`)
      }
      if (def.name === "actions") {
        // The stored actions must speak the engines' grammar (actions.ts) —
        // a malformed action is refused at write time, not at fire time.
        const { invalid } = parseActions(raw)
        if (invalid.length > 0) {
          throw new ConfigError(
            `${resource} actions invalid: ` +
            invalid.map((i) => `index ${i.index}: ${i.reason}`).join("; "),
          )
        }
      }
      if (def.name === "schedule") validateSchedule(raw)
      return raw
    }
    case "text[]": {
      if (!Array.isArray(raw) || raw.some((x) => typeof x !== "string")) {
        throw new ConfigError(`${def.name} must be an array of strings`)
      }
      return raw
    }
    case "date": {
      if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        throw new ConfigError(`${def.name} must be a date (YYYY-MM-DD)`)
      }
      return raw
    }
    case "uuid": {
      if (typeof raw !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
        throw new ConfigError(`${def.name} must be a uuid`)
      }
      return raw
    }
  }
}

/** Pull the whitelisted, coerced fields out of a request body. */
function pickFields(
  def: ResourceDef,
  body: Record<string, unknown>,
  mode: "create" | "update",
  resource: ConfigResource,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of def.fields) {
    if (mode === "update" && f.createOnly) continue
    const v = coerceField(f, body[f.name], resource)
    if (v !== undefined) out[f.name] = v
  }
  if (mode === "create") {
    for (const f of def.fields) {
      if (f.required && out[f.name] === undefined) {
        throw new ConfigError(`${f.name} is required`)
      }
    }
  }
  return out
}

// ── Audit (§18 admin-configuration change log) ─────────────────────

export interface ConfigActor {
  userId: string | null
  staffId: string | null
  ip: string | null
  userAgent: string | null
}

async function auditConfigChange(
  c: Db,
  tenantId: string,
  actor: ConfigActor,
  table: string,
  rowId: string | null,
  verb: "create" | "update" | "deactivate" | "delete",
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): Promise<void> {
  try {
    await c.query(
      `INSERT INTO public.crm_audit_log
         (tenant_id, actor_user_id, actor_staff_id, entity_type, entity_id, action, before_data, after_data, ip_address, user_agent)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6, $7::jsonb, $8::jsonb, $9::inet, $10)`,
      [
        tenantId, actor.userId, actor.staffId, table, rowId,
        `support_config_${verb}`,
        before ? JSON.stringify(before) : null,
        after ? JSON.stringify(after) : null,
        actor.ip, actor.userAgent,
      ],
    )
  } catch (e) {
    console.error(
      `[support-config] audit write failed for ${table}/${verb}:`,
      e instanceof Error ? e.message : String(e),
    )
  }
}

// ── Reads ───────────────────────────────────────────────────────────

async function selectVisible(
  c: Db, def: ResourceDef, tenantId: string,
): Promise<Record<string, unknown>[]> {
  if (def.kind === "registry") {
    const { rows } = await c.query(
      `SELECT * FROM public.${def.table} ORDER BY sort_order ASC, code ASC`,
    )
    return rows
  }
  if (def.kind === "ops") {
    const { rows } = await c.query(
      `SELECT * FROM public.${def.table} WHERE tenant_id = $1::uuid ORDER BY created_at ASC`,
      [tenantId],
    )
    return rows
  }
  const { rows } = await c.query(
    `SELECT * FROM public.${def.table}
      WHERE scope = 'master' OR tenant_id = $1::uuid
      ORDER BY created_at ASC`,
    [tenantId],
  )
  return rows
}

export async function listSupportConfig(c: Db, tenantId: string) {
  const resources: Record<string, Record<string, unknown>[]> = {}
  for (const key of Object.keys(CONFIG_RESOURCES) as ConfigResource[]) {
    resources[key] = await selectVisible(c, CONFIG_RESOURCES[key], tenantId)
  }
  const { rows: staff } = await c.query(
    `SELECT id::text AS id, display_name, role FROM public.crm_staff
      WHERE tenant_id = $1::uuid AND is_active ORDER BY display_name ASC`,
    [tenantId],
  )
  return { tenant: tenantId, masterActor: isMasterActor(tenantId), staff, resources }
}

// ── Writes ──────────────────────────────────────────────────────────

async function fetchRow(
  c: Db, def: ResourceDef, id: string,
): Promise<Record<string, any> | null> {
  const { rows } = await c.query(`SELECT * FROM public.${def.table} WHERE id = $1::uuid LIMIT 1`, [id])
  return rows[0] ?? null
}

/** May this actor modify this row? Registry + master rows: master actor only. */
function assertWritable(
  def: ResourceDef, row: Record<string, any>, tenantId: string, masterActor: boolean,
): void {
  if (def.kind === "registry") {
    if (!masterActor) {
      throw new ConfigError(
        "The category registry is platform-global in v1 (its codes are the tickets.category foreign key) — only the master tenant's desk can change it.",
        403,
      )
    }
    return
  }
  if (def.kind === "ops") {
    if (row.tenant_id !== tenantId) throw new ConfigError("Row belongs to another tenant", 404)
    return
  }
  if (row.scope === "master") {
    if (!masterActor) {
      throw new ConfigError(
        "Master-scope configuration is read-only here — refine it by creating a tenant override instead.",
        403,
      )
    }
    return
  }
  if (row.tenant_id !== tenantId) throw new ConfigError("Row belongs to another tenant", 404)
  if (row.locked_by_master && !masterActor) {
    throw new ConfigError("This row is locked by master and cannot be changed from a tenant desk.", 403)
  }
}

async function assertRefinable(
  c: Db, def: ResourceDef, inheritsFromId: string,
): Promise<void> {
  const parent = await fetchRow(c, def, inheritsFromId)
  if (!parent) throw new ConfigError("inheritsFromId does not name a row of this table", 400)
  if (parent.scope !== "master") {
    throw new ConfigError("inheritsFromId must name a master-scope row (inheritance refines master defaults)", 400)
  }
  if (parent.locked_by_master) {
    throw new ConfigError("That master row is locked — it cannot be refined by a tenant override.", 409)
  }
}

async function assertTemplateCodeUnlocked(
  c: Db, tenantId: string, code: string,
): Promise<void> {
  const { rows } = await c.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM public.support_templates
      WHERE scope = 'master' AND code = $1 AND locked`,
    [code],
  )
  if ((rows[0]?.n ?? 0) > 0) {
    throw new ConfigError(
      `Template code '${code}' is locked at master scope (statutory wording) — tenant rows for it can never take effect and are refused.`,
      409,
    )
  }
  void tenantId
}

/** Ops rows name people: the staff row must belong to the acting tenant. */
async function assertStaffOfTenant(c: Db, tenantId: string, staffId: string): Promise<void> {
  const { rows } = await c.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM public.crm_staff WHERE id = $1::uuid AND tenant_id = $2::uuid`,
    [staffId, tenantId],
  )
  if ((rows[0]?.n ?? 0) === 0) {
    throw new ConfigError("staff_id does not name a staff member of this tenant", 400)
  }
}

async function assertTeamVisible(c: Db, tenantId: string, teamId: string): Promise<void> {
  const team = await fetchRow(c, CONFIG_RESOURCES.teams, teamId)
  if (!team || !(team.scope === "master" || team.tenant_id === tenantId)) {
    throw new ConfigError("team_id does not name a team visible to this tenant", 400)
  }
}

export interface MutationResult { row: Record<string, unknown> }

export async function createSupportConfig(
  c: Db,
  tenantId: string,
  actor: ConfigActor,
  resource: ConfigResource,
  body: Record<string, unknown>,
): Promise<MutationResult> {
  const def = CONFIG_RESOURCES[resource]
  const masterActor = isMasterActor(tenantId)
  const fields = pickFields(def, body, "create", resource)

  const cols: string[] = []
  const vals: unknown[] = []
  const push = (col: string, v: unknown) => { cols.push(col); vals.push(v) }

  if (def.kind === "registry") {
    if (!masterActor) {
      throw new ConfigError(
        "The category registry is platform-global in v1 — only the master tenant's desk can add categories.",
        403,
      )
    }
    push("scope", "master")
    push("tenant_id", null)
  } else if (def.kind === "ops") {
    push("tenant_id", tenantId)
    if (typeof fields.staff_id === "string") {
      await assertStaffOfTenant(c, tenantId, fields.staff_id)
    }
    if (resource === "teamMembers") {
      await assertTeamVisible(c, tenantId, String(fields.team_id))
    }
  } else {
    const scope = body.scope === "master" ? "master" : "tenant"
    if (scope === "master" && !masterActor) {
      throw new ConfigError("Only the master tenant's desk can author master-scope configuration.", 403)
    }
    push("scope", scope)
    push("tenant_id", scope === "master" ? null : tenantId)
    if (scope === "tenant" && typeof body.inheritsFromId === "string" && body.inheritsFromId) {
      await assertRefinable(c, def, body.inheritsFromId)
      push("inherits_from_id", body.inheritsFromId)
    }
    if (body.lockedByMaster === true) {
      if (!masterActor || scope !== "master") {
        throw new ConfigError("locked_by_master can only be set on a master row, from the master desk.", 403)
      }
      push("locked_by_master", true)
    }
    if (resource === "templates") {
      if (fields.locked === true && !(masterActor && scope === "master")) {
        throw new ConfigError("A template can only be locked on a master row, from the master desk.", 403)
      }
      if (scope === "tenant") await assertTemplateCodeUnlocked(c, tenantId, String(fields.code))
    }
  }

  for (const f of def.fields) {
    if (fields[f.name] === undefined) continue
    // jsonb params go in as JSON text (node-pg would otherwise turn a JS
    // array into a Postgres array literal); text[] params go in raw.
    push(f.name, f.type === "json" ? JSON.stringify(fields[f.name]) : fields[f.name])
  }
  const placeholders = cols.map((col, i) => {
    const f = def.fields.find((x) => x.name === col)
    if (f?.type === "json") return `$${i + 1}::jsonb`
    if (f?.type === "text[]") return `$${i + 1}::text[]`
    if (f?.type === "uuid") return `$${i + 1}::uuid`
    if (f?.type === "date") return `$${i + 1}::date`
    return `$${i + 1}`
  })
  const { rows } = await c.query(
    `INSERT INTO public.${def.table} (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
    vals,
  )
  const row = rows[0]
  await auditConfigChange(c, tenantId, actor, def.table, row.id, "create", null, row)
  return { row }
}

export async function updateSupportConfig(
  c: Db,
  tenantId: string,
  actor: ConfigActor,
  resource: ConfigResource,
  id: string,
  body: Record<string, unknown>,
): Promise<MutationResult> {
  const def = CONFIG_RESOURCES[resource]
  const masterActor = isMasterActor(tenantId)
  const before = await fetchRow(c, def, id)
  if (!before) throw new ConfigError("Row not found", 404)
  assertWritable(def, before, tenantId, masterActor)

  const fields = pickFields(def, body, "update", resource)
  if (def.kind === "ops" && typeof fields.staff_id === "string") {
    await assertStaffOfTenant(c, tenantId, fields.staff_id)
  }
  if (resource === "teamMembers" && typeof fields.team_id === "string") {
    await assertTeamVisible(c, tenantId, fields.team_id)
  }
  if (resource === "templates" && before.scope === "tenant") {
    await assertTemplateCodeUnlocked(c, tenantId, String(fields.code ?? before.code))
  }
  if (fields.locked !== undefined && resource === "templates") {
    if (!(masterActor && before.scope === "master")) {
      throw new ConfigError("A template can only be locked on a master row, from the master desk.", 403)
    }
  }
  if (body.isActive !== undefined && typeof body.isActive !== "boolean") {
    throw new ConfigError("isActive must be true or false")
  }

  const sets: string[] = []
  const vals: unknown[] = []
  for (const f of def.fields) {
    if (fields[f.name] === undefined) continue
    vals.push(f.type === "json" ? JSON.stringify(fields[f.name]) : fields[f.name])
    const cast = f.type === "json" ? "::jsonb" : f.type === "text[]" ? "::text[]" : f.type === "uuid" ? "::uuid" : f.type === "date" ? "::date" : ""
    sets.push(`${f.name} = $${vals.length}${cast}`)
  }
  if (typeof body.isActive === "boolean" && "is_active" in before) {
    vals.push(body.isActive)
    sets.push(`is_active = $${vals.length}`)
  }
  if (sets.length === 0) throw new ConfigError("Nothing to update")
  vals.push(id)
  const { rows } = await c.query(
    `UPDATE public.${def.table}
        SET ${sets.join(", ")}, row_version = row_version + 1, updated_at = now()
      WHERE id = $${vals.length}::uuid
      RETURNING *`,
    vals,
  )
  const row = rows[0]
  await auditConfigChange(c, tenantId, actor, def.table, row.id, "update", before, row)
  return { row }
}

export async function removeSupportConfig(
  c: Db,
  tenantId: string,
  actor: ConfigActor,
  resource: ConfigResource,
  id: string,
): Promise<MutationResult> {
  const def = CONFIG_RESOURCES[resource]
  const masterActor = isMasterActor(tenantId)
  const before = await fetchRow(c, def, id)
  if (!before) throw new ConfigError("Row not found", 404)
  assertWritable(def, before, tenantId, masterActor)

  if (def.deleteMode === "deactivate") {
    if (before.is_active === false) return { row: before }
    const { rows } = await c.query(
      `UPDATE public.${def.table}
          SET is_active = false, row_version = row_version + 1, updated_at = now()
        WHERE id = $1::uuid
        RETURNING *`,
      [id],
    )
    const row = rows[0]
    await auditConfigChange(c, tenantId, actor, def.table, row.id, "deactivate", before, row)
    return { row }
  }
  await c.query(`DELETE FROM public.${def.table} WHERE id = $1::uuid`, [id])
  await auditConfigChange(c, tenantId, actor, def.table, id, "delete", before, null)
  return { row: before }
}
