import { createHmac } from "node:crypto"

// ============================================================================
// §16 OUTBOUND WEBHOOKS (support-gaps build) — per-tenant endpoint
// registrations, event selection, signed deliveries.
//
// The store is 20261074 (support_webhooks_outbound +
// support_webhook_deliveries, live). This lib is its code:
//
//   REGISTRATION — CRUD over support_webhooks_outbound. The signing
//   secret is WRITE-ONLY: accepted on create/update, stored, and
//   never selected into any read shape (the read columns name it
//   only as `hasSecret`). Clearing is explicit (clearSecret).
//
//   EMISSION — emitTicketEventWebhooks is called (fail-soft) from
//   logTicketEvent, the desk's one event writer, so EVERY ticket
//   event is a candidate. A registration receives an event when it
//   is active and its event_types contains the event's type (an
//   empty selection subscribes to nothing — a registration that
//   wants events names them). Each emission writes, together: one
//   delivery row (born 'queued') and one support_jobs row (type
//   'webhook_delivery', born 'queued', payload naming the delivery)
//   — the §13 consumer's webhook_delivery executor settles them.
//
//   DELIVERY — executeWebhookDelivery (the consumer's executor):
//   the payload's canonical form (JSON with recursively sorted
//   keys) is signed with the registration's secret as
//   'sha256=<hmac-sha256 hex>' (the platform's §4.5 scheme) and the
//   delivery settles 'recorded' with the signature stored. THE
//   TRANSPORT IS THE SEAM: no live HTTP call is made from this
//   build — 'recorded' means the signed delivery descriptor exists
//   and is inspectable; 'delivered' is reserved for a future
//   transport-confirmed state and nothing here writes it.
//   A registration deleted/deactivated between emission and
//   execution fails the delivery honestly ('failed' + last_error)
//   and the job completes — there is nothing to retry against a
//   registration that no longer exists.
// ============================================================================

export class WebhookError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export interface SupportWebhook {
  id: string
  name: string
  url: string
  eventTypes: string[]
  hasSecret: boolean
  isActive: boolean
  createdByStaffId: string | null
  createdAt: string
  updatedAt: string
}

export interface WebhookDelivery {
  id: string
  webhookId: string
  ticketId: string | null
  eventType: string
  eventId: string | null
  payload: Record<string, unknown>
  status: string
  attempts: number
  signature: string | null
  responseStatus: number | null
  lastError: string | null
  jobId: string | null
  createdAt: string
  deliveredAt: string | null
}

const HOOK_COLS = `id::text AS id, name, url, event_types, (secret IS NOT NULL) AS has_secret,
  is_active, created_by_staff_id::text AS created_by_staff_id,
  created_at::text AS created_at, updated_at::text AS updated_at`

function mapHook(r: any): SupportWebhook {
  return {
    id: r.id,
    name: r.name,
    url: r.url,
    eventTypes: (r.event_types ?? []) as string[],
    hasSecret: r.has_secret === true,
    isActive: r.is_active === true,
    createdByStaffId: r.created_by_staff_id ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

const DELIVERY_COLS = `id::text AS id, webhook_id::text AS webhook_id,
  ticket_id::text AS ticket_id, event_type, event_id::text AS event_id,
  payload, status, attempts, signature, response_status, last_error,
  job_id::text AS job_id, created_at::text AS created_at,
  delivered_at::text AS delivered_at`

function mapDelivery(r: any): WebhookDelivery {
  return {
    id: r.id,
    webhookId: r.webhook_id,
    ticketId: r.ticket_id ?? null,
    eventType: r.event_type,
    eventId: r.event_id ?? null,
    payload: (r.payload ?? {}) as Record<string, unknown>,
    status: r.status,
    attempts: Number(r.attempts ?? 0),
    signature: r.signature ?? null,
    responseStatus: r.response_status ?? null,
    lastError: r.last_error ?? null,
    jobId: r.job_id ?? null,
    createdAt: r.created_at,
    deliveredAt: r.delivered_at ?? null,
  }
}

function cleanUrl(raw: unknown): string {
  const url = String(raw || "").trim()
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new WebhookError("url must be a valid URL")
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new WebhookError("url must be http(s)")
  }
  return url
}

function cleanEventTypes(raw: unknown): string[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) throw new WebhookError("eventTypes must be an array of event type names")
  const out: string[] = []
  for (const v of raw) {
    const t = String(v || "").trim()
    if (!t) continue
    if (!/^[a-z0-9_.-]+$/i.test(t)) throw new WebhookError(`'${t}' is not an event type name`)
    if (!out.includes(t)) out.push(t)
  }
  return out
}

// ── Registration CRUD ────────────────────────────────────────────────

export async function listWebhooks(client: any, tenantId: string): Promise<SupportWebhook[]> {
  const r = await client.query(
    `SELECT ${HOOK_COLS} FROM public.support_webhooks_outbound
      WHERE tenant_id = $1::uuid ORDER BY created_at ASC`,
    [tenantId],
  )
  return r.rows.map(mapHook)
}

