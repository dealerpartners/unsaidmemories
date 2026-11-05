import "server-only"

// ---------------------------------------------------------------------------
// Google Merchant API v1 — the sync engine. Pushes the catalog (the
// feed's own item set: lib/shop/google-feed.ts getGoogleFeedItems)
// into the platform's API-input data source, and keeps it true:
//
//   full        — every item is (re)pushed; departed ledger entries
//                 are deleted. The first run after deploy is ONE
//                 call in this mode (POST /api/cron/google-merchant-
//                 sync?mode=full, or the 6-hourly cron after a
//                 manual flip of the mode — the scheduled run is
//                 incremental).
//   incremental — only what changed: new items, failed pushes,
//                 replaced catalog rows, content-hash changes;
//                 departed items are deleted from Google.
//
// The ledger (google_merchant_sync_state, record 20261200) IS the
// sync state: probe-gated like every consumer — until the record
// is applied, the engine reports installed=false and pushes
// NOTHING (an unrecorded push is a duplicate waiting to happen).
// A run that hits a platform timeout mid-push is resumable by
// construction: what landed is in the ledger, and the next
// incremental run skips it by hash.
//
// Per-item failures never abort the run: each is recorded on its
// ledger row (state=failed, last_error) and counted in the run
// summary (google_merchant_sync_runs + the cron response).
// ---------------------------------------------------------------------------

import { pgExec, pgQuery } from "@/lib/pg"
import { SITE_URL } from "@/lib/site-url"
import { getGoogleFeedItems } from "@/lib/shop/google-feed"
import {
  deleteProductInput,
  insertProductInput,
  resolveMerchantConfig,
  withMerchantRetry,
  type MerchantConfig,
} from "./client"
import {
  mapCatalogItems,
  planMerchantSync,
  type MappedMerchantProduct,
  type MerchantLedgerRow,
  type PlannedDelete,
  type PlannedInsert,
} from "./core"

const CONCURRENCY = 8
const LEDGER_FLUSH_SIZE = 200

// ---------------------------------------------------------------------------
// Tables — probe-gated on migration record 20261200
// ---------------------------------------------------------------------------

export type MerchantTables = { ledger: boolean; runs: boolean }

export async function merchantTablesInstalled(): Promise<MerchantTables> {
  try {
    const rows = await pgQuery<Record<string, string | null>>(
      `SELECT to_regclass('public.google_merchant_sync_state') AS ledger,
              to_regclass('public.google_merchant_sync_runs') AS runs`,
    )
    const r = rows[0] ?? {}
    return { ledger: Boolean(r.ledger), runs: Boolean(r.runs) }
  } catch {
    return { ledger: false, runs: false }
  }
}

// ---------------------------------------------------------------------------
// Ledger IO
// ---------------------------------------------------------------------------

async function loadLedger(): Promise<MerchantLedgerRow[]> {
  const rows = await pgQuery<{
    offer_id: string
    catalog_item_id: string
    content_hash: string
    state: string
  }>(
    `SELECT offer_id, catalog_item_id, content_hash, state
       FROM google_merchant_sync_state`,
  )
  return rows.map((r) => ({
    offerId: r.offer_id,
    catalogItemId: r.catalog_item_id,
    contentHash: r.content_hash,
    state: r.state === "failed" ? "failed" : r.state === "deleted" ? "deleted" : "pushed",
  }))
}

