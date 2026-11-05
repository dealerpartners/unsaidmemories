// ---------------------------------------------------------------------------
// fulfillment/tracking.ts — carrier tracking ingest for fulfillment
// packages (Marketplace Closed-Loop Commerce contract, step 10): the
// SQL store, the Shippo webhook + refresh providers, and the
// orchestration over the pure core in tracking-core.ts.
//
// WHERE TRACKING COMES FROM — one writer, three doors, all feeding
// the SAME idempotent applyTrackingObservation:
//   (a) WEBHOOK — POST /api/webhooks/shippo receives Shippo
//       track_updated events. Shippo does not sign webhook payloads,
//       so the posture matches the provider: when
//       SHIPPO_WEBHOOK_SECRET is configured the endpoint requires
//       it, and in all cases the payload is treated as a HINT — the
//       handler re-reads the authoritative track state from Shippo
//       on the package's own credential before applying, falling
//       back to the payload only when the re-read cannot run. The
//       monotonic decider (tracking-core) makes either source safe.
//   (b) REFRESH — seller/admin-triggered re-read of the carrier
//       state for one package (missed-event recovery), plus
//   (c) SWEEP — a cron pass over packages still in motion whose
//       last check is stale, recovering events the webhook never
//       delivered (or delivered while we were down).
// Refresh reads Shippo's tracks endpoint on the credential the
// label was bought with (the step-9 gate: resolvePackageShippoAuth)
// and falls back to the platform's direct carrier adapters
// (lib/tracking) for packages Shippo can't answer for.
//
// STATE + NOTIFICATIONS: an applied transition updates the package
// (state + tracking_status + a bounded tracking history in
// metadata), mirrors tracking_status onto commerce_orders ONLY for
// single-package orders (the step-8/9 legacy-compat rule), and emits
// ONE deduped outbox effect per (package, transition kind) — the
// tracking.effects consumer sends the customer email. Replays and
// refreshes of the same state emit nothing.
//
// Pre-cutover honesty: until migration 20261195 is applied live the
// probe reports the store absent and every entry point no-ops /
// answers 503 — nothing fabricates a tracking state.
// ---------------------------------------------------------------------------

import type { SellerQueryFn } from "@/lib/sellers/attribution"
import { orderNumberFor } from "@/lib/sellers/attribution"
import { buildEnvelope, aggregateIdFor, type PgExecutor } from "@/lib/events/envelope"
import { fetchLiveTracking, normalizeCarrier } from "@/lib/tracking"
import { probeFulfillmentStore } from "./plan"
import {
  applyTrackingObservation,
  carrierTrackingUrl,
  mapShippoStatus,
  mapTrackingText,
  refineShippoStatus,
  trackingEffectDedupeKey,
  TRACKING_EFFECT_EVENT_TYPE,
  type ApplyObservationResult,
  type CarrierStatus,
  type TrackingNotifyKind,
  type TrackingObservation,
  type TrackingStore,
  type TrackingUpdate,
} from "./tracking-core"

export {
  applyTrackingObservation,
  type ApplyObservationResult,
  type TrackingStore,
  type TrackingUpdate,
} from "./tracking-core"

const SHIPPO_BASE = "https://api.goshippo.com"

// ---------------------------------------------------------------------------
// Store probe (pre-cutover degradation — the plan store IS the
// tracking store: tracking lives on fulfillment_packages)
// ---------------------------------------------------------------------------

export async function probeTrackingStore(q: SellerQueryFn): Promise<boolean> {
  return probeFulfillmentStore(q)
}

// ---------------------------------------------------------------------------
// Tracked package facts
// ---------------------------------------------------------------------------

export interface TrackedPackage {
  id: string
  tenantId: string
  orderId: string
  sellerId: string | null
  state: string
  carrier: string | null
  trackingNumber: string | null
  trackingStatus: string | null
  labelProvider: string | null
  metadata: Record<string, any>
}

function shapeTrackedPackage(row: Record<string, unknown>): TrackedPackage {
  let metadata: Record<string, any> = {}
  if (typeof row.metadata === "string") {
    try {
      metadata = JSON.parse(row.metadata) as Record<string, any>
    } catch {
      metadata = {}
    }
  } else if (row.metadata && typeof row.metadata === "object") {
    metadata = row.metadata as Record<string, any>
  }
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    orderId: String(row.order_id),
    sellerId: row.seller_id ? String(row.seller_id) : null,
    state: String(row.state),
    carrier: row.carrier ? String(row.carrier) : null,
    trackingNumber: row.tracking_number ? String(row.tracking_number) : null,
    trackingStatus: row.tracking_status ? String(row.tracking_status) : null,
    labelProvider: row.label_provider ? String(row.label_provider) : null,
    metadata,
  }
}

