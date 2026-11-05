// ---------------------------------------------------------------------------
// settlement/settlement.ts — seller settlement records, transfer
// execution, and refund apportionment (Marketplace Closed-Loop
// Commerce contract, step 11). The pure math lives in ./core; this
// module is the SQL store + Stripe orchestration, mirroring the
// fulfillment plan/label split (steps 8–9).
//
// WHY THIS LAYER EXISTS (inventory, 2026-10-25): the platform's money
// chain was built for ONE seller per order. Checkout stamps a single
// metadata.seller_id (or splits the order into per-seller children);
// the accrual engine (lib/sellers/accrual) claims only orders
// carrying that stamp, so a multi-seller order accrued to NO ONE; the
// payout desk executes approved seller_payouts through Connect
// transfers (lib/sellers/payout-execution); and refunds had no
// per-seller record to apportion against at all (accrual's header
// names refund clawbacks as not built). This module is the missing
// per-(order, seller) layer, built ON that machinery — never beside
// it:
//   · fees resolve through the accrual engine's OWN resolver
//     (resolveSellerFeeSchedules: seller schedule -> tenant default
//     -> sellers.commission_rate fallback -> none). No new rate, no
//     app_settings key — the configured rate already existed.
//   · transfers execute through the platform payout pipeline's rules:
//     the payout mode gate (lib/payments/execution-gate — live keys
//     refused outside production), the recorded payout-delay policy
//     (deriveSellerPayoutDelay sets execute_after), seller_stripe_
//     accounts preflight, the balanced GL entry (Dr seller payable
//     2100 / Cr cash 1000 — the same accounts payout-execution uses),
//     the seller audit row, and the seller notification.
//   · every order gets exactly ONE money path: orders recorded here
//     on the collect leg are stamped metadata.settlement_owned and
//     the accrual claim excludes them. Destination-charge orders are
//     recorded (state 'settled' — their net moved at charge time)
//     but NOT settlement-owned: accrual keeps its record-only stamps
//     for them, and no transfer is ever created here for them.
//
// PRE-CUTOVER: until migration 20261197 is applied live, the probe
// reports the store absent and every entry point no-ops honestly
// (the steps 7–10 pattern).
//
// IDEMPOTENCY: the settlement row's UNIQUE (tenant, order, seller)
// is the record identity; the Stripe transfer carries idempotency
// key 'settlement-transfer:<order>:<seller>', so a re-driven
// finalization, a retried sweep, or two concurrent executors resolve
// to the SAME transfer. A settlement whose transfer landed but whose
// ledger leg failed keeps stripe_transfer_id + state 'pending' —
// the next pass REPAIRS it (completes the ledger, creates nothing),
// the payout-execution pattern. Refund reversals key on (tenant,
// stripe refund, settlement) with their own provider idempotency
// keys, and every cap is computed against cumulative reversals, so
// partial refunds accumulate and never over-reverse.
// ---------------------------------------------------------------------------

import Stripe from "stripe"
import { postBalancedJournalEntry } from "@/lib/accounting/journal"
import { PayoutExecutionError, payoutModeGate } from "@/lib/payments/execution-gate"
import { resolveSellerFeeSchedules, type FeeType } from "@/lib/sellers/accrual"
import { moneyToCents, type SellerQueryFn } from "@/lib/sellers/attribution"
import { resolveLineSellers, sellerQueryFnForPgClient } from "@/lib/sellers/order-split"
import { deriveSellerPayoutDelay } from "@/lib/sellers/payout-delay"
import { writeSellerAudit } from "@/lib/sellers/audit"
import {
  computeSettlementAmounts,
  connectBlockFor,
  destinationSettlementAmounts,
  executionDecisionFor,
  planRefundApportionment,
  settlementReversalKey,
  settlementTransferKey,
  sharesFromLegacyLines,
  sharesFromSnapshot,
  type ResolvedFeeInput,
  type SellerShare,
  type SettlementAmounts,
  type SettlementFeeType,
  type SettlementForRefund,
} from "./core"

export { PayoutExecutionError }

type PgClient = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>
}

export interface StripeSettlementClient {
  transfers: {
    create: (
      params: Record<string, unknown>,
      options?: { idempotencyKey?: string },
    ) => Promise<{ id: string }>
    createReversal: (
      transferId: string,
      params: Record<string, unknown>,
      options?: { idempotencyKey?: string },
    ) => Promise<{ id: string }>
  }
}

let _stripe: Stripe | null = null
function defaultStripe(): StripeSettlementClient {
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
  return _stripe as unknown as StripeSettlementClient
}

// ---------------------------------------------------------------------------
// Store probe (pre-cutover degradation)
// ---------------------------------------------------------------------------

export async function probeSettlementStore(q: SellerQueryFn): Promise<boolean> {
  try {
    const rows = await q(
      `SELECT to_regclass('public.seller_settlements') AS settlements,
              to_regclass('public.seller_settlement_reversals') AS reversals`,
      [],
    )
    return !!rows?.[0]?.settlements && !!rows?.[0]?.reversals
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseMetadata(raw: unknown): Record<string, any> {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, any>
    } catch {
      return {}
    }
  }
  if (raw && typeof raw === "object") return raw as Record<string, any>
  return {}
}

