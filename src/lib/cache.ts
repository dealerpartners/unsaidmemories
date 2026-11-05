// ---------------------------------------------------------------------------
// cache — process-wide TTL memoization for remote reads.
//
// Every uncached read in this app pays a network round trip to the REMOTE
// Supabase project (pg via session pooler or PostgREST over HTTPS). A customer
// browsing category pages re-runs identical queries second after second —
// paying that trip per view is why the storefront felt slow. This helper
// parks each result in a globalThis map (Turbopack-safe, like the pg pool)
// for a short TTL:
//
//   • taxonomy facet/section definitions — 5 min (owner edits rarely)
//   • PLP grids per (scope + filters + page) — 60 s
//   • CMS chrome reads (settings / services / testimonials …) — 60 s
//
// Writes invalidate their resource so admin edits are visible immediately
// (repo.ts calls invalidate()). Bounded size + TTL sweep keeps memory flat.
// ---------------------------------------------------------------------------

type Entry = { value: unknown; expiresAt: number }

const globalStore = globalThis as unknown as {
  __unsaidTtlCache?: Map<string, Entry>
  __unsaidInflight?: Map<string, Promise<unknown>>
}

function store(): Map<string, Entry> {
  if (!globalStore.__unsaidTtlCache) globalStore.__unsaidTtlCache = new Map()
  return globalStore.__unsaidTtlCache
}

function inflight(): Map<string, Promise<unknown>> {
  if (!globalStore.__unsaidInflight) globalStore.__unsaidInflight = new Map()
  return globalStore.__unsaidInflight
}

// 1500 (was 500): the key space is crawler-shaped — PLP grids key per
// (scope | sort | page | filters) and PDPs per slug across an 18k-product
// catalog — so at 500 entries, enumeration traffic evicted live entries
// long before their TTL and every eviction re-paid a full cold fetch
// against the database. The eviction below (soonest-expiring first)
// still bounds memory; the ceiling is sized so real browsing keys
// survive their TTL.
const MAX_ENTRIES = 1500

function put(key: string, value: unknown, ttlMs: number): void {
  const s = store()
  // Bound the map: when full, drop the soonest-expiring entries first.
  if (s.size >= MAX_ENTRIES && !s.has(key)) {
    const entries = [...s.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)
    for (const [k] of entries.slice(0, Math.ceil(MAX_ENTRIES / 4))) s.delete(k)
  }
  s.set(key, { value, expiresAt: Date.now() + ttlMs })
}

/**
 * Return the cached value for `key` when fresh, else run `fn`, park the
 * result for `ttlMs` and return it.
 *
 * Two customer-facing guarantees:
 *   1. REQUEST COALESCING — concurrent misses share ONE `fn` execution, so a
 *      burst of views on a cold key costs a single remote round trip instead
 *      of N (that stampede was exhausting the Supabase session pooler).
 *   2. STALE-WHILE-REVALIDATE — once a value exists it is served INSTANTLY
 *      forever; when the TTL lapses the fresh fetch happens in the
 *      background. A customer never waits on a re-fetch after the first
 *      view — the render only ever pays the query once per key.
 * Rejections are never cached — a failed fetch is retried on the next call.
 */
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const s = store()
  const hit = s.get(key)
  const now = Date.now()

  if (hit) {
    if (hit.expiresAt > now) return hit.value as T
    // Stale — serve it now, refresh in the background (single-flight).
    const f = inflight()
    if (!f.has(key)) {
      const p = (async () => {
        const value = await fn()
        put(key, value, ttlMs)
      })()
      f.set(
        key,
        p.finally(() => f.delete(key)).catch(() => {}),
      )
    }
    return hit.value as T
  }

  // Miss — coalesce concurrent callers onto one fetch.
  const f = inflight()
  const pending = f.get(key)
  if (pending) return pending as Promise<T>
  const exec = (async () => {
    const value = await fn()
    put(key, value, ttlMs)
    return value
  })()
  f.set(
    // The map holds a DERIVED promise (exec.finally). When exec rejects,
    // that derived promise has no other handler — without the .catch it
    // surfaces as an unhandledRejection per failed fetch (log spam on
    // every cold miss during a database episode). The caller still awaits
    // exec itself, so real rejections still propagate: nothing is cached,
    // nothing is swallowed.
    key,
    exec.finally(() => f.delete(key)).catch(() => {}),
  )
  return exec
}

/** Drop every cache key that starts with `prefix` (pass nothing to clear all). */
export function invalidate(prefix?: string): void {
  const s = store()
  const f = inflight()
  if (!prefix) {
    s.clear()
    f.clear()
    return
  }
  for (const k of s.keys()) {
    if (k.startsWith(prefix)) s.delete(k)
  }
  // In-flight fetches started before the write may repopulate stale data —
  // drop them so the next read after the write goes straight to the source.
  for (const k of f.keys()) {
    if (k.startsWith(prefix)) f.delete(k)
  }
}
