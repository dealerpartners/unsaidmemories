import Stripe from "stripe"
import { postBalancedJournalEntry } from "@/lib/accounting/journal"
import { emitEvent } from "@/lib/events/envelope"
import { writeSellerAudit } from "@/lib/sellers/audit"
import { PayoutExecutionError, payoutModeGate } from "@/lib/payments/execution-gate"

export { PayoutExecutionError, payoutModeGate } from "@/lib/payments/execution-gate"

// ---------------------------------------------------------------------------
// SELLER PAYOUT EXECUTION — the follow-on module the E1 payout desk
// (src/app/api/admin/payouts/route.ts) names as execution's decided home.
//
// The money model (Sunny, 2026-10-14): agency model, platform is Merchant
// of Record, Stripe Connect Express with destination charges; the
// platform strips its fees and the NET passes to the seller's connected
// account after the delay window. Accrual (lib/sellers/accrual) already
// computes the net and records it: seller_payouts row + wallet credit.
// This module is the leg that was never built — moving an APPROVED,
// due payout from record to money:
//
//   1. PREFLIGHT (no writes, fail-closed): payout is 'approved' and its
//      delay window has lapsed (scheduled_at reached or NULL); the
//      seller has a seller_stripe_accounts row (migration 20261082) with
//      payouts_enabled; the wallet's available balance covers the
//      amount; both GL accounts resolve in the tenant's chart.
//   2. TRANSFER: stripe.transfers.create of the net to the connected
//      account (the post-collection form of the destination-charge
//      model: funds sit in the platform balance; the transfer is the
//      pass-through). transfer_group + metadata carry the payout id.
//   3. LEDGER (one pg transaction): wallet debit + wallet transaction,
//      the balanced GL entry (Dr seller payable / Cr cash — the payout
//      extinguishes the payable the accrual recognized), the payout row
//      → 'paid' with paid_at + stripe_transfer_id + journal_entry_id,
//      the m3.payout.completed event on the outbox, and the audit row.
//
// MODE GATE — money is never invented here: execution runs in Stripe
// TEST mode whenever the configured key is a test key. A LIVE key is
// refused unless PAYOUT_EXECUTION_LIVE=enabled is set in the
// environment (the production-side-only rule from the desk, enforced in
// code rather than by convention).
//
// REPAIR: if the transfer succeeded but the ledger transaction failed,
// the payout keeps status 'approved' with stripe_transfer_id +
// execution_error recorded. Re-executing detects that state and
// completes ONLY the ledger leg — a second transfer is never created.
// ---------------------------------------------------------------------------

export const SELLER_PAYABLE_GL_ACCOUNT = "2100"
export const PLATFORM_CASH_GL_ACCOUNT = "1000"

type PgClient = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>
}

export interface StripeTransferClient {
  transfers: { create: (params: Record<string, unknown>) => Promise<{ id: string }> }
}

let _stripe: Stripe | null = null
function defaultStripe(): StripeTransferClient {
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
  return _stripe as unknown as StripeTransferClient
}

export interface PayoutExecutionResult {
  payoutId: string
  sellerId: string
  amount: number
  transferId: string
  journalEntryId: string
  mode: "test" | "live"
  repairedLedgerOnly: boolean
}

