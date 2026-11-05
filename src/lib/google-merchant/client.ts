import "server-only"

// ---------------------------------------------------------------------------
// Google Merchant API v1 — server side: the product-input writer for
// Google Shopping. ALL catalog products flow to Shopping through
// this API (the platform's API-input data source); the pre-existing
// XML feed on its FILE data source keeps running alongside — the
// API flow is additive, and both paths carry the same item set
// (lib/shop/google-feed.ts is the one sellable definition).
//
// THE credential gate is the google-indexing gate
// (lib/google-indexing/client.ts → resolveGoogleIndexingConfig +
// getGoogleAccessTokenForScopes with the content scope): ONE
// service account, ONE settings key. No second credential path,
// no env service account.
//
// Merchant API v1 only — merchantapi.googleapis.com. (The legacy
// Content API surface the platform probed earlier is deprecated;
// nothing here touches it.)
// ---------------------------------------------------------------------------

import { pgQuery } from "@/lib/pg"
import {
  getGoogleAccessTokenForScopes,
  resolveGoogleIndexingConfig,
} from "@/lib/google-indexing/client"
import type { ServiceAccount } from "@/lib/google-indexing/core"
import {
  classifyGoogleApiError,
  resolveSeededId,
  type ClassifiedGoogleError,
} from "@/lib/google-properties/core"
import {
  GOOGLE_MERCHANT_CONTENT_SCOPE,
  KNOWN_MERCHANT_ACCOUNT_ID,
  KNOWN_MERCHANT_DATA_SOURCE_ID,
  MERCHANT_PRODUCTS_API_BASE,
  isRetryableMerchantStatus,
  merchantRetryBackoffMs,
  parseProcessedProductsPage,
  parseProductInputResult,
  type MerchantProductInput,
  type ParsedProductInputResult,
  type ProcessedProduct,
} from "./core"

// ---------------------------------------------------------------------------
// Errors — typed, with the shared classification (SERVICE_DISABLED
// stays its own honest kind) and the retry posture from core.
// ---------------------------------------------------------------------------

export class MerchantApiError extends Error {
  kind: ClassifiedGoogleError["kind"]
  httpStatus: number
  retryable: boolean
  constructor(classified: ClassifiedGoogleError, httpStatus: number) {
    super(classified.detail)
    this.kind = classified.kind
    this.httpStatus = httpStatus
    this.retryable = isRetryableMerchantStatus(httpStatus)
  }
}

// ---------------------------------------------------------------------------
// Resolved merchant config — the gate + the account/data-source ids
// (app_settings → the known constants; seeded by record 20261200)
// ---------------------------------------------------------------------------

const SETTING_MERCHANT_ACCOUNT = "google.merchant_account_id"
const SETTING_MERCHANT_DATA_SOURCE = "google.merchant_data_source_id"

export type MerchantConfig = {
  armed: boolean
  serviceAccount: ServiceAccount | null
  accountId: string
  dataSourceId: string
}

async function readSetting(key: string): Promise<string | null> {
  try {
    const rows = await pgQuery<{ value: unknown }>(
      `SELECT value FROM app_settings WHERE key = $1`,
      [key],
    )
    const v = rows[0]?.value
    if (v == null) return null
    const s = (typeof v === "string" ? v : String(v)).trim()
    return s ? s : null
  } catch {
    return null
  }
}

export async function resolveMerchantConfig(): Promise<MerchantConfig> {
  const gate = await resolveGoogleIndexingConfig()
  const accountId =
    resolveSeededId(await readSetting(SETTING_MERCHANT_ACCOUNT), KNOWN_MERCHANT_ACCOUNT_ID) ??
    KNOWN_MERCHANT_ACCOUNT_ID
  const dataSourceId =
    resolveSeededId(await readSetting(SETTING_MERCHANT_DATA_SOURCE), KNOWN_MERCHANT_DATA_SOURCE_ID) ??
    KNOWN_MERCHANT_DATA_SOURCE_ID
  return {
    armed: gate.armed && Boolean(gate.serviceAccount),
    serviceAccount: gate.serviceAccount,
    accountId,
    dataSourceId,
  }
}

