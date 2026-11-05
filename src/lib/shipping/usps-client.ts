// ---------------------------------------------------------------------------
// shipping/usps-client.ts — the REAL USPS API client.
//
// Built from the 11 USPS OpenAPI specs the owner uploaded:
//   tracking-v3r2_15.yaml    → /tracking/v3r2/tracking/{trackingNumber}
//   domestic-prices_18.yaml  → /prices/v3/base-rates-search (POST)
//   labels_15_0.yaml         → /labels/v3/labels (POST, needs payment token)
//   addresses-v3r2_0.yaml    → /addresses/v3/address (GET, address validation)
//   carrier-pickup_7.yaml    → /pickup/v3/carrier-pickup (POST, schedule pickup)
//   adjustments_3_0.yaml     → /adjustments/v3/adjustments/{CRID}/{trackingNumber}/{eventType}
//   indemnity-claims_1.yaml  → /indemnity-claims/v3/claims (POST, file insurance claim)
//   locations_20.yaml        → /locations/v3/locations (GET, find USPS facilities)
//   service-standards_5_0.yaml → /service-standards/v3/estimates (GET, delivery estimates)
//   campaigns_3.yaml         → Informed Delivery campaigns (not used in fulfillment)
//   userinfo_1.yaml          → OAuth2 userinfo endpoint
//
// All USPS APIs use OAuth2 (client_credentials grant) → Bearer token in
// Authorization header. Token endpoint: https://apis.usps.com/oauth2/v3/token
// Production base: https://apis.usps.com
// Testing base:    https://apis-tem.usps.com
//
// Env vars (all present in .env):
//   USPS_CONSUMER_KEY, USPS_CONSUMER_SECRET — OAuth2 client credentials
//   USPS_CUSTOMER_REGISTRATION_ID (CRID)    — required for labels + adjustments
//   USPS_MASTER_MAILER_ID (MID)             — required for labels
//   USPS_LABEL_MAILER_ID                    — required for labels
//   USPS_EPS_PAYMENT_ACCOUNT_NUMBER         — required for label postage payment
//
// NOTE: credentials can now be managed in Admin → Settings → Shipping (stored in
// the app_settings table); env vars remain as fallback. Both are read via
// lib/shipping/settings.ts.
// ---------------------------------------------------------------------------

import { getShippingSettings } from "./settings"
import { resolveShipFromForLabel } from "./ship-from"
const PROD_BASE = "https://apis.usps.com"
// Always use production — the USPS_CONSUMER_KEY/SECRET in .env are real
// production credentials (the tem/testing endpoint uses a separate token
// signing key and rejects production tokens with "invalid_token_signature").
const BASE = PROD_BASE

// ---- OAuth2 token cache (module-level, survives across requests) ----
let _token: { value: string; expiresAt: number; scope?: string } | null = null

export async function getUspsAccessToken(scope = "tracking"): Promise<string | null> {
  // Admin-configured credentials (app_settings) first, env fallback.
  const s = await getShippingSettings()
  const key = s.uspsConsumerKey
  const secret = s.uspsConsumerSecret
  if (!key || !secret) return null

  // Cache key includes the scope so different scopes get different tokens.
  const cacheKey = scope
  if (_token?.scope === cacheKey && _token.expiresAt > Date.now() + 60_000) {
    return _token.value
  }

  try {
    const res = await fetch("https://apis.usps.com/oauth2/v3/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: key,
        client_secret: secret,
        scope,
      }),
    })
    if (!res.ok) {
      console.error("[usps-client] token fetch failed:", res.status, await res.text().catch(() => ""))
      return null
    }
    const data = await res.json()
    _token = {
      value: data.access_token,
      expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
      scope: cacheKey,
    }
    return _token.value
  } catch (e: any) {
    console.error("[usps-client] token fetch error:", e?.message || e)
    return null
  }
}

async function uspsGet(path: string, expected404 = false, scope = "tracking"): Promise<any | null> {
  const token = await getUspsAccessToken(scope)
  if (!token) return null
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    })
    return await parseUspsResponse(res, expected404)
  } catch (e: any) {
    console.error(`[usps-client] GET ${path} error:`, e?.message || e)
    return null
  }
}

async function uspsPost(path: string, body: any, extraHeaders: Record<string, string> = {}, expected404 = false, scope = "tracking"): Promise<any | null> {
  const token = await getUspsAccessToken(scope)
  if (!token) return null
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    })
    return await parseUspsResponse(res, expected404)
  } catch (e: any) {
    console.error(`[usps-client] POST ${path} error:`, e?.message || e)
    return null
  }
}

