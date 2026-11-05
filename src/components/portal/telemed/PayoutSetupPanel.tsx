"use client";

/* §1.8 — the veterinarian's payout setup face (telemed portal profile).
 * Renders only for vets: GET /api/telemed/payout-setup answers 403 for
 * everyone else and the panel stays silent. State shown is the RECORDED
 * state (the roster seat + the Connect store, as last synced); the
 * "Refresh status" act re-reads Stripe itself. Onboarding is hosted by
 * Stripe (Connect Express — owner ruling 2026-10-16, the same rail as
 * sellers): this panel never collects bank details. */

import { useCallback, useEffect, useRef, useState } from "react";
import { Landmark } from "lucide-react";

type ConnectState = {
  stripeAccountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  onboardingComplete: boolean;
  disabledReason: string | null;
  seat: string;
};

type SetupState = {
  connectedAccountId: string | null;
  accountRecorded: boolean;
  onboardingComplete: boolean;
  payoutRateMultiplier: number | null;
  payoutSchedule: { recorded: boolean; note: string };
};

export function PayoutSetupPanel() {
  const [setup, setSetup] = useState<SetupState | null>(null);
  const [connect, setConnect] = useState<ConnectState | null>(null);
  const [isVet, setIsVet] = useState(false);
  const [delayDays, setDelayDays] = useState<3 | 5 | 7>(3);
  const [busy, setBusy] = useState<"connect" | "sync" | null>(null);
  const [msg, setMsg] = useState("");
  const syncedOnReturn = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/telemed/payout-setup", { cache: "no-store" });
      if (!res.ok) return;
      const j = await res.json();
      if (j?.ok) {
        setIsVet(true);
        setSetup(j.payoutSetup ?? null);
        setConnect(j.connect ?? null);
      }
    } catch {
      /* not a vet / unavailable — the panel stays silent */
    }
  }, []);

  const sync = useCallback(async (announce: boolean) => {
    setBusy("sync");
    try {
      const res = await fetch("/api/telemed/payout-setup/sync", { method: "POST" });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok) {
        setConnect(j.connect ?? null);
        if (announce) setMsg("Payout status refreshed from Stripe.");
        await load();
      } else if (announce) {
        setMsg(j?.message || "Could not refresh payout status from Stripe.");
      }
    } catch {
      if (announce) setMsg("Could not refresh payout status from Stripe.");
    }
    setBusy(null);
  }, [load]);

  useEffect(() => {
    load().then(() => {
      // Returning from Stripe's hosted onboarding: pull the true state
      // immediately rather than waiting on the account.updated webhook.
      if (
        !syncedOnReturn.current &&
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("payout")
      ) {
        syncedOnReturn.current = true;
        sync(false);
      }
    });
  }, [load, sync]);

  const startOnboarding = async () => {
    setBusy("connect");
    setMsg("");
    try {
      const res = await fetch("/api/telemed/payout-setup/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delayDays }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok && j.url) {
        window.location.assign(j.url);
        return;
      }
      setMsg(j?.message || "Payout setup is unavailable right now.");
    } catch {
      setMsg("Payout setup is unavailable right now.");
    }
    setBusy(null);
  };

  if (!isVet || !setup) return null;

  const hasAccount = Boolean(connect?.stripeAccountId || setup.connectedAccountId);
  const payoutsLive = Boolean(connect?.payoutsEnabled);
  const onboardingDone = Boolean(connect?.onboardingComplete || setup.onboardingComplete);

  return (
    <section className="rounded-lg border bg-card p-6">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
        <Landmark className="size-5" /> Payouts
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Consult earnings are paid to your bank through Stripe Connect — the same
        payout rail the marketplace uses. Bank details are entered on Stripe
        only; they never touch this app.
      </p>

      {msg && (
        <p className="mb-4 rounded border border-border bg-muted p-2 text-sm">{msg}</p>
      )}

      <dl className="grid gap-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Payout account</dt>
          <dd className="font-medium">
            {hasAccount ? "Connected (Stripe Express)" : "Not set up yet"}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Onboarding</dt>
          <dd className="font-medium">{onboardingDone ? "Complete" : "Not complete"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Payouts</dt>
          <dd className="font-medium">
            {payoutsLive
              ? "Enabled"
              : hasAccount
                ? "Not enabled yet"
                : "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Your share of the consult fee</dt>
          <dd className="font-medium">
            {setup.payoutRateMultiplier != null
              ? `${Math.round(setup.payoutRateMultiplier * 100)}%`
              : "Not recorded"}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Payout window</dt>
          <dd className="font-medium">
            {setup.payoutSchedule.recorded
              ? "Recorded on your payout account"
              : "Set when you start payout setup"}
          </dd>
        </div>
        {connect?.disabledReason && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Stripe needs</dt>
            <dd className="font-medium">{connect.disabledReason}</dd>
          </div>
        )}
      </dl>

      {!payoutsLive && (
        <div className="mt-5">
          {!hasAccount && (
            <fieldset className="mb-4">
              <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Payout window — how long after a consult your share is released
              </legend>
              <div className="mt-2 flex gap-4 text-sm">
                {([3, 5, 7] as const).map((d) => (
                  <label key={d} className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="payout-delay"
                      checked={delayDays === d}
                      onChange={() => setDelayDays(d)}
                    />
                    {d} days
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={startOnboarding}
              disabled={busy !== null}
              className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy === "connect"
                ? "Opening Stripe…"
                : hasAccount
                  ? "Continue payout setup on Stripe"
                  : "Set up payouts on Stripe"}
            </button>
            {hasAccount && (
              <button
                onClick={() => sync(true)}
                disabled={busy !== null}
                className="rounded border border-border px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {busy === "sync" ? "Refreshing…" : "Refresh status"}
              </button>
            )}
          </div>
        </div>
      )}
      {payoutsLive && (
        <div className="mt-5">
          <button
            onClick={() => sync(true)}
            disabled={busy !== null}
            className="rounded border border-border px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {busy === "sync" ? "Refreshing…" : "Refresh status"}
          </button>
        </div>
      )}
    </section>
  );
}