const PACKAGE_COLS = `id::text AS id, tenant_id::text AS tenant_id,
  order_id::text AS order_id, seller_id::text AS seller_id, state,
  carrier, tracking_number, tracking_status, label_provider, metadata`

// ---------------------------------------------------------------------------
// Store — the SQL implementation of the core's TrackingStore (unit
// tests drive the same orchestrator against an in-memory fake)
// ---------------------------------------------------------------------------

export class SqlTrackingStore implements TrackingStore {
  constructor(private q: SellerQueryFn) {}

  private exec(): PgExecutor {
    const q = this.q
    return { query: async (sql: string, params?: unknown[]) => ({ rows: await q(sql, params ?? []) }) }
  }

  async loadById(
    tenantId: string,
    packageId: string,
    sellerId?: string | null,
  ): Promise<TrackedPackage | null> {
    const rows = await this.q(
      `SELECT ${PACKAGE_COLS}
         FROM public.fulfillment_packages
        WHERE tenant_id = $1 AND id::text = $2
          AND ($3::text IS NULL OR seller_id::text = $3::text)
        LIMIT 1`,
      [tenantId, packageId, sellerId ?? null],
    )
    return rows[0] ? shapeTrackedPackage(rows[0]) : null
  }

  async loadByTrackingNumber(
    trackingNumber: string,
    carrier?: string | null,
  ): Promise<TrackedPackage | null> {
    // Webhooks arrive without a tenant context: the tracking number
    // is the identity. Prefer a non-terminal package when history
    // somehow holds more than one row for a number.
    const rows = await this.q(
      `SELECT ${PACKAGE_COLS}
         FROM public.fulfillment_packages
        WHERE tracking_number = $1
          AND ($2::text IS NULL OR LOWER(carrier) = LOWER($2::text))
        ORDER BY (state IN ('delivered', 'cancelled')) ASC, updated_at DESC
        LIMIT 1`,
      [trackingNumber, carrier ?? null],
    )
    return rows[0] ? shapeTrackedPackage(rows[0]) : null
  }

  async applyUpdate(pkg: TrackedPackage, update: TrackingUpdate): Promise<void> {
    const metadata = { ...(pkg.metadata || {}), tracking: update.tracking }
    await this.q(
      `UPDATE public.fulfillment_packages
          SET state = COALESCE($3, state),
              tracking_status = $4,
              metadata = $5::jsonb,
              updated_at = now()
        WHERE tenant_id = $1 AND id = $2::uuid`,
      [pkg.tenantId, pkg.id, update.state, update.trackingStatus, JSON.stringify(metadata)],
    )
    // Legacy scalar mirror — single-package orders ONLY (the
    // step-8/9 compat rule): with several packages there is no
    // honest single tracking_status for the order; the packages are
    // the record and the surfaces read them.
    const counts = await this.q(
      `SELECT COUNT(*)::int AS n FROM public.fulfillment_packages
        WHERE tenant_id = $1 AND order_id = $2::uuid`,
      [pkg.tenantId, pkg.orderId],
    )
    if (Number(counts[0]?.n) === 1) {
      await this.q(
        `UPDATE public.commerce_orders
            SET tracking_status = $3, updated_at = now()
          WHERE tenant_id = $1 AND id = $2::uuid`,
        [pkg.tenantId, pkg.orderId, update.trackingStatus],
      )
    }
  }

