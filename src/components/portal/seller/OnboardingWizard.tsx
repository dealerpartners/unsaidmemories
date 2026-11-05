'use client'

// Onboarding wizard — ONE sequential 10-step wizard (Sunny, 2026-10-16;
// portals.md §1). This module is the wizard's step shell: it renders the
// shared WizardShell (src/components/partners/wizard-shell.tsx, Crew A
// contract), enforces SEQUENTIAL GATING from the seller's saved state
// (GET /api/seller/onboarding — a step unlocks only when every earlier
// step is completed; resume lands on the first incomplete step), and on
// save POSTs the step to /api/seller/onboarding (seller_onboarding_state
// + its side effects) and advances to the next step in the wizard.
//
// Sensitive values: full tax ids and bank account/routing numbers are
// stripped client-side before anything is sent — only their last four
// digits ever leave the browser (the API likewise stores last-four
// only). Step 4's document inputs upload the real file via
// /api/seller/onboarding/documents (private seller-documents bucket,
// partner_application_documents + verification_tasks evidence) and
// merge the storage path into the saved documents list.

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  FileCheck2,
  Globe2,
  IdCard,
  Landmark,
  LayoutList,
  Lock,
  PackagePlus,
  ScrollText,
  Star,
  type LucideIcon,
} from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { WizardShell } from "@/components/partners/seller-wizard-shell"
import {
  SELLER_ONBOARDING_STEPS,
  SELLER_ONBOARDING_TOTAL,
  completedStepSlugs,
  firstIncompleteStep,
  isStepUnlocked,
  wizardHref,
} from "@/lib/sellers/onboarding-steps"

export type OnboardingStep = {
  slug: string
  label: string
  description: string
  icon: LucideIcon
}

const STEP_ICONS: LucideIcon[] = [
  LayoutList, // 1 Overview
  Building2, // 2 Business details
  Landmark, // 3 Bank info
  IdCard, // 4 Business verification
  Star, // 5 Customer favorites
  PackagePlus, // 6 First listing
  Globe2, // 7 Global markets
  ScrollText, // 8 Policy acceptance
  FileCheck2, // 9 Tax identity
  FileCheck2, // 10 Review & complete
]

export const ONBOARDING_STEPS: OnboardingStep[] = SELLER_ONBOARDING_STEPS.map((def, i) => ({
  slug: def.slug,
  label: def.label,
  description: def.description,
  icon: STEP_ICONS[i] || LayoutList,
}))

interface OnboardingStateData {
  state: { step: string; status: string }[]
}

