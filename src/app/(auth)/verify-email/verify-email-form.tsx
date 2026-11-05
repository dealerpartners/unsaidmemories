"use client";

import { useState } from "react";
import { Mail } from "lucide-react";

/**
 * The waiting screen for the store's confirmation email. The email
 * carries a magic confirm link; tapping it lands through
 * /auth/callback, which stamps the account and routes onward. Resend
 * mints a fresh link (old ones stop working). "I've tapped it" simply
 * reloads — the server page re-reads the account and routes a
 * confirmed user onward by itself.
 */
export function VerifyEmailForm({
  next,
  cardName,
  cardEmail,
  cardAvatar,
  fromGoogle,
}: {
  next: string;
  cardName: string;
  cardEmail: string;
  cardAvatar: string;
  fromGoogle: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function resend() {
    setBusy(true);
    setNote("");
    try {
      const res = await fetch("/api/auth/email/resend-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ next }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setNote(
        res.ok
          ? "Sent — check your inbox. In Gmail it may land under Promotions."
          : body.error ?? "We couldn't resend it just now. Please try again in a moment."
      );
    } catch {
      setNote("We couldn't resend it just now. Please try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2
        style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: 34,
          fontWeight: 400,
          margin: "0 0 18px",
          color: "#171420",
        }}
      >
        Check your email.
      </h2>

      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          border: "1px solid #e4e0ea",
          borderRadius: 12,
          padding: "12px 16px",
          marginBottom: 18,
          background: "#fff",
        }}
      >
        {cardAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cardAvatar}
            alt=""
            style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover" }}
          />
        ) : null}
        <div>
          <div style={{ fontWeight: 700, color: "#171420" }}>{cardName || cardEmail}</div>
          <div style={{ color: "#3c3744", fontSize: 14 }}>{cardEmail}</div>
          <div style={{ color: "#3c3744", fontSize: 12 }}>
            {fromGoogle ? "From your Google account" : "From your account"}
          </div>
        </div>
      </div>

      <p style={{ color: "#3c3744", fontSize: 15, lineHeight: 1.6, margin: "0 0 20px" }}>
        We sent a confirmation email to <strong>{cardEmail}</strong>. Tap the link in
        it — it brings you right back here, and then we&apos;ll do the quick phone
        check. The link works once, so use the newest email if you resend.
      </p>

      <button
        onClick={resend}
        disabled={busy}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          background: "#171420",
          color: "#fff",
          border: "none",
          borderRadius: 10,
          padding: "15px 20px",
          fontSize: 15,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <Mail size={17} />
        {busy ? "Sending…" : "Resend the email"}
      </button>
      <button
        onClick={() => window.location.reload()}
        style={{
          width: "100%",
          background: "#fff",
          color: "#171420",
          border: "1px solid #171420",
          borderRadius: 10,
          padding: "13px 20px",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
          marginTop: 10,
        }}
      >
        I&apos;ve tapped it — continue
      </button>
      {note ? (
        <p style={{ color: "#3c3744", fontSize: 14, marginTop: 14 }}>{note}</p>
      ) : null}
    </div>
  );
}
