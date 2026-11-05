"use client"

import { useMemo, useState } from "react"
import { loadStripe } from "@stripe/stripe-js"
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js"
import { CreditCard, Loader2 } from "lucide-react"

// ============================================================================
// AddCardForm — customer-facing add-a-card for the portal Payment Methods
// page. The parent page first mints a SetupIntent via
// POST /api/customer/payment-methods/setup-intent (session-derived Stripe
// customer) and hands us its client secret; the card number is typed into
// Stripe's own Elements field and confirmed straight to Stripe with
// confirmCardSetup — card details never touch our servers or database.
// Same loadStripe singleton pattern as StripeCardForm / the storefront.
// ============================================================================

const stripePromise = (() => {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  return key ? loadStripe(key) : null
})()

export function stripeJsAvailable(): boolean {
  return !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
}

function AddCardFormInner({
  clientSecret,
  onSaved,
  onCancel,
}: {
  clientSecret: string
  onSaved: (paymentMethodId: string) => void
  onCancel: () => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (!stripe || !elements || busy) return
    const card = elements.getElement(CardElement)
    if (!card) return
    setBusy(true)
    setError(null)
    // confirmCardSetup drives any bank authentication (3DS) in Stripe's
    // own modal; the card attaches to the customer's Stripe customer.
    const { error: stripeError, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
      payment_method: { card },
    })
    if (stripeError) {
      setError(stripeError.message || "That card couldn't be saved.")
      setBusy(false)
      return
    }
    if (!setupIntent || setupIntent.status !== "succeeded") {
      setError("The card wasn't saved — please try again.")
      setBusy(false)
      return
    }
    const pmId =
      typeof setupIntent.payment_method === "string"
        ? setupIntent.payment_method
        : setupIntent.payment_method?.id || ""
    onSaved(pmId)
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
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!stripe || busy}
          className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground text-[13px] font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
          {busy ? "Saving…" : "Save card"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="py-2.5 px-4 rounded-lg border border-border text-[13px] font-semibold text-foreground cursor-pointer disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground text-center">Card details go directly to Stripe — they never touch our servers.</p>
    </div>
  )
}

export default function AddCardForm({
  clientSecret,
  onSaved,
  onCancel,
}: {
  clientSecret: string
  onSaved: (paymentMethodId: string) => void
  onCancel: () => void
}) {
  const options = useMemo(() => ({ clientSecret }), [clientSecret])
  if (!stripePromise) {
    return (
      <p className="text-[12px] font-medium text-destructive bg-destructive/10 border border-destructive/20 rounded px-2.5 py-2">
        Card entry is unavailable right now — please try again later, or save a card at checkout instead.
      </p>
    )
  }
  return (
    <Elements stripe={stripePromise} options={options}>
      <AddCardFormInner clientSecret={clientSecret} onSaved={onSaved} onCancel={onCancel} />
    </Elements>
  )
}