async function parseUspsResponse(res: Response, expected404 = false): Promise<any | null> {
  if (res.status === 204) return {}
  const text = await res.text().catch(() => "")
  // 404 from the tracking API is a VALID response — it means USPS hasn't
  // received the package yet (PRE_TRANSIT). Don't treat it as an error.
  if (res.status === 404 && expected404) {
    return { __notFound: true, raw: text }
  }
  if (!res.ok) {
    console.error(`[usps-client] ${res.status} response:`, text.slice(0, 300))
    return null
  }
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    return { raw: text }
  }
}

// ===========================================================================
// TRACKING — GET /tracking/v3r2/tracking/{trackingNumber}
// Spec: tracking-v3r2_15.yaml → operationId: get-package-tracking
// ===========================================================================

export type UspsTrackEvent = {
  eventCode?: string
  eventName?: string
  eventDescription?: string
  eventTimestamp?: string
  eventCity?: string
  eventState?: string
  eventZIP?: string
  eventCountry?: string
  firm?: string
  name?: string
}

export type UspsTrackResult = {
  status: "DELIVERED" | "IN_TRANSIT" | "PRE_TRANSIT" | "UNKNOWN"
  summary: string
  isDelivered: boolean
  simulated: boolean
  /** True when the carrier API could not be reached at all (or no USPS
   *  credentials are configured) — status is UNKNOWN and NOT a carrier
   *  answer. Callers must not persist it as an order state. */
  unavailable?: boolean
  events?: UspsTrackEvent[]
  trackingNumber?: string
  mailClass?: string
  expectedDeliveryDate?: string
  proofOfDeliveryUrl?: string
}

export async function trackPackage(trackingNumber: string): Promise<UspsTrackResult> {
  const clean = String(trackingNumber || "").trim()
  if (!clean) {
    return { status: "UNKNOWN", summary: "No tracking number provided.", isDelivered: false, simulated: false }
  }

  // The USPS Tracking API (tracking-v3r2_15.yaml) is a POST /tracking with an
  // array body (TrackingRequest = [TrackingRequestBody]). A 404 response means
  // USPS hasn't received the package yet (PRE_TRANSIT) — that's a valid state.
  const data = await uspsPost("/tracking/v3r2/tracking", [{ trackingNumber: clean }], {}, true)
  if (!data) {
    // Carrier API unreachable or no USPS credentials configured. Honest
    // UNKNOWN — a fabricated status must never reach an order record.
    return {
      status: "UNKNOWN",
      summary: "USPS tracking unavailable — the carrier API could not be reached, so no live status is available.",
      isDelivered: false,
      simulated: false,
      unavailable: true,
      trackingNumber: clean,
    }
  }

  // 404 = USPS hasn't received the package yet → PRE_TRANSIT.
  if (data.__notFound) {
    return {
      status: "PRE_TRANSIT",
      summary: "USPS has not received this package yet. (Tracking number not found in USPS system.)",
      isDelivered: false,
      simulated: false,
      trackingNumber: clean,
    }
  }

  // The response (TrackingDetails) may be a single object or an array (one
  // per requested tracking number). Walk the common shapes.
  const info = Array.isArray(data) ? data[0] : (data.trackingInfo || data.info || data)
  const events: UspsTrackEvent[] = info.eventData || info.events || data.eventData || []
  const latest = events[0]
  const statusText = String(latest?.eventCode || latest?.eventName || info.status || info.trackingSummary || "").toLowerCase()
  const summary = String(
    latest?.eventDescription || latest?.eventName || info.trackingSummary || info.summary || data.message || "USPS tracking retrieved.",
  )
  const isDelivered = statusText.includes("delivered") || statusText.includes("delivery")
  const isPreTransit = statusText.includes("pre") || statusText.includes("label") || statusText.includes("accepted") || statusText.includes("acceptance")
  return {
    status: isDelivered ? "DELIVERED" : isPreTransit ? "PRE_TRANSIT" : "IN_TRANSIT",
    summary,
    isDelivered,
    simulated: false,
    events,
    trackingNumber: clean,
    mailClass: info.mailClass || data.mailClass,
    expectedDeliveryDate: info.expectedDeliveryDate || data.expectedDeliveryDate,
  }
}