  async emitTransition(
    pkg: TrackedPackage,
    kind: TrackingNotifyKind,
    obs: TrackingObservation,
  ): Promise<{ emitted: boolean }> {
    const client = this.exec()
    const dedupeKey = trackingEffectDedupeKey(pkg.id, kind)
    const existing = await client.query(
      `SELECT id FROM public.commerce_outbox_events
        WHERE event_type = $1 AND payload->'data'->>'dedupe_key' = $2
        LIMIT 1`,
      [TRACKING_EFFECT_EVENT_TYPE, dedupeKey],
    )
    if (existing.rows.length > 0) return { emitted: false }

    // The email payload is a snapshot taken NOW (recipient + order
    // identity + which package of how many) — the consumer never
    // re-derives it from records that may move later.
    const orderRows = await this.q(
      `SELECT COALESCE(customer_email, email) AS email
         FROM public.commerce_orders
        WHERE tenant_id = $1 AND id = $2::uuid
        LIMIT 1`,
      [pkg.tenantId, pkg.orderId],
    )
    const email = orderRows[0]?.email ? String(orderRows[0].email) : null
    const siblings = await this.q(
      `SELECT id::text AS id FROM public.fulfillment_packages
        WHERE tenant_id = $1 AND order_id = $2::uuid
        ORDER BY created_at ASC`,
      [pkg.tenantId, pkg.orderId],
    )
    const packageIndex = siblings.findIndex((r) => String(r.id) === pkg.id) + 1

    const envelope = buildEnvelope({
      type: TRACKING_EFFECT_EVENT_TYPE,
      producedBy: "tracking-ingest",
      tenantId: pkg.tenantId,
      subjectType: "fulfillment_package",
      subjectId: pkg.id,
      actorRole: "system",
      data: {
        dedupe_key: dedupeKey,
        kind,
        email,
        order_id: pkg.orderId,
        order_number: orderNumberFor(pkg.orderId),
        package_id: pkg.id,
        package_index: packageIndex > 0 ? packageIndex : 1,
        package_total: siblings.length || 1,
        carrier: pkg.carrier || obs.carrier,
        tracking_number: pkg.trackingNumber || obs.trackingNumber,
        tracking_url: carrierTrackingUrl(pkg.carrier || obs.carrier, pkg.trackingNumber || obs.trackingNumber),
        status: obs.status,
        detail: obs.detail,
      },
    })
    try {
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
      )
      return { emitted: true }
    } catch (e: any) {
      // The 20261194 partial unique index on dedupe_key turns a lost
      // race into 23505 — that IS "already emitted", not a failure.
      if (e?.code === "23505") return { emitted: false }
      throw e
    }
  }
}

// ---------------------------------------------------------------------------
// Shippo payloads — webhook parse + tracks re-read
// ---------------------------------------------------------------------------

function shippoStatusParts(data: any): {
  status: CarrierStatus
  at: string | null
  detail: string | null
  location: string | null
} {
  const ts = data?.tracking_status || {}
  const subCode =
    typeof ts.substatus === "object" && ts.substatus ? ts.substatus.code : ts.substatus
  const status = refineShippoStatus(mapShippoStatus(ts.status), subCode)
  const loc = ts.location
  const location =
    loc && typeof loc === "object"
      ? [loc.city, loc.state, loc.zip].filter(Boolean).join(", ") || null
      : typeof loc === "string"
        ? loc
        : null
  return {
    status,
    at: typeof ts.status_date === "string" ? ts.status_date : null,
    detail: typeof ts.status_details === "string" ? ts.status_details : null,
    location,
  }
}

/** Parse a Shippo track_updated webhook body into an observation.
 *  Returns null for anything that is not a tracking update with a
 *  tracking number — the endpoint acks those without acting. */
export function observationFromShippoWebhook(payload: any): TrackingObservation | null {
  if (!payload || typeof payload !== "object") return null
  if (payload.event !== "track_updated") return null
  const data = payload.data || {}
  const trackingNumber = typeof data.tracking_number === "string" ? data.tracking_number : null
  if (!trackingNumber) return null
  const parts = shippoStatusParts(data)
  return {
    carrier: typeof data.carrier === "string" ? data.carrier : null,
    trackingNumber,
    rawStatus: typeof data.tracking_status?.status === "string" ? data.tracking_status.status : null,
    status: parts.status,
    at: parts.at,
    detail: parts.detail,
    location: parts.location,
    source: "shippo_webhook",
  }
}

