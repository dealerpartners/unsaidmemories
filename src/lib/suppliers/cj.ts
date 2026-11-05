// ---------------------------------------------------------------------------
// cj.ts — CJ Dropshipping API 2.0 client (INTERNAL ONLY — the supplier name
// never appears in public UI; admin surfaces label it as a supplier).
//
// Docs: developers.cjdropshipping.com — "API 2.0" (Authentication, 05.
// Shopping) and "Orders Synchronization Processing". Verified 2026-10-24.
//
// API shape (from the docs):
//   • Base: https://developers.cjdropshipping.com/api2.0/v1
//   • Auth: POST /authentication/getAccessToken { apiKey } → accessToken +
//     refreshToken (180-day life each; CJ caches the token server-side for
//     24h per account). Every business call carries the header
//     CJ-Access-Token: <accessToken>.
//   • Success = HTTP 200 AND code = 200 (result true). Anything else is an
//     error with a message meant for humans, never for control flow.
//   • Rate limit: 1 call/second — this client is only called from staff
//     actions on the Supplier Orders desk, one order at a time.
//   • Orders: POST /shopping/order/createOrderV3 with payType=2 pays from
//     the CJ account balance inside the create call (it runs add-to-cart,
//     confirmation and balance deduction itself — the payType=3 multi-call
//     chain is NOT needed). shopLogisticsType=2 + logisticName = CJ
//     Logistics: after payment CJ arranges shipment itself.
//   • Tracking: GET /shopping/order/list?orderIds=… returns trackNumber,
//     trackingProvider and the order status per order.
//
// Env-gated, exactly like Kole (Sunny's pattern: plug the key in Vercel and
// it starts flowing):
//   CJ_API_KEY          — the API Key from My CJ → API (NOT the website
//                         password; the API app must be installed there)
//   CJ_LOGISTIC_NAME    — the CJ logistics channel name for these orders
//                         (account-specific, e.g. the US CJPacket channel)
//   CJ_FROM_COUNTRY_CODE— warehouse country, defaults to "US"
//   CJ_API_BASE         — optional override, defaults to the documented host
//
// Until CJ_API_KEY and CJ_LOGISTIC_NAME exist, cjConfigured() is false and
// EVERY method throws CjNotConfiguredError before any network call. No
// surface ever reports a fake success for an unconfigured supplier.
// The access token is cached in app_settings (key cj.api_token) — the same
// store the Stripe checkout logo uses — and refreshed ahead of expiry.
// ---------------------------------------------------------------------------

import { withPg } from "@/lib/crm/enterprise"

export const CJ_SUPPLIER_ID = "cj-dropshipping"

const TOKEN_SETTINGS_KEY = "cj.api_token"

export type CjConfig = {
  apiKey: string | null
  apiBase: string
  logisticName: string | null
  fromCountryCode: string
}

export function cjConfig(): CjConfig {
  return {
    apiKey: process.env.CJ_API_KEY?.trim() || null,
    apiBase: (process.env.CJ_API_BASE?.trim() || "https://developers.cjdropshipping.com").replace(/\/+$/, ""),
    logisticName: process.env.CJ_LOGISTIC_NAME?.trim() || null,
    fromCountryCode: (process.env.CJ_FROM_COUNTRY_CODE?.trim() || "US").toUpperCase(),
  }
}

/** True when everything an order push needs exists in env. */
export function cjConfigured(): boolean {
  const c = cjConfig()
  return Boolean(c.apiKey && c.logisticName)
}

/** Names of the env vars still missing for order pushes. */
export function cjMissingConfig(): string[] {
  const c = cjConfig()
  const missing: string[] = []
  if (!c.apiKey) missing.push("CJ_API_KEY")
  if (!c.logisticName) missing.push("CJ_LOGISTIC_NAME")
  return missing
}

export class CjNotConfiguredError extends Error {
  readonly missing: string[]
  constructor(missing: string[]) {
    super(`CJ Dropshipping is not configured (missing ${missing.join(", ")})`)
    this.name = "CjNotConfiguredError"
    this.missing = missing
  }
}

export class CjApiError extends Error {
  readonly status: number
  readonly code: number | null
  readonly requestId: string | null
  constructor(status: number, message: string, code?: number | null, requestId?: string | null) {
    super(message)
    this.name = "CjApiError"
    this.status = status
    this.code = code ?? null
    this.requestId = requestId ?? null
  }
}

