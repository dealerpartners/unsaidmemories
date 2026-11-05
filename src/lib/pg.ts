// Server-side raw pg client for querying the live Supabase database.
// Foundation for the UnSaid Memories admin transplant (2026-10-30): UnSaid Memories's admin
// API routes run raw SQL through this layer because PostgREST (supabase-js)
// only exposes the public schema by default, while transplanted code queries
// across schemas. Modeled on UnSaid Memories src/lib/pg.ts; withPg/withPgStrict are
// ported from UnSaid Memories src/lib/crm/enterprise.ts, where they sit on top of
// getPg()/pgConnectionString with the same contracts (null on failure for
// withPg, throw for withPgStrict).
//
// CONNECTION: one env var, UNSAID_DATABASE_URL, read at runtime. The parent
// sets UNSAID_DATABASE_URL in Vercel to Unsaid's Supabase SESSION POOLER
// URI. DATABASE_URL is accepted as a fallback (lib/pg-ctor.ts already uses
// it for pooled DDL). Two normalizations are applied to whichever value is
// configured, both learned the hard way in the sibling codebases:
//   1. Pooler hostname: Supabase's stale naming (aws-0-useast-1…) does not
//      resolve; the current naming is aws-0-us-east-1… (the correction
//      pg-ctor.ts derives for its candidate list).
//   2. Session → transaction pooler port swap (UnSaid Memories's toTransactionPooler):
//      the session pooler (:5432) gives every client a dedicated server
//      session and caps concurrent clients hard (pool_size 15); serverless
//      instances parking keep-alive connections exhaust it (EMAXCONNSESSION).
//      The transaction pooler (:6543) multiplexes queries over a shared
//      server pool. This layer's usage is plain single-statement
//      reads/writes (no SET, no LISTEN, no advisory locks, no temp tables,
//      no named prepared statements), exactly the surface transaction mode
//      supports. Multi-statement transactions via withPg still pin one
//      checked-out client for the duration of the call.
//
// POOL SHAPE (serverless-safe): process-wide singleton on globalThis
// (Turbopack-safe), max 5 connections per instance, TCP keep-alive with a
// 5-minute idle timeout, 5s acquire wait, 8s statement ceiling.

import { Pool, type PoolClient } from "pg";

/** The client type withPg/withPgStrict hand to their callbacks. */
export type PgClient = PoolClient;

const rawConnectionString =
  process.env.UNSAID_DATABASE_URL || process.env.DATABASE_URL || "";

export function toTransactionPooler(cs: string): string {
  // Only Supavisor pooler hosts have a transaction endpoint; a DIRECT
  // (db.<ref>.supabase.co) connection must be passed through untouched.
  if (!cs.includes("pooler.supabase.com")) return cs;
  return cs.replace(/:5432(?=\/)/, ":6543");
}

export function normalizePoolerHost(cs: string): string {
  if (!cs.includes("pooler.supabase.com")) return cs;
  return cs.replace(/useast-1(?=\.pooler\.supabase\.com)/, "us-east-1");
}

const connectionString = toTransactionPooler(normalizePoolerHost(rawConnectionString));

/** Resolved pooler URI for consumers that need a one-off client. */
export const pgConnectionString = connectionString;

if (!connectionString && process.env.NODE_ENV !== "production") {
  console.error(
    "[pg] Missing UNSAID_DATABASE_URL env var — DB queries will return empty results.",
  );
}

const POOL_MAX = 5;

// globalThis survives Turbopack chunk duplication; a plain module-level
// `let` does not (each chunk gets its own copy of the module state).
const globalStore = globalThis as unknown as { __unsaidPgPool?: Pool };

