// ---------------------------------------------------------------------------
// The payout execution mode gate — platform policy for BOTH money rails
// (seller payouts, telemed vet payouts). Money is never invented by code
// running in the wrong place: execution runs in Stripe TEST mode whenever
// the configured key is a test key. A LIVE key is refused unless
// PAYOUT_EXECUTION_LIVE=enabled is set in the environment — the
// production-side-only rule (live keys exist only in the production env),
// enforced in code rather than by convention.
// ---------------------------------------------------------------------------

export class PayoutExecutionError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

export function payoutModeGate(): { mode: "test" | "live" | "unconfigured"; allowed: boolean; reason?: string } {
  const key = process.env.STRIPE_SECRET_KEY || ""
  if (!key) return { mode: "unconfigured", allowed: false, reason: "STRIPE_SECRET_KEY is not configured" }
  if (key.startsWith("sk_test_") || key.startsWith("rk_test_")) return { mode: "test", allowed: true }
  if (key.startsWith("sk_live_") || key.startsWith("rk_live_")) {
    if (process.env.PAYOUT_EXECUTION_LIVE === "enabled") return { mode: "live", allowed: true }
    return {
      mode: "live",
      allowed: false,
      reason: "Live-mode payout execution is refused here: it runs production-side only (set PAYOUT_EXECUTION_LIVE=enabled in the production environment to enable it there).",
    }
  }
  return { mode: "unconfigured", allowed: false, reason: "STRIPE_SECRET_KEY is neither a test nor a live key" }
}