function clientShim(q: SellerQueryFn): PgClient {
  return {
    query: async (text, params) => ({ rows: await q(text, params as unknown[]) }),
  }
}

/** The accrual resolver's output (rate PERCENT / flat DOLLARS) in the
 *  settlement core's normalized shape (rate PERCENT / flat CENTS) —
 *  the single conversion point between the two money units. */
function toCoreFees(
  resolved: Record<FeeType, { source: string; rate: number | null; flat: number | null }>,
): Record<SettlementFeeType, ResolvedFeeInput> {
  const out = {} as Record<SettlementFeeType, ResolvedFeeInput>
  for (const t of Object.keys(resolved) as FeeType[]) {
    const f = resolved[t]
    out[t as SettlementFeeType] = {
      source: f.source as ResolvedFeeInput["source"],
      ratePct: f.rate !== null ? Number(f.rate) : null,
      flatCents: f.flat !== null ? Math.round(Number(f.flat) * 100) : null,
    }
  }
  return out
}

interface OrderForSettlement {
  id: string
  tenantId: string
  metadata: Record<string, any>
}

// ---------------------------------------------------------------------------
// RECORD — at order finalization, one settlement per seller with
// lines on the order.
// ---------------------------------------------------------------------------

export interface RecordSettlementsResult {
  available: boolean
  recorded: number
  existing: number
  destination: boolean
  /** Set when the order could not be attributed honestly (a line
   *  resolving to more than one seller): nothing is recorded, the
   *  same refusal the checkout split makes. */
  blocked?: "ambiguous" | "order-missing" | "no-lines"
  sellerIds: string[]
}