export async function getWebhook(client: any, tenantId: string, id: string): Promise<SupportWebhook | null> {
  const r = await client.query(
    `SELECT ${HOOK_COLS} FROM public.support_webhooks_outbound
      WHERE tenant_id = $1::uuid AND id = $2::uuid`,
    [tenantId, id],
  )
  return r.rows[0] ? mapHook(r.rows[0]) : null
}

export interface CreateWebhookInput {
  name: string
  url: string
  eventTypes?: unknown
  secret?: string | null
  isActive?: boolean
}

export async function createWebhook(
  client: any, tenantId: string, actorStaffId: string | null, input: CreateWebhookInput,
): Promise<SupportWebhook> {
  const name = String(input.name || "").trim()
  if (!name) throw new WebhookError("a webhook name is required")
  const url = cleanUrl(input.url)
  const eventTypes = cleanEventTypes(input.eventTypes)
  const secret = input.secret ? String(input.secret) : null
  const r = await client.query(
    `INSERT INTO public.support_webhooks_outbound
       (tenant_id, name, url, event_types, secret, is_active, created_by_staff_id)
     VALUES ($1::uuid, $2, $3, $4::text[], $5, $6, $7::uuid)
     RETURNING ${HOOK_COLS}`,
    [tenantId, name, url, eventTypes, secret, input.isActive !== false, actorStaffId],
  )
  return mapHook(r.rows[0])
}

export interface UpdateWebhookInput {
  name?: string
  url?: string
  eventTypes?: unknown
  /** Provide a new secret, or clearSecret to remove it. Absent = keep. */
  secret?: string | null
  clearSecret?: boolean
  isActive?: boolean
}

export async function updateWebhook(
  client: any, tenantId: string, id: string, patch: UpdateWebhookInput,
): Promise<SupportWebhook | null> {
  const sets: string[] = []
  const vals: any[] = [tenantId, id]
  if (patch.name !== undefined) {
    const name = String(patch.name || "").trim()
    if (!name) throw new WebhookError("a webhook name is required")
    vals.push(name); sets.push(`name = $${vals.length}`)
  }
  if (patch.url !== undefined) {
    vals.push(cleanUrl(patch.url)); sets.push(`url = $${vals.length}`)
  }
  if (patch.eventTypes !== undefined) {
    vals.push(cleanEventTypes(patch.eventTypes)); sets.push(`event_types = $${vals.length}::text[]`)
  }
  if (patch.clearSecret === true) {
    sets.push(`secret = NULL`)
  } else if (patch.secret !== undefined && patch.secret !== null && patch.secret !== "") {
    vals.push(String(patch.secret)); sets.push(`secret = $${vals.length}`)
  }
  if (patch.isActive !== undefined) {
    vals.push(patch.isActive === true); sets.push(`is_active = $${vals.length}`)
  }
  if (!sets.length) return getWebhook(client, tenantId, id)
  const r = await client.query(
    `UPDATE public.support_webhooks_outbound
        SET ${sets.join(", ")}, row_version = row_version + 1, updated_at = now()
      WHERE tenant_id = $1::uuid AND id = $2::uuid
      RETURNING ${HOOK_COLS}`,
    vals,
  )
  return r.rows[0] ? mapHook(r.rows[0]) : null
}

export async function deleteWebhook(client: any, tenantId: string, id: string): Promise<boolean> {
  const r = await client.query(
    `DELETE FROM public.support_webhooks_outbound WHERE tenant_id = $1::uuid AND id = $2::uuid`,
    [tenantId, id],
  )
  return (r.rowCount ?? 0) > 0
}

export async function listDeliveries(
  client: any, tenantId: string, opts: { webhookId?: string; limit?: number } = {},
): Promise<WebhookDelivery[]> {
  const limit = Math.min(100, Math.max(1, Math.floor(opts.limit ?? 25)))
  const r = opts.webhookId
    ? await client.query(
        `SELECT ${DELIVERY_COLS} FROM public.support_webhook_deliveries
          WHERE tenant_id = $1::uuid AND webhook_id = $2::uuid
          ORDER BY created_at DESC LIMIT $3`,
        [tenantId, opts.webhookId, limit],
      )
    : await client.query(
        `SELECT ${DELIVERY_COLS} FROM public.support_webhook_deliveries
          WHERE tenant_id = $1::uuid
          ORDER BY created_at DESC LIMIT $2`,
        [tenantId, limit],
      )
  return r.rows.map(mapDelivery)
}

// ── Signing ──────────────────────────────────────────────────────────

/** Canonical payload form: JSON with object keys sorted recursively. */
export function canonicalPayload(payload: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort)
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {}
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        out[k] = sort((v as Record<string, unknown>)[k])
      }
      return out
    }
    return v
  }
  return JSON.stringify(sort(payload ?? {}))
}

/** The §4.5 signature: 'sha256=<hmac-sha256 hex>' over the canonical payload. */
export function signPayload(secret: string, payload: unknown): string {
  return `sha256=${createHmac("sha256", secret).update(canonicalPayload(payload)).digest("hex")}`
}

