import { withPg } from "@/lib/crm/enterprise"
import {
  claimNextSyncJob, completeSyncJob, enqueueSyncJob, enqueueSyncJobSafe, failSyncJob,
  failSyncJobTerminal, isMissingSyncJobsTable, type SyncJob,
} from "./jobs"
import { stripeSyncConfigured, syncProductsToStripe } from "./stripe-sync"
import { algoliaSyncConfigured, reindexProductsToAlgolia } from "./algolia-sync"

// ---------------------------------------------------------------------------
// sync_jobs runner — claims due jobs and executes them against the real
// handlers. Invoked by /api/cron/sync-jobs every minute (bounded batch)
// and synchronously by the manual product-sync endpoint for its own jobs.
//
// Failure contract:
//   · infrastructure failures (Stripe/Algolia/DB unreachable, missing
//     configuration) THROW out of a handler → the job retries on the §9.4
//     ladder and dies after 5 attempts, with the error recorded.
//   · per-product DATA failures inside a batch (a product with no valid
//     price) are recorded in the job's result.failed[] — retrying cannot
//     fix data, so the job completes carrying the truth.
// ---------------------------------------------------------------------------

type PgClient = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>
}

function payloadIds(job: SyncJob): string[] | null {
  const ids = (job.payload as any)?.productIds
  if (!Array.isArray(ids)) return null
  const clean = ids.filter((x: unknown) => typeof x === "string" && x)
  return clean.length ? (clean as string[]) : null
}

async function executeJob(c: PgClient, job: SyncJob): Promise<Record<string, unknown>> {
  switch (job.job_type) {
    case "stripe_product_sync": {
      if (!stripeSyncConfigured()) {
        throw new Error("STRIPE_SECRET_KEY is not configured — stripe_product_sync cannot run")
      }
      const result = await syncProductsToStripe(c as PgClient, payloadIds(job))
      return { synced: result.synced, failed: result.failed }
    }
    case "algolia_reindex": {
      if (!algoliaSyncConfigured()) {
        throw new Error("ALGOLIA_ADMIN_API_KEY is not configured — algolia_reindex cannot run")
      }
      const result = await reindexProductsToAlgolia(c, payloadIds(job))
      return { ...result }
    }
    case "feed_followthrough": {
      // A feed run changed these products in the database; fan out the two
      // downstream syncs per product. Child keys derive from THIS job's id,
      // so a retried follow-through converges instead of duplicating.
      const ids = payloadIds(job) ?? []
      const children: string[] = []
      for (const productId of ids) {
        for (const jobType of ["stripe_product_sync", "algolia_reindex"] as const) {
          const child = await enqueueSyncJob(c, {
            tenantId: job.tenant_id,
            jobType,
            payload: { productIds: [productId], via: "feed_followthrough", parentJobId: job.id },
            idempotencyKey: `${job.id}:${jobType}:${productId}`,
          })
          children.push(child.id)
        }
      }
      return { productIds: ids, childJobIds: children }
    }
  }
}

export type DrainSummary = { claimed: number; succeeded: number; retried: number; dead: number; failed: number }

/** Drain up to maxJobs due jobs. Runs inside one withPg client. */
export async function drainSyncJobs(maxJobs = 25): Promise<DrainSummary> {
  const summary: DrainSummary = { claimed: 0, succeeded: 0, retried: 0, dead: 0, failed: 0 }
  const out = await withPg(async (c) => {
    for (let i = 0; i < maxJobs; i++) {
      const job = await claimNextSyncJob(c as PgClient)
      if (!job) break
      summary.claimed++
      try {
        const result = await executeJob(c as PgClient, job)
        await completeSyncJob(c as PgClient, job.id, result)
        summary.succeeded++
      } catch (e: any) {
        const message = e?.message || "Sync job failed"
        // A job for a tenant/product shape that can never succeed is
        // terminally failed; everything else follows the retry ladder.
        if (/No valid price to sync/.test(message) && job.job_type !== "stripe_product_sync") {
          await failSyncJobTerminal(c as PgClient, job.id, message)
          summary.failed++
        } else {
          const next = await failSyncJob(c as PgClient, job, message)
          if (next === "dead") summary.dead++
          else summary.retried++
        }
      }
    }
    return summary
  })
  return out ?? summary
}

/**
 * The manual endpoint's path: record ONE batch job, execute it now through
 * the same handler the cron runner uses, and return the batch result in the
 * endpoint's long-standing shape. If the sync_jobs table does not exist yet
 * (migration 20261080 pending), the sync still runs — unrecorded — and the
 * caller is told so (jobRecorded: false). Never the reverse: a recorded
 * job that didn't run would be a false claim.
 */