export async function recordOrderSettlements(
  client: PgClient,
  args: { tenantId: string; orderId: string },
): Promise<RecordSettlementsResult> {
  const q = sellerQueryFnForPgClient(client)
  const empty: RecordSettlementsResult = {
    available: false,
    recorded: 0,
    existing: 0,
    destination: false,
    sellerIds: [],
  }
  if (!(await probeSettlementStore(q))) return empty

  const orderRows = await q(
    `SELECT id::text AS id, tenant_id::text AS tenant_id, metadata
       FROM public.commerce_orders
      WHERE id::text = $1
      LIMIT 1`,
    [args.orderId],
  )
  const orderRow = orderRows[0]
  if (!orderRow) return { ...empty, available: true, blocked: "order-missing" }
  const order: OrderForSettlement = {
    id: String(orderRow.id),
    tenantId: String(orderRow.tenant_id || args.tenantId),
    metadata: parseMetadata(orderRow.metadata),
  }
  const tenantId = order.tenantId
  const meta = order.metadata
  const discountCents = Math.max(0, Math.trunc(Number(meta.discount_cents || 0)))

  // ---- Split children: the seller's fulfillment record of this
  //      order, when checkout (or the paid-time backfill) split it.
  const childRows = await q(
    `SELECT id::text AS id, metadata->>'seller_id' AS seller_id
       FROM public.commerce_orders
      WHERE metadata->>'split_from' = $1
        AND metadata->>'split_by' = 'checkout'`,
    [args.orderId],
  )
  const childBySeller = new Map<string, string>()
  for (const r of childRows) {
    const sid = String(r.seller_id || "")
    if (sid) childBySeller.set(sid, String(r.id))
  }
  const sellerOrderIdFor = (sellerId: string): string | null =>
    childBySeller.get(sellerId) ??
    (String(meta.seller_id || "") === sellerId ? args.orderId : null)

  // ---- Shares: the accepted quote snapshot when the order carries
  //      one (exact per-line seller + per-group charged shipping),
  //      else the persisted lines through the attribution writer's
  //      own line-seller resolution.
  let shares: SellerShare[]
  let platformItemsCents = 0
  const snapshot = meta.fulfillment_snapshot
  if (snapshot && Array.isArray(snapshot.lines) && snapshot.lines.length > 0) {
    const built = sharesFromSnapshot(
      snapshot.lines.map((l: any) => ({
        productId: String(l.product_id || ""),
        quantity: Number(l.quantity) || 0,
        unitCents: Number(l.unit_cents) || 0,
        sellerId: l.seller_id ? String(l.seller_id) : null,
      })),
      (Array.isArray(snapshot.groups) ? snapshot.groups : []).map((g: any) => ({
        sellerId: g.seller_id ? String(g.seller_id) : null,
        shippingCents: Number(g.service?.charged_cents) || 0,
      })),
    )
    shares = built.shares
    platformItemsCents = built.platformItemsCents
  } else {
    const itemRows = await q(
      `SELECT product_id, quantity, unit_price
         FROM public.commerce_order_items
        WHERE order_id::text = $1
        ORDER BY created_at ASC`,
      [args.orderId],
    )
    if (itemRows.length === 0) return { ...empty, available: true, blocked: "no-lines" }
    const lineSellers = await resolveLineSellers(
      q,
      tenantId,
      itemRows.map((it) => String(it.product_id || "")),
    )
    for (const ls of lineSellers.values()) {
      if (ls.kind === "ambiguous") {
        return { ...empty, available: true, blocked: "ambiguous", sellerIds: ls.sellerIds }
      }
    }
    const built = sharesFromLegacyLines(
      itemRows.map((it) => {
        const ls = lineSellers.get(String(it.product_id || ""))
        return {
          productId: String(it.product_id || ""),
          quantity: Number(it.quantity) || 0,
          unitCents: moneyToCents(it.unit_price),
          sellerId: ls?.kind === "seller" ? ls.sellerId : null,
        }
      }),
      Math.max(0, Math.trunc(Number(meta.shipping?.cents || 0))),
    )
    shares = built.shares
    platformItemsCents = built.platformItemsCents
  }
  for (const s of shares) s.sellerOrderId = sellerOrderIdFor(s.sellerId)
  const sellerIds = shares.map((s) => s.sellerId)
  if (sellerIds.length === 0) {
    // Platform-only order: no seller to settle. Not blocked — there
    // is simply no settlement to record.
    return { ...empty, available: true, sellerIds: [] }
  }

  // ---- Destination charge: the order's stamp names the ONE seller
  //      whose net moved at charge time. Record that settlement;
  //      never a transfer.
  const dest = meta.destination_charge
  if (dest && typeof dest === "object" && dest.seller_id) {
    const destSellerId = String(dest.seller_id)
    const share = shares.find((s) => s.sellerId === destSellerId)
    if (share) {
      const amounts = destinationSettlementAmounts({
        share,
        allShares: shares,
        platformItemsCents,
        discountCents,
        applicationFeeCents: Number(dest.application_fee_cents) || 0,
      })
      const inserted = await insertSettlement(client, {
        tenantId,
        orderId: args.orderId,
        amounts,
        via: "destination_charge",
        state: "settled",
        stripeAccountId: dest.stripe_account_id ? String(dest.stripe_account_id) : null,
        executeAfter: null,
        executedAt: new Date(),
        metadata: {
          source: snapshot ? "quote_snapshot" : "order_lines",
          destination_charge: {
            model: "destination_charge",
            application_fee_cents: Number(dest.application_fee_cents) || 0,
          },
        },
      })
      await stampOrderSettlementMetadata(client, args.orderId, {
        owned: false,
        settlementIds: inserted ? [inserted] : [],
      })
      return {
        available: true,
        recorded: inserted ? 1 : 0,
        existing: inserted ? 0 : 1,
        destination: true,
        sellerIds,
      }
    }
    // A destination stamp naming a seller with no share on the order
    // is a data contradiction — fall through to the collect leg,
    // which attributes from the lines themselves, rather than record
    // a settlement for a seller who sold nothing here.
  }

  // ---- Collect leg: fees resolve per seller through THE accrual
  //      resolver, then amounts compute in ONE pass over the full
  //      share set (the discount allocation must see every share +
  //      the platform remainder at once so grosses sum back to the
  //      order total), then insert per seller with the recorded
  //      payout-delay policy as execute_after.
  let recorded = 0
  let existing = 0
  const feesBySeller = new Map<string, Record<SettlementFeeType, ResolvedFeeInput>>()
  for (const share of shares) {
    const { rows: sellerRows } = await client.query(
      `SELECT commission_rate::float AS commission_rate
         FROM public.sellers
        WHERE tenant_id = $1 AND id = $2::uuid
        LIMIT 1`,
      [tenantId, share.sellerId],
    )
    if (!sellerRows[0]) continue
    const resolved = await resolveSellerFeeSchedules(
      clientShim(q),
      tenantId,
      share.sellerId,
      sellerRows[0].commission_rate != null ? Number(sellerRows[0].commission_rate) : null,
    )
    feesBySeller.set(share.sellerId, toCoreFees(resolved))
  }
  const allAmounts = computeSettlementAmounts({
    shares,
    platformItemsCents,
    discountCents,
    feesBySeller,
  })
  const insertedIds: string[] = []
  for (const amounts of allAmounts) {
    // A share whose seller row no longer exists (or never resolved
    // fees) is not recorded — but it DID take part in the discount
    // allocation above, so the remaining sellers' shares stay exact.
    if (!feesBySeller.has(amounts.sellerId)) continue
    const delay = await deriveSellerPayoutDelay(client, tenantId, amounts.sellerId)
    const executeAfter =
      delay.delayDays === null
        ? null
        : new Date(Date.now() + delay.delayDays * 86400000)
    const inserted = await insertSettlement(client, {
      tenantId,
      orderId: args.orderId,
      amounts,
      via: "collect",
      state: "pending",
      stripeAccountId: null,
      executeAfter,
      executedAt: null,
      metadata: {
        source: snapshot ? "quote_snapshot" : "order_lines",
        delay_days: delay.delayDays,
        delay_source: delay.source,
      },
    })
    if (inserted) {
      recorded += 1
      insertedIds.push(inserted)
    } else {
      existing += 1
    }
  }
  if (recorded + existing > 0) {
    await stampOrderSettlementMetadata(client, args.orderId, {
      owned: true,
      settlementIds: insertedIds,
    })
  }
  return { available: true, recorded, existing, destination: false, sellerIds }
}

