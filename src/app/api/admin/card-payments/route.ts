import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { getStripe } from "@/lib/stripe"
import {
  CardPaymentError,
  cancelPendingCharge,
  chargeCardOnFile,
  createKeyedIntent,
  createPaymentLink,
  emailPaymentLink,
  finalizePendingCharge,
  getCardOptions,
  getPendingCharge,
  getPendingChargeWithSale,
} from "@/lib/card-payments"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// /api/admin/card-payments — counter card payments (POS register + header
// Process Payment modal). One POST endpoint, action-dispatched:
//
//   options        → per-path availability (Stripe configured? saved cards?)
//   keyed_intent   → PaymentIntent for staff-keyed entry (Stripe Elements)
//   on_file_charge → charge the customer's saved Stripe payment method
//   link           → Stripe Checkout payment link for this sale/payment
//   link_send      → email that link to the customer's address on file
//   confirm        → verify a keyed PaymentIntent with Stripe, finalize
//   status         → pending-charge status (register polls this for links;
//                    also checks the Checkout session live so a paid link
//                    completes even before the webhook lands)
//   cancel         → abandon a pending charge (webhook will NOT finalize a
//                    cancelled charge; a late payment stays visible in the
//                    unified ledger for refund/reconcile)
//
// Every completion funnels through finalizePendingCharge → completePosSale
// (pos_sale) or the take_payment-shaped commerce_payments insert
// (manual_payment). No parallel money logic.
// ============================================================================

function fail(e: any) {
  if (e instanceof CardPaymentError) {
    return NextResponse.json({ ok: false, error: e.message, code: e.code || undefined }, { status: e.status })
  }
  console.error("[POST /api/admin/card-payments]", e)
  return NextResponse.json({ ok: false, error: e?.message || "Card payment failed" }, { status: 500 })
}

function saleSnapshot(body: any) {
  if (body?.kind !== "pos_sale") return null
  const sale = body?.sale || {}
  if (!sale.registerSessionId || !Array.isArray(sale.lines) || sale.lines.length === 0) {
    throw new CardPaymentError("A register sale snapshot (registerSessionId + lines) is required for POS card payments.", 400)
  }
  return {
    sale: {
      registerSessionId: String(sale.registerSessionId),
      customerId: sale.customerId || null,
      petId: sale.petId || null,
      appointmentId: sale.appointmentId || null,
      staffId: sale.staffId || null,
      lines: sale.lines,
      discountTotal: Number(sale.discountTotal) || 0,
      taxTotal: Number(sale.taxTotal) || 0,
      depositAmount: Number(sale.depositAmount) || 0,
      notes: sale.notes || "",
      createdBy: sale.createdBy,
    },
    priorPayments: Array.isArray(body?.priorPayments) ? body.priorPayments : [],
    tipAmount: Number(body?.tipAmount) || 0,
  }
}

