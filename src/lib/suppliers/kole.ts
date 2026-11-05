// ---------------------------------------------------------------------------
// kole.ts — Kole Imports Dropship API client (INTERNAL ONLY — the supplier
// name never appears in public UI; admin surfaces label it as a supplier).
//
// Docs: Kole Support KB "Dropship API Documentation" (Overview / Accounts /
// Products / Orders / Shipments / Transactions) and the official PHP client
// (github.com/kole-imports/dropship-api-client), whose service surface this
// mirrors: products list/detail, orders list/detail/create, shipments
// list/detail, transactions list/detail.
//
// API shape (from the KB):
//   • Base: https://api.koleimports.com — HTTPS required.
//   • Auth: HTTP Basic, username = Account ID, password = API key.
//     (API credentials are NOT the website login.)
//   • Per-resource vendor media types, e.g.
//     application/vnd.koleimports.ds.product+json — JSON preferred here;
//     XML responses are parsed with the shared mini-parser as a fallback.
//   • Rate limit: 1000 requests/hour.
//
// Env-gated (Sunny, 2026-10-13: "plug the key in Vercel and it'll start
// flowing"):
//   KOLE_ACCOUNT_ID — dropship account id (Account tab in their portal)
//   KOLE_API_KEY    — a key from the same page's API Keys section
//   KOLE_FEED_URL   — the product-feed download URL (carries its own key)
//   KOLE_API_BASE   — optional override, defaults to the documented host
//
// Until the credentials exist, koleConfigured() is false and EVERY method
// throws KoleNotConfiguredError before any network call is attempted. No
// surface ever reports a fake success for an unconfigured supplier.
// ---------------------------------------------------------------------------

import { parseXml, xmlToValue } from "./kole-feed"

export const KOLE_SUPPLIER_ID = "koleimports"

export type KoleConfig = {
  accountId: string | null
  apiKey: string | null
  feedUrl: string | null
  apiBase: string
}

export function koleConfig(): KoleConfig {
  return {
    accountId: process.env.KOLE_ACCOUNT_ID?.trim() || null,
    apiKey: process.env.KOLE_API_KEY?.trim() || null,
    feedUrl: process.env.KOLE_FEED_URL?.trim() || null,
    apiBase: (process.env.KOLE_API_BASE?.trim() || "https://api.koleimports.com").replace(/\/+$/, ""),
  }
}

/** True when the API credentials exist (feed sync needs only KOLE_FEED_URL). */
export function koleConfigured(): boolean {
  const c = koleConfig()
  return Boolean(c.accountId && c.apiKey)
}

export function koleFeedConfigured(): boolean {
  return Boolean(koleConfig().feedUrl)
}

/** Names of the env vars still missing for the API (not the feed). */
export function koleMissingConfig(): string[] {
  const c = koleConfig()
  const missing: string[] = []
  if (!c.accountId) missing.push("KOLE_ACCOUNT_ID")
  if (!c.apiKey) missing.push("KOLE_API_KEY")
  return missing
}

export class KoleNotConfiguredError extends Error {
  readonly missing: string[]
  constructor(missing: string[]) {
    super(`Kole Imports is not configured (missing ${missing.join(", ")})`)
    this.name = "KoleNotConfiguredError"
    this.missing = missing
  }
}

export class KoleApiError extends Error {
  readonly status: number
  readonly body: string
  constructor(status: number, body: string) {
    super(`Kole API request failed (${status}): ${body.slice(0, 300)}`)
    this.name = "KoleApiError"
    this.status = status
    this.body = body
  }
}

function requireConfigured(): KoleConfig {
  const missing = koleMissingConfig()
  if (missing.length) throw new KoleNotConfiguredError(missing)
  return koleConfig()
}

// Vendor media types per resource, per the KB pattern
// application/vnd.koleimports.ds.<resource>+(xml|json).
type KoleResource = "product" | "order" | "shipment" | "transaction" | "account" | "links"