function useOnboardingState() {
  const [completed, setCompleted] = useState<Set<string>>(new Set())
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch("/api/seller/onboarding", { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`)
        return d as OnboardingStateData
      })
      .then((d) => {
        if (cancelled) return
        setCompleted(completedStepSlugs(d.state || []))
        setLoaded(true)
      })
      .catch((e) => {
        if (cancelled) return
        // Honest failure state: gating cannot be proven, so the wizard
        // shows the error instead of guessing the applicant's progress.
        setLoadError(e instanceof Error ? e.message : "Failed to load onboarding state")
        setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])
  return { completed, loaded, loadError }
}

/** Serialize a step form. Sensitive identifiers are reduced to last-four
 *  BEFORE the data can be posted anywhere. */
export function serializeStepForm(form: HTMLFormElement): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  const fd = new FormData(form)
  for (const [key, value] of fd.entries()) {
    if (value instanceof File) {
      if (value.size > 0) {
        data[key] = { fileName: value.name, size: value.size, type: value.type }
      }
      continue
    }
    if (data[key] === undefined) data[key] = value
    else if (Array.isArray(data[key])) (data[key] as unknown[]).push(value)
    else data[key] = [data[key], value]
  }
  // Document inputs are named doc-<id>: fold them into a documents list.
  const documents: unknown[] = []
  for (const key of Object.keys(data)) {
    if (key.startsWith("doc-")) {
      documents.push({ id: key.slice(4), ...(data[key] as Record<string, unknown>) })
      delete data[key]
    }
  }
  if (documents.length) data.documents = documents
  // Strip full BANK identifiers → last four only. The tax ID is the
  // exception: it is sent in full so the API can run its structural
  // validation on the whole number (lib/sellers/tax-id.ts) — the API
  // stores only the last four, exactly as it does for every caller.
  for (const key of Object.keys(data)) {
    const lower = key.toLowerCase()
    const v = data[key]
    if (typeof v !== "string") continue
    if (lower.includes("taxid") || lower === "tax_id") {
      continue
    } else if (lower.includes("accountnumber") || lower === "account_number") {
      data.account_last4 = v.replace(/\D/g, "").slice(-4)
      delete data[key]
    } else if (lower.includes("routing")) {
      data.routing_last4 = v.replace(/\D/g, "").slice(-4)
      delete data[key]
    }
  }
  return data
}

export function WizardStepShell({
  step,
  title,
  description,
  children,
  submitLabel = "Save & continue",
  collectData,
  onSave,
}: {
  step: number
  title: string
  description?: string
  children: React.ReactNode
  submitLabel?: string
  /** Extra state a step keeps outside form fields (checkbox groups) —
   *  merged into the saved step data. */
  collectData?: () => Record<string, unknown>
  /** Full save override (profile/bank/policy steps): receives the
   *  serialized step data; the shell's own step-state POST is skipped. */
  onSave?: (data: Record<string, unknown>) => Promise<void>
}) {
  const router = useRouter()
  const { completed, loaded, loadError } = useOnboardingState()
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const def = SELLER_ONBOARDING_STEPS[step - 1]
  const slug = def.slug
  const isDone = completed.has(slug)
  const unlocked = !loaded || loadError ? true : isStepUnlocked(step, completed)
  const resumeStep = Math.min(firstIncompleteStep(completed), SELLER_ONBOARDING_TOTAL)

  const shellSteps = SELLER_ONBOARDING_STEPS.map((s) => ({ key: s.slug, label: s.label }))
  const lockedKeys =
    loaded && !loadError
      ? SELLER_ONBOARDING_STEPS.filter((s) => !isStepUnlocked(s.n, completed)).map((s) => s.slug)
      : []

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const data = { ...serializeStepForm(e.currentTarget), ...(collectData ? collectData() : {}) }
      if (onSave) {
        await onSave(data)
      } else {
        const r = await fetch("/api/seller/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ step: slug, status: "completed", data }),
        })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error || `Save failed (${r.status})`)
      }
      setSaved(true)
      // Advance inside the wizard — the next step is now unlocked.
      if (step < SELLER_ONBOARDING_TOTAL) {
        router.push(wizardHref(step + 1))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save this step")
    } finally {
      setSaving(false)
    }
  }

  return (
    <WizardShell
      steps={shellSteps}
      current={slug}
      onStep={(key) => {
        const target = SELLER_ONBOARDING_STEPS.find((s) => s.slug === key)
        if (target) router.push(wizardHref(target.n))
      }}
      saving={saving}
      error={error}
      completed={completed}
      locked={lockedKeys}
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        <Badge variant={isDone ? "default" : "secondary"}>{isDone ? "Completed" : "In progress"}</Badge>
      </div>

      {!loaded ? (
        <p className="text-sm text-muted-foreground">Loading your application progress…</p>
      ) : loadError ? (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-200">
          Couldn&apos;t load your onboarding progress ({loadError}). Saving is unavailable until
          your saved state can be read — reload to try again.
        </div>
      ) : !unlocked ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border p-4">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold">This step unlocks in order</p>
              <p className="mt-1 text-sm text-muted-foreground">
                The seller application is one sequential wizard — complete the earlier steps
                first and this step opens. Your progress so far is saved on your application.
              </p>
            </div>
          </div>
          <Link
            href={wizardHref(resumeStep)}
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Resume at Step {resumeStep}: {SELLER_ONBOARDING_STEPS[resumeStep - 1].label}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {children}

          <Alert>
            <AlertDescription>
              Saving records this step to your seller application. Our team reviews submissions
              from the onboarding queue — you&apos;ll be notified when your account is activated.
              Submitting never activates your store on its own.
            </AlertDescription>
          </Alert>

          {saved && (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-700 dark:bg-green-950 dark:text-green-200">
              <Check className="h-4 w-4" /> Saved to your application.
              {step < SELLER_ONBOARDING_TOTAL ? " Taking you to the next step…" : ""}
            </div>
          )}

          <div className="flex items-center justify-between border-t pt-4">
            <div>
              {step > 1 ? (
                <Link
                  href={wizardHref(step - 1)}
                  className="inline-flex items-center gap-1 rounded-lg border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </Link>
              ) : (
                <span />
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? "Saving…" : submitLabel}
                {step < SELLER_ONBOARDING_TOTAL && <ArrowRight className="h-4 w-4" />}
              </button>
              {step === SELLER_ONBOARDING_TOTAL && saved && (
                <Link
                  href="/seller/dashboard"
                  className="inline-flex items-center gap-1 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
                >
                  Go to seller dashboard <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          </div>
        </form>
      )}
    </WizardShell>
  )
}

/** Back-compat alias: the wizard step shell is the only onboarding shell. */
export const OnboardingShell = WizardStepShell
