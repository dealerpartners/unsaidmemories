"use client"

import { useMemo, useState } from "react"
import { loadStripe } from "@stripe/stripe-js"
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js"
import { CreditCard, Loader2 } from "lucide-react"

// ============================================================================
// StripeCardForm — staff-keyed card entry for the counter (POS register +
// header Process Payment modal). The card number goes straight to Stripe
// from this form (Elements); our servers only ever see the PaymentIntent id.
//
// Follows the storefront pattern (product-detail.tsx): a module-level
// loadStripe singleton keyed by NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY. When the
// publishable key is absent the form renders its honest unavailable state —
// the server-side paths gate on STRIPE_SECRET_KEY separately.
// ============================================================================

const stripePromise = (() => {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  return key ? loadStripe(key) : null
})()

export function stripeJsAvailable(): boolean {
  return !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
}

function KeyedFormInner({
  clientSecret,
  amount,
  onConfirmed,
}: {
  clientSecret: string
  amount: number
  onConfirmed: (paymentIntentId: string) => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const charge = async () => {
    if (!stripe || !elements || busy) return
    const card = elements.getElement(CardElement)
    if (!card) return
    setBusy(true)
    setError(null)
    // confirmCardPayment drives any bank authentication (3DS) in Stripe's
    // own modal; statuses come back here — nothing is assumed.
    const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: { card },
    })
    if (stripeError) {
      setError(stripeError.message || "The card could not be charged.")
      setBusy(false)
      return
    }
    if (!paymentIntent) {
      setError("Stripe returned no result for this charge. Nothing was recorded.")
      setBusy(false)
      return
    }
    if (paymentIntent.status === "succeeded" || paymentIntent.status === "processing") {
      // The parent verifies with the server (POST confirm) — the sale only
      // completes once the server confirms with Stripe directly.
      onConfirmed(paymentIntent.id)
      return
    }
    setError(
      paymentIntent.status === "requires_action"
        ? "The bank needs the customer to approve this charge, which can't finish on the register. Send them a payment link instead."
        : `The card payment did not complete (status: ${paymentIntent.status}). Nothing was recorded.`,
    )
    setBusy(false)
  }

  return (
    <div className="space-y-3">
      <div className="border border-border rounded-lg px-3 py-2.5 bg-background">
        <CardElement
          options={{
            style: {
              base: { fontSize: "15px", color: "#1a1a1a", "::placeholder": { color: "#9ca3af" } },
              invalid: { color: "#dc2626" },
            },
          }}
        />
      </div>
      {error && (
        <p className="text-[12px] font-medium text-destructive bg-destructive/10 border border-destructive/20 rounded px-2.5 py-2">{error}</p>
      )}
      <button
        type="button"
        onClick={charge}
        disabled={!stripe || busy}
        className="w-full py-2.5 rounded-lg border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 text-[13px] font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
        {busy ? "Charging…" : `Charge $${amount.toFixed(2)}`}
      </button>
      <p className="text-[10px] text-muted-foreground text-center">Card details go directly to Stripe — they never touch this register or our servers.</p>
    </div>
  )
}

export default function StripeCardForm({
  clientSecret,
  amount,
  onConfirmed,
}: {
  clientSecret: string
  amount: number
  onConfirmed: (paymentIntentId: string) => void
}) {
  const options = useMemo(() => ({ clientSecret }), [clientSecret])
  if (!stripePromise) {
    return (
      <p className="text-[12px] font-medium text-destructive bg-destructive/10 border border-destructive/20 rounded px-2.5 py-2">
        Card entry is unavailable — the Stripe publishable key (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) is not set for this site. Use a payment link, a card on file, or a manual record instead.
      </p>
    )
  }
  return (
    <Elements stripe={stripePromise} options={options}>
      <KeyedFormInner clientSecret={clientSecret} amount={amount} onConfirmed={onConfirmed} />
    </Elements>
  )
}
