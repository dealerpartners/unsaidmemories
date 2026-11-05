"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";

/**
 * The completion form: the contact card on top — everything capture
 * already put on the record, shown, never re-asked — and the address
 * fields below, the only blanks left. Saving writes to the same
 * address book the portal and checkout read
 * (/api/customers/me/addresses). Skip goes straight onward.
 */
export function CompleteProfileForm({
  next,
  cardName,
  cardEmail,
  cardAvatar,
  cardPhone,
  fromGoogle,
  prefill,
}: {
  next: string;
  cardName: string;
  cardEmail: string;
  cardAvatar: string;
  cardPhone: string;
  fromGoogle: boolean;
  prefill: {
    first_name: string;
    last_name: string;
    line1: string;
    line2: string;
    city: string;
    state: string;
    postal_code: string;
    country_code: string;
    phone: string;
  };
}) {
  const [draft, setDraft] = useState(prefill);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof draft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/customers/me/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, is_default: true }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "That address could not be saved. Please check it and try again.");
        return;
      }
      window.location.href = next;
    } catch {
      setError("That address could not be saved. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2>Your address.</h2>
      {(cardName || cardEmail) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            border: "1px solid rgba(23, 20, 32, 0.12)",
            borderRadius: 14,
            padding: "12px 14px",
            marginBottom: 18,
          }}
        >
          {cardAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cardAvatar}
              alt=""
              width={40}
              height={40}
              style={{ borderRadius: "50%", objectFit: "cover" }}
              referrerPolicy="no-referrer"
            />
          ) : (
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: "#f2eafe",
                color: "#6942c2",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 600,
              }}
            >
              {(cardName || cardEmail || "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            {cardName && <div style={{ fontWeight: 600 }}>{cardName}</div>}
            {cardEmail && (
              <div style={{ opacity: 0.75, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis" }}>
                {cardEmail}
              </div>
            )}
            <div style={{ opacity: 0.6, fontSize: 12.5 }}>
              {fromGoogle ? "From your Google account" : "From your account"}
              {cardPhone ? ` · ${cardPhone} verified` : ""}
            </div>
          </div>
        </div>
      )}

      {error && <div className="auth-error">{error}</div>}

      <form onSubmit={save}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="auth-field">
            <label htmlFor="cp-first">First name</label>
            <input id="cp-first" autoComplete="given-name" value={draft.first_name} onChange={set("first_name")} required />
          </div>
          <div className="auth-field">
            <label htmlFor="cp-last">Last name</label>
            <input id="cp-last" autoComplete="family-name" value={draft.last_name} onChange={set("last_name")} required />
          </div>
        </div>
        <div className="auth-field">
          <label htmlFor="cp-line1">Street address</label>
          <input id="cp-line1" autoComplete="street-address" value={draft.line1} onChange={set("line1")} required />
        </div>
        <div className="auth-field">
          <label htmlFor="cp-line2">Apartment, suite (optional)</label>
          <input id="cp-line2" value={draft.line2} onChange={set("line2")} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="auth-field">
            <label htmlFor="cp-city">City</label>
            <input id="cp-city" autoComplete="address-level2" value={draft.city} onChange={set("city")} required />
          </div>
          <div className="auth-field">
            <label htmlFor="cp-state">State</label>
            <input id="cp-state" autoComplete="address-level1" value={draft.state} onChange={set("state")} required />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="auth-field">
            <label htmlFor="cp-zip">Postal code</label>
            <input id="cp-zip" autoComplete="postal-code" value={draft.postal_code} onChange={set("postal_code")} required />
          </div>
          <div className="auth-field">
            <label htmlFor="cp-country">Country</label>
            <input
              id="cp-country"
              autoComplete="country"
              value={draft.country_code}
              onChange={(e) => setDraft((d) => ({ ...d, country_code: e.target.value.toUpperCase() }))}
              maxLength={2}
              required
            />
          </div>
        </div>
        <button type="submit" className="auth-submit" disabled={busy}>
          <MapPin size={16} /> {busy ? "Saving…" : "Save and continue"}
        </button>
      </form>
      <p style={{ marginTop: 14 }}>
        <button
          type="button"
          onClick={() => {
            window.location.href = next;
          }}
          style={{ textDecoration: "underline", background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" }}
        >
          Skip for now
        </button>{" "}
        — you can add it any time in your portal, under Addresses.
      </p>
    </>
  );
}