type LedgerOutcome = {
  offerId: string
  catalogItemId: string
  contentHash: string
  state: "pushed" | "failed" | "deleted"
  googleProductName: string | null
  lastError: string | null
  pushed: boolean // stamp pushed_at (a successful push/delete time)
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function flushLedger(outcomes: LedgerOutcome[]): Promise<void> {
  for (const part of chunk(outcomes, LEDGER_FLUSH_SIZE)) {
    const params: unknown[] = []
    const values = part.map((o, i) => {
      const b = i * 7
      params.push(
        o.offerId,
        o.catalogItemId,
        o.contentHash,
        o.state,
        o.googleProductName,
        o.lastError ? o.lastError.slice(0, 2000) : null,
        o.pushed,
      )
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, CASE WHEN $${b + 7} THEN now() END, now(), now())`
    })
    await pgQuery(
      `INSERT INTO google_merchant_sync_state
         (offer_id, catalog_item_id, content_hash, state, google_product_name,
          last_error, pushed_at, created_at, updated_at)
       VALUES ${values.join(", ")}
       ON CONFLICT (offer_id) DO UPDATE SET
         catalog_item_id = EXCLUDED.catalog_item_id,
         content_hash = EXCLUDED.content_hash,
         state = EXCLUDED.state,
         google_product_name = COALESCE(EXCLUDED.google_product_name, google_merchant_sync_state.google_product_name),
         last_error = EXCLUDED.last_error,
         pushed_at = COALESCE(EXCLUDED.pushed_at, google_merchant_sync_state.pushed_at),
         updated_at = now()`,
      params,
    )
  }
}

async function recordRun(summary: MerchantSyncSummary, startedAt: Date): Promise<void> {
  try {
    await pgExec(
      `INSERT INTO google_merchant_sync_runs
         (mode, inserted, updated, deleted, failed, skipped, detail, started_at, finished_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, now())`,
      [
        summary.mode,
        summary.inserted,
        summary.updated,
        summary.deleted,
        summary.failed,
        summary.skipped,
        summary.detail,
        startedAt.toISOString(),
      ],
    )
  } catch {
    // Recording is visibility, not the work itself (the cron
    // response still carries the summary).
  }
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

export type MerchantSyncMode = "full" | "incremental"

export type MerchantSyncSummary = {
  armed: boolean
  installed: boolean
  mode: MerchantSyncMode
  considered: number
  inserted: number
  updated: number
  deleted: number
  failed: number
  skipped: number
  detail: string | null
  failures: { offerId: string; error: string }[]
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0
  const lanes = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const i = next
      next += 1
      if (i >= items.length) return
      await worker(items[i])
    }
  })
  await Promise.all(lanes)
}

export async function runGoogleMerchantSync(
  mode: MerchantSyncMode = "incremental",
): Promise<MerchantSyncSummary> {
  const startedAt = new Date()
  const summary: MerchantSyncSummary = {
    armed: false,
    installed: false,
    mode,
    considered: 0,
    inserted: 0,
    updated: 0,
    deleted: 0,
    failed: 0,
    skipped: 0,
    detail: null,
    failures: [],
  }

  const cfg = await resolveMerchantConfig()
  if (!cfg.armed || !cfg.serviceAccount) {
    summary.detail = "not_armed"
    return summary
  }
  summary.armed = true

  const tables = await merchantTablesInstalled()
  if (!tables.ledger) {
    summary.detail = "table_not_installed"
    return summary
  }
  summary.installed = true

  const items = await getGoogleFeedItems()
  const mapped: MappedMerchantProduct[] = mapCatalogItems(items, { siteBase: SITE_URL })
  summary.considered = mapped.length

  const ledger = await loadLedger()
  const plan = planMerchantSync(mapped, ledger, mode)
  summary.skipped = plan.skipped

  const outcomes: LedgerOutcome[] = []
  let flushChain: Promise<void> = Promise.resolve()
  const queueOutcome = (o: LedgerOutcome) => {
    outcomes.push(o)
    if (outcomes.length >= LEDGER_FLUSH_SIZE) {
      const batch = outcomes.splice(0, outcomes.length)
      flushChain = flushChain.then(() => flushLedger(batch))
    }
  }

  const doInsert = async (planned: PlannedInsert): Promise<void> => {
    const { product, kind } = planned
    try {
      const result = await withMerchantRetry(() => insertProductInput(cfg, product.input))
      if (kind === "update") summary.updated += 1
      else summary.inserted += 1
      queueOutcome({
        offerId: product.offerId,
        catalogItemId: product.catalogItemId,
        contentHash: product.contentHash,
        state: "pushed",
        googleProductName: result.productName ?? result.name,
        lastError: null,
        pushed: true,
      })
    } catch (e) {
      summary.failed += 1
      const message = e instanceof Error ? e.message : String(e)
      if (summary.failures.length < 50) {
        summary.failures.push({ offerId: product.offerId, error: message.slice(0, 500) })
      }
      queueOutcome({
        offerId: product.offerId,
        catalogItemId: product.catalogItemId,
        contentHash: product.contentHash,
        state: "failed",
        googleProductName: null,
        lastError: message,
        pushed: false,
      })
    }
  }

  const doDelete = async (planned: PlannedDelete): Promise<void> => {
    try {
      await withMerchantRetry(() => deleteProductInput(cfg, planned.offerId))
      summary.deleted += 1
      queueOutcome({
        offerId: planned.offerId,
        catalogItemId: planned.catalogItemId,
        contentHash: "",
        state: "deleted",
        googleProductName: null,
        lastError: null,
        pushed: true,
      })
    } catch (e) {
      summary.failed += 1
      const message = e instanceof Error ? e.message : String(e)
      if (summary.failures.length < 50) {
        summary.failures.push({ offerId: planned.offerId, error: `delete: ${message.slice(0, 440)}` })
      }
      // A failed delete keeps its prior ledger row untouched — the
      // item stays departed-and-pushed, so the next run retries the
      // delete instead of forgetting the product exists at Google.
    }
  }

  await runPool(plan.inserts, CONCURRENCY, doInsert)
  await runPool(plan.deletes, CONCURRENCY, doDelete)
  await flushChain
  if (outcomes.length > 0) await flushLedger(outcomes.splice(0, outcomes.length))

  summary.detail =
    `account=${cfg.accountId} source=${cfg.dataSourceId} mode=${mode} ` +
    `considered=${summary.considered} inserted=${summary.inserted} updated=${summary.updated} ` +
    `deleted=${summary.deleted} failed=${summary.failed} skipped=${summary.skipped}`
  console.log(`[google-merchant-sync] ${summary.detail}`)
  if (tables.runs) await recordRun(summary, startedAt)
  return summary
}

// ---------------------------------------------------------------------------
// Status — the admin surface's read: config (identifiers only),
// ledger counts, the last run, recent failures. No credential
// material is ever read out here.
// ---------------------------------------------------------------------------

export type MerchantSyncStatus = {
  armed: boolean
  serviceAccountEmail: string | null
  accountId: string
  dataSourceId: string
  tables: MerchantTables
  ledger: { pushed: number; failed: number; deleted: number; total: number } | null
  lastRun: {
    mode: string
    inserted: number
    updated: number
    deleted: number
    failed: number
    skipped: number
    detail: string | null
    finishedAt: string
  } | null
  recentFailures: { offerId: string; error: string | null; updatedAt: string }[]
}

export async function getGoogleMerchantStatus(): Promise<MerchantSyncStatus> {
  const cfg: MerchantConfig = await resolveMerchantConfig()
  const tables = await merchantTablesInstalled()

  let ledger: MerchantSyncStatus["ledger"] = null
  let recentFailures: MerchantSyncStatus["recentFailures"] = []
  if (tables.ledger) {
    try {
      const rows = await pgQuery<{ state: string; n: string }>(
        `SELECT state, count(*)::text AS n
           FROM google_merchant_sync_state
          GROUP BY state`,
      )
      const counts = { pushed: 0, failed: 0, deleted: 0, total: 0 }
      for (const r of rows) {
        const n = Number(r.n) || 0
        counts.total += n
        if (r.state === "pushed") counts.pushed = n
        else if (r.state === "failed") counts.failed = n
        else if (r.state === "deleted") counts.deleted = n
      }
      ledger = counts
      const fails = await pgQuery<{ offer_id: string; last_error: string | null; updated_at: string }>(
        `SELECT offer_id, last_error, updated_at::text AS updated_at
           FROM google_merchant_sync_state
          WHERE state = 'failed'
          ORDER BY updated_at DESC
          LIMIT 25`,
      )
      recentFailures = fails.map((f) => ({
        offerId: f.offer_id,
        error: f.last_error,
        updatedAt: f.updated_at,
      }))
    } catch {
      ledger = null
      recentFailures = []
    }
  }

  let lastRun: MerchantSyncStatus["lastRun"] = null
  if (tables.runs) {
    try {
      const rows = await pgQuery<{
        mode: string
        inserted: number
        updated: number
        deleted: number
        failed: number
        skipped: number
        detail: string | null
        finished_at: string
      }>(
        `SELECT mode, inserted, updated, deleted, failed, skipped, detail,
                finished_at::text AS finished_at
           FROM google_merchant_sync_runs
          ORDER BY finished_at DESC
          LIMIT 1`,
      )
      const r = rows[0]
      if (r) {
        lastRun = {
          mode: r.mode,
          inserted: Number(r.inserted) || 0,
          updated: Number(r.updated) || 0,
          deleted: Number(r.deleted) || 0,
          failed: Number(r.failed) || 0,
          skipped: Number(r.skipped) || 0,
          detail: r.detail,
          finishedAt: r.finished_at,
        }
      }
    } catch {
      lastRun = null
    }
  }

  return {
    armed: cfg.armed,
    serviceAccountEmail: cfg.serviceAccount?.clientEmail ?? null,
    accountId: cfg.accountId,
    dataSourceId: cfg.dataSourceId,
    tables,
    ledger,
    lastRun,
    recentFailures,
  }
}
