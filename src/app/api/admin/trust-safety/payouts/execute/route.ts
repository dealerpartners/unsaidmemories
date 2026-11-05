import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { getStripe } from "@/lib/stripe"
import { getActorIdFromRequest } from "@/lib/quick-actions/audit"
import { requestIp } from "@/lib/sellers/audit"
import { executeSellerPayout, PayoutExecutionError } from "@/lib/sellers/payout-execution"
import { syncSellerConnectStatus } from "@/lib/sellers/connect"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ---------------------------------------------------------------------------
// POST /api/admin/trust-safety/payouts/execute { payoutId }
// The execution act of the decided money model — seated in the Trust
// Center, exactly where the E1 payout desk's header points ("Execution
// … is the Admin Trust Center follow-on module"). The desk records
// review state; THIS route moves the money for an approved, due payout:
//
//   status refresh (the seller's Connect flags are re-read from Stripe
//     and persisted first, so preflight judges Stripe's current truth,
//     not a stale webhook) → preflight (connect account, wallet cover,
//     GL accounts, delay window)
//   → Stripe transfer (test mode here; live only production-side by the
//     code-enforced mode gate) → wallet debit + balanced journal +
//     payout 'paid' with transfer + journal ids + m3.payout.completed
//     on the outbox, in one transaction.
//
// Every refusal is a named PayoutExecutionError code; nothing here marks
// a payout paid by assertion — 'paid' is written only inside the ledger
// transaction that follows a real transfer.
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "write")
  if (denied) return denied
  const b = await req.json().catch(() => ({}))
  const payoutId = String(b.payoutId || "")
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payoutId)) {
    return NextResponse.json({ error: "payoutId must be a payout uuid" }, { status: 400 })
  }
  const tenant = resolveTenantId(req)
  const actorId = await getActorIdFromRequest(req)
  const ipAddress = requestIp(req)

  try {
    const out = await withPg(async (c) => {
      // Refresh the seller's Connect flags from Stripe before preflight
      // reads them (BL-1): a seller who finished onboarding since the
      // last webhook must not be refused on stale flags. Best-effort —
      // if Stripe cannot be reached, the stored flags stand and
      // preflight decides on them, exactly as before.
      const { rows } = await c.query(
        `SELECT seller_id::text AS seller_id FROM public.seller_payouts
          WHERE tenant_id = $1 AND id = $2::uuid LIMIT 1`,
        [tenant, payoutId],
      )
      const sellerId = rows[0]?.seller_id
      if (sellerId) {
        await syncSellerConnectStatus(
          c as any,
          getStripe(),
          tenant,
          String(sellerId),
        ).catch(() => null)
      }
      return executeSellerPayout(c as any, tenant, payoutId, { actorId, ipAddress })
    })
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
    return NextResponse.json({ ok: true, execution: out })
  } catch (e) {
    if (e instanceof PayoutExecutionError) {
      const status = e.code === "NOT_FOUND" ? 404 : e.code === "MODE_GATE" ? 403 : 409
      return NextResponse.json({ ok: false, error: e.message, code: e.code }, { status })
    }
    throw e
  }
}