interface InsertSettlementInput {
  tenantId: string
  orderId: string
  amounts: SettlementAmounts
  via: "collect" | "destination_charge"
  state: "pending" | "settled"
  stripeAccountId: string | null
  executeAfter: Date | null
  executedAt: Date | null
  metadata: Record<string, unknown>
}

/** Insert one settlement row; returns its id, or null when the
 *  (tenant, order, seller) row already exists — the re-drive no-op
 *  that makes finalization safe to repeat. */
async function insertSettlement(
  client: PgClient,
  input: InsertSettlementInput,
): Promise<string | null> {
  const a = input.amounts
  const { rows } = await client.query(
    `INSERT INTO public.seller_settlements
       (tenant_id, seller_id, order_id, seller_order_id, via, state,
        items_cents, shipping_cents, discount_cents, gross_cents,
        commission_cents, fees_cents, fee_breakdown, net_cents,
        currency, stripe_account_id, transfer_group, idempotency_key,
        execute_after, executed_at, metadata)
     VALUES ($1, $2::uuid, $3, $4, $5, $6,
             $7, $8, $9, $10,
             $11, $12, $13::jsonb, $14,
             'usd', $15, $16, $17,
             $18, $19, $20::jsonb)
     ON CONFLICT (tenant_id, order_id, seller_id) DO NOTHING
     RETURNING id::text AS id`,
    [
      input.tenantId,
      a.sellerId,
      input.orderId,
      a.sellerOrderId,
      input.via,
      input.state,
      a.itemsCents,
      a.shippingCents,
      a.discountCents,
      a.grossCents,
      a.commissionCents,
      a.feesCents,
      JSON.stringify(a.feeBreakdown),
      a.netCents,
      input.stripeAccountId,
      input.orderId,
      settlementTransferKey(input.orderId, a.sellerId),
      input.executeAfter,
      input.executedAt,
      JSON.stringify(input.metadata),
    ],
  )
  return rows[0]?.id ? String(rows[0].id) : null
}

/** Stamp the order with the settlement record's existence — and,
 *  for collect-leg orders, settlement_owned: the accrual claim's
 *  exclusion (exactly one money path per order). The flag is only
 *  ever SET (to true): the accrual predicate tests
 *  metadata->>'settlement_owned' IS NULL, so a destination order —
 *  which must keep accruing record-only — never carries the key. */
async function stampOrderSettlementMetadata(
  client: PgClient,
  orderId: string,
  input: { owned: boolean; settlementIds: string[] },
): Promise<void> {
  if (input.owned) {
    await client.query(
      `UPDATE public.commerce_orders
          SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'settlements_recorded_at', to_jsonb(now()),
                'settlement_owned', to_jsonb(true)),
              updated_at = now()
        WHERE id::text = $1`,
      [orderId],
    )
  } else {
    await client.query(
      `UPDATE public.commerce_orders
          SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'settlements_recorded_at', to_jsonb(now())),
              updated_at = now()
        WHERE id::text = $1`,
      [orderId],
    )
  }
}

// ---------------------------------------------------------------------------
// EXECUTE — move due pending settlements to the sellers' Connect
// accounts (Separate Charges and Transfers: the charge stayed on
// the platform; this transfer is the seller's settlement).
// ---------------------------------------------------------------------------

export interface ExecuteSettlementsSummary {
  available: boolean
  gate?: string
  executed: number
  repaired: number
  settledZero: number
  alreadySettled: number
  waiting: number
  blocked: Record<string, number>
  failed: number
}

const NO_SUMMARY: ExecuteSettlementsSummary = {
  available: false,
  executed: 0,
  repaired: 0,
  settledZero: 0,
  alreadySettled: 0,
  waiting: 0,
  blocked: {},
  failed: 0,
}