// ===========================================================================
// PRICES — POST /prices/v3/base-rates-search
// Spec: domestic-prices_18.yaml → operationId: post-base-rates-search
// ===========================================================================

export type UspsRateQuote = {
  mailClass: string
  productName: string
  basePrice: number
  totalPrice: number
  deliveryDays?: number
  dimensionalWeight?: number
}

export type UspsRateResult = {
  rates: UspsRateQuote[]
  simulated: boolean
  /** True when the carrier API could not be reached — rates is empty and
   *  no quote exists. Never present invented prices as quotes. */
  unavailable?: boolean
}

export async function getShippingRates(params: {
  originZIP: string
  destinationZIP: string
  weight: number // in ounces
  length?: number
  width?: number
  height?: number
  mailClasses?: string[] // e.g. ["USPS_GROUND_ADVANTAGE", "PRIORITY_MAIL"]
}): Promise<UspsRateResult> {
  const body = {
    originZIPCode: params.originZIP,
    destinationZIPCode: params.destinationZIP,
    weight: params.weight,
    length: params.length ?? 6,
    width: params.width ?? 4,
    height: params.height ?? 2,
    mailClasses: params.mailClasses ?? ["USPS_GROUND_ADVANTAGE", "PRIORITY_MAIL", "PRIORITY_MAIL_EXPRESS"],
  }
  // Prices API needs the "prices" scope.
  const data = await uspsPost("/prices/v3/base-rates-search", body, {}, false, "prices")
  if (!data) {
    return { rates: [], simulated: false, unavailable: true }
  }
  const rates: UspsRateQuote[] = (data.rateOptions || data.rates || data.baseRates || []).map((r: any) => ({
    mailClass: r.mailClass || r.product,
    productName: r.productName || r.product || r.mailClass,
    basePrice: Number(r.basePrice ?? r.price ?? 0),
    totalPrice: Number(r.totalPrice ?? r.basePrice ?? r.price ?? 0),
    deliveryDays: r.deliveryDays ? Number(r.deliveryDays) : undefined,
    dimensionalWeight: r.dimensionalWeight ? Number(r.dimensionalWeight) : undefined,
  }))
  return { rates, simulated: false }
}

// ===========================================================================
// LABELS — POST /labels/v3/labels
// Spec: labels_15_0.yaml → operationId: post-label
// Needs X-Payment-Authorization-Token header (from USPS Payments API).
// ===========================================================================

export type UspsLabelResult = {
  trackingNumber: string
  labelUrl: string
  labelBase64?: string
  postage: number
  mailClass: string
  simulated: boolean
}

// ---------------------------------------------------------------------------
// Ship-from (return) address — resolved per order from ship_from_addresses
// (lib/shipping/ship-from.ts): a seller's order ships from the seller's own
// return address, a house order from the tenant's. There is NO platform
// fallback: an unset or incomplete address throws ReturnAddressError with
// instructions, so a real label can never print a placeholder return address.
// ---------------------------------------------------------------------------

export async function createShippingLabel(params: {
  toName: string
  toAddress1: string
  toCity: string
  toState: string
  toZIP: string
  toPhone?: string
  weight: number // ounces
  mailClass?: string // default USPS_GROUND_ADVANTAGE
  serviceStandard?: string
  // Return-address scope. Pass orderId so a seller order resolves to the
  // seller's address; tenantId/sellerId override for direct calls.
  orderId?: string
  tenantId?: string
  sellerId?: string
}): Promise<UspsLabelResult | null> {
  // Resolve + validate the return address FIRST — a label must never be
  // attempted for an order nobody can ship.
  const from = await resolveShipFromForLabel({
    orderId: params.orderId,
    tenantId: params.tenantId,
    sellerId: params.sellerId,
  })

  // The labels API needs a payment authorization token. Without a configured
  // EPS payment account there is NO label — an honest failure, never a
  // simulated label with an invented tracking number.
  const paymentToken = await getPaymentAuthorizationToken()
  if (!paymentToken) {
    throw new Error(
      "USPS label purchase unavailable — the USPS EPS payment account is not configured (Admin → Settings → Shipping). No label was created.",
    )
  }

  const body = {
    mailClass: params.mailClass || "USPS_GROUND_ADVANTAGE",
    paymentAuthorizationToken: paymentToken,
    fromName: from.name,
    fromFirm: from.name,
    fromAddress1: from.street,
    fromCity: from.city,
    fromState: from.state,
    fromZIP5: from.zip,
    fromPhone: from.phone,
    toName: params.toName,
    toAddress1: params.toAddress1,
    toCity: params.toCity,
    toState: params.toState,
    toZIP5: params.toZIP,
    toPhone: params.toPhone || "",
    weight: params.weight,
    length: 6,
    width: 4,
    height: 2,
    mailerId: (await getShippingSettings()).uspsMailerId || undefined,
    customerRegistrationId: (await getShippingSettings()).uspsCrid || undefined,
  }

  const idempotencyKey = crypto.randomUUID()
  const data = await uspsPost("/labels/v3/labels", body, {
    "X-Payment-Authorization-Token": paymentToken,
    "X-Idempotency-Key": idempotencyKey,
  })

  if (!data) {
    throw new Error("USPS label purchase failed — the USPS API could not be reached. No label was created.")
  }

  return {
    trackingNumber: data.trackingNumber || data.labelTrackingNumber,
    labelUrl: data.labelUrl || data.labelImage?.url || "",
    labelBase64: data.labelImage?.base64,
    postage: Number(data.postage ?? data.totalPrice ?? 0),
    mailClass: data.mailClass || params.mailClass || "USPS_GROUND_ADVANTAGE",
    simulated: false,
  }
}

