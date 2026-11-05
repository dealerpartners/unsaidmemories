'use client'

// SelfServePrompts — the self-serve seller's standing prompts on the
// dashboard (owner ruling 2026-10-22): finish Stripe payout setup when
// the Connect onboarding is incomplete, the payout name-mismatch hold,
// and the DEFERRED tax form — once recorded earnings cross $2,000 the
// form is required to keep selling and be paid, the desk ticket is
// already filed, and this is where the seller is told. Renders nothing
// for sellers without a self-serve packet or with nothing outstanding.

import { useEffect, useState } from "react"
import { AlertTriangle, FileText, Wallet } from "lucide-react"

interface SelfServeState {
  ok: boolean
  selfServe: boolean
  payout: { chargesEnabled: boolean; payoutsEnabled: boolean; onboardingComplete: boolean } | null
  payoutNameMatch?: string
  taxForm: { status: string; recordedEarnings: number; threshold: number; ticketRef: string | null } | null
}

export function SelfServePrompts() {
  const [state, setState] = useState<SelfServeState | null>(null)
  const [linking, setLinking] = useState(false)

  useEffect(() => {
    let live = true
    fetch("/api/seller/self-serve")
      .then((r) => r.json())
      .then((d) => { if (live) setState(d) })
      .catch(() => {})
    return () => { live = false }
  }, [])

  if (!state?.selfServe) return null

  const payoutPending = state.payout && !state.payout.onboardingComplete
  const nameMismatch = state.payoutNameMatch === "mismatch"
  const taxDue = state.taxForm?.status === "required_prompted"
  if (!payoutPending && !nameMismatch && !taxDue) return null

  const startPayout = async () => {
    setLinking(true)
    try {
      const r = await fetch("/api/seller/self-serve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "payout_link" }),
      })
      const d = await r.json()
      if (d.url) window.location.href = d.url
    } finally {
      setLinking(false)
    }
  }

  return (
    <div className="space-y-3">
      {taxDue && (
        <div className="flex items-start gap-3 rounded-xl border border-[#f05a24]/40 bg-[#fdf3ef] p-4">
          <FileText className="mt-0.5 h-5 w-5 shrink-0 text-[#f05a24]" />
          <div className="text-sm">
            <p className="font-semibold text-neutral-900">Tax form required</p>
            <p className="mt-0.5 text-neutral-700">
              Your recorded earnings are ${Number(state.taxForm?.recordedEarnings ?? 0).toFixed(2)} — past the
              $2,000 mark where the tax form deferred at signup comes due. It is required to keep selling and
              be paid. Our team opened ticket {state.taxForm?.ticketRef ?? ""} for it — send your completed
              form (W-9 for most sellers) in reply there.
            </p>
          </div>
        </div>
      )}
      {nameMismatch && (
        <div className="flex items-start gap-3 rounded-xl border border-[#f05a24]/40 bg-[#fdf3ef] p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#f05a24]" />
          <div className="text-sm">
            <p className="font-semibold text-neutral-900">Payout name mismatch</p>
            <p className="mt-0.5 text-neutral-700">
              The name on your Stripe payout account does not match the legal name you registered with.
              Names must match across your ID, bank account, and registration — our team has the ticket and
              will work through it with you.
            </p>
          </div>
        </div>
      )}
      {payoutPending && (
        <div className="flex items-start gap-3 rounded-xl border bg-card p-4">
          <Wallet className="mt-0.5 h-5 w-5 shrink-0 text-[#087b72]" />
          <div className="text-sm">
            <p className="font-semibold">Finish your payout setup</p>
            <p className="mt-0.5 text-muted-foreground">
              Your Stripe payout account is created but its setup isn't finished — bank details are collected
              by Stripe, never here. Until it is finished, payouts can't be sent.
            </p>
            <button
              onClick={startPayout}
              disabled={linking}
              className="mt-2 rounded-lg bg-[#087b72] px-4 py-2 text-sm font-medium text-white hover:bg-[#06665e] disabled:opacity-50"
            >
              {linking ? "Opening Stripe…" : "Set up payouts with Stripe"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