export async function executeDueSettlements(
  client: PgClient,
  args: {
    tenantId: string
    orderId?: string
    limit?: number
    now?: Date
    stripe?: StripeSettlementClient
  },
): Promise<ExecuteSettlementsSummary> {
  const q = sellerQueryFnForPgClient(client)
  if (!(await probeSettlementStore(q))) return { ...NO_SUMMARY }
  const gate = payoutModeGate()
  if (!gate.allowed) {
    return { ...NO_SUMMARY, available: true, gate: gate.reason || "payout execution is not allowed in this environment" }
  }
  const stripe = args.stripe ?? defaultStripe()
  const now = args.now ?? new Date()
  const summary: ExecuteSettlementsSummary = { ...NO_SUMMARY, available: true, blocked: {} }

  const { rows } = await client.query(
    `SELECT s.id::text AS id, s.seller_id::text AS seller_id, s.order_id,
            s.state, s.via, s.net_cents::bigint AS net_cents, s.currency,
            s.stripe_transfer_id, s.stripe_account_id, s.idempotency_key,
            s.execute_after,
            COALESCE((SELECT SUM(r.net_reversed_cents) FROM public.seller_settlement_reversals r
                       WHERE r.settlement_id = s.id
                         AND r.state IN ('transfer_reversed', 'no_transfer')), 0)::bigint AS reversed_net
       FROM public.seller_settlements s
      WHERE s.tenant_id = $1 AND s.state = 'pending' AND s.via = 'collect'
        AND ($2::text IS NULL OR s.order_id = $2)
      ORDER BY s.created_at ASC
      LIMIT $3`,
    [args.tenantId, args.orderId ?? null, args.limit ?? 50],
  )

  for (const row of rows) {
    const netCents = Number(row.net_cents) || 0
    const payable = Math.max(0, netCents - (Number(row.reversed_net) || 0))
    const decision = executionDecisionFor({
      state: "pending",
      via: "collect",
      netCents: payable,
      executeAfter: row.execute_after ? new Date(row.execute_after).toISOString() : null,
      now,
    })
    if (decision.action === "wait") {
      summary.waiting += 1
      continue
    }
    if (decision.action === "skip") continue
    if (decision.action === "settle_zero") {
      const { rows: upd } = await client.query(
        `UPDATE public.seller_settlements
            SET state = 'settled', executed_at = now(), pending_reason = NULL,
                metadata = metadata || '{"zero_net": true}'::jsonb, updated_at = now()
          WHERE id = $1::uuid AND state = 'pending'
          RETURNING id`,
        [row.id],
      )
      if (upd.length) summary.settledZero += 1
      continue
    }

    // ---- execute (or repair: a transfer id already on the row means
    //      a previous pass moved the money and died before the
    //      ledger leg — complete the ledger, create nothing).
    const repairing = Boolean(row.stripe_transfer_id)
    let transferId = row.stripe_transfer_id as string | null
    let destination = row.stripe_account_id as string | null

    if (!repairing) {
      const { rows: acctRows } = await client.query(
        `SELECT stripe_account_id, payouts_enabled FROM public.seller_stripe_accounts
          WHERE tenant_id = $1 AND seller_id = $2::uuid LIMIT 1`,
        [args.tenantId, row.seller_id],
      )
      const acct = acctRows[0]
      const block = connectBlockFor(
        acct
          ? {
              stripeAccountId: acct.stripe_account_id ? String(acct.stripe_account_id) : null,
              payoutsEnabled: Boolean(acct.payouts_enabled),
            }
          : null,
      )
      if (block) {
        await markPendingReason(client, row.id, block)
        summary.blocked[block] = (summary.blocked[block] ?? 0) + 1
        continue
      }
      destination = String(acct.stripe_account_id)
      try {
        const transfer = await stripe.transfers.create(
          {
            amount: payable,
            currency: String(row.currency || "usd"),
            destination,
            transfer_group: String(row.order_id),
            description: `Seller settlement for order ${row.order_id}`,
            metadata: {
              settlement_id: String(row.id),
              order_id: String(row.order_id),
              seller_id: String(row.seller_id),
              tenant_id: args.tenantId,
            },
          },
          { idempotencyKey: String(row.idempotency_key) },
        )
        transferId = transfer.id
      } catch (e: any) {
        await markPendingReason(client, row.id, "transfer_failed", e?.message)
        summary.failed += 1
        continue
      }
      // Record the transfer id BEFORE the ledger leg: the winner of
      // this guarded update owns the ledger; a concurrent executor
      // whose update lands second sees the id and stands down (its
      // own create call resolved to the same Stripe transfer through
      // the idempotency key — money moved once).
      const { rows: claimed } = await client.query(
        `UPDATE public.seller_settlements
            SET stripe_transfer_id = $2, stripe_account_id = $3, updated_at = now()
          WHERE id = $1::uuid AND state = 'pending' AND stripe_transfer_id IS NULL
          RETURNING id`,
        [row.id, transferId, destination],
      )
      if (!claimed.length) {
        const { rows: current } = await client.query(
          `SELECT state FROM public.seller_settlements WHERE id = $1::uuid`,
          [row.id],
        )
        if (current[0]?.state === "settled") summary.alreadySettled += 1
        continue
      }
    }

    // ---- ledger leg (winner only, or the repair pass): GL + audit
    //      + the state flip. The GL entry is guarded by its own
    //      (source, source_id) existence — the journal writer has no
    //      dedupe of its own.
    try {
      const dollars = payable / 100
      const { coerceJournalSource } = await import("@/lib/accounting/journal")
      const { rows: existing } = await client.query(
        `SELECT id FROM public.acct_journal_entries WHERE source = $1 AND source_id = $2 LIMIT 1`,
        [coerceJournalSource("vendor_payment"), String(row.id)],
      )
      let journalEntryId: string | null = existing[0]?.id ? String(existing[0].id) : null
      if (!journalEntryId) {
        journalEntryId = await postBalancedJournalEntry(
          (text, params) => client.query(text, params),
          args.tenantId,
          {
            source: "vendor_payment",
            sourceId: String(row.id),
            reference: "seller_settlement",
            memo: `Seller settlement ${row.id} executed — Stripe transfer ${transferId} (${gate.mode} mode)`,
            lines: [
              { accountCode: "2100", debit: dollars, credit: 0, memo: "Seller payable extinguished" },
              { accountCode: "1000", debit: 0, credit: dollars, memo: `Cash out via Stripe Connect transfer ${transferId}` },
            ],
          },
        )
      }
      const { rows: upd } = await client.query(
        `UPDATE public.seller_settlements
            SET state = 'settled', executed_at = now(), pending_reason = NULL, updated_at = now()
          WHERE id = $1::uuid AND state = 'pending'
          RETURNING id`,
        [row.id],
      )
      if (!upd.length) {
        summary.alreadySettled += 1
        continue
      }
      await writeSellerAudit(client as any, {
        tenantId: args.tenantId,
        sellerId: String(row.seller_id),
        actorId: null,
        ipAddress: null,
        action: repairing ? "settlement.repaired" : "settlement.executed",
        entityType: "seller_settlement",
        entityId: String(row.id),
        afterState: {
          order_id: String(row.order_id),
          net_cents: payable,
          stripe_transfer_id: transferId,
          journal_entry_id: journalEntryId,
          mode: gate.mode,
        },
      })
      if (repairing) summary.repaired += 1
      else summary.executed += 1

      // The seller hears their order settled — after the state flip,
      // best-effort (notifySeller never throws).
      try {
        const { notifySeller } = await import("@/lib/sellers/notify")
        await notifySeller({
          tenantId: args.tenantId,
          sellerId: String(row.seller_id),
          event: "payments",
          type: "settlement_paid",
          title: "Order settled",
          body: `Your share of order ${row.order_id} has settled: $${(payable / 100).toFixed(2)} was transferred to your connected account (transfer ${transferId}).`,
          link: "/seller/payments",
        })
      } catch {}
    } catch (e: any) {
      // The money moved at Stripe and the transfer id is on the row;
      // the settlement stays 'pending' and the next pass repairs the
      // ledger leg — a second transfer is never created.
      console.error(`[settlement] ledger leg failed for settlement ${row.id} (transfer ${transferId}):`, e?.message)
      summary.failed += 1
    }
  }
  return summary
}