// ---------------------------------------------------------------------------
// HTTP — one fetch shape for the Merchant API
// ---------------------------------------------------------------------------

async function merchantFetch(
  sa: ServiceAccount,
  url: string,
  init?: { method?: string; body?: unknown },
): Promise<unknown> {
  const token = await getGoogleAccessTokenForScopes(sa, [GOOGLE_MERCHANT_CONTENT_SCOPE])
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: init?.body != null ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new MerchantApiError(classifyGoogleApiError(res.status, text), res.status)
  }
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Merchant API returned a non-JSON body (HTTP ${res.status})`)
  }
}

function dataSourceResource(accountId: string, dataSourceId: string): string {
  return `accounts/${accountId}/dataSources/${dataSourceId}`
}

/** Insert (upsert) one product input into the API data source.
 *  The insert IS the update path: re-inserting an existing offerId
 *  replaces its attributes under the same product — which is how
 *  the first full run adopts products already present (e.g. the
 *  coordinator's proof insert) instead of duplicating them. */
export async function insertProductInput(
  cfg: MerchantConfig,
  input: MerchantProductInput,
): Promise<ParsedProductInputResult> {
  if (!cfg.serviceAccount) throw new Error("merchant gate not armed")
  const url =
    `${MERCHANT_PRODUCTS_API_BASE}/accounts/${encodeURIComponent(cfg.accountId)}/productInputs:insert` +
    `?dataSource=${encodeURIComponent(dataSourceResource(cfg.accountId, cfg.dataSourceId))}`
  const json = await merchantFetch(cfg.serviceAccount, url, { method: "POST", body: input })
  return parseProductInputResult(json)
}

/** Delete one product input by offerId. A 404 (already gone) is a
 *  completed delete, not a failure — the ledger converges either
 *  way. */
export async function deleteProductInput(cfg: MerchantConfig, offerId: string): Promise<void> {
  if (!cfg.serviceAccount) throw new Error("merchant gate not armed")
  const url =
    `${MERCHANT_PRODUCTS_API_BASE}/accounts/${encodeURIComponent(cfg.accountId)}` +
    `/productInputs/${encodeURIComponent(offerId)}` +
    `?dataSource=${encodeURIComponent(dataSourceResource(cfg.accountId, cfg.dataSourceId))}`
  try {
    await merchantFetch(cfg.serviceAccount, url, { method: "DELETE" })
  } catch (e) {
    if (e instanceof MerchantApiError && e.httpStatus === 404) return
    throw e
  }
}

/** One page of processed products (Google's post-ingestion view of
 *  the account). Read-side visibility; the sync does not depend on
 *  it. */
export async function listProcessedProducts(
  cfg: MerchantConfig,
  opts?: { pageSize?: number; pageToken?: string | null },
): Promise<{ products: ProcessedProduct[]; nextPageToken: string | null }> {
  if (!cfg.serviceAccount) throw new Error("merchant gate not armed")
  const pageSize = Math.min(250, Math.max(1, opts?.pageSize ?? 250))
  const url =
    `${MERCHANT_PRODUCTS_API_BASE}/accounts/${encodeURIComponent(cfg.accountId)}/products` +
    `?pageSize=${pageSize}` +
    (opts?.pageToken ? `&pageToken=${encodeURIComponent(opts.pageToken)}` : "")
  const json = await merchantFetch(cfg.serviceAccount, url)
  return parseProcessedProductsPage(json)
}

// ---------------------------------------------------------------------------
// Bounded retry — 429/5xx back off (core's schedule); everything
// else surfaces immediately. Used by the sync engine per item, so
// one item's failure is recorded and the run moves on.
// ---------------------------------------------------------------------------

export async function withMerchantRetry<T>(
  fn: () => Promise<T>,
  opts?: { maxAttempts?: number; sleep?: (ms: number) => Promise<void> },
): Promise<T> {
  const maxAttempts = Math.max(1, opts?.maxAttempts ?? 3)
  const sleep =
    opts?.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn()
    } catch (e) {
      lastError = e
      const retryable = e instanceof MerchantApiError ? e.retryable : false
      if (!retryable || attempt >= maxAttempts) throw e
      await sleep(merchantRetryBackoffMs(attempt))
    }
  }
  throw lastError
}