function getPool(): Pool {
  if (globalStore.__unsaidPgPool) return globalStore.__unsaidPgPool;
  const pool = new Pool({
    connectionString,
    max: POOL_MAX,
    // Connections stay parked for 5 min with TCP keepalives, so repeated
    // requests reuse a hot socket instead of paying a full TLS handshake
    // to the remote Supabase region before the first byte of the query.
    idleTimeoutMillis: 300_000,
    keepAlive: true,
    connectionTimeoutMillis: 5_000, // wait up to 5s for a free conn
    // Statement-level timeout — a single bad query can't lock the pool.
    // 8s ceiling: one statement must fit well inside the <10s page budget,
    // and runWithRetry does NOT re-run a statement that timed out.
    query_timeout: 8_000,
    // Supabase pooler requires SSL.
    ssl: connectionString.includes("supabase.com") ? { rejectUnauthorized: false } : undefined,
  });
  // Pool errors can surface as 'idle client timeout' / 'connection ended'
  // events — log them so we see flakiness in dev.
  pool.on("error", (err) => {
    console.error("[pg] pool error:", err.message);
  });
  globalStore.__unsaidPgPool = pool;
  return pool;
}

// Returns a checked-out client. Caller is responsible for releasing.
export async function getPg(): Promise<PoolClient> {
  return getPool().connect();
}

/**
 * getPg() with connect retries. A single pool connect can hit a transient
 * SSL/pooler failure even while the pool itself is healthy — callers that
 * check out a client for a multi-statement transaction need the same
 * resilience at acquisition time.
 */
export async function getPgWithRetry(attempts = 4): Promise<PoolClient> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await getPool().connect();
    } catch (e) {
      lastErr = e;
      if (attempt < attempts - 1) {
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1) ** 2));
      }
    }
  }
  throw lastErr;
}

// Run a parameterized query and return rows; never throws in pgQuery
// (logs + returns []). Shared retry core below.
const TRANSIENT = /too many clients|connection|terminated|timeout|ECONNRESET|ECONNREFUSED|EAI_AGAIN|remaining connection slots|08006|08001|08003|08004|08007/i;
// A statement timeout (server-side SQLSTATE 57014, or the driver's own
// query_timeout firing) means the QUERY is expensive — retrying re-pays
// the full cost and doubles the stall. It is never retried.
const STATEMENT_TIMEOUT = /statement timeout|query read timeout/i;

// ---------------------------------------------------------------------------
// CIRCUIT BREAKER — outage fast-fail. During a database episode, each read
// used to pay the FULL connection-attempt budget before its caller's
// fallback path could engage. The breaker trips after BREAKER_THRESHOLD
// consecutive connection-class failures and, for a cooldown window, throws
// CircuitOpenError IMMEDIATELY — callers land in their degrade paths in
// microseconds instead of seconds. Statement timeouts and SQL errors (the
// query's own fault) never trip it; a successful probe (half-open) closes
// it again.
// ---------------------------------------------------------------------------
const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 30_000;

export class CircuitOpenError extends Error {
  constructor() {
    super("[pg] circuit open — database connection failures in progress");
    this.name = "CircuitOpenError";
  }
}