async function markPendingReason(
  client: PgClient,
  settlementId: string,
  reason: string,
  error?: string,
): Promise<void> {
  await client
    .query(
      `UPDATE public.seller_settlements
          SET pending_reason = $2,
              metadata = CASE WHEN $3::text IS NULL THEN metadata
                              ELSE metadata || jsonb_build_object('last_error', $3::text) END,
              updated_at = now()
        WHERE id = $1::uuid AND state = 'pending' AND pending_reason IS DISTINCT FROM $2`,
      [settlementId, reason, error ?? null],
    )
    .catch(() => {})
}

// ---------------------------------------------------------------------------
// REFUNDS — apportion a finalized refund across the order's
// settlements and reverse what was transferred.
// ---------------------------------------------------------------------------

export interface RefundSettlementInput {
  stripeRefundId: string
  amountCents: number
  /** The charge's own transfer id (destination charges): the
   *  reversal target for a destination settlement, when the event
   *  carries it. */
  chargeTransferId?: string | null
  /** Refunded lines' seller shares, when line-level detail exists. */
  lineShares?: { sellerId: string; cents: number }[] | null
}

export interface RefundSettlementSummary {
  available: boolean
  allocations: number
  reversedNetCents: number
  unapportionedCents: number
  failed: number
}

export async function applyRefundToSettlements(
  client: PgClient,
  args: { tenantId: string; orderId: string; refund: RefundSettlementInput; stripe?: StripeSettlementClient },
): Promise<RefundSettlementSummary> {
  const q = sellerQueryFnForPgClient(client)
  const none: RefundSettlementSummary = {
    available: false,
    allocations: 0,
    reversedNetCents: 0,
    unapportionedCents: 0,
    failed: 0,
  }
  if (!(await probeSettlementStore(q))) return none
  const stripe = args.stripe ?? defaultStripe()

  const { rows: settlementRows } = await client.query(
    `SELECT s.id::text AS id, s.seller_id::text AS seller_id, s.state, s.via,
            s.gross_cents::bigint AS gross_cents, s.commission_cents::bigint AS commission_cents,
            s.net_cents::bigint AS net_cents, s.stripe_transfer_id,
            COALESCE((SELECT SUM(r.amount_cents) FROM public.seller_settlement_reversals r
                       WHERE r.settlement_id = s.id AND r.state IN ('transfer_reversed', 'no_transfer')), 0)::bigint AS reversed_gross,
            COALESCE((SELECT SUM(r.commission_reversed_cents) FROM public.seller_settlement_reversals r
                       WHERE r.settlement_id = s.id AND r.state IN ('transfer_reversed', 'no_transfer')), 0)::bigint AS reversed_commission,
            COALESCE((SELECT SUM(r.net_reversed_cents) FROM public.seller_settlement_reversals r
                       WHERE r.settlement_id = s.id AND r.state IN ('transfer_reversed', 'no_transfer')), 0)::bigint AS reversed_net
       FROM public.seller_settlements s
      WHERE s.tenant_id = $1 AND s.order_id = $2
      ORDER BY s.created_at ASC`,
    [args.tenantId, args.orderId],
  )
  if (settlementRows.length === 0) {
    return { ...none, available: true, unapportionedCents: Math.max(0, Math.trunc(args.refund.amountCents)) }
  }

  const forRefund: SettlementForRefund[] = settlementRows.map((r) => ({
    settlementId: String(r.id),
    sellerId: String(r.seller_id),
    state: r.state,
    via: r.via,
    grossCents: Number(r.gross_cents) || 0,
    commissionCents: Number(r.commission_cents) || 0,
    netCents: Number(r.net_cents) || 0,
    transferredCents: r.via === "collect" && r.stripe_transfer_id ? Number(r.net_cents) || 0 : 0,
    reversedGrossCents: Number(r.reversed_gross) || 0,
    reversedCommissionCents: Number(r.reversed_commission) || 0,
    reversedNetCents: Number(r.reversed_net) || 0,
  }))
  const byId = new Map(settlementRows.map((r) => [String(r.id), r]))

  const plan = planRefundApportionment({
    refundCents: args.refund.amountCents,
    lineShares: args.refund.lineShares ?? null,
    settlements: forRefund,
  })

  const summary: RefundSettlementSummary = {
    available: true,
    allocations: 0,
    reversedNetCents: 0,
    unapportionedCents: plan.unapportionedCents,
    failed: 0,
  }

  for (const alloc of plan.allocations) {
    if (alloc.grossShareCents <= 0) continue
    summary.allocations += 1
    const settlement = byId.get(alloc.settlementId)
    if (!settlement) continue
    const reversalKey = settlementReversalKey(args.refund.stripeRefundId, alloc.settlementId)

    // The reversal row is the idempotency identity: insert first;
    // only the inserter (or a repair pass over a 'recorded' row)
    // performs the provider action.
    const { rows: inserted } = await client.query(
      `INSERT INTO public.seller_settlement_reversals
         (tenant_id, settlement_id, order_id, seller_id, stripe_refund_id,
          amount_cents, commission_reversed_cents, net_reversed_cents,
          state, idempotency_key, metadata)
       VALUES ($1, $2::uuid, $3, $4::uuid, $5, $6, $7, $8, 'recorded', $9, $10::jsonb)
       ON CONFLICT (tenant_id, stripe_refund_id, settlement_id) DO NOTHING
       RETURNING id::text AS id`,
      [
        args.tenantId,
        alloc.settlementId,
        args.orderId,
        alloc.sellerId,
        args.refund.stripeRefundId,
        alloc.grossShareCents,
        alloc.commissionReversedCents,
        alloc.netReversedCents,
        reversalKey,
        JSON.stringify({ mode: alloc.mode }),
      ],
    )
    let reversalId: string | null = inserted[0]?.id ? String(inserted[0].id) : null
    let amounts = {
      gross: alloc.grossShareCents,
      commission: alloc.commissionReversedCents,
      net: alloc.netReversedCents,
      mode: alloc.mode as string,
    }
    if (!reversalId) {
      const { rows: existing } = await client.query(
        `SELECT id::text AS id, state, stripe_reversal_id,
                amount_cents::bigint AS amount_cents,
                commission_reversed_cents::bigint AS commission_reversed_cents,
                net_reversed_cents::bigint AS net_reversed_cents,
                metadata
           FROM public.seller_settlement_reversals
          WHERE tenant_id = $1 AND stripe_refund_id = $2 AND settlement_id = $3::uuid
          LIMIT 1`,
        [args.tenantId, args.refund.stripeRefundId, alloc.settlementId],
      )
      const ex = existing[0]
      if (!ex || ex.state !== "recorded" || ex.stripe_reversal_id) {
        continue // fully processed by the earlier drive
      }
      // Repair: the row was recorded but its provider action never
      // completed. Use the RECORDED amounts (the plan that wrote
      // them), not this drive's recomputation.
      reversalId = String(ex.id)
      amounts = {
        gross: Number(ex.amount_cents) || 0,
        commission: Number(ex.commission_reversed_cents) || 0,
        net: Number(ex.net_reversed_cents) || 0,
        mode: String(parseMetadata(ex.metadata).mode || alloc.mode),
      }
    }

    try {
      let finalState: "transfer_reversed" | "no_transfer" = "no_transfer"
      let reversalStripeId: string | null = null
      if (amounts.mode === "transfer" && amounts.net > 0) {
        if (!settlement.stripe_transfer_id) throw new Error("settlement has no transfer to reverse")
        const reversal = await stripe.transfers.createReversal(
          String(settlement.stripe_transfer_id),
          { amount: amounts.net, description: `Refund ${args.refund.stripeRefundId} — settlement reversal` },
          { idempotencyKey: reversalKey },
        )
        reversalStripeId = reversal.id
        finalState = "transfer_reversed"
      } else if (amounts.mode === "destination" && amounts.net > 0 && args.refund.chargeTransferId) {
        const reversal = await stripe.transfers.createReversal(
          String(args.refund.chargeTransferId),
          { amount: amounts.net, description: `Refund ${args.refund.stripeRefundId} — destination settlement reversal` },
          { idempotencyKey: reversalKey },
        )
        reversalStripeId = reversal.id
        finalState = "transfer_reversed"
      }
      await client.query(
        `UPDATE public.seller_settlement_reversals
            SET state = $2, stripe_reversal_id = COALESCE($3, stripe_reversal_id),
                error = NULL, updated_at = now()
          WHERE id = $1::uuid`,
        [reversalId, finalState, reversalStripeId],
      )
      summary.reversedNetCents += amounts.net

      // Advance the settlement's state from its cumulative position
      // (this refund's share included).
      const fresh = forRefund.find((s) => s.settlementId === alloc.settlementId)
      if (fresh) {
        const reversedGrossAfter = fresh.reversedGrossCents + amounts.gross
        let newState = String(settlement.state)
        if (fresh.grossCents > 0 && reversedGrossAfter >= fresh.grossCents) newState = "reversed"
        else if (settlement.state === "settled" || settlement.state === "partially_reversed") {
          newState = "partially_reversed"
        }
        if (newState !== String(settlement.state)) {
          await client.query(
            `UPDATE public.seller_settlements SET state = $2, updated_at = now()
              WHERE id = $1::uuid AND state = $3`,
            [alloc.settlementId, newState, String(settlement.state)],
          )
        }
      }
    } catch (e: any) {
      await client
        .query(
          `UPDATE public.seller_settlement_reversals SET error = $2, updated_at = now() WHERE id = $1::uuid`,
          [reversalId, e instanceof Error ? e.message : String(e)],
        )
        .catch(() => {})
      summary.failed += 1
    }
  }
  return summary
}

