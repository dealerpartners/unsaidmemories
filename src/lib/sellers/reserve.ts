// ---------------------------------------------------------------------------
// sellers/reserve.ts — A5/E1 · Reserve management: the reserve POLICY and
// its application.
//
// What existed: the wallet's held bucket (seller_wallets.pending_balance)
// with manual place_hold / release_hold moves at the A5 desk, each an
// audited ledger record. What did not exist: any reserve CONTROL — no
// percentage, no policy, nothing the accrual applies. Reserves were a
// bucket an operator could move money into by hand, never a managed
// reserve. This module is the control:
//
//   POLICY — public.policy_settings, scope "payout_reserve" (the same
//     configuration store the payout-delay policy uses):
//       key "default_percent"  → the tenant-wide reserve percentage
//       key "seller:<uuid>"    → a per-seller override percentage
//     A percentage is a number 0–100 stored as text. Absence means NO
//     reserve is configured — the accrual withholds nothing and says so;
//     no default is invented here.
//
//   APPLICATION — the accrual (lib/sellers/accrual) resolves each
//     seller's percentage at credit time and moves that share of the
//     credit from the wallet's available bucket into the held/reserve
//     bucket, writing the ledger row ('reserve_hold') the A5 pattern
//     established. Release stays the A5 desk's release_hold — one
//     release path, not two.
// ---------------------------------------------------------------------------

type PgClientLike = {
  query: (
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: Record<string, unknown>[] }>;
};

export const PAYOUT_RESERVE_SCOPE = "payout_reserve";
const SELLER_KEY_PREFIX = "seller:";
const money = (n: number) => Math.round(n * 100) / 100;

export interface ReservePolicy {
  defaultPercent: number | null;
  perSeller: Map<string, number>;
}

function parsePercent(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

/** Read the tenant's reserve policy from policy_settings. */
export async function readReservePolicy(
  client: PgClientLike,
  tenantId: string,
): Promise<ReservePolicy> {
  const { rows } = await client.query(
    `SELECT key, value FROM public.policy_settings
      WHERE tenant_id = $1 AND scope = $2
      ORDER BY key ASC`,
    [tenantId, PAYOUT_RESERVE_SCOPE],
  );
  let defaultPercent: number | null = null;
  const perSeller = new Map<string, number>();
  for (const r of rows) {
    const key = String(r.key);
    const pct = parsePercent(r.value);
    if (pct === null) continue;
    if (key === "default_percent") defaultPercent = pct;
    else if (key.startsWith(SELLER_KEY_PREFIX)) {
      perSeller.set(key.slice(SELLER_KEY_PREFIX.length), pct);
    }
  }
  return { defaultPercent, perSeller };
}

/** The percentage that governs one seller: override, else default, else none. */
export function resolveReservePercent(
  policy: ReservePolicy,
  sellerId: string,
): number | null {
  return policy.perSeller.get(sellerId) ?? policy.defaultPercent;
}

/**
 * Write (or clear, with percent === null) a reserve percentage —
 * the tenant default when sellerId is null, else that seller's override.
 */
export async function writeReservePercent(
  client: PgClientLike,
  tenantId: string,
  sellerId: string | null,
  percent: number | null,
  actorId: string | null,
): Promise<void> {
  const key = sellerId ? `${SELLER_KEY_PREFIX}${sellerId}` : "default_percent";
  if (percent === null) {
    await client.query(
      `DELETE FROM public.policy_settings WHERE tenant_id = $1 AND scope = $2 AND key = $3`,
      [tenantId, PAYOUT_RESERVE_SCOPE, key],
    );
    return;
  }
  await client.query(
    `INSERT INTO public.policy_settings (tenant_id, scope, key, value, updated_at, updated_by)
     VALUES ($1, $2, $3, $4, now(), $5::uuid)
     ON CONFLICT (tenant_id, scope, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [tenantId, PAYOUT_RESERVE_SCOPE, key, String(percent), actorId],
  );
}

/**
 * Move `percent` of a fresh wallet credit into the reserve bucket.
 * Runs inside the accrual's transaction, immediately after the earnings
 * credit: the wallet UPDATE is balance-guarded so a concurrent move can
 * never drive the available bucket negative, and the ledger row is the
 * A5 shape ('reserve_hold', amount negative against available,
 * balance_after = the available balance after the move). Returns the
 * amount withheld (0 when no reserve applies).
 */
export async function applyReserveOnCredit(
  client: PgClientLike,
  input: {
    tenantId: string;
    sellerId: string;
    walletId: string;
    creditAmount: number;
    percent: number | null;
  },
): Promise<number> {
  const { tenantId, sellerId, walletId, creditAmount, percent } = input;
  if (percent === null || percent <= 0 || creditAmount <= 0) return 0;
  const withheld = money((creditAmount * percent) / 100);
  if (withheld <= 0) return 0;
  const { rows: updated } = await client.query(
    `UPDATE public.seller_wallets
        SET balance = balance - $3, pending_balance = pending_balance + $3,
            updated_at = now()
      WHERE tenant_id = $1 AND id = $2::uuid AND balance >= $3
      RETURNING balance::float AS balance, pending_balance::float AS pending_balance`,
    [tenantId, walletId, withheld],
  );
  if (updated.length === 0) return 0;
  await client.query(
    `INSERT INTO public.seller_wallet_transactions
       (tenant_id, seller_id, wallet_id, transaction_type, amount, balance_after, notes)
     VALUES ($1, $2::uuid, $3::uuid, 'reserve_hold', $4, $5, $6)`,
    [
      tenantId,
      sellerId,
      walletId,
      -withheld,
      money(Number(updated[0].balance)),
      `Reserve withheld at ${percent}% of earnings accrual (payout_reserve policy)`,
    ],
  );
  return withheld;
}
