import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"

export const dynamic = "force-dynamic"

// ---------------------------------------------------------------------------
// C3 · Stripe reconciliation — the dedicated report the census found
// missing (/api/admin/payments read the three stores side by side; no
// surface ever COMPARED them).
//
// GET ?days=30 (or ?from=YYYY-MM-DD&to=YYYY-MM-DD)
// Compares, for the period:
//   local    commerce_payments rows (the ledger of record);
//   stripe   Stripe charges via the SDK (charges.list, created in
//            period, capped at 500 — the cap is reported, never hidden);
//   webhooks commerce_webhook_events rows whose payload/external id
//            references the payment's processor reference.
// A local payment's processor reference is processor_transaction_id,
// falling back to external_reference. A charge matches when its id OR
// its payment_intent equals that reference (the ledger records both
// shapes across writers).
// Classifications (one per row, local and Stripe sides):
//   matched          reference found on both sides, amounts equal
//   amount_mismatch  reference found, amounts differ (both shown)
//   local_only       local payment with a reference Stripe does not
//                    return for the period (or Stripe not configured —
//                    then EVERY local row is local_only and the report
//                    says why instead of pretending a comparison ran)
//   no_reference     local payment with no processor reference at all
//   stripe_only      a Stripe charge no local payment references
// Amounts: local commerce_payments.amount is dollars; Stripe charges are
// cents — compared after conversion, both values carried on the row.
// Stripe absent → the codebase's honest not-configured state: the local
// + webhook legs still report, stripeConfigured=false, and no row is
// ever labeled 'matched'.
// ---------------------------------------------------------------------------

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "0"))
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