// ---------------------------------------------------------------------------
// READS — seller + admin surfaces. Amounts stay in their named cent
// fields (the seller_* money tables these sit beside are dollars;
// the read converts explicitly rather than renaming silently).
// ---------------------------------------------------------------------------

export interface SettlementReadRow {
  id: string
  seller_id: string
  order_id: string
  seller_order_id: string | null
  via: string
  state: string
  pending_reason: string | null
  gross_cents: number
  commission_cents: number
  fees_cents: number
  net_cents: number
  reversed_cents: number
  effective_net_cents: number
  currency: string
  stripe_transfer_id: string | null
  execute_after: string | null
  executed_at: string | null
  created_at: string
}

const READ_SQL = `
  SELECT s.id::text AS id, s.seller_id::text AS seller_id, s.order_id,
         s.seller_order_id, s.via, s.state, s.pending_reason,
         s.gross_cents::bigint AS gross_cents, s.commission_cents::bigint AS commission_cents,
         s.fees_cents::bigint AS fees_cents, s.net_cents::bigint AS net_cents,
         COALESCE((SELECT SUM(r.net_reversed_cents) FROM public.seller_settlement_reversals r
                    WHERE r.settlement_id = s.id AND r.state IN ('transfer_reversed', 'no_transfer')), 0)::bigint AS reversed_cents,
         s.currency, s.stripe_transfer_id,
         s.execute_after::text AS execute_after, s.executed_at::text AS executed_at,
         s.created_at::text AS created_at
    FROM public.seller_settlements s`

