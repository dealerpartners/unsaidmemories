'use client'

// Step 10 — Review & complete (§1.9). The whole application, summarized
// from its real stores (seller record, per-step state, verification
// tasks, filed documents, the application record) before the applicant
// submits it for platform review. Submitting records this step
// completed — it does NOT activate the store. Activation is the
// platform's decision after review (the admin activation path already
// exists); the seller's status stays "applied" until then.

import { Check, Circle } from "lucide-react"
import { OnboardingShell } from "@/components/portal/seller/OnboardingWizard"
import { field, useSellerApi } from "@/components/portal/seller/SellerData"
import { SELLER_ONBOARDING_STEPS, completedStepSlugs } from "@/lib/sellers/onboarding-steps"
import { cn } from "@/lib/utils"

interface OnboardingData {
  state: { step: string; status: string; data?: Record<string, unknown> }[]
  verificationTasks: Record<string, unknown>[]
  application: Record<string, unknown> | null
  partnerDocuments?: Record<string, unknown>[]
}
interface ShellData {
  seller: { status?: string | null; seller_type?: string | null; legal_name?: string | null; tax_id_last4?: string | null } | null
}

export default function Step10Page() {
  const onb = useSellerApi<OnboardingData>("/api/seller/onboarding")
  const shell = useSellerApi<ShellData>("/api/seller/shell")

  const completed = completedStepSlugs(onb.data?.state || [])
  const priorDone = SELLER_ONBOARDING_STEPS.slice(0, 9).every((s) => completed.has(s.slug))
  const tasks = onb.data?.verificationTasks || []
  const docsOnFile = onb.data?.partnerDocuments?.length ?? 0
  const step4 = (onb.data?.state || []).find((s) => s.step === "step-4")
  const step4Docs = Array.isArray(step4?.data?.documents) ? (step4!.data!.documents as unknown[]).length : 0
  const seller = shell.data?.seller

  return (
    <OnboardingShell
      step={10}
      title="Review & complete"
      description="Your whole application, as the review team will see it. Submitting sends it to platform review — it does not activate your store."
      submitLabel="Submit for platform review"
    >
      <div className="space-y-6">
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Steps</h3>
          <ul className="divide-y rounded-lg border">
            {SELLER_ONBOARDING_STEPS.slice(0, 9).map((s) => {
              const done = completed.has(s.slug)
              return (
                <li key={s.slug} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full border",
                      done ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground",
                    )}
                  >
                    {done ? <Check className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                  </span>
                  <span className="font-medium">Step {s.n}: {s.label}</span>
                  <span className="ml-auto text-muted-foreground">{done ? "Completed" : "Not completed"}</span>
                </li>
              )
            })}
          </ul>
          {!priorDone && (
            <p className="text-sm text-destructive">
              Some earlier steps are not completed yet. Go back and finish them — submitting now
              records an incomplete application for review.
            </p>
          )}
        </section>

        <section className="space-y-3 border-t pt-5">
          <h3 className="text-sm font-semibold">Application review</h3>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-4 border-b py-2">
              <dt className="text-muted-foreground">Legal name</dt>
              <dd className="font-medium">{seller ? field(seller as Record<string, unknown>, "legal_name") : "—"}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b py-2">
              <dt className="text-muted-foreground">Seller type</dt>
              <dd className="font-medium capitalize">
                {seller?.seller_type ? String(seller.seller_type).replace(/_/g, " ") : "Set at Step 4"}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b py-2">
              <dt className="text-muted-foreground">Tax ID on file</dt>
              <dd className="font-medium">{seller?.tax_id_last4 ? `…${String(seller.tax_id_last4)}` : "—"}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b py-2">
              <dt className="text-muted-foreground">Verification filings</dt>
              <dd className="font-medium">{tasks.length} on file</dd>
            </div>
            <div className="flex justify-between gap-4 border-b py-2">
              <dt className="text-muted-foreground">Documents filed</dt>
              <dd className="font-medium">{Math.max(docsOnFile, step4Docs)} on file</dd>
            </div>
            <div className="flex justify-between gap-4 border-b py-2">
              <dt className="text-muted-foreground">Application record</dt>
              <dd className="font-medium">{onb.data?.application ? "Filed" : "Files at Step 4"}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b py-2">
              <dt className="text-muted-foreground">Status</dt>
              <dd className="font-medium capitalize">{seller?.status ? String(seller.status) : "Applied"}</dd>
            </div>
          </dl>
          <p className="text-sm text-muted-foreground">
            Submitting completes your application and sends it to the platform&apos;s review queue.
            Your store activates only when the platform finishes its review and activates your
            account — a welcome email follows with your sign-in, and your dashboard tracks the
            decision.
          </p>
        </section>
      </div>
    </OnboardingShell>
  )
}
