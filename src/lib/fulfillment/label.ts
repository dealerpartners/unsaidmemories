// ---------------------------------------------------------------------------
// fulfillment/label.ts — package label purchase (Marketplace
// Closed-Loop Commerce contract, step 9): the SQL store, the Shippo
// provider, and the route-facing orchestration over the pure core in
// label-core.ts.
//
// State walk (contract §5): a paid order's package sits in
// ready_for_label (step 8); purchase claims it to label_requested,
// records the attempt + provider references BEFORE buying, and lands
// it in label_available with the label + tracking on the PACKAGE.
// PRE_TRANSIT is never written here — tracking_status stays NULL
// until a carrier event is observed (step 10). The commerce_orders
// scalar tracking mirror is written ONLY for single-package orders
// (legacy display compat, as step 8 specified).
//
// Print is a separate action (resolveLabelPrint in the core + the
// label-print routes): it serves the stored carrier file and never
// reaches this module's provider at all.
//
// Pre-cutover honesty: until migrations 20261195 (plan store) and
// 20261196 (attempts) are applied live, probeLabelStore reports the
// store absent and the endpoints answer 503 — nothing fakes a label.
// ---------------------------------------------------------------------------

import { randomUUID } from "crypto"
import type { SellerQueryFn } from "@/lib/sellers/attribution"
import { parseShipTo } from "@/lib/orders/lifecycle"
import { getShippingSettings } from "@/lib/shipping/settings"
import { probeFulfillmentStore } from "./plan"
import {
  purchasePackageLabel,
  type LabelActor,
  type LabelAttempt,
  type LabelPackage,
  type LabelProvider,
  type LabelStore,
  type ProviderRate,
  type ProviderShipment,
  type PurchasedLabel,
  type PurchaseOutcome,
  type ShipmentRequest,
} from "./label-core"

const SHIPPO_BASE = "https://api.goshippo.com"
/** Minimum API version Shippo accepts for on-behalf-of-user calls. */
const SHIPPO_API_VERSION = "2018-02-08"

// ---------------------------------------------------------------------------
// Store probe (pre-cutover degradation)
// ---------------------------------------------------------------------------

