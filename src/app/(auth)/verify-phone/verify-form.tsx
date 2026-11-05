"use client";

import { useState } from "react";
import { Smartphone } from "lucide-react";

/**
 * Two phases on one screen: number → code. The send route runs the
 * Twilio Lookup fraud gate before any code exists (non-mobile numbers
 * are refused there), and the check route stamps the account on
 * approval. Success leaves by full navigation so every server gate
 * downstream reads the fresh verified stamp.
 */
export function VerifyPhoneForm({
  next,
  cardName,
  cardEmail,
  cardAvatar,
  cardPhone,
  fromGoogle,
}: {
  next: string;
  cardName: string;
  cardEmail: string;
  cardAvatar: string;
  cardPhone: string;
  fromGoogle: boolean;
}) {
  // After the phone stamp, the chain's last step is the completion
  // form (address — the one thing capture cannot supply). It passes
  // straight through for accounts that already hold an address and
  // is skippable for everyone else.
  const onward = `/complete-profile?next=${encodeURIComponent(next)}`;
  const [phase, setPhase] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState(cardPhone);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/phone/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; verified?: boolean };
      if (!res.ok) {
        setError(body.error ?? "The code could not be sent. Please try again.");
        return;
      }
      // Lenient mode: the send route already stamped the account
      // verified — there is no code to enter, go straight through.
      if (body.verified) {
        window.location.href = onward;
        return;
      }
      setPhase("code");
    } catch {
      setError("The code could not be sent. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function check() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/phone/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "That code didn't work. Please try again.");
        return;
      }
      window.location.href = onward;
    } catch {
      setError("That code didn't work. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2>Verify your phone.</h2>
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
            </div>
          </div>
        </div>
      )}
      <p>
        {cardPhone
          ? "We have this number from your account — confirm it's your mobile, or change it. "
          : ""}
        We text a code to your mobile — one time only. It has to be a real mobile
        number; internet phone numbers and landlines can&apos;t be verified.
      </p>

      {error && <div className="auth-error">{error}</div>}

      {phase === "phone" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <div className="auth-field">
            <label htmlFor="phone">Mobile number</label>
            <input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              placeholder="(555) 123-4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="auth-submit" disabled={busy || !phone.trim()}>
            <Smartphone size={16} /> {busy ? "Sending…" : "Text me the code"}
          </button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void check();
          }}
        >
          <div className="auth-field">
            <label htmlFor="code">Code from the text</label>
            <input
              id="code"
              name="code"
              type="text"
              autoComplete="one-time-code"
              inputMode="numeric"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, ""))}
              required
            />
          </div>
          <button type="submit" className="auth-submit" disabled={busy || code.length < 4}>
            {busy ? "Checking…" : "Verify and continue"}
          </button>
          <p style={{ marginTop: 14 }}>
            Didn&apos;t get it?{" "}
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy}
              style={{ textDecoration: "underline", background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" }}
            >
              Send a new code
            </button>{" "}
            ·{" "}
            <button
              type="button"
              onClick={() => {
                setPhase("phone");
                setCode("");
                setError("");
              }}
              disabled={busy}
              style={{ textDecoration: "underline", background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" }}
            >
              Use a different number
            </button>
          </p>
        </form>
      )}
    </>
  );
}
