"use client";

import { useCallback, useEffect, useState } from "react";

// The customer's payment home — a first-class place in the portal
// (owner order, 2026-11-04). Cards are saved as Authorize.net
// customer profiles: Accept.js sends the card straight from this
// browser to the gateway and returns a token; only the gateway's
// profile ids and the masked card (brand + last four) live here.
// A card saved here is chargeable at checkout — same gateway, same
// profile — unlike the old Stripe setup card in Preferences, which
// checkout cannot use.

async function jfetch(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function loadAcceptJs(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).Accept?.dispatchData) return resolve();
    const existing = document.querySelector(`script[src="${url}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("secure payment library failed to load")));
      return;
    }
    const s = document.createElement("script");
    s.src = url;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("secure payment library failed to load"));
    document.head.appendChild(s);
  });
}

interface SavedCard {
  id: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  isDefault: boolean;
}

export function PaymentSection({
  anet,
}: {
  anet: { api_login_id: string; public_client_key: string; accept_js_url: string } | null;
}) {
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [cardCode, setCardCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [makeDefault, setMakeDefault] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await jfetch("/api/customers/me/cards");
      setCards(data.cards ?? []);
    } catch {
      setCards([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (anet) loadAcceptJs(anet.accept_js_url).catch(() => undefined);
  }, [anet]);

  async function saveCard(e: React.FormEvent) {
    e.preventDefault();
    if (!anet) return;
    setError("");
    const digits = cardNumber.replace(/\D/g, "");
    if (digits.length < 13 || !/^\d{1,2}$/.test(month) || !/^\d{2,4}$/.test(year) || cardCode.trim().length < 3) {
      setError("Enter the card number, expiry month and year, and the security code from the back of the card.");
      return;
    }
    setBusy(true);
    try {
      await loadAcceptJs(anet.accept_js_url);
      const Accept = (window as any).Accept;
      if (!Accept?.dispatchData) throw new Error("The secure payment library did not load. Check your connection and try again.");
      const nonce = await new Promise<{ data_descriptor: string; data_value: string }>((resolve, reject) => {
        Accept.dispatchData(
          {
            authData: { clientKey: anet.public_client_key, apiLoginID: anet.api_login_id },
            cardData: {
              cardNumber: digits,
              month: month.padStart(2, "0"),
              year: year.length === 2 ? `20${year}` : year,
              cardCode: cardCode.trim(),
              fullName: fullName.trim() || undefined,
            },
          },
          (response: any) => {
            if (response?.messages?.resultCode === "Error") {
              const text = (response.messages.message || []).map((m: any) => m.text).filter(Boolean).join(" ");
              reject(new Error(text || "The card details were not accepted. Check them and try again."));
              return;
            }
            const opaque = response?.opaqueData;
            if (!opaque?.dataDescriptor || !opaque?.dataValue) {
              reject(new Error("The payment service did not return a payment token. Try again."));
              return;
            }
            resolve({ data_descriptor: opaque.dataDescriptor, data_value: opaque.dataValue });
          },
        );
      });
      await jfetch("/api/customers/me/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...nonce,
          exp_month: Number(month),
          exp_year: Number(year.length === 2 ? `20${year}` : year),
          is_default: makeDefault,
        }),
      });
      setCardNumber("");
      setMonth("");
      setYear("");
      setCardCode("");
      setFullName("");
      setMakeDefault(false);
      setShowForm(false);
      await load();
    } catch (err: any) {
      setError(err?.message || "That card could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function removeCard(id: string) {
    setBusy(true);
    try {
      await jfetch(`/api/customers/me/cards/${id}`, { method: "DELETE" });
      await load();
    } catch (err: any) {
      setError(err?.message || "That card could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ua-blk">
      <h2 className="ua-h2">Payment</h2>
      <p className="ua-sub">
        Cards you save here are kept securely by our payment provider — we never see or store the
        number — and can be used at checkout without typing them again.
      </p>

      {loaded && cards.length > 0 ? (
        cards.map((c) => (
          <div className="ua-item" key={c.id}>
            <div>
              <div>
                {(c.brand || "Card") + (c.last4 ? ` ···· ${c.last4}` : "")}
                {c.isDefault ? " · Default" : ""}
              </div>
              <div className="ua-mut">
                {c.expMonth && c.expYear
                  ? `Expires ${String(c.expMonth).padStart(2, "0")}/${c.expYear}`
                  : ""}
              </div>
            </div>
            <button type="button" className="ua-btn ghost sm" disabled={busy} onClick={() => void removeCard(c.id)}>
              Remove
            </button>
          </div>
        ))
      ) : loaded ? (
        <p className="ua-sub">No saved cards yet.</p>
      ) : null}

      {error && <p className="ua-sub" role="alert">{error}</p>}

      {anet ? (
        showForm ? (
          <form onSubmit={saveCard}>
            <div className="ua-f">
              <label>Name on card</label>
              <input className="ua-input" autoComplete="cc-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="ua-f">
              <label>Card number</label>
              <input
                className="ua-input"
                inputMode="numeric"
                autoComplete="cc-number"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                required
              />
            </div>
            <div className="ua-cols" style={{ gap: 14 }}>
              <div className="ua-f">
                <label>Expiry month</label>
                <input className="ua-input" inputMode="numeric" placeholder="MM" value={month} onChange={(e) => setMonth(e.target.value)} required />
              </div>
              <div className="ua-f">
                <label>Expiry year</label>
                <input className="ua-input" inputMode="numeric" placeholder="YYYY" value={year} onChange={(e) => setYear(e.target.value)} required />
              </div>
              <div className="ua-f">
                <label>Security code</label>
                <input className="ua-input" inputMode="numeric" autoComplete="cc-csc" value={cardCode} onChange={(e) => setCardCode(e.target.value)} required />
              </div>
            </div>
            <label className="ua-sub" style={{ display: "block", margin: "10px 0" }}>
              <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} /> Make
              this my default card
            </label>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" className="ua-btn" disabled={busy}>
                {busy ? "Saving…" : "Save card"}
              </button>
              <button type="button" className="ua-btn ghost" disabled={busy} onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="ua-btn" onClick={() => setShowForm(true)}>
            Add a card
          </button>
        )
      ) : (
        <p className="ua-sub">Card saving is not switched on yet.</p>
      )}
    </section>
  );
}
