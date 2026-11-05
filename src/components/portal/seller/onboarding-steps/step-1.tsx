'use client'

// Step 1 — Overview (§1.1). What selling here
// costs and saves, from the marketplace's REAL published fee
// schedules — plus where the applicant stands in the ten steps.

import Link from "next/link"
import { OnboardingShell } from "@/components/portal/seller/OnboardingWizard"
import { fmtDollars, useSellerApi } from "@/components/portal/seller/SellerData"

interface PaymentsData {
  fees: Record<string, unknown>[]
}
interface ShellData {
  seller: { status?: string | null } | null
}

export default function Step1Page() {
  const payments = useSellerApi<PaymentsData>("/api/seller/payments")
  const shell = useSellerApi<ShellData>("/api/seller/shell")
  const fees = payments.data?.fees || []

  return (
    <OnboardingShell
      step={1}
      title="Overview"
      description="Selling on UnSaid Memories, in plain numbers — the referral fees on your categories, what new sellers save at launch, and the ten short steps between here and your first sale."
      submitLabel="Start the application"
    >
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Referral fees on this marketplace</h3>
        {fees.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            The fee schedule for your marketplace is published in Step 8 of this application and under
            Payments → Fees. Fees are a percentage of the sale price set per category — no listing
            fees, no monthly minimums beyond your plan.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {fees.slice(0, 6).map((f, i) => (
              <li key={String(f.id ?? i)} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="font-medium">{String(f.category_name || "All categories")}</span>
                <span className="text-muted-foreground">
                  {(Number(f.rate ?? 0) * 100).toFixed(2)}%
                  {Number(f.flat_amount ?? 0) > 0 ? ` + ${fmtDollars(f.flat_amount)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>New sellers start on the standard referral schedule — the same one shown in Step 8.</li>
          <li>Payouts run on the marketplace schedule once your bank details verify (Step 3).</li>
          <li>Seller Pro unlocks bulk import and gated categories; advertising is a separate grant.</li>
        </ul>
        {shell.data?.seller?.status && (
          <p className="text-sm">
            Your application status:{" "}
            <span className="font-medium capitalize">{String(shell.data.seller.status).replace(/_/g, " ")}</span>
            {" — "}
            <Link href="/seller/dashboard" className="font-medium text-primary underline">
              view your dashboard
            </Link>
          </p>
        )}
      </div>
    </OnboardingShell>
  )
}
