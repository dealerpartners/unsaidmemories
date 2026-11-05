// ---------------------------------------------------------------------------
// Seller earnings accrual + statement generation — the WRITER the money
// desks were missing (built 2026-10-15, Admin seller-money section).
//
// Census that forced this module: every seller-money store (wallets,
// payouts, statements) was designed and every desk (A5 standing, E1
// oversight, E2 fees, E3 tax register, Trust Center payout delay) reads
// them — but NOTHING anywhere wrote an earnings record. No order
// pipeline credited a wallet, no run created a payout, no generator
// produced a statement. The desks read zero because zero was all that
// had ever been recorded.
//
// THE SOURCE, as it actually exists in the schema:
//   public.commerce_orders — the shop's order record. A marketplace
//   order belongs to a seller when metadata->>'seller_id' names that
//   seller (the seller orders read keys on exactly this). An order is
//   earnable when payment_status = 'paid' AND fulfillment_status =
//   'delivered' AND its status is not a cancelled/refunded void.
//   Money is TEXT dollars on this table ("$102.00"); the amount is the
//   FIRST number in total_amount (falling back to subtotal), parsed in
//   SQL — ranges never concatenate. (The parse pattern's decimal group
//   is NON-capturing on purpose: with a capturing group, regexp_match
//   returns the group — ".00" — instead of the whole match.)
//
// WHAT AN ACCRUAL RUN DOES (one transaction per run):
//   1. Claims the tenant's un-accrued earnable orders (SELECT … FOR
//      UPDATE; an order is accrued when its metadata carries
//      earnings_accrued_at — the stamp is the idempotency key, so a
//      re-run is a no-op, never a double credit).
//   2. Per seller, resolves EVERY fee type the platform strips
//      (agency model: the platform is Merchant of Record and strips
//      its fees from the platform balance before the net passes).
//      For each of the five schedule types (referral, fulfillment,
//      storage, advertising, payment_processing):
//        a. an effective seller_fee_schedules row of that type for
//           this seller (seller-specific beats tenant default;
//           category-scoped rows do not apply to whole-order
//           accrual), else
//        b. the tenant-default row of that type, else
//        c. no fee for that type — recorded as source 'none', never
//           invented. A type with no active schedule charges nothing.
//      REFERRAL alone keeps its legacy fallback: when no referral
//      schedule exists, sellers.commission_rate applies (source
//      'commission_rate'). No other type falls back to it.
//      SEMANTICS PER TYPE (the schedule store carries only rate /
//      flat_amount, so the basis is the type's own):
//        referral, fulfillment, advertising, payment_processing —
//          PER ORDER: rate % of the order total, else the flat
//          amount per order (capped at the order total), exactly
//          the pattern the referral fee has always used.
//        storage — PER PERIOD: charged once per accrual run for
//          the seller (rate % of the run's gross, else the flat
//          amount once, capped at the run's gross), then allocated
//          across the run's orders pro-rata by order total (final
//          order absorbs rounding) so per-order stamps and period
//          statements sum exactly to the run's fees.
//      A rate row charges rate × order total; a flat row charges its
//      flat_amount per order (capped at the order total). UNITS, as the
//      stores themselves define them: seller_fee_schedules.rate is a
//      PERCENT (the E2 page's form labels it "Rate (%)" and its table
//      renders "12.50%"), while sellers.commission_rate is a 0..1
//      FRACTION (its CHECK). The two are converted accordingly —
//      confusing them would misprice every fee by 100×.
//   3. Writes ONE seller_payouts record per seller for the run
//      (status 'pending' — the E1 desk's review vocabulary), amount =
//      gross − fees, scheduled_at = run time + the seller's payout
//      delay from the Trust Center policy (deriveSellerPayoutDelay:
//      tier band → default band). When no delay is configured the
//      schedule is left NULL and the run reports it — no delay is
//      promised that policy never set. The payout is linked to the
//      seller's default active payment method when one is on file.
//   4. Credits the seller's wallet available balance by the net and
//      writes the seller_wallet_transactions ledger row ('earnings').
//      The wallet row is born here if none exists (the A5 pattern).
//   5. Stamps every claimed order's metadata with earnings_accrued_at,
//      earnings_fee, and earnings_payout_id.
//   Zero/negative-net sellers are stamped but get no payout and no
//   credit (nothing to disburse); the run summary counts them.
//
// STATEMENTS (generateSellerStatements): one seller_statements row per
// seller per period, aggregated from the orders ACCRUED in the period
// (gross = order totals, fees = the stamped per-order fees, net =
// gross − fees; status takes the table's own 'generated' default).
// A seller who already has a statement for the exact period is
// skipped — regeneration never duplicates. statement_url stays NULL:
// the artifact store for generated statements does not exist yet, and
// a URL is never invented.
//
// DESTINATION-CHARGED ORDERS (BL-1, 2026-10-23): when shop checkout
// charged a single-seller order as a Stripe destination charge (the
// payload-library model: application fee stripped at the charge, net
// transferred to the seller's connected account at charge time), the
// order carries metadata.destination_charge with the fee Stripe
// actually stripped. Such an order is accrued RECORD-ONLY here: it is
// stamped (earnings_fee = the stripped application fee, as dollars;
// earnings_fees records it as the referral fee, the fee the
// application fee is) so statements and per-order records stay
// complete — but it creates NO payout and NO wallet credit, because
// the platform never held its net. Paying it again through the
// collect-then-transfer leg would pay the seller twice. Orders
// without the stamp flow through the full netting below, unchanged.

