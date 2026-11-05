// ============================================================================
// Live carrier tracking (§2.10 / §6.9) — the feed the order surfaces
// consume instead of the stored tracking_status alone.
//
// One adapter per carrier, each reading its official API credentials
// from the environment (the same env-only discipline as every other
// provider key in this codebase):
//   USPS  — Web Tools TrackV2 XML API        USPS_USER_ID
//   UPS   — OAuth2 + Track API                UPS_CLIENT_ID / UPS_CLIENT_SECRET
//   FedEx — OAuth2 + Track API                FEDEX_CLIENT_ID / FEDEX_CLIENT_SECRET
// An adapter whose credentials are absent reports { configured: false }
// and the caller falls back to the stored status with that fact stated
// on the surface — the machinery is live; a carrier only answers once
// its account key is provisioned.
// ============================================================================

export interface TrackingEvent {
  at: string | null
  description: string
  location: string | null
}

export interface LiveTracking {
  configured: boolean
  carrier: string
  status: string | null
  events: TrackingEvent[]
  checkedAt: string
}

export function normalizeCarrier(raw: string | null | undefined): "usps" | "ups" | "fedex" | "other" {
  const c = String(raw || "").toLowerCase()
  if (c.includes("usps") || c.includes("postal")) return "usps"
  if (c.includes("ups")) return "ups"
  if (c.includes("fedex") || c.includes("fdx")) return "fedex"
  return "other"
}

async function fetchWithTimeout(url: string, init: RequestInit, ms = 8000): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

// ---------------------------------------------------------------- USPS
async function trackUsps(tn: string): Promise<LiveTracking | null> {
  const userId = process.env.USPS_USER_ID
  const base: LiveTracking = { configured: Boolean(userId), carrier: "usps", status: null, events: [], checkedAt: new Date().toISOString() }
  if (!userId) return base
  const xml = `<TrackFieldRequest USERID="${userId}"><Revision>1</Revision><ClientIp>127.0.0.1</ClientIp><TrackID ID="${tn}"></TrackID></TrackFieldRequest>`
  const res = await fetchWithTimeout(
    `https://secure.shippingapis.com/ShippingAPI.dll?API=TrackV2&XML=${encodeURIComponent(xml)}`,
    { method: "GET" },
  )
  if (!res.ok) return base
  const text = await res.text()
  const summary = text.match(/<TrackSummary>([\s\S]*?)<\/TrackSummary>/)?.[1]?.trim() || null
  const details = [...text.matchAll(/<TrackDetail>([\s\S]*?)<\/TrackDetail>/g)].map((m) => ({
    at: null,
    description: m[1].replace(/<[^>]+>/g, "").trim(),
    location: null,
  }))
  return { ...base, status: summary, events: details }
}

// ----------------------------------------------------------------- UPS
async function trackUps(tn: string): Promise<LiveTracking | null> {
  const id = process.env.UPS_CLIENT_ID
  const secret = process.env.UPS_CLIENT_SECRET
  const base: LiveTracking = { configured: Boolean(id && secret), carrier: "ups", status: null, events: [], checkedAt: new Date().toISOString() }
  if (!id || !secret) return base
  const tokenRes = await fetchWithTimeout("https://wwwcie.ups.com/security/v1/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  })
  if (!tokenRes.ok) return base
  const token = (await tokenRes.json())?.access_token
  if (!token) return base
  const res = await fetchWithTimeout(`https://wwwcie.ups.com/api/track/v1/details/${encodeURIComponent(tn)}`, {
    headers: { Authorization: `Bearer ${token}`, transId: crypto.randomUUID(), transactionSrc: "unsaid" },
  })
  if (!res.ok) return base
  const data: any = await res.json().catch(() => null)
  const shipment = data?.trackResponse?.shipment?.[0]
  const pkg = shipment?.package?.[0]
  const activities: any[] = pkg?.activity || shipment?.activity || []
  const events: TrackingEvent[] = activities.map((a: any) => ({
    at: a?.date && a?.time ? `${a.date} ${a.time}` : null,
    description: a?.status?.description || a?.status?.type || "Update",
    location: [a?.location?.address?.city, a?.location?.address?.stateProvince].filter(Boolean).join(", ") || null,
  }))
  return { ...base, status: pkg?.currentStatus?.description || events[0]?.description || null, events }
}

// --------------------------------------------------------------- FedEx
async function trackFedex(tn: string): Promise<LiveTracking | null> {
  const id = process.env.FEDEX_CLIENT_ID
  const secret = process.env.FEDEX_CLIENT_SECRET
  const base: LiveTracking = { configured: Boolean(id && secret), carrier: "fedex", status: null, events: [], checkedAt: new Date().toISOString() }
  if (!id || !secret) return base
  const tokenRes = await fetchWithTimeout("https://apis.fedex.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }),
  })
  if (!tokenRes.ok) return base
  const token = (await tokenRes.json())?.access_token
  if (!token) return base
  const res = await fetchWithTimeout("https://apis.fedex.com/track/v1/trackingnumbers", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ includeDetailedScans: true, trackingInfo: [{ trackingNumberInfo: { trackingNumber: tn } }] }),
  })
  if (!res.ok) return base
  const data: any = await res.json().catch(() => null)
  const result = data?.output?.completeTrackResults?.[0]?.trackResults?.[0]
  const scans: any[] = result?.scanEvents || []
  const events: TrackingEvent[] = scans.map((s: any) => ({
    at: s?.date || null,
    description: s?.eventDescription || s?.derivedStatus || "Update",
    location: [s?.scanLocation?.city, s?.scanLocation?.stateOrProvinceCode].filter(Boolean).join(", ") || null,
  }))
  return { ...base, status: result?.latestStatusDetail?.description || events[0]?.description || null, events }
}

/**
 * Fetch the live status for a shipment. Returns null only when the
 * carrier is one we have no adapter for at all; adapters with missing
 * credentials return configured:false so the surface can say so.
 */
export async function fetchLiveTracking(carrierRaw: string | null, trackingNumber: string): Promise<LiveTracking | null> {
  const carrier = normalizeCarrier(carrierRaw)
  try {
    if (carrier === "usps") return await trackUsps(trackingNumber)
    if (carrier === "ups") return await trackUps(trackingNumber)
    if (carrier === "fedex") return await trackFedex(trackingNumber)
  } catch {
    return { configured: true, carrier, status: null, events: [], checkedAt: new Date().toISOString() }
  }
  return null
}
