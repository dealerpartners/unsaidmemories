'use client'

// Step 3 — Bank info (§1.4). The payout bank account: account and
// routing numbers are stripped to their last four before anything
// leaves the browser (serializeStepForm), and POST /api/seller/onboarding
// creates the seller_payment_methods row from those last fours only —
// the full numbers are never stored on this platform.
//
// Below the form, the Stripe Connect panel (SellerConnectPanel) is the
// step's money leg (BL-1): the last-four record above is the platform's
// method of record, but payouts execute to the seller's connected
// Stripe Express account — created and kept current by
// lib/sellers/connect.ts, which is what payout preflight reads.
//
// Resume/edit: the saved step (and the default payment method it
// created) are read back on open. The last fours on file are shown and
// the number fields become optional — leaving them blank keeps the
// account on file (the saved last fours are carried forward in the
// save); entering new numbers replaces it.

import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { OnboardingShell } from "@/components/portal/seller/OnboardingWizard"
import { sellerPost } from "@/components/portal/seller/SellerData"
import { SellerConnectPanel } from "@/components/portal/seller/SellerConnectPanel"

interface BankSeed {
  bankName: string
  accountHolder: string
  accountLast4: string
  routingLast4: string
}

export default function Step3Page() {
  const [seed, setSeed] = useState<BankSeed | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch("/api/seller/onboarding", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/seller/payments", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([onb, pay]) => {
      if (cancelled) return
      const row = ((onb?.state ?? []) as { step: string; data?: Record<string, unknown> }[]).find(
        (s) => s.step === "step-3" || s.step === "bank-info",
      )
      const data = row?.data ?? {}
      const s = (v: unknown) => (typeof v === "string" ? v : "")
      const methods = (pay?.methods ?? []) as Record<string, unknown>[]
      const def = methods.find((m) => m.is_default) || methods[0]
      setSeed({
        bankName: s(data.bankName) || s(data.bank_label),
        accountHolder: s(data.accountHolder),
        accountLast4: s(data.account_last4) || s(def?.last4),
        routingLast4: s(data.routing_last4),
      })
    })
    return () => {
      cancelled = true
    }
  }, [])

  const hasAccountOnFile = !!seed?.accountLast4

  return (
    <OnboardingShell
      step={3}
      title="Bank info"
      description="The bank account your payouts land in. Verification at Step 4 checks your documents against the business named at Step 2."
      onSave={async (data) => {
        // The payment-method label the API stamps is the bank's name.
        const bankLabel =
          typeof data.bankName === "string" && data.bankName ? data.bankName : "Bank account"
        // Blank number fields on a revisit keep the account on file:
        // carry the saved last fours forward instead of overwriting
        // the step record with empty strings.
        const finalData: Record<string, unknown> = { ...data, bank_label: bankLabel }
        if (!finalData.account_last4 && seed?.accountLast4) finalData.account_last4 = seed.accountLast4
        if (!finalData.routing_last4 && seed?.routingLast4) finalData.routing_last4 = seed.routingLast4
        await sellerPost("/api/seller/onboarding", {
          step: "step-3",
          status: "completed",
          data: finalData,
        })
      }}
    >
      {!seed ? (
        <p className="text-sm text-muted-foreground">Loading your saved bank details…</p>
      ) : (
        <div className="space-y-4" key="seeded">
          <h3 className="text-sm font-semibold">Payout bank account</h3>
          {hasAccountOnFile && (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              Bank account on file ending in{" "}
              <span className="font-medium text-foreground">••••{seed.accountLast4}</span>
              {seed.routingLast4 ? (
                <>
                  {" "}(routing ••••{seed.routingLast4})
                </>
              ) : null}
              . Leave the number fields blank to keep it, or enter new numbers to replace it.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bankName">Bank name <span className="text-destructive">*</span></Label>
              <Input id="bankName" name="bankName" required defaultValue={seed.bankName} placeholder="e.g. First National Bank" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accountHolder">Account holder <span className="text-destructive">*</span></Label>
              <Input id="accountHolder" name="accountHolder" required defaultValue={seed.accountHolder} placeholder="Name on the account" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accountNumber">
                Account number {!hasAccountOnFile && <span className="text-destructive">*</span>}
              </Label>
              <Input
                id="accountNumber"
                name="accountNumber"
                required={!hasAccountOnFile}
                inputMode="numeric"
                autoComplete="off"
                placeholder={hasAccountOnFile ? `••••${seed.accountLast4} on file` : "Account number"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="routingNumber">
                Routing number {!hasAccountOnFile && <span className="text-destructive">*</span>}
              </Label>
              <Input
                id="routingNumber"
                name="routingNumber"
                required={!hasAccountOnFile}
                inputMode="numeric"
                autoComplete="off"
                placeholder={hasAccountOnFile && seed.routingLast4 ? `••••${seed.routingLast4} on file` : "9-digit routing number"}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Only the last four digits of the account and routing numbers are stored — as your payout
            method of record (seller_payment_methods). The full numbers are never kept on this
            platform.
          </p>
        </div>
      )}
      <div className="mt-6">
        <SellerConnectPanel returnTo="wizard" />
      </div>
    </OnboardingShell>
  )
}