// SETTLEMENT-OWNED ORDERS (contract step 11, 2026-10-25): orders
// whose finalization recorded per-seller settlements on the collect
// leg (lib/settlement — seller_settlements) are stamped
// metadata.settlement_owned and are EXCLUDED from this claim: the
// settlement layer owns their per-order money (records at
// finalization, transfers through the payout pipeline), and this
// engine paying them again would pay the seller twice. Destination-
// charge orders are NOT settlement-owned — they keep the record-only
// treatment above. Refund apportionment against settled orders
// lives in lib/settlement (seller_settlement_reversals), closing the
// clawback gap named below for settlement-owned orders; a refund on
// an order accrued HERE (pre-settlement orders) is still handled by
// an A5 hold, recorded by hand.
//
// NOT HERE, named rather than faked: disbursement itself (the Trust
// Center Connect follow-on owns it; these records are what it will
// execute against).
// ---------------------------------------------------------------------------

import { writeSellerAudit } from "@/lib/sellers/audit";
import {
  readPayoutDelayPolicy,
  deriveSellerPayoutDelay,
} from "@/lib/sellers/payout-delay";
import {
  readReservePolicy,
  resolveReservePercent,
  applyReserveOnCredit,
} from "@/lib/sellers/reserve";

type Client = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;
};

const FIRST_NUMBER = `(regexp_match(COALESCE(NULLIF(o.total_amount, ''), o.subtotal, ''), '[0-9]+(?:\\.[0-9]+)?'))[1]`;