function mapReadRow(r: any): SettlementReadRow {
  const net = Number(r.net_cents) || 0
  const reversed = Number(r.reversed_cents) || 0
  return {
    id: String(r.id),
    seller_id: String(r.seller_id),
    order_id: String(r.order_id),
    seller_order_id: r.seller_order_id ? String(r.seller_order_id) : null,
    via: String(r.via),
    state: String(r.state),
    pending_reason: r.pending_reason ? String(r.pending_reason) : null,
    gross_cents: Number(r.gross_cents) || 0,
    commission_cents: Number(r.commission_cents) || 0,
    fees_cents: Number(r.fees_cents) || 0,
    net_cents: net,
    reversed_cents: reversed,
    effective_net_cents: Math.max(0, net - reversed),
    currency: String(r.currency || "usd"),
    stripe_transfer_id: r.stripe_transfer_id ? String(r.stripe_transfer_id) : null,
    execute_after: r.execute_after ? String(r.execute_after) : null,
    executed_at: r.executed_at ? String(r.executed_at) : null,
    created_at: String(r.created_at),
  }
}

export async function listSellerSettlements(
  client: PgClient,
  tenantId: string,
  sellerId: string,
  limit = 100,
): Promise<SettlementReadRow[]> {
  const q = sellerQueryFnForPgClient(client)
  if (!(await probeSettlementStore(q))) return []
  const { rows } = await client.query(
    `${READ_SQL}
      WHERE s.tenant_id = $1 AND s.seller_id = $2::uuid
      ORDER BY s.created_at DESC
      LIMIT $3`,
    [tenantId, sellerId, limit],
  )
  return rows.map(mapReadRow)
}

export async function listOrderSettlements(
  client: PgClient,
  tenantId: string,
  orderId: string,
): Promise<SettlementReadRow[]> {
  const q = sellerQueryFnForPgClient(client)
  if (!(await probeSettlementStore(q))) return []
  const { rows } = await client.query(
    `${READ_SQL}
      WHERE s.tenant_id = $1 AND s.order_id = $2
      ORDER BY s.created_at ASC`,
    [tenantId, orderId],
  )
  return rows.map(mapReadRow)
}
