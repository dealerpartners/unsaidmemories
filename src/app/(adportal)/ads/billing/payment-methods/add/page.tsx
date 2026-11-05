"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

function CardForm({ clientSecret }: { clientSecret: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!stripe || !elements) return;
    const card = elements.getElement(CardElement);
    if (!card) return;
    setNote("");
    setBusy(true);
    const { error, setupIntent } = await stripe.confirmCardSetup(clientSecret, { payment_method: { card } });
    if (error) { setNote(error.message || "Card setup failed."); setBusy(false); return; }
    const pmId = typeof setupIntent?.payment_method === "string" ? setupIntent.payment_method : setupIntent?.payment_method?.id;
    if (!pmId) { setNote("Card setup didn't return a payment method."); setBusy(false); return; }
    const res = await fetch("/api/ads/billing/payment-methods", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payment_method_id: pmId }) });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setNote("Couldn't save the card: " + (d.error || "unknown error"));
      setBusy(false);
      return;
    }
    router.push("/ads/billing/payment-methods");
  };

  return (
    <div className="space-y-5 rounded-xl border border-neutral-100 bg-white p-6">
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">Card</label>
        <div className="rounded-lg border border-neutral-200 px-3 py-3">
          <CardElement options={{ style: { base: { fontSize: "14px", color: "#171717" } } }} />
        </div>
        <p className="mt-1 text-xs text-neutral-400">Card details go straight to Stripe — they never touch this site's servers.</p>
      </div>
      {note && <p className="text-sm text-red-600">{note}</p>}
      <div className="flex justify-end">
        <button onClick={submit} disabled={busy || !stripe} className="rounded-lg bg-[#f2eafe] px-5 py-2 text-sm font-medium text-[#6942c2] disabled:opacity-50">{busy ? "Saving…" : "Save card"}</button>
      </div>
    </div>
  );
}

export default function Page() {
  const [clientSecret, setClientSecret] = useState("");
  const [unavailable, setUnavailable] = useState("");
  useEffect(() => {
    if (!stripePromise) { setUnavailable("Card entry is unavailable — the Stripe publishable key isn't set for this site. That's a site-configuration step (the keys live in the site owner's Stripe account)."); return; }
    fetch("/api/ads/billing/setup-intent", { method: "POST" })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "setup_failed"); return d; })
      .then((d) => setClientSecret(d.clientSecret))
      .catch((e) => setUnavailable("Card management is unavailable right now: " + String(e?.message || "unknown error")));
  }, []);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Add Payment Method</h1>
        <p className="mt-1 text-sm text-neutral-500">The card billing will charge when campaign spend settles.</p>
      </div>
      {unavailable ? (
        <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600"><p>{unavailable}</p></div>
      ) : clientSecret && stripePromise ? (
        <Elements stripe={stripePromise}>
          <CardForm clientSecret={clientSecret} />
        </Elements>
      ) : (
        <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-500">Preparing secure card entry…</div>
      )}
    </div>
  );
}