export async function runManualStripeSync(
  tenantId: string,
  ids: string[] | null,
): Promise<{ synced: unknown[]; failed: unknown[]; jobId: string | null; jobRecorded: boolean }> {
  if (!stripeSyncConfigured()) {
    throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY in .env to enable product sync.")
  }
  const direct = async () => {
    const r = await withPg(async (c) => syncProductsToStripe(c as PgClient, ids))
    return { synced: r?.synced ?? [], failed: r?.failed ?? [], jobId: null, jobRecorded: false }
  }
  try {
    const out = await withPg(async (c) => {
      const job = await enqueueSyncJob(c as PgClient, {
        tenantId,
        jobType: "stripe_product_sync",
        payload: ids ? { productIds: ids, via: "manual_endpoint" } : { via: "manual_endpoint", allVisible: true },
        idempotencyKey: `manual:${crypto.randomUUID()}`,
      })
      // Execute immediately: flip to running, run, and record the outcome
      // on the same row the cron runner would have used.
      await (c as PgClient).query(
        `UPDATE public.sync_jobs SET status = 'running', attempts = attempts + 1, started_at = now(), updated_at = now() WHERE id = $1`,
        [job.id],
      )
      try {
        const result = await executeJob(c as PgClient, { ...job, attempts: job.attempts + 1 })
        await completeSyncJob(c as PgClient, job.id, result)
        return {
          synced: (result as any).synced ?? [],
          failed: (result as any).failed ?? [],
          jobId: job.id,
          jobRecorded: true,
        }
      } catch (e: any) {
        await failSyncJob(c as PgClient, { id: job.id, attempts: job.attempts + 1 }, e?.message || "Sync failed")
        throw e
      }
    })
    return out ?? (await direct())
  } catch (e) {
    if (isMissingSyncJobsTable(e)) return direct()
    throw e
  }
}

/**
 * In-transaction enqueue for the enterprise catalog write path
 * (createCatalogProduct / updateCatalogProduct): a catalog item's index
 * universe is Algolia (commerce_catalog_items), AND its managed-price
 * universe is Stripe (erp_products.metadata linkage) — so the write
 * enqueues an algolia_reindex AND a stripe_product_sync for the item
 * inside the SAME transaction. The Stripe leg was never wired here:
 * enqueueProductSync (which fans out both) has no callers, and this
 * function used to enqueue Algolia only — so a published price change
 * reached the index and never reached Stripe. Savepoint-safe: a pending
 * sync_jobs migration degrades to "no job recorded", never a failed
 * product write.
 */
export async function enqueueCatalogItemSync(
  c: { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> },
  tenantId: string,
  catalogItemId: string,
  via: string,
): Promise<boolean> {
  const minute = Math.floor(Date.now() / 60000)
  const algolia = await enqueueSyncJobSafe(c, {
    tenantId,
    jobType: "algolia_reindex",
    payload: { productIds: [catalogItemId], via },
    idempotencyKey: `${via}:algolia_reindex:${catalogItemId}:${minute}`,
  })
  const stripe = await enqueueSyncJobSafe(c, {
    tenantId,
    jobType: "stripe_product_sync",
    payload: { productIds: [catalogItemId], via },
    idempotencyKey: `${via}:stripe_product_sync:${catalogItemId}:${minute}`,
  })
  return algolia && stripe
}

/**
 * Enqueue one stripe + one algolia job per product. Used by the product
 * write paths (admin catalog, seller listings) so a published change is
 * delivered to both downstream systems, and by the internal feed
 * follow-through route (which enqueues a single feed_followthrough job
 * instead — see /api/internal/sync/feed-followthrough).
 */
export async function enqueueProductSync(
  tenantId: string,
  productIds: string[],
  via: string,
): Promise<{ jobIds: string[] } | null> {
  return withPg(async (c) => {
    const jobIds: string[] = []
    for (const productId of productIds) {
      for (const jobType of ["stripe_product_sync", "algolia_reindex"] as const) {
        const job = await enqueueSyncJob(c as PgClient, {
          tenantId,
          jobType,
          payload: { productIds: [productId], via },
          // Keyed on the work + a per-call nonce is wrong (replays must
          // converge); keyed on product+type+the product's current update
          // marker would be ideal, but producers call this at write time —
          // the write itself is the event. Use via+product+type+minute
          // bucket so a burst of edits in one minute converges on one job,
          // while a later edit re-syncs.
          idempotencyKey: `${via}:${jobType}:${productId}:${Math.floor(Date.now() / 60000)}`,
        })
        jobIds.push(job.id)
      }
    }
    return { jobIds }
  })
}