export async function probeLabelStore(q: SellerQueryFn): Promise<boolean> {
  if (!(await probeFulfillmentStore(q))) return false
  try {
    const rows = await q(
      `SELECT to_regclass('public.fulfillment_label_attempts') AS attempts`,
      [],
    )
    return !!rows?.[0]?.attempts
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Package loading
// ---------------------------------------------------------------------------

function parseJsonObj(raw: unknown): Record<string, unknown> | null {
  if (typeof raw === "string") {
    try {
      const v = JSON.parse(raw)
      return v && typeof v === "object" ? (v as Record<string, unknown>) : null
    } catch {
      return null
    }
  }
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null
}

/**
 * Load one package as the label core reads it, with the ship-to
 * resolved from its ORDER's stored address. Scoped by tenant; when
 * sellerId is given the package must be that seller's (a non-owner
 * read is a miss, never a leak). Returns null when absent.
 */
export async function loadPackageForLabel(
  q: SellerQueryFn,
  tenantId: string,
  packageId: string,
  opts: { sellerId?: string | null } = {},
): Promise<LabelPackage | null> {
  const rows = await q(
    `SELECT p.id::text AS id, p.order_id::text AS order_id,
            p.seller_id::text AS seller_id, p.state, p.fulfillment_method,
            p.origin_snapshot, p.parcel_snapshot, p.service_level, p.service_snapshot,
            p.tracking_number, p.carrier, p.label_id, p.label_url,
            o.shipping_address, o.customer_email, o.email AS order_email
       FROM public.fulfillment_packages p
       JOIN public.commerce_orders o ON o.id = p.order_id
      WHERE p.tenant_id = $1 AND p.id::text = $2
        AND ($3::text IS NULL OR p.seller_id::text = $3::text)
      LIMIT 1`,
    [tenantId, packageId, opts.sellerId ?? null],
  )
  const row = rows[0]
  if (!row) return null
  const fallbackName =
    (typeof row.customer_email === "string" && row.customer_email) ||
    (typeof row.order_email === "string" && row.order_email) ||
    "Customer"
  const to = parseShipTo(row.shipping_address, fallbackName)
  return {
    id: String(row.id),
    tenantId,
    orderId: String(row.order_id),
    sellerId: row.seller_id ? String(row.seller_id) : null,
    state: String(row.state),
    fulfillmentMethod: String(row.fulfillment_method || "ship"),
    origin: parseJsonObj(row.origin_snapshot),
    parcel: parseJsonObj(row.parcel_snapshot),
    serviceLevel: row.service_level ? String(row.service_level) : null,
    service: parseJsonObj(row.service_snapshot),
    trackingNumber: row.tracking_number ? String(row.tracking_number) : null,
    carrier: row.carrier ? String(row.carrier) : null,
    labelId: row.label_id ? String(row.label_id) : null,
    labelUrl: row.label_url ? String(row.label_url) : null,
    shipTo: to
      ? {
          name: to.name,
          street1: to.street1,
          city: to.city,
          state: to.state,
          zip: to.zip,
          country: "US",
        }
      : null,
  }
}

// ---------------------------------------------------------------------------
// SQL store (LabelStore)
// ---------------------------------------------------------------------------

function shapeAttempt(row: Record<string, unknown>): LabelAttempt {
  const status = String(row.status || "started")
  return {
    attemptKey: String(row.attempt_key),
    status: (["started", "shipment_recorded", "unknown", "confirmed", "failed"].includes(status)
      ? status
      : "started") as LabelAttempt["status"],
    shipmentId: row.shipment_id ? String(row.shipment_id) : null,
    rateId: row.rate_id ? String(row.rate_id) : null,
    transactionId: row.transaction_id ? String(row.transaction_id) : null,
    error: row.error ? String(row.error) : null,
  }
}

export class SqlLabelStore implements LabelStore {
  constructor(
    private q: SellerQueryFn,
    private tenantId: string,
    private orderId: string,
  ) {}

  async loadAttempt(packageId: string): Promise<LabelAttempt | null> {
    const rows = await this.q(
      `SELECT attempt_key, status, shipment_id, rate_id, transaction_id, error
         FROM public.fulfillment_label_attempts
        WHERE tenant_id = $1 AND package_id = $2::uuid
        LIMIT 1`,
      [this.tenantId, packageId],
    )
    return rows[0] ? shapeAttempt(rows[0]) : null
  }

  async claim(
    packageId: string,
    attemptKey: string,
  ): Promise<{ claimed: boolean; attempt: LabelAttempt }> {
    // The state transition IS the claim: exactly one concurrent
    // caller can move ready_for_label → label_requested.
    const moved = await this.q(
      `UPDATE public.fulfillment_packages
          SET state = 'label_requested', updated_at = now()
        WHERE tenant_id = $1 AND id = $2::uuid AND state = 'ready_for_label'
        RETURNING id::text AS id`,
      [this.tenantId, packageId],
    )
    if (moved.length > 0) {
      const rows = await this.q(
        `INSERT INTO public.fulfillment_label_attempts
           (id, tenant_id, package_id, order_id, attempt_key, provider, status)
         VALUES ($1, $2, $3::uuid, $4::uuid, $5, 'shippo', 'started')
         ON CONFLICT (tenant_id, package_id) DO UPDATE
           SET status = 'started', shipment_id = NULL, rate_id = NULL,
               transaction_id = NULL, error = NULL,
               attempt_key = EXCLUDED.attempt_key, updated_at = now()
         RETURNING attempt_key, status, shipment_id, rate_id, transaction_id, error`,
        [randomUUID(), this.tenantId, packageId, this.orderId, attemptKey],
      )
      return { claimed: true, attempt: shapeAttempt(rows[0]) }
    }
    const existing = await this.loadAttempt(packageId)
    return {
      claimed: false,
      attempt: existing ?? {
        attemptKey,
        status: "started",
        shipmentId: null,
        rateId: null,
        transactionId: null,
        error: null,
      },
    }
  }

  async recordShipment(
    packageId: string,
    attemptKey: string,
    shipmentId: string,
    rateId: string | null,
  ): Promise<void> {
    await this.q(
      `UPDATE public.fulfillment_label_attempts
          SET status = 'shipment_recorded', shipment_id = $3, rate_id = $4, updated_at = now()
        WHERE tenant_id = $1 AND package_id = $2::uuid`,
      [this.tenantId, packageId, shipmentId, rateId],
    )
  }

  async recordAttempt(
    packageId: string,
    _attemptKey: string,
    patch: Partial<LabelAttempt>,
  ): Promise<void> {
    await this.q(
      `UPDATE public.fulfillment_label_attempts
          SET status = COALESCE($3, status),
              shipment_id = COALESCE($4, shipment_id),
              rate_id = COALESCE($5, rate_id),
              transaction_id = COALESCE($6, transaction_id),
              error = $7,
              updated_at = now()
        WHERE tenant_id = $1 AND package_id = $2::uuid`,
      [
        this.tenantId,
        packageId,
        patch.status ?? null,
        patch.shipmentId ?? null,
        patch.rateId ?? null,
        patch.transactionId ?? null,
        patch.error ?? null,
      ],
    )
  }

  async saveLabel(packageId: string, attemptKey: string, label: PurchasedLabel): Promise<void> {
    await this.q(
      `UPDATE public.fulfillment_packages
          SET state = 'label_available',
              label_id = $3, label_url = $4, label_provider = 'shippo',
              label_cost_cents = $5, label_test_mode = $6,
              label_purchased_at = now(),
              tracking_number = $7, carrier = $8,
              updated_at = now()
        WHERE tenant_id = $1 AND id = $2::uuid`,
      [
        this.tenantId,
        packageId,
        label.transactionId,
        label.labelUrl,
        label.rateCents,
        label.testMode,
        label.trackingNumber,
        label.carrier,
      ],
    )
    await this.q(
      `UPDATE public.fulfillment_label_attempts
          SET status = 'confirmed', transaction_id = $3, error = NULL, updated_at = now()
        WHERE tenant_id = $1 AND package_id = $2::uuid`,
      [this.tenantId, packageId, label.transactionId],
    )
    // Legacy scalar mirror — single-package orders ONLY (step 8):
    // the old surfaces read one tracking number off the order; with
    // several packages there is no honest scalar, so none is written.
    const counts = await this.q(
      `SELECT COUNT(*)::int AS n FROM public.fulfillment_packages
        WHERE tenant_id = $1 AND order_id = $2::uuid`,
      [this.tenantId, this.orderId],
    )
    if (Number(counts[0]?.n) === 1) {
      await this.q(
        `UPDATE public.commerce_orders
            SET tracking_number = $3, carrier = $4, updated_at = now()
          WHERE tenant_id = $1 AND id = $2::uuid`,
        [this.tenantId, this.orderId, label.trackingNumber, label.carrier],
      )
    }
  }

  async revertToReady(packageId: string, _attemptKey: string, error: string): Promise<void> {
    await this.q(
      `UPDATE public.fulfillment_packages
          SET state = 'ready_for_label', updated_at = now()
        WHERE tenant_id = $1 AND id = $2::uuid AND state = 'label_requested'`,
      [this.tenantId, packageId],
    )
    await this.q(
      `UPDATE public.fulfillment_label_attempts
          SET status = 'failed', error = $3, updated_at = now()
        WHERE tenant_id = $1 AND package_id = $2::uuid`,
      [this.tenantId, packageId, error],
    )
  }
}

// ---------------------------------------------------------------------------
// The credential gate — ONE helper (house rule: one definition per gate)
// ---------------------------------------------------------------------------

export const SHIPPO_SELLER_NOT_CONNECTED = "shippo_seller_not_connected"

export class ShippoSellerNotConnectedError extends Error {
  constructor() {
    super(SHIPPO_SELLER_NOT_CONNECTED)
    this.name = "ShippoSellerNotConnectedError"
  }
}

export type PackageShippoAuth =
  | { kind: "house" }
  | { kind: "seller"; sellerId: string; accessToken: string }

/**
 * THE seller-connection lookup — isolated on purpose. When the
 * gray-label branch (feat/shippo-oauth-graylabel) merges, this one
 * helper's body is replaced by getConnectedShippoToken() from
 * lib/shipping/shippo-oauth (same table, same vault envelope) and
 * resolvePackageShippoAuth delegates to resolveShippoAuth there.
 * Until then it reads the connection the OAuth flow stores:
 * public.seller_shippo_connections (record 20261193), token only as
 * AES-256-GCM ciphertext. A missing table / row / token reads as NO
 * connection — never as a house-key fallback.
 */
export async function readSellerShippoConnectionToken(
  q: SellerQueryFn,
  tenantId: string,
  sellerId: string,
): Promise<string | null> {
  let rows: Record<string, unknown>[]
  try {
    rows = await q(
      `SELECT access_token_ciphertext
         FROM public.seller_shippo_connections
        WHERE tenant_id = $1 AND seller_id = $2::uuid AND status = 'connected'
        LIMIT 1`,
      [tenantId, sellerId],
    )
  } catch (e) {
    const code = (e as { code?: string })?.code
    const msg = e instanceof Error ? e.message : String(e)
    if (code === "42P01" || /relation .* does not exist/i.test(msg)) return null
    throw e
  }
  const cipher = rows[0]?.access_token_ciphertext
  if (!cipher || typeof cipher !== "string") return null
  const { decryptFromText } = await import("@/lib/social/crypto/vault")
  return decryptFromText(cipher)
}

/**
 * Resolve which Shippo credential a package's label acts on — the
 * package-scope mirror of the gray-label branch's resolveShippoAuth:
 * house package (or a first-party house seller) → the platform
 * Standard-path key; a non-house seller WITH a connection → their
 * OAuth token; WITHOUT one → ShippoSellerNotConnectedError. A
 * seller's label is never silently billed to the house account.
 */
export async function resolvePackageShippoAuth(
  q: SellerQueryFn,
  pkg: Pick<LabelPackage, "sellerId" | "tenantId">,
): Promise<PackageShippoAuth> {
  if (!pkg.sellerId) return { kind: "house" }
  const rows = await q(
    `SELECT seller_type FROM public.sellers WHERE id = $1::uuid LIMIT 1`,
    [pkg.sellerId],
  )
  if (!rows.length) throw new Error("shippo_seller_not_found")
  if (rows[0].seller_type === "first_party") return { kind: "house" }
  const token = await readSellerShippoConnectionToken(q, pkg.tenantId, pkg.sellerId)
  if (!token) throw new ShippoSellerNotConnectedError()
  return { kind: "seller", sellerId: pkg.sellerId, accessToken: token }
}

/**
 * The Shippo auth headers for a package's credential (step 10's
 * tracking reads run on the same account the label was bought
 * with). Null when no credential resolves — house key unset, or a
 * seller whose connection is gone: a tracking READ degrades to the
 * next source rather than failing, so every resolution error folds
 * to null here. (Purchases use resolvePackageShippoAuth directly
 * and surface the typed errors; reads never block on them.)
 */
export async function shippoHeadersForPackage(
  q: SellerQueryFn,
  pkg: Pick<LabelPackage, "sellerId" | "tenantId">,
): Promise<Record<string, string> | null> {
  try {
    const auth = await resolvePackageShippoAuth(q, pkg)
    const resolved =
      auth.kind === "house" ? await houseAuthHeaders() : sellerAuthHeaders(auth.accessToken)
    return resolved.headers
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Shippo provider (REST — one implementation for both credentials;
// the auth selects the header set, mirroring shippo-oauth's semantics:
// house = ShippoToken <platform key>; seller = Bearer <OAuth token>
// with the API version pinned, as on-behalf calls require)
// ---------------------------------------------------------------------------

export class ProviderRequestError extends Error {
  unknownOutcome: boolean
  constructor(message: string, unknownOutcome: boolean) {
    super(message)
    this.name = unknownOutcome ? "ProviderUnknownOutcomeError" : "ProviderRequestError"
    this.unknownOutcome = unknownOutcome
  }
}

interface ShippoAuthHeaders {
  headers: Record<string, string>
  testMode: boolean
}

async function houseAuthHeaders(): Promise<ShippoAuthHeaders> {
  const s = await getShippingSettings()
  const key = s.shippoApiKey || process.env.SHIPPO_API_KEY || process.env.SHIPPO_TEST_API || ""
  if (!key) throw new Error("shippo_not_configured")
  return {
    headers: { Authorization: `ShippoToken ${key}`, "Content-Type": "application/json" },
    testMode: s.shippoTestMode,
  }
}

function sellerAuthHeaders(accessToken: string): ShippoAuthHeaders {
  return {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Shippo-API-Version": SHIPPO_API_VERSION,
      "Content-Type": "application/json",
    },
    // On-behalf calls run on the seller's own account (live by
    // definition of their billing relationship).
    testMode: false,
  }
}

function shapeRates(raw: any[]): ProviderRate[] {
  return (raw || [])
    .map((r) => ({
      rateId: String(r.object_id || ""),
      provider: String(r.provider || ""),
      service: String(r.servicelevel?.name || ""),
      amountCents: Math.round(Number(r.amount) * 100),
    }))
    .filter((r) => r.rateId && Number.isFinite(r.amountCents))
}

function shapeLabel(tx: any, rates: ProviderRate[]): PurchasedLabel {
  const rate = rates.find((r) => r.rateId === String(tx.rate || ""))
  return {
    transactionId: tx.object_id ? String(tx.object_id) : null,
    labelUrl: String(tx.label_url || ""),
    trackingNumber: String(tx.tracking_number || ""),
    trackingUrl: tx.tracking_url_provider ? String(tx.tracking_url_provider) : null,
    carrier: rate?.provider || "",
    service: rate?.service || "",
    rateCents: rate?.amountCents ?? null,
    testMode: tx.test === true,
  }
}

export class ShippoLabelProvider implements LabelProvider {
  constructor(private auth: ShippoAuthHeaders) {}

  static async forAuth(auth: PackageShippoAuth): Promise<ShippoLabelProvider> {
    return new ShippoLabelProvider(
      auth.kind === "house" ? await houseAuthHeaders() : sellerAuthHeaders(auth.accessToken),
    )
  }

  private async call(path: string, init: RequestInit, timeoutMs: number, unknownOnFailure: boolean): Promise<any> {
    let res: Response
    try {
      res = await fetch(`${SHIPPO_BASE}${path}`, {
        ...init,
        headers: { ...this.auth.headers, ...(init.headers || {}) },
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (e) {
      // Network failure / timeout: for a POST that creates, the
      // request may have landed — unknown. For a GET, nothing was
      // created, but absence is unproven — also unknown.
      throw new ProviderRequestError(`shippo_request_failed:${e instanceof Error ? e.message : String(e)}`, true)
    }
    if (!res.ok) {
      // 5xx may follow a landed create; 4xx is a definite refusal.
      throw new ProviderRequestError(`shippo_${path.split("/")[1] || "call"}_${res.status}`, unknownOnFailure && res.status >= 500)
    }
    return res.json().catch(() => ({}))
  }

  async createShipment(input: ShipmentRequest): Promise<ProviderShipment> {
    const j = await this.call(
      "/shipments/",
      {
        method: "POST",
        body: JSON.stringify({
          address_from: { ...input.from, country: input.from.country || "US" },
          address_to: { ...input.to, country: input.to.country || "US" },
          parcels: [
            {
              length: String(input.parcel.lengthIn),
              width: String(input.parcel.widthIn),
              height: String(input.parcel.heightIn),
              distance_unit: "in",
              weight: (Math.round(Math.max(0.1, input.parcel.weightLb) * 100) / 100).toFixed(2),
              mass_unit: "lb",
            },
          ],
          async: false,
          metadata: input.attemptKey,
        }),
      },
      20000,
      true,
    )
    if (!j?.object_id) throw new ProviderRequestError("shippo_shipment_malformed", false)
    return { shipmentId: String(j.object_id), rates: shapeRates(j.rates || []) }
  }

  async getShipment(shipmentId: string): Promise<ProviderShipment | null> {
    try {
      const j = await this.call(`/shipments/${encodeURIComponent(shipmentId)}/`, { method: "GET" }, 15000, false)
      if (!j?.object_id) return null
      return { shipmentId: String(j.object_id), rates: shapeRates(j.rates || []) }
    } catch (e) {
      if (e instanceof ProviderRequestError && /_404$/.test(e.message)) return null
      throw e
    }
  }

  async findShipmentByAttemptKey(attemptKey: string): Promise<ProviderShipment | null> {
    for (let page = 1; page <= 3; page++) {
      const j = await this.call(`/shipments/?page=${page}&results=50`, { method: "GET" }, 15000, false)
      const results: any[] = j?.results || []
      const hit = results.find((s) => String(s?.metadata || "") === attemptKey)
      if (hit) return { shipmentId: String(hit.object_id), rates: shapeRates(hit.rates || []) }
      if (results.length < 50) break
    }
    return null
  }

  async findTransactionForRates(rateIds: string[]): Promise<PurchasedLabel | null> {
    if (rateIds.length === 0) return null
    const wanted = new Set(rateIds)
    for (let page = 1; page <= 3; page++) {
      const j = await this.call(`/transactions/?page=${page}&results=50`, { method: "GET" }, 15000, false)
      const results: any[] = j?.results || []
      const hit = results.find(
        (t) => wanted.has(String(t?.rate || "")) && String(t?.status || "") === "SUCCESS" && t?.label_url,
      )
      if (hit) {
        // Rates of the hit's own shipment aren't in scope here; the
        // label's carrier/service are best-effort from the tx itself
        // (the package's service snapshot remains the record of the
        // chosen service).
        return {
          transactionId: hit.object_id ? String(hit.object_id) : null,
          labelUrl: String(hit.label_url || ""),
          trackingNumber: String(hit.tracking_number || ""),
          trackingUrl: hit.tracking_url_provider ? String(hit.tracking_url_provider) : null,
          carrier: "",
          service: "",
          rateCents: null,
          testMode: hit.test === true,
        }
      }
      if (results.length < 50) break
    }
    return null
  }

  async buyLabel(rateId: string, attemptKey: string): Promise<PurchasedLabel> {
    const tx = await this.call(
      "/transactions/",
      {
        method: "POST",
        body: JSON.stringify({ rate: rateId, label_file_type: "PDF", async: false, metadata: attemptKey }),
      },
      30000,
      true,
    )
    if (tx?.status !== "SUCCESS") {
      throw new ProviderRequestError(
        `shippo_label_failed:${tx?.messages?.[0]?.text || tx?.status || "unknown"}`,
        false,
      )
    }
    // The transaction names its rate, not the carrier/service — read
    // the rate back so the package records who carries it and at what
    // price (best-effort: the label itself is already bought).
    let rates: ProviderRate[] = []
    try {
      const r = await this.call(`/rates/${encodeURIComponent(rateId)}/`, { method: "GET" }, 15000, false)
      if (r?.object_id) rates = shapeRates([r])
    } catch {
      rates = []
    }
    const label = shapeLabel(tx, rates)
    label.testMode = this.auth.testMode || tx.test === true
    return label
  }
}

// ---------------------------------------------------------------------------
// Route-facing orchestration
// ---------------------------------------------------------------------------

export type PurchasePackageLabelResult =
  | { available: false }
  | { available: true; found: false }
  | { available: true; found: true; outcome: PurchaseOutcome; pkg: LabelPackage }

/**
 * Buy (or reconcile/return) the label for one package. Loads the
 * package, resolves credentials through the ONE gate, and runs the
 * core. Provider construction happens only when a purchase may
 * actually reach the provider — a package that already carries its
 * label returns it without touching credentials at all.
 */
export async function purchaseLabelForPackage(
  q: SellerQueryFn,
  args: { tenantId: string; packageId: string; actor: LabelActor },
): Promise<PurchasePackageLabelResult> {
  if (!(await probeLabelStore(q))) return { available: false }
  const pkg = await loadPackageForLabel(q, args.tenantId, args.packageId, {
    sellerId: args.actor.kind === "seller" ? args.actor.sellerId : null,
  })
  if (!pkg) return { available: true, found: false }
  const alreadyLabeled =
    (pkg.labelUrl || pkg.labelId) && pkg.state !== "ready_for_label" && pkg.state !== "label_requested"
  const store = new SqlLabelStore(q, args.tenantId, pkg.orderId)
  if (alreadyLabeled) {
    const outcome = await purchasePackageLabel({ store, provider: NO_PROVIDER }, pkg, args.actor)
    return { available: true, found: true, outcome, pkg }
  }
  const auth = await resolvePackageShippoAuth(q, pkg)
  const provider = await ShippoLabelProvider.forAuth(auth)
  const outcome = await purchasePackageLabel({ store, provider }, pkg, args.actor)
  return { available: true, found: true, outcome, pkg }
}

/** A provider that must never be called — used for the
 *  already-labeled fast path, where the core returns the stored
 *  label before any provider method can run. */
const NO_PROVIDER: LabelProvider = {
  async createShipment(): Promise<ProviderShipment> {
    throw new Error("provider_not_needed")
  },
  async getShipment(): Promise<ProviderShipment | null> {
    throw new Error("provider_not_needed")
  },
  async findShipmentByAttemptKey(): Promise<ProviderShipment | null> {
    throw new Error("provider_not_needed")
  },
  async findTransactionForRates(): Promise<PurchasedLabel | null> {
    throw new Error("provider_not_needed")
  },
  async buyLabel(): Promise<PurchasedLabel> {
    throw new Error("provider_not_needed")
  },
}