function shippoCarrierSlug(carrier: string | null): string | null {
  const n = normalizeCarrier(carrier)
  if (n !== "other") return n
  const slug = String(carrier || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
  return slug || null
}

/** Re-read the authoritative track state from Shippo on a resolved
 *  credential (headers from the step-9 gate). Null when Shippo has
 *  no track for the number or the call fails — the caller decides
 *  what a null means (webhook: fall back to the payload; refresh:
 *  fall back to the direct carrier adapters). */
export async function fetchShippoTrackObservation(
  headers: Record<string, string>,
  carrier: string | null,
  trackingNumber: string,
  source: TrackingObservation["source"],
): Promise<TrackingObservation | null> {
  const slug = shippoCarrierSlug(carrier)
  if (!slug) return null
  try {
    const res = await fetch(
      `${SHIPPO_BASE}/tracks/${encodeURIComponent(slug)}/${encodeURIComponent(trackingNumber)}/`,
      { headers, signal: AbortSignal.timeout(15000) },
    )
    if (!res.ok) return null
    const data: any = await res.json().catch(() => null)
    if (!data || typeof data !== "object") return null
    const parts = shippoStatusParts(data)
    return {
      carrier: typeof data.carrier === "string" ? data.carrier : carrier,
      trackingNumber,
      rawStatus: typeof data.tracking_status?.status === "string" ? data.tracking_status.status : null,
      status: parts.status,
      at: parts.at,
      detail: parts.detail,
      location: parts.location,
      source,
    }
  } catch {
    return null
  }
}

/** Fallback observation from the platform's direct carrier adapters
 *  (lib/tracking — USPS / UPS / FedEx APIs), for packages whose
 *  label didn't come from Shippo or whose Shippo track is silent.
 *  Null when no adapter answers with a status. */
async function carrierAdapterObservation(
  carrier: string | null,
  trackingNumber: string,
  source: TrackingObservation["source"],
): Promise<TrackingObservation | null> {
  const live = await fetchLiveTracking(carrier, trackingNumber)
  if (!live || !live.configured || !live.status) return null
  return {
    carrier: live.carrier,
    trackingNumber,
    rawStatus: live.status,
    status: mapTrackingText(live.status),
    at: live.checkedAt,
    detail: live.status,
    location: live.events?.[0]?.location ?? null,
    source,
  }
}

// ---------------------------------------------------------------------------
// Webhook door
// ---------------------------------------------------------------------------

export interface WebhookIngestResult {
  handled: boolean
  reason?: "unrecognized" | "package_not_found" | "store_absent"
  confirmed?: boolean
  result?: ApplyObservationResult
}

/**
 * Ingest one Shippo tracking webhook: locate the package by
 * tracking number, CONFIRM the state against Shippo on the
 * package's credential when that resolves (the payload alone is a
 * hint — Shippo does not sign webhooks), and apply through the one
 * writer. Package-not-found acks as ignored: a number we never
 * labeled is not an error and must not invite retries.
 */
export async function ingestShippoTrackingWebhook(
  q: SellerQueryFn,
  payload: unknown,
): Promise<WebhookIngestResult> {
  if (!(await probeTrackingStore(q))) return { handled: false, reason: "store_absent" }
  const obs = observationFromShippoWebhook(payload)
  if (!obs) return { handled: false, reason: "unrecognized" }
  const store = new SqlTrackingStore(q)
  const pkg = await store.loadByTrackingNumber(obs.trackingNumber, obs.carrier)
  if (!pkg) return { handled: false, reason: "package_not_found" }

  let effective = obs
  let confirmed = false
  try {
    const { shippoHeadersForPackage } = await import("./label")
    const headers = await shippoHeadersForPackage(q, pkg)
    if (headers) {
      const fresh = await fetchShippoTrackObservation(headers, pkg.carrier || obs.carrier, obs.trackingNumber, "shippo_webhook")
      if (fresh) {
        effective = fresh
        confirmed = true
      }
    }
  } catch {
    // Confirmation is best-effort: an unresolvable credential (e.g.
    // the seller disconnected after purchase) leaves the payload
    // observation, which the monotonic writer still guards.
    confirmed = false
  }

  const result = await applyTrackingObservation(store, pkg, effective)
  return { handled: true, confirmed, result }
}

// ---------------------------------------------------------------------------
// Refresh door (manual + cron sweep share it)
// ---------------------------------------------------------------------------

export type RefreshPackageResult =
  | { available: false }
  | { available: true; found: false }
  | {
      available: true
      found: true
      ok: boolean
      reason?: "no_tracking" | "no_carrier_answer" | "terminal"
      source?: TrackingObservation["source"]
      result?: ApplyObservationResult
    }

/**
 * Re-read the carrier state for ONE package and apply it through
 * the same writer the webhook feeds — missed-event recovery.
 * Seller actors are scoped to their own packages in the load.
 */
export async function refreshPackageTracking(
  q: SellerQueryFn,
  args: {
    tenantId: string
    packageId: string
    actor: { kind: "admin" } | { kind: "seller"; sellerId: string } | { kind: "system" }
    source?: "shippo_refresh" | "carrier_refresh" | "cron_refresh"
  },
): Promise<RefreshPackageResult> {
  if (!(await probeTrackingStore(q))) return { available: false }
  const store = new SqlTrackingStore(q)
  const pkg = await store.loadById(
    args.tenantId,
    args.packageId,
    args.actor.kind === "seller" ? args.actor.sellerId : null,
  )
  if (!pkg) return { available: true, found: false }
  if (!pkg.trackingNumber) {
    return { available: true, found: true, ok: false, reason: "no_tracking" }
  }
  if (pkg.state === "delivered" || pkg.state === "cancelled") {
    return { available: true, found: true, ok: false, reason: "terminal" }
  }
  const cron = args.source === "cron_refresh"
  const shippoSource = cron ? "cron_refresh" : "shippo_refresh"
  const carrierSource = cron ? "cron_refresh" : "carrier_refresh"

  let obs: TrackingObservation | null = null
  if (pkg.labelProvider === "shippo" || pkg.carrier) {
    const { shippoHeadersForPackage } = await import("./label")
    const headers = await shippoHeadersForPackage(q, pkg)
    if (headers) {
      obs = await fetchShippoTrackObservation(headers, pkg.carrier, pkg.trackingNumber, shippoSource)
    }
  }
  if (!obs) {
    obs = await carrierAdapterObservation(pkg.carrier, pkg.trackingNumber, carrierSource)
  }
  if (!obs) {
    return { available: true, found: true, ok: false, reason: "no_carrier_answer" }
  }
  const result = await applyTrackingObservation(store, pkg, obs)
  return { available: true, found: true, ok: true, source: obs.source, result }
}

// ---------------------------------------------------------------------------
// Cron sweep — in-motion packages whose last check went stale
// ---------------------------------------------------------------------------

export interface TrackingSweepSummary {
  available: boolean
  checked: number
  transitioned: number
  refreshed: number
  ignored: number
  noAnswer: number
  errors: number
}

/**
 * One sweep pass: packages still in motion (label_available /
 * in_transit / out_for_delivery) with a tracking number whose last
 * check (or label purchase, or creation) is older than staleHours,
 * oldest first, batch-bounded. Each is refreshed through the same
 * door a seller/admin triggers — the sweep invents no second path.
 */
export async function sweepStaleTrackingPackages(
  q: SellerQueryFn,
  opts: { limit?: number; staleHours?: number } = {},
): Promise<TrackingSweepSummary> {
  const summary: TrackingSweepSummary = {
    available: false,
    checked: 0,
    transitioned: 0,
    refreshed: 0,
    ignored: 0,
    noAnswer: 0,
    errors: 0,
  }
  if (!(await probeTrackingStore(q))) return summary
  summary.available = true
  const limit = Math.max(1, Math.min(200, opts.limit ?? 50))
  const staleHours = Math.max(1, opts.staleHours ?? 6)
  const rows = await q(
    `SELECT id::text AS id, tenant_id::text AS tenant_id
       FROM public.fulfillment_packages
      WHERE tracking_number IS NOT NULL
        AND state IN ('label_available', 'in_transit', 'out_for_delivery')
        AND COALESCE(
              (metadata->'tracking'->>'last_checked_at')::timestamptz,
              label_purchased_at,
              created_at
            ) < now() - ($1 || ' hours')::interval
      ORDER BY COALESCE(
              (metadata->'tracking'->>'last_checked_at')::timestamptz,
              label_purchased_at,
              created_at
            ) ASC
      LIMIT $2`,
    [String(staleHours), limit],
  )
  for (const row of rows) {
    summary.checked += 1
    try {
      const r = await refreshPackageTracking(q, {
        tenantId: String(row.tenant_id),
        packageId: String(row.id),
        actor: { kind: "system" },
        source: "cron_refresh",
      })
      if (!r.available || !r.found || !r.ok) {
        summary.noAnswer += 1
        continue
      }
      const action = r.result?.decision.action
      if (action === "transition") summary.transitioned += 1
      else if (action === "refresh") summary.refreshed += 1
      else summary.ignored += 1
    } catch (e) {
      summary.errors += 1
      console.error("[tracking-sweep] package refresh failed:", row.id, e instanceof Error ? e.message : e)
    }
  }
  return summary
}