function money(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export const FEE_TYPES = [
  "referral",
  "fulfillment",
  "storage",
  "advertising",
  "payment_processing",
] as const;
export type FeeType = (typeof FEE_TYPES)[number];
export type FeeSource =
  | "seller_schedule"
  | "default_schedule"
  | "commission_rate"
  | "none";

export type AccrualSellerResult = {
  seller_id: string;
  seller_name: string;
  orders: number;
  /** Destination-charged orders recorded (not netted) in this run —
   *  their nets moved at charge time; see the module header. */
  destination_orders: number;
  /** Application fees Stripe stripped on those orders (dollars) —
   *  recorded as their referral fee; never part of gross/fees/net,
   *  which describe only the platform-collected leg. */
  destination_fees: number;
  gross: number;
  fees: number;
  net: number;
  /** The referral fee's source — kept for the E1 desk's summary. */
  fee_source: FeeSource;
  /** Total charged per fee type for this seller in this run. */
  fee_breakdown: Record<FeeType, number>;
  /** Where each fee type's charge came from ('none' = no active
   *  schedule for that type, so nothing was charged for it). */
  fee_sources: Record<FeeType, FeeSource>;
  payout_id: string | null;
  delay_days: number | null;
  delay_source: string;
  /** The reserve percentage the payout_reserve policy applied to this
   *  credit (null = no reserve configured) and the amount withheld into
   *  the wallet's held bucket — the A5/E1 reserve control. */
  reserve_percent: number | null;
  reserve_withheld: number;
};

export type ResolvedFee = {
  source: FeeSource;
  /** Schedule PERCENT scale (seller_fee_schedules.rate units). */
  rate: number | null;
  /** Flat amount in DOLLARS (seller_fee_schedules.flat_amount units). */
  flat: number | null;
};

const NO_FEE: ResolvedFee = { source: "none", rate: null, flat: null };

/** One fee's amount on one money basis: rate % of the basis when a
 *  rate is set, else the flat amount capped at the basis — the exact
 *  computation the referral fee has always used. */
export function feeOnBasis(fee: ResolvedFee, basis: number): number {
  if (fee.rate !== null) return money(basis * (fee.rate / 100));
  if (fee.flat !== null) return Math.min(money(fee.flat), basis);
  return 0;
}

/**
 * THE fee resolution — one definition for every surface that strips
 * platform fees from a seller's money (this accrual engine, the
 * destination-charge resolver in lib/sellers/connect, and the
 * per-order settlement writer in lib/settlement). Per fee type:
 * seller schedule -> tenant-default schedule -> none. Category-scoped
 * rows never apply to a whole-order computation. REFERRAL alone
 * falls back to the seller's commission_rate when it has no schedule
 * (its legacy behavior); no other type falls back to it, and a type
 * with no active schedule charges nothing — a rate is never invented.
 */
export async function resolveSellerFeeSchedules(
  client: Client,
  tenantId: string,
  sellerId: string,
  commissionRate: number | null | undefined,
): Promise<Record<FeeType, ResolvedFee>> {
  const resolved = {} as Record<FeeType, ResolvedFee>;
  for (const feeType of FEE_TYPES) {
    const { rows: feeRows } = await client.query(
      `SELECT seller_id, rate::float AS rate, flat_amount::float AS flat_amount
         FROM public.seller_fee_schedules
        WHERE tenant_id = $1 AND fee_type = $3 AND category_id IS NULL
          AND (seller_id = $2::uuid OR seller_id IS NULL)
          AND (effective_from IS NULL OR effective_from <= CURRENT_DATE)
          AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
        ORDER BY (seller_id IS NULL) ASC, created_at DESC
        LIMIT 1`,
      [tenantId, sellerId, feeType],
    );
    const feeRow = feeRows[0];
    resolved[feeType] =
      feeRow && (feeRow.rate !== null || feeRow.flat_amount !== null)
        ? {
            source: feeRow.seller_id ? "seller_schedule" : "default_schedule",
            rate: feeRow.rate !== null ? Number(feeRow.rate) : null,
            flat: feeRow.flat_amount !== null ? Number(feeRow.flat_amount) : null,
          }
        : NO_FEE;
  }
  if (
    resolved.referral.source === "none" &&
    commissionRate !== null &&
    commissionRate !== undefined
  ) {
    // commission_rate is a 0..1 FRACTION (its CHECK) — converted to
    // the schedule PERCENT scale so feeOnBasis applies uniformly.
    resolved.referral = {
      source: "commission_rate",
      rate: Number(commissionRate) * 100,
      flat: null,
    };
  }
  return resolved;
}

export type AccrualSummary = {
  sellers: AccrualSellerResult[];
  orders_accrued: number;
  /** Orders accrued record-only because checkout destination-charged
   *  them (subset of orders_accrued). */
  destination_orders: number;
  total_net: number;
  zero_net_sellers: number;
  delay_unconfigured_sellers: number;
  /** Earnable orders whose recorded amount could not be parsed —
   *  never stamped, never silently dropped: the run reports them. */
  unparseable_orders: number;
};

export async function accrueSellerEarnings(
  client: Client,
  tenantId: string,
  actor: { actorId: string | null; ipAddress: string | null },
): Promise<AccrualSummary> {
  const policy = await readPayoutDelayPolicy(client as any, tenantId);
  const reservePolicy = await readReservePolicy(client as any, tenantId);

  // Claim the earnable, un-accrued orders for this tenant. The
  // destination-charge stamp rides along: a stamped order's fee is
  // the application fee Stripe stripped at charge time (cents, as
  // recorded by checkout / the webhook backfill) — it is recorded,
  // never re-computed or re-charged here.
  const { rows: orders } = await client.query(
    `SELECT o.id, o.metadata->>'seller_id' AS seller_id,
            ${FIRST_NUMBER}::numeric AS total,
            (o.metadata#>>'{destination_charge,application_fee_cents}')::numeric AS dest_fee_cents
       FROM public.commerce_orders o
       JOIN public.sellers s
         ON s.id::text = o.metadata->>'seller_id' AND s.tenant_id = o.tenant_id
      WHERE o.tenant_id = $1
        AND o.payment_status = 'paid'
        AND o.fulfillment_status = 'delivered'
        AND lower(o.status) NOT IN ('cancelled', 'canceled', 'refunded', 'void')
        AND o.metadata->>'earnings_accrued_at' IS NULL
        AND o.metadata->>'settlement_owned' IS NULL
        AND ${FIRST_NUMBER} IS NOT NULL
      ORDER BY o.created_at ASC
      FOR UPDATE OF o`,
    [tenantId],
  );

  const summary: AccrualSummary = {
    sellers: [],
    orders_accrued: 0,
    destination_orders: 0,
    total_net: 0,
    zero_net_sellers: 0,
    delay_unconfigured_sellers: 0,
    unparseable_orders: 0,
  };
  {
    const { rows: bad } = await client.query(
      `SELECT count(*)::int AS n
         FROM public.commerce_orders o
         JOIN public.sellers s
           ON s.id::text = o.metadata->>'seller_id' AND s.tenant_id = o.tenant_id
        WHERE o.tenant_id = $1
          AND o.payment_status = 'paid'
          AND o.fulfillment_status = 'delivered'
          AND lower(o.status) NOT IN ('cancelled', 'canceled', 'refunded', 'void')
          AND o.metadata->>'earnings_accrued_at' IS NULL
          AND o.metadata->>'settlement_owned' IS NULL
          AND ${FIRST_NUMBER} IS NULL`,
      [tenantId],
    );
    summary.unparseable_orders = Number(bad[0]?.n || 0);
  }
  if (orders.length === 0) return summary;

  const bySeller = new Map<
    string,
    { id: string; total: number; destFeeCents: number | null }[]
  >();
  for (const o of orders) {
    const list = bySeller.get(String(o.seller_id)) ?? [];
    list.push({
      id: String(o.id),
      total: money(o.total),
      destFeeCents:
        o.dest_fee_cents === null || o.dest_fee_cents === undefined
          ? null
          : Number(o.dest_fee_cents),
    });
    bySeller.set(String(o.seller_id), list);
  }

  for (const [sellerId, claimedOrders] of bySeller) {
    // Partition the claim: destination-charged orders are recorded
    // only (below); the platform-collected remainder flows through
    // the full fee netting, exactly as before.
    const destOrders = claimedOrders.filter((o) => o.destFeeCents !== null);
    const sellerOrders = claimedOrders.filter((o) => o.destFeeCents === null);
    const destinationFees = money(
      destOrders.reduce((sum, o) => sum + (o.destFeeCents ?? 0), 0) / 100,
    );
    const { rows: sellerRows } = await client.query(
      `SELECT display_name, commission_rate::float AS commission_rate
         FROM public.sellers WHERE tenant_id = $1 AND id = $2::uuid`,
      [tenantId, sellerId],
    );
    const seller = sellerRows[0];
    if (!seller) continue;

    // Fee resolution, per type — THE shared resolver above (seller
    // schedule -> tenant-default schedule -> none; referral alone
    // falls back to the seller's commission_rate).
    const resolved = await resolveSellerFeeSchedules(
      client,
      tenantId,
      sellerId,
      seller.commission_rate,
    );
    const feeSource = resolved.referral.source;

    // Per-order types charge on every order in the run; storage is
    // per-period and is charged once below, after gross is known.
    const PER_ORDER_TYPES: FeeType[] = [
      "referral",
      "fulfillment",
      "advertising",
      "payment_processing",
    ];
    let gross = 0;
    let fees = 0;
    const feeBreakdown = {} as Record<FeeType, number>;
    for (const t of FEE_TYPES) feeBreakdown[t] = 0;
    const perOrder: { id: string; fee: number; byType: Record<FeeType, number> }[] = [];
    for (const o of sellerOrders) {
      const byType = {} as Record<FeeType, number>;
      for (const t of FEE_TYPES) byType[t] = 0;
      let fee = 0;
      for (const t of PER_ORDER_TYPES) {
        const amount = feeOnBasis(resolved[t], o.total);
        byType[t] = amount;
        feeBreakdown[t] = money(feeBreakdown[t] + amount);
        fee = money(fee + amount);
      }
      perOrder.push({ id: o.id, fee, byType });
      gross = money(gross + o.total);
      fees = money(fees + fee);
    }

    // Storage — PER PERIOD: a single charge for this accrual run
    // (rate % of the run's gross, else the flat amount once, capped
    // at the run's gross), never multiplied per order. It is then
    // allocated across the run's orders pro-rata by order total —
    // the final order absorbs rounding — so each order's stamped
    // earnings_fee / earnings_fees and the period statements built
    // from those stamps sum exactly to the run's total fees.
    const storageFee = feeOnBasis(resolved.storage, gross);
    if (storageFee > 0 && gross > 0) {
      feeBreakdown.storage = storageFee;
      fees = money(fees + storageFee);
      let allocated = 0;
      perOrder.forEach((o, i) => {
        const share =
          i === perOrder.length - 1
            ? money(storageFee - allocated)
            : money(storageFee * (sellerOrders[i].total / gross));
        allocated = money(allocated + share);
        o.byType.storage = share;
        o.fee = money(o.fee + share);
      });
    }
    const net = money(gross - fees);

    const delay = await deriveSellerPayoutDelay(client as any, tenantId, sellerId, policy);
    if (delay.delayDays === null) summary.delay_unconfigured_sellers += 1;

    let payoutId: string | null = null;
    const reservePercent = resolveReservePercent(reservePolicy, sellerId);
    let reserveWithheld = 0;
    if (net > 0) {
      const { rows: methodRows } = await client.query(
        `SELECT id FROM public.seller_payment_methods
          WHERE tenant_id = $1 AND seller_id = $2::uuid AND status = 'active'
          ORDER BY is_default DESC, created_at DESC LIMIT 1`,
        [tenantId, sellerId],
      );
      const { rows: payoutRows } = await client.query(
        `INSERT INTO public.seller_payouts
           (tenant_id, seller_id, amount, status, payout_method_id, scheduled_at)
         VALUES ($1, $2::uuid, $3, 'pending', $4::uuid,
                 CASE WHEN $5::int IS NULL THEN NULL
                      ELSE now() + ($5::int || ' days')::interval END)
         RETURNING id`,
        [tenantId, sellerId, net, methodRows[0]?.id ?? null, delay.delayDays],
      );
      payoutId = String(payoutRows[0].id);

      // Credit the wallet's available bucket + ledger row (A5 pattern:
      // the wallet is born on first use; the schema has no unique
      // (tenant, seller) constraint, so create-if-absent is explicit).
      await client.query(
        `INSERT INTO public.seller_wallets (tenant_id, seller_id)
         SELECT $1, $2::uuid
          WHERE NOT EXISTS (
            SELECT 1 FROM public.seller_wallets
             WHERE tenant_id = $1 AND seller_id = $2::uuid)`,
        [tenantId, sellerId],
      );
      const { rows: walletRows } = await client.query(
        `UPDATE public.seller_wallets
            SET balance = balance + $3, updated_at = now()
          WHERE tenant_id = $1 AND seller_id = $2::uuid
          RETURNING id, balance::float AS balance`,
        [tenantId, sellerId, net],
      );
      const wallet = walletRows[0];
      await client.query(
        `INSERT INTO public.seller_wallet_transactions
           (tenant_id, seller_id, wallet_id, transaction_type, amount, balance_after, notes)
         VALUES ($1, $2::uuid, $3::uuid, 'earnings', $4, $5, $6)`,
        [
          tenantId,
          sellerId,
          wallet.id,
          net,
          money(wallet.balance),
          `Earnings accrual — ${sellerOrders.length} delivered order${sellerOrders.length === 1 ? "" : "s"}`,
        ],
      );
      // Reserve control (A5/E1): the payout_reserve policy's share of
      // this credit moves into the wallet's held bucket with its own
      // ledger row. No configured percentage = nothing withheld. The
      // reserve rides the platform-collected credit only — a
      // destination-charged claim never lands in this wallet (BL-1).
      reserveWithheld = await applyReserveOnCredit(client as any, {
        tenantId,
        sellerId,
        walletId: String(wallet.id),
        creditAmount: net,
        percent: reservePercent,
      });
    } else if (sellerOrders.length > 0) {
      // Zero-net counts only platform-collected claims: a seller whose
      // claim was entirely destination-charged was already paid by the
      // charge — they are not a zero-net case.
      summary.zero_net_sellers += 1;
    }

    // Stamp the orders: the accrual record that makes re-runs no-ops
    // and feeds statement generation.
    for (const o of perOrder) {
      await client.query(
        `UPDATE public.commerce_orders
            SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                  'earnings_accrued_at', to_jsonb(now()),
                  'earnings_fee', to_jsonb($3::numeric),
                  'earnings_fees', $5::jsonb,
                  'earnings_payout_id', to_jsonb($4::text)),
                updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [tenantId, o.id, o.fee, payoutId, JSON.stringify(o.byType)],
      );
    }

    // Destination-charged orders: RECORD-ONLY stamps (see the module
    // header). earnings_fee is the application fee Stripe stripped, in
    // dollars; earnings_fees records it as the referral fee — the fee
    // the application fee is — with every other type at zero (nothing
    // else was charged on this leg). earnings_payout_id is NULL: no
    // payout exists or ever will for this order on this platform.
    for (const o of destOrders) {
      const feeDollars = money((o.destFeeCents ?? 0) / 100);
      const byType: Record<FeeType, number> = {
        referral: feeDollars,
        fulfillment: 0,
        storage: 0,
        advertising: 0,
        payment_processing: 0,
      };
      await client.query(
        `UPDATE public.commerce_orders
            SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                  'earnings_accrued_at', to_jsonb(now()),
                  'earnings_fee', to_jsonb($3::numeric),
                  'earnings_fees', $4::jsonb,
                  'earnings_payout_id', to_jsonb(NULL::text),
                  'earnings_via', to_jsonb('destination_charge'::text)),
                updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [tenantId, o.id, feeDollars, JSON.stringify(byType)],
      );
    }

    await writeSellerAudit(client as any, {
      tenantId,
      sellerId,
      actorId: actor.actorId,
      ipAddress: actor.ipAddress,
      action: "payout.earnings_accrued",
      entityType: "seller_payout",
      entityId: payoutId,
      afterState: {
        orders: claimedOrders.length,
        destination_orders: destOrders.length,
        destination_fees: destinationFees,
        gross,
        fees,
        net,
        fee_source: feeSource,
        fee_breakdown: feeBreakdown,
        fee_sources: Object.fromEntries(
          FEE_TYPES.map((t) => [t, resolved[t].source]),
        ),
        delay_days: delay.delayDays,
        delay_source: delay.source,
        reserve_percent: reservePercent,
        reserve_withheld: reserveWithheld,
      },
    });

    summary.sellers.push({
      seller_id: sellerId,
      seller_name: String(seller.display_name || ""),
      orders: claimedOrders.length,
      destination_orders: destOrders.length,
      destination_fees: destinationFees,
      gross,
      fees,
      net,
      fee_source: feeSource,
      fee_breakdown: feeBreakdown,
      fee_sources: Object.fromEntries(
        FEE_TYPES.map((t) => [t, resolved[t].source]),
      ) as Record<FeeType, FeeSource>,
      payout_id: payoutId,
      delay_days: delay.delayDays,
      delay_source: delay.source,
      reserve_percent: reservePercent,
      reserve_withheld: reserveWithheld,
    });
    summary.orders_accrued += claimedOrders.length;
    summary.destination_orders += destOrders.length;
    summary.total_net = money(summary.total_net + Math.max(net, 0));
  }
  return summary;
}