async function koleRequest<T>(
  resource: KoleResource,
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const cfg = requireConfigured() // throws BEFORE any network call
  const url = `${cfg.apiBase}${path}`
  const media = `application/vnd.koleimports.ds.${resource}+json`
  const auth = Buffer.from(`${cfg.accountId}:${cfg.apiKey}`).toString("base64")
  const res = await fetch(url, {
    method: opts.method || "GET",
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: media,
      ...(opts.body !== undefined ? { "Content-Type": media } : {}),
      "User-Agent": "unsaid-kole-sync",
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new KoleApiError(res.status, text)
  if (!text.trim()) return {} as T
  try {
    return JSON.parse(text) as T
  } catch {
    // The API also speaks XML — parse it with the shared mini-parser.
    return xmlToValue(parseXml(text)) as T
  }
}

// ---------------------------------------------------------------------------
// Types (documented fields; index signatures keep us forward-compatible).
// ---------------------------------------------------------------------------

export type KoleApiProduct = {
  id?: string
  sku?: string
  title?: string
  brand?: string
  inventory?: number | string
  [key: string]: unknown
}

export type KoleOrderItemInput = { sku: string; quantity: number }

export type KoleOrderInput = {
  /** Our order reference — Kole's PO number. */
  po_number: string
  first_name: string
  last_name: string
  company?: string
  address1: string
  address2?: string
  city: string
  state: string
  zipcode: string
  ext_zipcode?: string
  phone?: string
  carrier?: string
  service?: string
  signature?: boolean
  notes?: string
  instructions?: string
  items: KoleOrderItemInput[]
}

export type KoleOrder = {
  order_id?: string | number
  id?: string | number
  po_number?: string
  status?: string
  [key: string]: unknown
}

export type KoleShipmentPackage = { weight?: string | number; tracking?: string }

export type KoleShipment = {
  order_id?: string | number
  po_number?: string
  carrier?: string
  service?: string
  master_tracking?: string
  packages?: KoleShipmentPackage[]
  [key: string]: unknown
}

export type KoleTransaction = {
  order_id?: string | number
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export function listKoleProducts(opts: { limit?: number; offset?: number } = {}): Promise<unknown> {
  const limit = opts.limit ?? 100
  const offset = opts.offset ?? 0
  return koleRequest("product", `/products?limit=${limit}&offset=${offset}`)
}

export function getKoleProduct(sku: string): Promise<KoleApiProduct> {
  return koleRequest<KoleApiProduct>("product", `/products/${encodeURIComponent(sku)}`)
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export function listKoleOrders(): Promise<unknown> {
  return koleRequest("order", "/orders")
}

export function getKoleOrder(orderId: string): Promise<KoleOrder> {
  return koleRequest<KoleOrder>("order", `/orders/${encodeURIComponent(orderId)}`)
}

/** Create an order at Kole. Items are in PIECES (the caller multiplies pack
 *  quantities — Kole orders by piece at tier-pack multiples). */
export function createKoleOrder(order: KoleOrderInput): Promise<KoleOrder> {
  return koleRequest<KoleOrder>("order", "/orders", { method: "POST", body: order })
}

// ---------------------------------------------------------------------------
// Shipments / tracking
// ---------------------------------------------------------------------------

export function listKoleShipments(): Promise<unknown> {
  return koleRequest("shipment", "/shipments")
}

export function getKoleShipment(orderId: string): Promise<KoleShipment> {
  return koleRequest<KoleShipment>("shipment", `/shipments/${encodeURIComponent(orderId)}`)
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export function listKoleTransactions(): Promise<unknown> {
  return koleRequest("transaction", "/transactions")
}

export function getKoleTransaction(orderId: string): Promise<KoleTransaction> {
  return koleRequest<KoleTransaction>("transaction", `/transactions/${encodeURIComponent(orderId)}`)
}

// ---------------------------------------------------------------------------
// Feed download (the URL carries its own access key — no API creds needed).
// ---------------------------------------------------------------------------

export async function fetchKoleFeedXml(): Promise<string> {
  const cfg = koleConfig()
  if (!cfg.feedUrl) throw new KoleNotConfiguredError(["KOLE_FEED_URL"])
  const res = await fetch(cfg.feedUrl, { headers: { "User-Agent": "unsaid-kole-sync" } })
  const text = await res.text()
  if (!res.ok) throw new KoleApiError(res.status, text)
  return text
}
