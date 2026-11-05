/**
 * pg-ctor / pooled DDL helpers.
 *
 * Two problems live here:
 *
 * 1. INTEROP: with `pg` in `serverExternalPackages`, `await import("pg")`
 *    returns the raw CJS module namespace on Vercel's node runtime — where
 *    `default` is undefined and the real export (`Pool`) sits at the top
 *    level. When the bundler DOES process pg, `default` holds the module
 *    object instead. getPgPool() walks every observed shape and names the
 *    module keys in the thrown error so any future interop change is
 *    diagnosable from the response.
 *
 * 2. STALE POOLER HOSTNAME: the configured DATABASE_URL uses Supabase's
 *    old pooler naming (`aws-0-useast-1.pooler.supabase.com`), which does
 *    not resolve. pgConnectionCandidates() derives the corrected current
 *    naming (`us-east-1`) on both account shards, the transaction-mode
 *    port, and the IPv6 DIRECT_URL as a last resort; getReachablePgPool()
 *    walks the list and returns the first that completes a handshake.
 */

export type PgPool = import("pg").Pool;
export type PgPoolCtor = typeof import("pg").Pool;

export async function getPgPoolCtor(): Promise<PgPoolCtor> {
  const mod = (await import("pg")) as unknown as {
    Pool?: PgPoolCtor;
    default?: unknown;
  };
  const d1 = mod.default as
    | { Pool?: PgPoolCtor; default?: unknown }
    | undefined;
  const d2 = d1?.default as { Pool?: PgPoolCtor } | undefined;
  const ctor = mod.Pool ?? d1?.Pool ?? d2?.Pool;
  if (!ctor) {
    const keys = [
      ...Object.keys(mod),
      ...(d1 ? Object.keys(d1).map((k) => `default.${k}`) : []),
    ].join(", ");
    throw new Error(`pg Pool constructor not found (module keys: ${keys || "none"})`);
  }
  return ctor;
}

export type PgCandidate = { label: string; url: string };

/** The candidate connection strings, most-trusted first. */
export function pgConnectionCandidates(): PgCandidate[] {
  const out: PgCandidate[] = [];
  const dbUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;

  if (dbUrl) {
    out.push({ label: "DATABASE_URL (as configured)", url: dbUrl });

    // Corrected pooler naming: `useast-1` → `us-east-1` (Supabase's current
    // format), on both account shards, session port 5432.
    try {
      const u = new URL(dbUrl);
      const region = u.hostname.replace(/^aws-\d+-/, "").replace("useast-1", "us-east-1");
      if (region && region !== u.hostname) {
        for (const shard of ["aws-0", "aws-1"]) {
          const v = new URL(dbUrl);
          v.hostname = `${shard}-${region}.pooler.supabase.com`;
          v.port = "5432";
          out.push({ label: `pooler ${shard}-${region}:5432 (session)`, url: v.toString() });
        }
        // Transaction-mode port on the primary shard as a later fallback.
        const t = new URL(dbUrl);
        t.hostname = `aws-0-${region}.pooler.supabase.com`;
        t.port = "6543";
        out.push({ label: `pooler aws-0-${region}:6543 (transaction)`, url: t.toString() });
      }
    } catch {
      // DATABASE_URL unparseable — skip the derived variants.
    }
  }

  if (directUrl) out.push({ label: "DIRECT_URL (db host)", url: directUrl });
  return out;
}

export type PgReachable =
  | {
      pool: PgPool;
      label: string;
      attempts: { label: string; ok: boolean; error?: string }[];
    }
  | {
      pool: null;
      label: null;
      attempts: { label: string; ok: boolean; error?: string }[];
    };

/**
 * Walk the candidate list and return the first pool that completes a
 * `connect()`. Every failed candidate's pool is destroyed; the winner is
 * left CONNECTED and must be `end()`ed by the caller. The failure shape
 * still carries the full per-candidate attempts (with error messages) so
 * callers can report WHICH candidate failed and WHY — never a bare
 * "unreachable".
 */
export async function getReachablePgPool(): Promise<PgReachable> {
  const candidates = pgConnectionCandidates();
  const attempts: { label: string; ok: boolean; error?: string }[] = [];
  if (!candidates.length) return { pool: null, label: null, attempts };
  const PoolCtor = await getPgPoolCtor();
  for (const c of candidates) {
    const pool = new PoolCtor({
      connectionString: c.url,
      ssl: { rejectUnauthorized: false },
      max: 1,
      connectionTimeoutMillis: 5000,
    });
    try {
      const client = await pool.connect();
      client.release();
      attempts.push({ label: c.label, ok: true });
      return { pool, label: c.label, attempts };
    } catch (err) {
      await pool.end().catch(() => {});
      attempts.push({
        label: c.label,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { pool: null, label: null, attempts };
}