type TokenStore = {
  accessToken: string
  refreshToken: string | null
  accessTokenExpiryDate: string | null
  refreshTokenExpiryDate: string | null
}

async function readTokenStore(): Promise<TokenStore | null> {
  const out = await withPg(async (c) => {
    const { rows } = await c.query(`SELECT value FROM app_settings WHERE key = $1`, [TOKEN_SETTINGS_KEY])
    return rows[0]?.value ?? null
  }).catch(() => null)
  if (!out) return null
  try {
    const v = typeof out === "string" ? JSON.parse(out) : out
    if (v && typeof v.accessToken === "string" && v.accessToken) return v as TokenStore
  } catch {
    /* a corrupt cache entry is just a cache miss */
  }
  return null
}

async function writeTokenStore(t: TokenStore): Promise<void> {
  await withPg(async (c) => {
    await c.query(
      `INSERT INTO app_settings (key, value) VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [TOKEN_SETTINGS_KEY, JSON.stringify(t)],
    )
  }).catch(() => {
    /* the token is also cached by CJ server-side for 24h; a failed local
       write costs one extra getAccessToken call, never correctness */
  })
}

function expiryMs(iso: string | null | undefined): number {
  if (!iso) return 0
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : 0
}

async function authCall(path: string, body: Record<string, unknown>): Promise<TokenStore> {
  const cfg = cjConfig()
  const res = await fetch(`${cfg.apiBase}/api2.0/v1${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  const json: any = await res.json().catch(() => null)
  if (!res.ok || !json || json.code !== 200 || !json.data?.accessToken) {
    throw new CjApiError(
      res.status,
      `CJ authentication failed: ${json?.message || `HTTP ${res.status}`}`,
      typeof json?.code === "number" ? json.code : null,
      json?.requestId ?? null,
    )
  }
  const store: TokenStore = {
    accessToken: String(json.data.accessToken),
    refreshToken: json.data.refreshToken ? String(json.data.refreshToken) : null,
    accessTokenExpiryDate: json.data.accessTokenExpiryDate ?? null,
    refreshTokenExpiryDate: json.data.refreshTokenExpiryDate ?? null,
  }
  await writeTokenStore(store)
  return store
}

/** The current access token: cached copy while it has >7 days of life,
 *  else a refresh, else a fresh token from the API key. */
export async function getCjAccessToken(): Promise<string> {
  const cfg = cjConfig()
  if (!cfg.apiKey) throw new CjNotConfiguredError(cjMissingConfig())
  const now = Date.now()
  const store = await readTokenStore()
  if (store && expiryMs(store.accessTokenExpiryDate) - now > 7 * 24 * 3600 * 1000) {
    return store.accessToken
  }
  if (store?.refreshToken && expiryMs(store.refreshTokenExpiryDate) > now) {
    try {
      const refreshed = await authCall("/authentication/refreshAccessToken", { refreshToken: store.refreshToken })
      return refreshed.accessToken
    } catch {
      /* fall through to a fresh token from the API key */
    }
  }
  const fresh = await authCall("/authentication/getAccessToken", { apiKey: cfg.apiKey })
  return fresh.accessToken
}

async function cjCall<T>(path: string, init: { method: "GET" | "POST"; body?: unknown }): Promise<T> {
  const cfg = cjConfig()
  if (!cfg.apiKey) throw new CjNotConfiguredError(cjMissingConfig())
  const token = await getCjAccessToken()
  const res = await fetch(`${cfg.apiBase}/api2.0/v1${path}`, {
    method: init.method,
    headers: { "content-type": "application/json", "CJ-Access-Token": token },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  })
  const json: any = await res.json().catch(() => null)
  const ok = res.ok && json && (json.code === 200 || json.code == null) && json.result !== false
  if (!ok) {
    throw new CjApiError(
      res.status,
      `CJ API error: ${json?.message || `HTTP ${res.status}`}`,
      typeof json?.code === "number" ? json.code : null,
      json?.requestId ?? null,
    )
  }
  return json.data as T
}

// ---------------------------------------------------------------------------
// Inventory — the stock count per variant, per warehouse.
// GET /product/stock/queryByVid?vid=… returns one row per warehouse the
// variant is stocked in; totalInventoryNum is that warehouse's sellable
// count (storageNum mirrors it). The catalog count for a variant is the
// SUM across warehouses. Verified live 2026-10-28. This is the ONLY way
// counts leave CJ — CJ has no bulk inventory export in API 2.0, and the
// rate limit (1 call/second) makes a full-catalog pass a background job,
// never a request-path call.
// ---------------------------------------------------------------------------

export type CjVariantStockWarehouse = {
  vid: string
  areaId?: string
  areaEn?: string
  countryCode?: string
  storageNum?: number
  totalInventoryNum?: number
  cjInventoryNum?: number
  factoryInventoryNum?: number
  [k: string]: unknown
}

/** Live stock rows (one per warehouse) for one CJ variant id. */
export async function queryCjVariantStock(vid: string): Promise<CjVariantStockWarehouse[]> {
  const data = await cjCall<CjVariantStockWarehouse[]>(
    `/product/stock/queryByVid?vid=${encodeURIComponent(vid)}`,
    { method: "GET" },
  )
  return Array.isArray(data) ? data : []
}

/** The variant's total sellable count: totalInventoryNum summed across
 *  every warehouse row CJ returns. No rows = no stock anywhere = 0. */
export function cjVariantTotalStock(rows: readonly CjVariantStockWarehouse[]): number {
  return rows.reduce((sum, w) => sum + (Number(w?.totalInventoryNum) || 0), 0)
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export type CjCreateOrderInput = {
  /** OUR order number — CJ treats it as the partner-unique identifier. */
  orderNumber: string
  shippingCustomerName: string
  shippingAddress: string
  shippingAddress2?: string
  shippingCity: string
  shippingProvince: string
  shippingZip: string
  shippingCountryCode: string
  shippingCountry: string
  shippingPhone?: string
  email?: string
  remark?: string
  logisticName: string
  fromCountryCode: string
  products: { vid: string; quantity: number; storeLineItemId?: string }[]
}

export type CjCreateOrderResult = {
  orderId?: string
  orderNumber?: string
  shipmentOrderId?: string
  orderStatus?: string
  orderAmount?: number | string
  actualPayment?: number | string
  postageAmount?: number | string
  productAmount?: number | string
  [k: string]: unknown
}

/** Create + pay a CJ order in one call (payType=2: balance payment runs
 *  add-to-cart, confirmation and deduction inside the create). */
export async function createCjOrder(input: CjCreateOrderInput): Promise<CjCreateOrderResult> {
  return cjCall<CjCreateOrderResult>("/shopping/order/createOrderV3", {
    method: "POST",
    body: {
      orderNumber: input.orderNumber,
      shippingCustomerName: input.shippingCustomerName,
      shippingAddress: input.shippingAddress,
      ...(input.shippingAddress2 ? { shippingAddress2: input.shippingAddress2 } : {}),
      shippingCity: input.shippingCity,
      shippingProvince: input.shippingProvince,
      shippingZip: input.shippingZip,
      shippingCountryCode: input.shippingCountryCode,
      shippingCountry: input.shippingCountry,
      ...(input.shippingPhone ? { shippingPhone: input.shippingPhone } : {}),
      ...(input.email ? { email: input.email } : {}),
      ...(input.remark ? { remark: input.remark } : {}),
      logisticName: input.logisticName,
      fromCountryCode: input.fromCountryCode,
      shopLogisticsType: 2,
      payType: 2,
      orderFlow: 1,
      products: input.products.map((p) => ({
        vid: p.vid,
        quantity: p.quantity,
        ...(p.storeLineItemId ? { storeLineItemId: p.storeLineItemId } : {}),
      })),
    },
  })
}

export type CjOrderListEntry = {
  orderId?: string
  cjOrderId?: string
  orderNum?: string
  status?: string
  orderStatus?: string
  trackNumber?: string
  trackingProvider?: string
  logisticName?: string
  [k: string]: unknown
}

/** Order list lookup by CJ order id(s) — the tracking/status source.
 *  The list envelope has varied across CJ doc revisions, so the array is
 *  located defensively (data itself, data.content, or data.list). */
export async function listCjOrders(orderIds: string[]): Promise<CjOrderListEntry[]> {
  const q = new URLSearchParams({
    pageNum: "1",
    pageSize: String(Math.max(10, orderIds.length)),
    orderIds: orderIds.join(","),
  })
  const data = await cjCall<unknown>(`/shopping/order/list?${q.toString()}`, { method: "GET" })
  if (Array.isArray(data)) return data as CjOrderListEntry[]
  const d = (data ?? {}) as Record<string, unknown>
  for (const key of ["content", "list", "records", "rows"]) {
    if (Array.isArray(d[key])) return d[key] as CjOrderListEntry[]
  }
  return []
}
