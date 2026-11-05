"use client";

import { useCallback, useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { CreditCard, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { primaryCtaStyle } from "@/components/commerce/cta-style";

interface SavedCard {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

function SetupForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError("");
    const { error: err } = await stripe.confirmSetup({
      elements,
      redirect: "if_required",
      // Required by Stripe when a redirect-based method is chosen —
      // without it the confirmation fails outright (the account
      // notice of 2026-10-30). Returns the customer to their account.
      confirmParams: { return_url: `${window.location.origin}/account` },
    });
    setBusy(false);
    if (err) {
      setError(err.message || "That card could not be saved. Please check the details and try again.");
      return;
    }
    onDone();
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <PaymentElement />
      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !stripe} style={primaryCtaStyle}>
          {busy ? "Saving…" : "Save card"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * Saved payment methods — cards live at Stripe, never in our
 * database. This card lists them (brand + last 4 only), adds new
 * ones through Stripe's own form, and removes them.
 */
export function PaymentMethodsCard() {
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [cardsRes, cfgRes] = await Promise.all([
        fetch("/api/customers/me/payment-methods", { cache: "no-store" }),
        fetch("/api/checkout/config", { cache: "no-store" }),
      ]);
      if (cardsRes.ok) setCards((await cardsRes.json()).cards ?? []);
      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        if (cfg.publishable_key) setPublishableKey(cfg.publishable_key);
      }
    } catch {
      /* the empty state below explains what to do */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startAdd = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/customers/me/payment-methods/setup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start card setup.");
      setClientSecret(data.clientSecret);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await fetch(`/api/customers/me/payment-methods/${id}`, { method: "DELETE" });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" /> Payment methods
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Cards are stored securely by Stripe — we never see or keep the numbers.
        </p>
        {loading ? (
          <p className="text-muted-foreground">Loading your cards…</p>
        ) : cards.length === 0 && !clientSecret ? (
          <p className="text-muted-foreground">No saved cards yet. Add one to check out faster next time.</p>
        ) : (
          cards.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-md border px-4 py-3">
              <p>
                <span className="font-medium capitalize">{c.brand}</span> •••• {c.last4}
                <span className="text-muted-foreground">
                  {" "}
                  · expires {String(c.expMonth).padStart(2, "0")}/{c.expYear}
                  {c.isDefault ? " · default" : ""}
                </span>
              </p>
              <Button variant="ghost" size="icon" disabled={busy} onClick={() => remove(c.id)} aria-label="Remove card">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}
        {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-destructive">{error}</p>}
        {clientSecret && stripePromise ? (
          <Elements stripe={stripePromise} options={{ clientSecret }}>
            <SetupForm
              onDone={() => {
                setClientSecret(null);
                load();
              }}
              onCancel={() => setClientSecret(null)}
            />
          </Elements>
        ) : (
          !loading && (
            <Button onClick={startAdd} disabled={busy} style={primaryCtaStyle}>
              Add a card
            </Button>
          )
        )}
      </CardContent>
    </Card>
  );
}
