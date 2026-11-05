'use client'

// SellerConnectPanel — the seller's Stripe Connect payout account,
// rendered from the REAL recorded state (GET /api/seller/connect →
// seller_stripe_accounts, the store lib/sellers/connect.ts writes).
// Used by onboarding Step 3 (Bank info) and Payments → Methods.
//
// The rail, truthfully: payouts execute to the seller's connected
// Stripe Express account — Stripe holds the full bank details and
// identity verification; this platform never sees them. The panel's
// states are Stripe's own flags, refreshed from Stripe when the
// seller returns from hosted onboarding (?connect=return → POST
// /api/seller/connect/sync) or taps Refresh status; Stripe's
// account.updated webhook keeps them current between visits.

import { useEffect, useState } from "react"
import { BadgeCheck, Landmark, Loader2, RefreshCw } from "lucide-react"
import { sellerPost } from "@/components/portal/seller/SellerData"

export interface SellerConnectState {
  stripeAccountId: string | null
  chargesEnabled: boolean
  payoutsEnabled: boolean
  onboardingComplete: boolean
}

export function SellerConnectPanel({ returnTo }: { returnTo: "wizard" | "methods" }) {
  const [connect, setConnect] = useState<SellerConnectState | null>(null)
  const [delayDays, setDelayDays] = useState<number | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [busy, setBusy] = useState<"start" | "sync" | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const back = new URLSearchParams(window.location.search).get("connect")
    if (back === "return") {
      setNotice("Welcome back — your payout account status is up to date.")
    } else if (back === "refresh") {
      setNotice(
        "That Stripe link expired before you finished. Start again below — the progress you made is saved with Stripe.",
      )
    }
    const run = async () => {
      // Returning from Stripe: sync first so the state below is
      // Stripe's current truth, not the pre-onboarding record.
      if (back === "return") {
        await fetch("/api/seller/connect/sync", { method: "POST" }).catch(() => null)
      }
      const d = await fetch("/api/seller/connect", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
      if (cancelled) return
      if (d?.connect) {
        setConnect(d.connect as SellerConnectState)
        setDelayDays(
          typeof d.payoutDelay?.delayDays === "number" ? d.payoutDelay.delayDays : null,
        )
      } else {
        setLoadFailed(true)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  const start = async () => {
    setBusy("start")
    setActionError(null)
    setNotice(null)
    try {
      const out = (await sellerPost("/api/seller/connect", { returnTo })) as {
        url?: string
      }
      if (out?.url) {
        window.location.href = out.url
        return
      }
      setActionError("Stripe didn't return a setup link — please try again.")
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't start Stripe setup.")
    } finally {
      setBusy(null)
    }
  }

  const refresh = async () => {
    setBusy("sync")
    setActionError(null)
    setNotice(null)
    try {
      const out = (await sellerPost("/api/seller/connect/sync", {})) as {
        connect?: SellerConnectState
      }
      if (out?.connect) setConnect(out.connect)
      setNotice("Payout account status refreshed from Stripe.")
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't refresh your status.")
    } finally {
      setBusy(null)
    }
  }

  const tail = connect?.stripeAccountId ? ` ····${connect.stripeAccountId.slice(-4)}` : ""

  return (
    <section className="rounded-xl border bg-card">
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
          <Landmark className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h3 className="font-semibold">Payout account — Stripe Connect</h3>
          <p className="text-sm text-muted-foreground">
            Where payouts are actually sent. Stripe holds your bank details and verifies
            your identity; they never touch this platform.
          </p>
        </div>
      </div>
      <div className="px-6 py-4">
        {notice && <p className="mb-3 rounded-lg bg-muted px-4 py-2 text-sm">{notice}</p>}
        {actionError && <p className="mb-3 text-sm text-destructive">{actionError}</p>}
        {!connect ? (
          <p className="text-sm text-muted-foreground">
            {loadFailed
              ? "Your payout account status couldn't be loaded — reload the page to try again."
              : "Loading your payout account status…"}
          </p>
        ) : !connect.stripeAccountId ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              You haven&apos;t connected a payout account yet. Until you do, an approved
              payout can&apos;t be sent — sales still settle to your wallet, and payouts
              execute once your Stripe account is connected.
              {delayDays
                ? ` Your payout window is ${delayDays} days: funds release to your bank ${delayDays} days after each payout is sent.`
                : ""}
            </p>
            <button
              type="button"
              onClick={start}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {busy === "start" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Connect payout account with Stripe
            </button>
          </div>
        ) : !connect.onboardingComplete ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Stripe setup started (account{tail}) but isn&apos;t finished — payouts
              can&apos;t be sent yet. Continue where you left off; Stripe saved your
              progress.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={start}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {busy === "start" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Continue Stripe setup
              </button>
              <button
                type="button"
                onClick={refresh}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                {busy === "sync" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Refresh status
              </button>
            </div>
          </div>
        ) : !connect.payoutsEnabled ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Stripe has your details (account{tail}) and is finishing verification —
              payouts turn on when Stripe enables them. If Stripe asked for more
              information, its setup flow has the details.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={start}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {busy === "start" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Open Stripe setup
              </button>
              <button
                type="button"
                onClick={refresh}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                {busy === "sync" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Refresh status
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="inline-flex items-center gap-1.5 text-sm font-medium">
              <BadgeCheck className="h-4 w-4 text-primary" />
              Connected — payouts are enabled on your Stripe account{tail}.
            </p>
            <p className="text-sm text-muted-foreground">
              Approved payouts are sent to this account
              {delayDays
                ? ` and release to your bank on its ${delayDays}-day payout window`
                : ""}
              . To change the bank account or tax details Stripe pays, update them with
              Stripe during setup — the account ending above is the one on file.
            </p>
            <button
              type="button"
              onClick={refresh}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              {busy === "sync" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh status
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