// ===========================================================================
// ADDRESSES — GET /addresses/v3/address
// Spec: addresses-v3r2_0.yaml → operationId: get-address
// Validates + standardizes a USPS address (CASS-certified).
// ===========================================================================

export type UspsAddressResult = {
  valid: boolean
  standardized?: {
    address1: string
    address2?: string
    city: string
    state: string
    ZIP5: string
    ZIP4?: string
  }
  error?: string
}

export async function validateAddress(params: {
  address1: string
  address2?: string
  city: string
  state: string
  ZIPCode?: string
}): Promise<UspsAddressResult> {
  // The Addresses API (addresses-v3r2_0.yaml) uses camelCase query params:
  //   streetAddress (required), aptSuite, city, state, ZIPCode, ZIPPlus4
  const qs = new URLSearchParams({
    streetAddress: params.address1,
    city: params.city,
    state: params.state,
  })
  if (params.address2) qs.set("aptSuite", params.address2)
  if (params.ZIPCode) qs.set("ZIPCode", params.ZIPCode)

  // Addresses API needs the "addresses" scope.
  const data = await uspsGet(`/addresses/v3/address?${qs.toString()}`, false, "addresses")
  if (!data) {
    return { valid: false, error: "USPS Address API unreachable" }
  }
  const addr = data.address || data
  return {
    valid: !!addr.addressValidated || !!addr.ZIP5,
    standardized: {
      address1: addr.address1 || addr.streetAddress || params.address1,
      address2: addr.address2,
      city: addr.city || params.city,
      state: addr.state || params.state,
      ZIP5: addr.ZIP5 || addr.ZIPCode || params.ZIPCode || "",
      ZIP4: addr.ZIP4,
    },
  }
}

// ===========================================================================
// PAYMENTS — get a payment authorization token for the labels API.
// The USPS Payments API lives at /payments/v3/payment-authorization. The
// EPS account number + CRID identify the payment account.
// ===========================================================================

let _paymentToken: { value: string; expiresAt: number } | null = null

async function getPaymentAuthorizationToken(): Promise<string | null> {
  // Admin-configured EPS account/CRID (app_settings) first, env fallback.
  const s = await getShippingSettings()
  const acct = s.uspsEpsAccount
  const crid = s.uspsCrid
  if (!acct || !crid) return null

  if (_paymentToken && _paymentToken.expiresAt > Date.now() + 60_000) {
    return _paymentToken.value
  }

  const body = {
    customerRegistrationId: crid,
    paymentAccountNumber: acct,
    paymentAccountType: "EPS",
  }
  const data = await uspsPost("/payments/v3/payment-authorization", body)
  if (!data?.token) return null
  _paymentToken = {
    value: data.token,
    expiresAt: Date.now() + (Number(data.expiresInSeconds) || 3600) * 1000,
  }
  return _paymentToken.value
}

// ===========================================================================
// NO simulation fallbacks. When the USPS API is unreachable or credentials
// are missing, tracking returns an explicit `unavailable` UNKNOWN, rates
// return an empty list flagged `unavailable`, and label purchase throws an
// honest error. A fabricated tracking status, price, or tracking number must
// never be persisted to or displayed on a real order.
// ===========================================================================