function manualPayload(body: any) {
  return { reference: body?.reference ? String(body.reference) : null }
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("payments", "write")
  if (gate) return gate
  const tenant = resolveTenantId(req)

  try {
    const body = await req.json().catch(() => ({}))
    const action = String(body?.action || "").trim()
    const kind = body?.kind === "pos_sale" ? "pos_sale" : "manual_payment"
    const amount = Number(body?.amount) || 0
    const customerId = body?.customerId ? String(body.customerId) : null

    if (action === "options") {
      const options = await getCardOptions(tenant, customerId)
      return NextResponse.json({ ok: true, ...options })
    }

    if (action === "keyed_intent") {
      if (amount <= 0) throw new CardPaymentError("Amount must be greater than zero", 400)
      const payload = kind === "pos_sale" ? saleSnapshot(body) : manualPayload(body)
      const result = await createKeyedIntent({
        tenant, kind, amount, customerId,
        payload, saveCard: !!body?.saveCard, createdBy: body?.createdBy,
      })
      return NextResponse.json({ ok: true, ...result })
    }

    if (action === "on_file_charge") {
      if (amount <= 0) throw new CardPaymentError("Amount must be greater than zero", 400)
      const payload = kind === "pos_sale" ? saleSnapshot(body) : manualPayload(body)
      const result = await chargeCardOnFile({
        tenant, kind, amount, customerId,
        paymentMethodId: body?.paymentMethodId ? String(body.paymentMethodId) : null,
        payload, createdBy: body?.createdBy,
      })
      if (result.outcome === "completed" && result.saleResult) {
        const sr = result.saleResult
        return NextResponse.json({
          ok: true, ...result,
          sale: {
            saleId: sr.saleId, saleNumber: sr.saleNumber, receiptNumber: sr.receiptNumber,
            total: sr.total, paidTotal: sr.paidTotal, changeDue: sr.changeDue,
            receiptRaw: sr.receiptRaw, journalEntryId: sr.journalEntryId,
          },
        })
      }
      return NextResponse.json({ ok: true, ...result })
    }

    if (action === "link") {
      if (amount <= 0) throw new CardPaymentError("Amount must be greater than zero", 400)
      const payload = kind === "pos_sale" ? saleSnapshot(body) : manualPayload(body)
      const result = await createPaymentLink({
        tenant, kind, amount, customerId,
        payload, saveCard: !!body?.saveCard, createdBy: body?.createdBy,
      })
      return NextResponse.json({ ok: true, ...result })
    }

    if (action === "link_send") {
      const pendingId = String(body?.pendingId || "")
      if (!pendingId) throw new CardPaymentError("pendingId required", 400)
      const result = await emailPaymentLink(tenant, pendingId)
      return NextResponse.json({ ok: true, ...result })
    }

    if (action === "confirm") {
      const pendingId = String(body?.pendingId || "")
      const paymentIntentId = String(body?.paymentIntentId || "")
      if (!pendingId || !paymentIntentId) throw new CardPaymentError("pendingId + paymentIntentId required", 400)
      const stripe = getStripe()
      if (!stripe) throw new CardPaymentError("Stripe is not configured — this payment cannot be verified.", 503, "stripe_not_configured")
      const pending = await getPendingCharge(tenant, pendingId)
      if (!pending) throw new CardPaymentError("Pending payment not found", 404)
      if (pending.status === "completed") {
        const withSale = await getPendingChargeWithSale(tenant, pendingId)
        return NextResponse.json({
          ok: true, status: "completed", saleId: pending.sale_id, paymentId: pending.payment_id,
          sale: withSale?.sale
            ? {
                saleId: withSale.sale.id,
                saleNumber: withSale.sale.sale_number,
                receiptNumber: withSale.sale.receipt_number || withSale.sale.sale_number,
                total: Number(withSale.sale.total) || 0,
                paidTotal: Number(withSale.sale.paid_total) || 0,
                changeDue: Number(withSale.sale.change_due) || 0,
              }
            : null,
        })
      }
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId)
      if (pi.metadata?.pending_charge_id !== pendingId) {
        throw new CardPaymentError("That Stripe payment does not belong to this pending charge.", 409)
      }
      if (pi.status === "processing") {
        return NextResponse.json({ ok: true, status: "processing", message: "The bank is still processing this charge — it will complete here automatically when it clears." })
      }
      if (pi.status !== "succeeded") {
        return NextResponse.json({ ok: false, status: pi.status, error: `The card payment did not complete (Stripe status: ${pi.status}). No charge was recorded.` }, { status: 402 })
      }
      const fin = await finalizePendingCharge(pendingId, {
        paymentIntentId: pi.id,
        amountCents: pi.amount_received || pi.amount,
      })
      if (fin.saleResult) {
        const sr = fin.saleResult
        return NextResponse.json({
          ok: true,
          status: fin.status,
          saleId: fin.saleId,
          paymentId: fin.paymentId,
          paymentNumber: fin.paymentNumber,
          sale: {
            saleId: sr.saleId, saleNumber: sr.saleNumber, receiptNumber: sr.receiptNumber,
            total: sr.total, paidTotal: sr.paidTotal, changeDue: sr.changeDue,
            receiptRaw: sr.receiptRaw, journalEntryId: sr.journalEntryId,
          },
        })
      }
      const withSale = await getPendingChargeWithSale(tenant, pendingId)
      return NextResponse.json({
        ok: true,
        status: fin.status,
        saleId: fin.saleId,
        paymentId: fin.paymentId,
        paymentNumber: fin.paymentNumber,
        sale: withSale?.sale
          ? {
              saleId: withSale.sale.id,
              saleNumber: withSale.sale.sale_number,
              receiptNumber: withSale.sale.receipt_number || withSale.sale.sale_number,
              total: Number(withSale.sale.total) || 0,
              paidTotal: Number(withSale.sale.paid_total) || 0,
              changeDue: Number(withSale.sale.change_due) || 0,
            }
          : null,
      })
    }

    if (action === "status") {
      const pendingId = String(body?.pendingId || "")
      if (!pendingId) throw new CardPaymentError("pendingId required", 400)
      let withSale = await getPendingChargeWithSale(tenant, pendingId)
      if (!withSale) throw new CardPaymentError("Pending payment not found", 404)
      // Live-check the Checkout session: a paid link finalizes here even if
      // the webhook hasn't landed yet (same finalize path either way).
      const stripe = getStripe()
      if (
        stripe &&
        withSale.pending.status === "awaiting_payment" &&
        withSale.pending.stripe_checkout_session_id
      ) {
        try {
          const session = await stripe.checkout.sessions.retrieve(withSale.pending.stripe_checkout_session_id)
          const piId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id
          if (session.payment_status === "paid" && piId && session.amount_total) {
            await finalizePendingCharge(pendingId, { paymentIntentId: piId, amountCents: session.amount_total })
            withSale = await getPendingChargeWithSale(tenant, pendingId)
          }
        } catch (e) {
          // A finalize error here must not break polling — the webhook is
          // the backstop and will retry. Surface the recorded error below.
          console.error("[card-payments status] live finalize failed:", e instanceof Error ? e.message : e)
          withSale = await getPendingChargeWithSale(tenant, pendingId)
        }
      }
      const p = withSale!.pending
      return NextResponse.json({
        ok: true,
        status: p.status,
        saleId: p.sale_id,
        paymentId: p.payment_id,
        paymentNumber: null,
        error: p.error,
        sale: withSale!.sale
          ? {
              saleId: withSale!.sale.id,
              saleNumber: withSale!.sale.sale_number,
              receiptNumber: withSale!.sale.receipt_number || withSale!.sale.sale_number,
              total: Number(withSale!.sale.total) || 0,
              paidTotal: Number(withSale!.sale.paid_total) || 0,
              changeDue: Number(withSale!.sale.change_due) || 0,
            }
          : null,
      })
    }

    if (action === "cancel") {
      const pendingId = String(body?.pendingId || "")
      if (!pendingId) throw new CardPaymentError("pendingId required", 400)
      const row = await cancelPendingCharge(tenant, pendingId)
      if (!row) throw new CardPaymentError("Pending payment not found", 404)
      return NextResponse.json({ ok: true, status: row.status })
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 })
  } catch (e: any) {
    return fail(e)
  }
}