type ReconRow = {
  classification: "matched" | "amount_mismatch" | "local_only" | "no_reference" | "stripe_only"
  localPaymentId: string | null
  paymentNumber: string | null
  reference: string | null
  localAmount: number | null
  stripeChargeId: string | null
  stripeAmount: number | null
  stripeStatus: string | null
  localStatus: string | null
  webhookReceived: boolean | null
  createdAt: string | null
}

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("payments", "read")
  if (gate) return gate
  const tenant = resolveTenantId(req)
  const sp = req.nextUrl.searchParams

  const daysRaw = Number(sp.get("days") || 30)
  const days = Number.isFinite(daysRaw) ? Math.min(Math.max(Math.trunc(daysRaw), 1), 365) : 30
  const fromParam = (sp.get("from") || "").trim()
  const toParam = (sp.get("to") || "").trim()
  const from = fromParam ? new Date(`${fromParam}T00:00:00Z`) : new Date(Date.now() - days * 86400000)
  const to = toParam ? new Date(`${toParam}T23:59:59Z`) : new Date()
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    return NextResponse.json({ error: "Invalid period — use days=N or from/to as YYYY-MM-DD" }, { status: 400 })
  }

  const local = await withPg(async (c) => {
    const { rows } = await c.query(
      `SELECT cp.id::text AS id, cp.payment_number, cp.amount, cp.status,
              cp.processor_transaction_id, cp.external_reference,
              cp.created_at::text AS created_at,
              EXISTS (
                SELECT 1 FROM public.commerce_webhook_events w
                 WHERE w.payload::text LIKE '%' || COALESCE(cp.processor_transaction_id, cp.external_reference, '__none__') || '%'
                    OR w.external_event_id = COALESCE(cp.processor_transaction_id, cp.external_reference)
              ) AS webhook_received
         FROM public.commerce_payments cp
        WHERE cp.tenant_id = $1 AND cp.created_at >= $2 AND cp.created_at <= $3
        ORDER BY cp.created_at DESC
        LIMIT 500`,
      [tenant, from.toISOString(), to.toISOString()],
    )
    const webhookCount = await c.query(
      `SELECT count(*)::int AS n FROM public.commerce_webhook_events
        WHERE created_at >= $1 AND created_at <= $2`,
      [from.toISOString(), to.toISOString()],
    )
    return { payments: rows, webhookEventsInPeriod: Number(webhookCount.rows[0]?.n ?? 0) }
  })
  if (!local) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })

  // ── Stripe leg ────────────────────────────────────────────────────────
  const stripeKey = process.env.STRIPE_SECRET_KEY
  let stripeConfigured = Boolean(stripeKey)
  let stripeError: string | null = null
  let stripeCapped = false
  const charges: { id: string; paymentIntent: string | null; amount: number; status: string; created: number }[] = []
  if (stripeKey) {
    try {
      const Stripe = (await import("stripe")).default
      const stripe = new Stripe(stripeKey)
      let startingAfter: string | undefined
      for (let page = 0; page < 5; page++) {
        const list = await stripe.charges.list({
          limit: 100,
          created: {
            gte: Math.floor(from.getTime() / 1000),
            lte: Math.floor(to.getTime() / 1000),
          },
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        })
        for (const ch of list.data) {
          charges.push({
            id: ch.id,
            paymentIntent: typeof ch.payment_intent === "string" ? ch.payment_intent : null,
            amount: (ch.amount || 0) / 100,
            status: String(ch.status || ""),
            created: ch.created,
          })
        }
        if (!list.has_more) break
        if (page === 4) stripeCapped = true
        startingAfter = list.data[list.data.length - 1]?.id
      }
    } catch (e: any) {
      stripeConfigured = false
      stripeError = e?.message || "Stripe charges list failed"
    }
  }

  const chargeByRef = new Map<string, (typeof charges)[number]>()
  for (const ch of charges) {
    chargeByRef.set(ch.id, ch)
    if (ch.paymentIntent) chargeByRef.set(ch.paymentIntent, ch)
  }
  const matchedChargeIds = new Set<string>()
  const rows: ReconRow[] = []

  for (const p of local.payments as Record<string, unknown>[]) {
    const reference =
      (typeof p.processor_transaction_id === "string" && p.processor_transaction_id) ||
      (typeof p.external_reference === "string" && p.external_reference) ||
      null
    const localAmount = num(p.amount)
    const base: ReconRow = {
      classification: "local_only",
      localPaymentId: String(p.id),
      paymentNumber: (p.payment_number as string) ?? null,
      reference,
      localAmount,
      stripeChargeId: null,
      stripeAmount: null,
      stripeStatus: null,
      localStatus: (p.status as string) ?? null,
      webhookReceived: p.webhook_received === true,
      createdAt: (p.created_at as string) ?? null,
    }
    if (!reference) {
      rows.push({ ...base, classification: "no_reference" })
      continue
    }
    const charge = stripeConfigured ? chargeByRef.get(reference) : undefined
    if (!charge) {
      rows.push(base)
      continue
    }
    matchedChargeIds.add(charge.id)
    const same = Math.abs(charge.amount - localAmount) < 0.005
    rows.push({
      ...base,
      classification: same ? "matched" : "amount_mismatch",
      stripeChargeId: charge.id,
      stripeAmount: charge.amount,
      stripeStatus: charge.status,
    })
  }
  for (const ch of charges) {
    if (matchedChargeIds.has(ch.id)) continue
    rows.push({
      classification: "stripe_only",
      localPaymentId: null,
      paymentNumber: null,
      reference: ch.paymentIntent || ch.id,
      localAmount: null,
      stripeChargeId: ch.id,
      stripeAmount: ch.amount,
      stripeStatus: ch.status,
      localStatus: null,
      webhookReceived: null,
      createdAt: new Date(ch.created * 1000).toISOString(),
    })
  }

  const count = (k: ReconRow["classification"]) => rows.filter((r) => r.classification === k).length
  return NextResponse.json({
    period: { from: from.toISOString(), to: to.toISOString() },
    stripeConfigured,
    stripeError,
    stripeChargesFetched: charges.length,
    stripeChargesCappedAt500: stripeCapped,
    webhookEventsInPeriod: local.webhookEventsInPeriod,
    summary: {
      localPayments: (local.payments as unknown[]).length,
      matched: count("matched"),
      amountMismatch: count("amount_mismatch"),
      localOnly: count("local_only"),
      noReference: count("no_reference"),
      stripeOnly: count("stripe_only"),
      localWithoutWebhook: (local.payments as Record<string, unknown>[]).filter((p) => p.webhook_received !== true).length,
    },
    rows,
    note: !stripeKey
      ? "Stripe is not configured (STRIPE_SECRET_KEY missing) — no comparison against Stripe was run. Local rows are classified local_only / no_reference from commerce_payments alone, and webhook presence is read from commerce_webhook_events."
      : stripeError
        ? `Stripe charges could not be listed (${stripeError}) — rows are classified from the local ledger alone.`
        : rows.length === 0
          ? "No payments in commerce_payments and no Stripe charges in this period — the reconciliation is honestly empty."
          : null,
  })
}