type BreakerState = { fails: number; openedAt: number | null };
const breakerStore = globalThis as unknown as { __unsaidPgBreaker?: BreakerState };
function breaker(): BreakerState {
  if (!breakerStore.__unsaidPgBreaker) breakerStore.__unsaidPgBreaker = { fails: 0, openedAt: null };
  return breakerStore.__unsaidPgBreaker;
}
function recordFailure(msg: string) {
  if (STATEMENT_TIMEOUT.test(msg) || !TRANSIENT.test(msg)) return;
  const b = breaker();
  b.fails += 1;
  if (b.fails >= BREAKER_THRESHOLD && b.openedAt === null) {
    b.openedAt = Date.now();
    console.error(
      `[pg] circuit OPEN for ${BREAKER_COOLDOWN_MS / 1000}s after ${b.fails} consecutive connection failures — degrade paths will fast-fail`,
    );
  }
}
function recordSuccess() {
  const b = breaker();
  if (b.openedAt !== null || b.fails > 0) {
    b.fails = 0;
    b.openedAt = null;
  }
}
function breakerOpen(): boolean {
  const b = breaker();
  if (b.openedAt === null) return false;
  if (Date.now() - b.openedAt >= BREAKER_COOLDOWN_MS) {
    // HALF-OPEN: let one real attempt through. If it fails, recordFailure
    // re-opens on the next threshold hit; if it succeeds, recordSuccess
    // resets. (fails = THRESHOLD-1 so a single failure re-trips instantly.)
    b.openedAt = null;
    b.fails = BREAKER_THRESHOLD - 1;
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// LAST-KNOWN-GOOD READ SNAPSHOTS — bounded per-query cache of the most
// recent successful rows, keyed by (sql + params). pgQueryResilient serves
// these when the live read fails (including breaker-open fast-fail), so a
// read that has EVER succeeded keeps rendering for maxStaleMs during a
// full outage. Bounded to LKG_MAX_ENTRIES with insertion-order eviction;
// snapshots are refreshed (re-dated) on every success.
// ---------------------------------------------------------------------------
const LKG_MAX_ENTRIES = 200;
type LkgEntry = { rows: unknown[]; at: number };
const lkgStore = globalThis as unknown as {
  __unsaidPgLkg?: Map<string, LkgEntry>;
};
function lkg(): Map<string, LkgEntry> {
  if (!lkgStore.__unsaidPgLkg) lkgStore.__unsaidPgLkg = new Map();
  return lkgStore.__unsaidPgLkg;
}
function lkgKey(text: string, params: unknown[]): string {
  let tail = "";
  try {
    tail = params.map((p) => JSON.stringify(p) ?? "null").join("¦");
  } catch {
    tail = `#${params.length}`;
  }
  if (tail.length > 512) tail = tail.slice(0, 512);
  return `${text}|${tail}`;
}
function recordLkg(key: string, rows: unknown[]) {
  const m = lkg();
  // Re-insert to refresh recency order, then evict the oldest over budget.
  m.delete(key);
  m.set(key, { rows, at: Date.now() });
  if (m.size > LKG_MAX_ENTRIES) {
    const oldest = m.keys().next().value;
    if (oldest !== undefined) m.delete(oldest);
  }
}

async function runWithRetry<T>(text: string, params: unknown[]): Promise<T[]> {
  // Fast-fail while the breaker is open: callers with last-good data serve
  // it at once; the error below is NEVER fed back into the breaker's own
  // counters (that would keep it open forever).
  if (breakerOpen()) throw new CircuitOpenError();
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const client = await getPool().connect();
      try {
        const { rows } = await client.query(text, params);
        recordSuccess();
        return rows as T[];
      } finally {
        client.release();
      }
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      if ((e as { code?: string })?.code === "57014" || STATEMENT_TIMEOUT.test(msg)) break;
      if (!TRANSIENT.test(msg)) break;
      recordFailure(msg);
      if (attempt < 1) {
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1) ** 2));
      }
    }
  }
  throw lastErr;
}

/**
 * Resilient READ: strict semantics with a last-known-good parachute.
 * Success → rows are returned AND snapshotted. Failure (any transient
 * error, statement timeout, or breaker-open fast-fail) → the most recent
 * successful snapshot for THIS (sql, params) is served while it is younger
 * than maxStaleMs; with no usable snapshot, the error propagates so
 * callers keep their existing "never cache a failure" verdicts.
 *
 * Wire read-path queries that render public surfaces through this —
 * never writes (writes must fail loudly; strict/pgExec semantics below
 * are unchanged).
 */
export async function pgQueryResilient<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
  opts: { maxStaleMs?: number } = {},
): Promise<T[]> {
  if (!connectionString) throw new Error("[pg] no connection string configured");
  const maxStaleMs = opts.maxStaleMs ?? 15 * 60_000;
  const key = lkgKey(text, params);
  try {
    const rows = await runWithRetry<T>(text, params);
    recordLkg(key, rows);
    return rows;
  } catch (e) {
    const snap = lkg().get(key);
    if (snap && Date.now() - snap.at <= maxStaleMs) {
      console.error(
        "[pg] resilient read serving last-good snapshot after:",
        e instanceof Error ? e.message : String(e),
      );
      return snap.rows as T[];
    }
    throw e;
  }
}

