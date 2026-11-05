"use client";

import { useEffect, useState } from "react";

// ============================================================================
// TenantSubscriptionGate — the portal half of the Leashed subscription
// lockout (design step 6). Mounted in the tenant-facing portal layouts
// (admin + employee). It asks /api/tenant/subscription for the signed-in
// user's home-tenant state; when the tenant's Leashed subscription is on
// record and not active/trialing, the portal is covered by the billing
// notice until the subscription recovers (the webhook flips
// tenants.subscription_status back, and a reload re-reads it). Platform
// (master-tenant) users and tenants with no subscription attached are
// never gated. A failed read never locks anyone out — enforcement fails
// open on the read, closed on the recorded status.
// ============================================================================

export default function TenantSubscriptionGate() {
  const [locked, setLocked] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/tenant/subscription", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return;
        setLocked(!!j.locked);
        setStatus(j.status ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!locked) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Subscription payment required"
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(23,25,28,0.72)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          background: "#ffffff", borderRadius: 16, maxWidth: 480, width: "100%",
          padding: "32px 28px", boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
          fontFamily: "inherit", color: "#17191c",
        }}
      >
        <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 700 }}>
          Your Leashed subscription needs attention
        </h2>
        <p style={{ margin: "0 0 12px", fontSize: 15, lineHeight: 1.55 }}>
          This workspace is paused because the Leashed subscription for your
          business is{status ? <> currently <strong>{status}</strong></> : " not active"}.
          Your data is safe, and your marketplace listings are hidden while
          the subscription is unpaid.
        </p>
        <p style={{ margin: "0 0 20px", fontSize: 15, lineHeight: 1.55 }}>
          Update the payment method on your Leashed subscription to restore
          access. Access returns automatically once Stripe confirms the
          payment.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              background: "#f05a24", color: "#fff", border: 0, borderRadius: 10,
              padding: "10px 18px", fontSize: 15, fontWeight: 600, cursor: "pointer",
            }}
          >
            I&apos;ve updated my payment method
          </button>
          <a
            href="/support"
            style={{
              border: "1px solid #d5d9d5", borderRadius: 10, padding: "10px 18px",
              fontSize: 15, fontWeight: 600, color: "#17191c", textDecoration: "none",
            }}
          >
            Contact support
          </a>
        </div>
      </div>
    </div>
  );
}