// ── Emission (from logTicketEvent) ───────────────────────────────────

/**
 * Fan one ticket event out to the tenant's subscribed registrations.
 * Writes delivery + job together per registration and links them.
 * Returns the number of deliveries queued. Callers wrap this
 * fail-soft — an emission failure must never fail the event itself.
 */
export async function emitTicketEventWebhooks(
  client: any,
  tenantId: string,
  args: { ticketId: string; eventId: string | null; eventType: string; detail?: Record<string, unknown> },
): Promise<number> {
  const hooks = await client.query(
    `SELECT id::text AS id FROM public.support_webhooks_outbound
      WHERE tenant_id = $1::uuid AND is_active AND $2 = ANY(event_types)`,
    [tenantId, args.eventType],
  )
  if (!hooks.rows.length) return 0
  const ref = await client.query(
    `SELECT ticket_ref FROM public.support_tickets WHERE tenant_id = $1::uuid AND id = $2::uuid`,
    [tenantId, args.ticketId],
  ).catch(() => ({ rows: [] as any[] }))
  const payload = {
    event: args.eventType,
    event_id: args.eventId,
    ticket_id: args.ticketId,
    ticket_ref: ref.rows[0]?.ticket_ref ?? null,
    detail: args.detail ?? {},
    emitted_at: new Date().toISOString(),
  }
  let queued = 0
  for (const h of hooks.rows as any[]) {
    const job = await client.query(
      `INSERT INTO public.support_jobs (tenant_id, type, status, payload)
       VALUES ($1::uuid, 'webhook_delivery', 'queued', $2::jsonb)
       RETURNING id::text AS id`,
      [tenantId, JSON.stringify({ webhook_id: h.id, event_type: args.eventType })],
    )
    const jobId = job.rows[0].id as string
    const delivery = await client.query(
      `INSERT INTO public.support_webhook_deliveries
         (tenant_id, webhook_id, ticket_id, event_type, event_id, payload, status, job_id)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6::jsonb, 'queued', $7::uuid)
       RETURNING id::text AS id`,
      [tenantId, h.id, args.ticketId, args.eventType, args.eventId, JSON.stringify(payload), jobId],
    )
    await client.query(
      `UPDATE public.support_jobs SET payload = $2::jsonb WHERE id = $1::uuid`,
      [jobId, JSON.stringify({ webhook_id: h.id, delivery_id: delivery.rows[0].id, event_type: args.eventType })],
    )
    queued++
  }
  return queued
}

// ── Delivery execution (the §13 consumer's executor) ─────────────────

/**
 * Execute one webhook_delivery job: sign the delivery's payload with
 * the registration's secret (when one is set) and settle the delivery
 * 'recorded'. Throws when the delivery row itself is gone (the job
 * retries / dead-letters honestly); a registration that no longer
 * exists or is inactive settles the delivery 'failed' and completes
 * the job — there is nothing to retry against.
 */
export async function executeWebhookDelivery(
  client: any, tenantId: string, job: { id: string; payload: any },
): Promise<{ deliveryId: string; outcome: string }> {
  const deliveryId = job.payload?.delivery_id as string | undefined
  if (!deliveryId) throw new Error("webhook_delivery job payload carries no delivery_id")
  const d = await client.query(
    `SELECT ${DELIVERY_COLS} FROM public.support_webhook_deliveries
      WHERE tenant_id = $1::uuid AND id = $2::uuid`,
    [tenantId, deliveryId],
  )
  if (!d.rows[0]) throw new Error(`webhook delivery ${deliveryId} not found`)
  const delivery = mapDelivery(d.rows[0])
  if (delivery.status === "recorded" || delivery.status === "delivered") {
    return { deliveryId, outcome: `already_${delivery.status}` }
  }
  const h = await client.query(
    `SELECT is_active, secret FROM public.support_webhooks_outbound
      WHERE tenant_id = $1::uuid AND id = $2::uuid`,
    [tenantId, delivery.webhookId],
  )
  if (!h.rows[0] || h.rows[0].is_active !== true) {
    const reason = !h.rows[0] ? "registration_deleted" : "registration_inactive"
    await client.query(
      `UPDATE public.support_webhook_deliveries
          SET status = 'failed', attempts = attempts + 1, last_error = $3, updated_at = now()
        WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [tenantId, deliveryId, reason],
    )
    return { deliveryId, outcome: reason }
  }
  const secret = h.rows[0].secret as string | null
  const signature = secret ? signPayload(secret, delivery.payload) : null
  await client.query(
    `UPDATE public.support_webhook_deliveries
        SET status = 'recorded', attempts = attempts + 1, signature = $3,
            last_error = NULL, updated_at = now()
      WHERE tenant_id = $1::uuid AND id = $2::uuid`,
    [tenantId, deliveryId, signature],
  )
  return { deliveryId, outcome: signature ? "recorded_signed" : "recorded_unsigned" }
}