// Never throws: failures are logged and surface as []. Use pgQueryStrict
// where an empty result would be wrong to cache (ISR pages, static params).
export async function pgQuery<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  if (!connectionString) return [];
  try {
    return await runWithRetry<T>(text, params);
  } catch (e) {
    console.error("[pg] query failed:", e instanceof Error ? e.message : String(e));
    return [];
  }
}

// Same as pgQuery but throws after retries, so Next keeps the last good
// ISR page instead of caching an empty one.
export async function pgQueryStrict<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  if (!connectionString) throw new Error("[pg] no connection string configured");
  return runWithRetry<T>(text, params);
}

// Run a parameterized write (INSERT/UPDATE/DELETE); returns rows affected; never throws.
export async function pgExec(
  text: string,
  params: unknown[] = [],
): Promise<number> {
  if (!connectionString) return 0;
  try {
    const client = await getPool().connect();
    try {
      const { rowCount } = await client.query(text, params);
      return rowCount ?? 0;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("[pg] exec failed:", e instanceof Error ? e.message : String(e));
    return 0;
  }
}

// ---------------------------------------------------------------------------
// withPg / withPgStrict — ported from UnSaid Memories src/lib/crm/enterprise.ts.
// The client is CHECKED OUT of the shared pool above (no per-call raw
// Client): per-instance database concurrency stays hard-bounded no matter
// how many callers fan out, and the callback still receives a dedicated
// client for the duration of the call (multi-statement transactions pin
// one connection, which transaction-mode pooling supports).
// Contracts: null on failure for withPg, throw for withPgStrict.
// ---------------------------------------------------------------------------
export async function withPg<T>(fn: (client: PgClient) => Promise<T>): Promise<T | null> {
  if (!pgConnectionString) return null;
  let client: PoolClient | null = null;
  for (let attempt = 0; attempt < 3 && !client; attempt++) {
    try {
      client = await getPg();
    } catch (e) {
      if (attempt === 2) {
        console.error("[withPg] Connection failed after 3 attempts:", e instanceof Error ? e.message : String(e));
        return null;
      }
      await new Promise((r) => setTimeout(r, 200 * (attempt + 1) ** 2));
    }
  }
  if (!client) return null;
  try {
    return await fn(client);
  } catch (e) {
    console.error("[withPg] Query execution failed:", e instanceof Error ? e.message : String(e));
    return null;
  } finally {
    client.release();
  }
}

/**
 * withPg, but failures THROW instead of returning null. For callers where
 * "no result" and "the database failed" must not be confused. Connection
 * setup keeps withPg's acquisition backoff; a query error propagates as
 * thrown. A successful run that finds nothing still resolves normally.
 */
export async function withPgStrict<T>(fn: (client: PgClient) => Promise<T>): Promise<T> {
  if (!pgConnectionString) throw new Error("[withPgStrict] no connection string configured");
  let client: PoolClient | null = null;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3 && !client; attempt++) {
    try {
      client = await getPg();
    } catch (e) {
      lastErr = e;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 200 * (attempt + 1) ** 2));
    }
  }
  if (!client) throw lastErr instanceof Error ? lastErr : new Error("[withPgStrict] connection failed after 3 attempts");
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/**
 * AdPortal compatibility: Sunny's API gateway (lib/api-gateway)
 * imports a `pgPool` object with a .query(text, params) method
 * returning { rows }. Backed by this module's resilient runner.
 * Note pgQuery swallows errors to [] (house behavior); gateway
 * event logging tolerates that.
 */
export const pgPool = {
  query: async <T = Record<string, unknown>>(
    text: string,
    params: unknown[] = [],
  ): Promise<{ rows: T[] }> => ({ rows: await pgQuery<T>(text, params) }),
  end: async (): Promise<void> => {},
};
