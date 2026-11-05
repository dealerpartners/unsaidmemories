// ---------------------------------------------------------------------------
// Category admin — the returns-configuration register (Admin D3 remainders:
// "Category windows" + "Legal minimums").
//
// The register rides public.policy_settings, the platform's designed
// per-tenant configuration store (the payout-delay control's precedent:
// scope is free text — the table carries only its PK plus
// UNIQUE (tenant_id, scope, key); verified firsthand 2026-10-14).
// Scope "returns" holds:
//   window_days:default            -> the platform default return window
//   window_days:category:<nodeId>  -> a category's return window (days)
//   legal_minimum_days:category:<nodeId>
//                                  -> the legal-minimum return window
//                                     recorded for a category (days)
// Values are TEXT day counts. A value that is not a non-negative integer
// is NOT honored (reads as unconfigured) — the payout-delay discipline:
// out-of-set stored values derive "unconfigured", never a number.
//
// NOTHING here invents a figure: the register is empty until an admin
// records real values (legal minimums are legal facts the business
// supplies, never statutory numbers an agent guesses). Consumption —
// the seller return-rule evaluation reading these windows — is a named
// follow-on; this register is the recorded source it will read.
// ---------------------------------------------------------------------------

export const RETURNS_CONFIG_SCOPE = "returns";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export function returnWindowKey(nodeId: string | null): string {
  return nodeId ? `window_days:category:${nodeId}` : "window_days:default";
}

export function legalMinimumKey(nodeId: string): string {
  return `legal_minimum_days:category:${nodeId}`;
}

/** A stored value counts only when it is a non-negative integer day count. */
export function parseDayCount(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!/^\d{1,5}$/.test(s)) return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 && n <= 3650 ? n : null;
}

export type ReturnsCategoryConfig = {
  /** The platform default window (window_days:default), or null. */
  defaultWindowDays: number | null;
  /** Per-category records, keyed by taxonomy node id. */
  categories: Map<
    string,
    { windowDays: number | null; legalMinimumDays: number | null }
  >;
};

type PgClientLike = {
  query: (
    sql: string,
    params?: unknown[]
  ) => Promise<{ rows: Record<string, unknown>[] }>;
};

/** Read the tenant's full returns-configuration register. */
export async function readReturnsConfig(
  c: PgClientLike,
  tenantId: string
): Promise<ReturnsCategoryConfig> {
  const { rows } = await c.query(
    `SELECT key, value FROM public.policy_settings
      WHERE tenant_id = $1 AND scope = $2`,
    [tenantId, RETURNS_CONFIG_SCOPE]
  );
  const out: ReturnsCategoryConfig = {
    defaultWindowDays: null,
    categories: new Map(),
  };
  for (const r of rows) {
    const key = String(r.key);
    const days = parseDayCount(r.value);
    if (key === "window_days:default") {
      out.defaultWindowDays = days;
      continue;
    }
    const win = key.match(/^window_days:category:(.+)$/);
    const min = key.match(/^legal_minimum_days:category:(.+)$/);
    const nodeId = win?.[1] ?? min?.[1];
    if (!nodeId || !isUuid(nodeId)) continue;
    const entry = out.categories.get(nodeId) ?? {
      windowDays: null,
      legalMinimumDays: null,
    };
    if (win) entry.windowDays = days;
    if (min) entry.legalMinimumDays = days;
    out.categories.set(nodeId, entry);
  }
  return out;
}