export type StatementSummary = {
  generated: { seller_id: string; seller_name: string; gross: number; fees: number; net: number }[];
  skipped_existing: number;
  period_start: string;
  period_end: string;
};

export async function generateSellerStatements(
  client: Client,
  tenantId: string,
  periodStart: string,
  periodEnd: string,
  actor: { actorId: string | null; ipAddress: string | null },
): Promise<StatementSummary> {
  const { rows: agg } = await client.query(
    `SELECT s.id AS seller_id, s.display_name,
            COALESCE(SUM(${FIRST_NUMBER}::numeric), 0)::float AS gross,
            COALESCE(SUM((o.metadata->>'earnings_fee')::numeric), 0)::float AS fees
       FROM public.commerce_orders o
       JOIN public.sellers s
         ON s.id::text = o.metadata->>'seller_id' AND s.tenant_id = o.tenant_id
      WHERE o.tenant_id = $1
        AND o.metadata->>'earnings_accrued_at' IS NOT NULL
        AND (o.metadata->>'earnings_accrued_at')::timestamptz::date BETWEEN $2::date AND $3::date
      GROUP BY s.id, s.display_name
      ORDER BY s.display_name`,
    [tenantId, periodStart, periodEnd],
  );

  const out: StatementSummary = {
    generated: [],
    skipped_existing: 0,
    period_start: periodStart,
    period_end: periodEnd,
  };
  for (const r of agg) {
    const gross = money(r.gross);
    const fees = money(r.fees);
    const net = money(gross - fees);
    const { rows: existing } = await client.query(
      `SELECT id FROM public.seller_statements
        WHERE tenant_id = $1 AND seller_id = $2::uuid
          AND period_start = $3::date AND period_end = $4::date
        LIMIT 1`,
      [tenantId, r.seller_id, periodStart, periodEnd],
    );
    if (existing.length > 0) {
      out.skipped_existing += 1;
      continue;
    }
    const { rows: inserted } = await client.query(
      `INSERT INTO public.seller_statements
         (tenant_id, seller_id, period_start, period_end, gross, fees, net)
       VALUES ($1, $2::uuid, $3::date, $4::date, $5, $6, $7)
       RETURNING id`,
      [tenantId, r.seller_id, periodStart, periodEnd, gross, fees, net],
    );
    await writeSellerAudit(client as any, {
      tenantId,
      sellerId: String(r.seller_id),
      actorId: actor.actorId,
      ipAddress: actor.ipAddress,
      action: "statement.generated",
      entityType: "seller_statement",
      entityId: String(inserted[0].id),
      afterState: { period_start: periodStart, period_end: periodEnd, gross, fees, net },
    });
    out.generated.push({
      seller_id: String(r.seller_id),
      seller_name: String(r.display_name || ""),
      gross,
      fees,
      net,
    });
  }
  return out;
}