export async function executeSellerPayout(
  client: PgClient,
  tenant: string,
  payoutId: string,
  opts: { actorId?: string | null; ipAddress?: string | null; stripe?: StripeTransferClient } = {},
): Promise<PayoutExecutionResult> {
  const gate = payoutModeGate()
  if (!gate.allowed) throw new PayoutExecutionError("MODE_GATE", gate.reason || "Payout execution is not allowed in this environment")
  const mode = gate.mode as "test" | "live"
  const stripe = opts.stripe ?? defaultStripe()

  // ---- load the payout -----------------------------------------------------
  const { rows: payoutRows } = await client.query(
    `SELECT id::text AS id, seller_id::text AS seller_id, amount::float AS amount,
            status, scheduled_at, stripe_transfer_id
       FROM public.seller_payouts
      WHERE tenant_id = $1 AND id = $2::uuid`,
    [tenant, payoutId],
  )
  const payout = payoutRows[0]
  if (!payout) throw new PayoutExecutionError("NOT_FOUND", "Payout not found in this tenant")
  if (payout.status === "paid") {
    throw new PayoutExecutionError("ALREADY_PAID", "Payout is already paid — execution is idempotent by refusal, never by double transfer")
  }
  if (payout.status !== "approved") {
    throw new PayoutExecutionError("NOT_APPROVED", `Payout is "${payout.status}"; only an approved payout can execute (the desk's review state is the gate)`)
  }
  if (payout.scheduled_at && new Date(payout.scheduled_at).getTime() > Date.now()) {
    throw new PayoutExecutionError("NOT_DUE", `Payout is scheduled for ${payout.scheduled_at} — the delay window has not lapsed`)
  }
  const amount = Number(payout.amount)
  if (!(amount > 0)) throw new PayoutExecutionError("BAD_AMOUNT", "Payout amount must be positive")
  const sellerId = String(payout.seller_id)
  const existingTransferId = (payout.stripe_transfer_id as string | null) || null

  // ---- preflight: destination, wallet, GL ----------------------------------
  const { rows: acctRows } = await client.query(
    `SELECT stripe_account_id, payouts_enabled FROM public.seller_stripe_accounts
      WHERE tenant_id = $1 AND seller_id = $2::uuid LIMIT 1`,
    [tenant, sellerId],
  )
  const connect = acctRows[0]
  if (!connect) {
    throw new PayoutExecutionError("NO_CONNECT_ACCOUNT", "Seller has no Stripe Connect account on file (seller_stripe_accounts) — onboarding must complete before a payout can execute")
  }
  if (!connect.payouts_enabled) {
    throw new PayoutExecutionError("PAYOUTS_NOT_ENABLED", "The seller's connected account does not have payouts_enabled — Stripe has not cleared it for disbursement")
  }

  const { rows: walletRows } = await client.query(
    `SELECT id::text AS id, balance::float AS balance FROM public.seller_wallets
      WHERE tenant_id = $1 AND seller_id = $2::uuid LIMIT 1`,
    [tenant, sellerId],
  )
  const wallet = walletRows[0]
  if (!wallet || Number(wallet.balance) < amount) {
    throw new PayoutExecutionError("INSUFFICIENT_WALLET", "The seller wallet's available balance does not cover this payout — the accrual and the payout record disagree; refusing rather than overdrawing")
  }

  const { rows: glRows } = await client.query(
    `SELECT code FROM public.acct_chart_of_accounts
      WHERE tenant_id = $1 AND code = ANY($2) AND is_active IS NOT FALSE`,
    [tenant, [SELLER_PAYABLE_GL_ACCOUNT, PLATFORM_CASH_GL_ACCOUNT]],
  )
  const glCodes = new Set(glRows.map((r: any) => String(r.code)))
  for (const code of [SELLER_PAYABLE_GL_ACCOUNT, PLATFORM_CASH_GL_ACCOUNT]) {
    if (!glCodes.has(code)) {
      throw new PayoutExecutionError("GL_ACCOUNT_MISSING", `Tenant chart of accounts has no active GL account ${code} — the payout cannot tie to the books, so it does not execute`)
    }
  }

  // ---- transfer (skipped on the repair path) --------------------------------
  let transferId = existingTransferId
  if (!transferId) {
    const transfer = await stripe.transfers.create({
      amount: Math.round(amount * 100),
      currency: "usd",
      destination: String(connect.stripe_account_id),
      transfer_group: `payout_${payoutId}`,
      description: `Seller payout ${payoutId}`,
      metadata: { payout_id: payoutId, seller_id: sellerId, tenant_id: tenant },
    })
    transferId = transfer.id
  }

  // ---- ledger transaction ----------------------------------------------------
  const query = (text: string, params?: unknown[]) => client.query(text, params)
  try {
    await client.query("BEGIN")
    const { rows: wRows } = await client.query(
      `UPDATE public.seller_wallets
          SET balance = balance - $3, updated_at = now()
        WHERE tenant_id = $1 AND seller_id = $2::uuid AND balance >= $3
        RETURNING balance::float AS balance`,
      [tenant, sellerId, amount],
    )
    if (!wRows.length) throw new PayoutExecutionError("INSUFFICIENT_WALLET", "Wallet balance changed under execution — debit refused")
    const balanceAfter = Number(wRows[0].balance)
    await client.query(
      `INSERT INTO public.seller_wallet_transactions
         (tenant_id, seller_id, wallet_id, transaction_type, amount, balance_after, notes)
       VALUES ($1, $2::uuid, $3::uuid, 'payout', $4, $5, $6)`,
      [tenant, sellerId, wallet.id, -amount, balanceAfter, `Payout executed — Stripe transfer ${transferId}`],
    )

    const journalEntryId = await postBalancedJournalEntry(query as any, tenant, {
      source: "vendor_payment",
      sourceId: payoutId,
      reference: "seller_payout",
      memo: `Seller payout ${payoutId} executed — Stripe transfer ${transferId} (${mode} mode)`,
      lines: [
        { accountCode: SELLER_PAYABLE_GL_ACCOUNT, debit: amount, credit: 0, memo: "Seller payable extinguished" },
        { accountCode: PLATFORM_CASH_GL_ACCOUNT, debit: 0, credit: amount, memo: `Cash out via Stripe Connect transfer ${transferId}` },
      ],
    })

    const { rows: upd } = await client.query(
      `UPDATE public.seller_payouts
          SET status = 'paid', paid_at = now(), executed_at = now(),
              stripe_transfer_id = $3, journal_entry_id = $4::uuid, execution_error = NULL,
              updated_at = now()
        WHERE tenant_id = $1 AND id = $2::uuid AND status = 'approved'
        RETURNING id`,
      [tenant, payoutId, transferId, journalEntryId],
    )
    if (!upd.length) throw new PayoutExecutionError("RACE", "Payout state changed under execution — the ledger leg rolled back; the transfer id is recorded for reconciliation")

    await emitEvent(client as any, {
      type: "m3.payout.completed",
      producedBy: "M3",
      tenantId: tenant,
      subjectType: "payout",
      subjectId: payoutId,
      actorId: opts.actorId ?? null,
      actorRole: opts.actorId ? "admin" : "system",
      data: { seller_id: sellerId, amount, stripe_transfer_id: transferId, journal_entry_id: journalEntryId, mode },
    })

    await writeSellerAudit(client as any, {
      tenantId: tenant,
      sellerId,
      actorId: opts.actorId ?? null,
      ipAddress: opts.ipAddress ?? null,
      action: "payout.executed",
      entityType: "seller_payout",
      entityId: payoutId,
      beforeState: { status: "approved", amount },
      afterState: { status: "paid", amount, stripe_transfer_id: transferId, journal_entry_id: journalEntryId, mode },
    })

    await client.query("COMMIT")

    // The seller hears the payout landed — through the comms layer
    // (event "payments"), AFTER the ledger commits, on the service's
    // own connection. notifySeller never throws; the payout is already
    // paid either way.
    const { notifySeller } = await import("./notify")
    await notifySeller({
      tenantId: tenant,
      sellerId,
      event: "payments",
      type: "payout_status",
      title: "Payout paid",
      body: `Your payout of $${amount.toFixed(2)} has been paid to your connected account (transfer ${transferId}).`,
      link: "/seller/payments/overview",
    })

    return { payoutId, sellerId, amount, transferId, journalEntryId, mode, repairedLedgerOnly: Boolean(existingTransferId) }
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {})
    // Preserve the transfer id for the repair path — the money moved at
    // Stripe; the record must say so even though the payout is NOT paid.
    await client.query(
      `UPDATE public.seller_payouts
          SET stripe_transfer_id = COALESCE(stripe_transfer_id, $3),
              execution_error = $4, updated_at = now()
        WHERE tenant_id = $1 AND id = $2::uuid AND status = 'approved'`,
      [tenant, payoutId, transferId, `transfer ${transferId} created; ledger leg failed: ${e instanceof Error ? e.message : String(e)}`],
    ).catch(() => {})
    throw e
  }
}
