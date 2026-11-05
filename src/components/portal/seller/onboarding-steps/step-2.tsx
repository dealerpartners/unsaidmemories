'use client'

// Step 2 — Business details (§1, entity details). The business profile
// (saved onto the seller record via /api/seller/account), the legal
// entity type + state of formation (recorded in this step's
// seller_onboarding_state.data — the application table has no entity
// column), and the readiness checklist for the bank-grade packet at
// Step 4, so nothing stalls mid-application.

import { useEffect, useState } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { OnboardingShell } from "@/components/portal/seller/OnboardingWizard"
import { sellerPost } from "@/components/portal/seller/SellerData"
import { cn } from "@/lib/utils"

const ENTITY_TYPES = [
  { id: "sole_proprietorship", label: "Sole proprietorship" },
  { id: "llc", label: "Limited liability company (LLC)" },
  { id: "corporation", label: "Corporation" },
  { id: "partnership", label: "Partnership" },
  { id: "nonprofit", label: "Nonprofit organization" },
]

const NEEDS = [
  {
    id: "legal",
    label: "Legal business name and address",
    detail: "Exactly as registered — this is the name on your seller record and tax filings.",
  },
  {
    id: "tax-id",
    label: "Tax ID (EIN or SSN) and the tax document",
    detail: "You'll enter the number (only the last four are ever stored) and provide the tax ID document at Step 4.",
  },
  {
    id: "gov-id",
    label: "Government-issued photo ID",
    detail: "For the business owner or authorized representative, provided at Step 4.",
  },
  {
    id: "resale",
    label: "Resale tax certificate",
    detail: "If you buy inventory for resale — provided at Step 4 so purchases settle correctly.",
  },
  {
    id: "bank",
    label: "Bank account for payouts",
    detail: "Account and routing numbers for the payout account (Step 3). Only last fours are stored.",
  },
  {
    id: "catalog",
    label: "Your product list",
    detail: "A spreadsheet of your items speeds up Step 6 — or add products one at a time later.",
  },
]

interface Step2Seed {
  legalName: string
  displayName: string
  phone: string
  website: string
  businessAddress: string
  entityType: string
  formationState: string
}

export default function Step2Page() {
  const [ready, setReady] = useState<Record<string, boolean>>({})
  const [seed, setSeed] = useState<Step2Seed | null>(null)

  // Resume/edit: prefill from the seller record (the profile fields)
  // and this step's saved state (entity, formation, address, readiness)
  // so reopening the step shows what is already on the application.
  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch("/api/seller/account", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/seller/onboarding", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([acct, onb]) => {
      if (cancelled) return
      const seller = (acct?.seller ?? {}) as Record<string, unknown>
      const row = ((onb?.state ?? []) as { step: string; data?: Record<string, unknown> }[]).find(
        (s) => s.step === "step-2",
      )
      const data = row?.data ?? {}
      const s = (v: unknown) => (typeof v === "string" ? v : "")
      setSeed({
        legalName: s(seller.legal_name) || s(data.legalName) || s(data.legal_name),
        displayName: s(seller.display_name) || s(data.displayName),
        phone: s(seller.phone) || s(data.phone),
        website: s(seller.website) || s(data.website),
        businessAddress: s(data.business_address) || s(data.businessAddress),
        entityType: s(data.entity_type),
        formationState: s(data.formation_state),
      })
      if (Array.isArray(data.ready)) {
        setReady(Object.fromEntries(data.ready.map((k) => [String(k), true])) as Record<string, boolean>)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <OnboardingShell
      step={2}
      title="Business details"
      description="Your business profile and legal entity — the record the Step 4 verification packet is checked against."
      collectData={() => ({
        ready: Object.entries(ready).filter(([, v]) => v).map(([k]) => k),
      })}
      onSave={async (data) => {
        const patch: Record<string, unknown> = {}
        if (typeof data.legalName === "string" && data.legalName) patch.legal_name = data.legalName
        if (typeof data.displayName === "string" && data.displayName) patch.display_name = data.displayName
        if (typeof data.phone === "string" && data.phone) patch.phone = data.phone
        if (typeof data.website === "string" && data.website) patch.website = data.website
        if (Object.keys(patch).length > 0) {
          const r = await fetch("/api/seller/account", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          })
          if (!r.ok) {
            const d = await r.json().catch(() => ({}))
            throw new Error(d.error || `Profile save failed (${r.status})`)
          }
        }
        await sellerPost("/api/seller/onboarding", { step: "step-2", status: "completed", data })
      }}
    >
      {!seed ? (
        <p className="text-sm text-muted-foreground">Loading your saved business details…</p>
      ) : (
      <div className="space-y-8" key="seeded">
        <section className="space-y-4">
          <h3 className="text-sm font-semibold">Business profile</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="legalName">Legal business name <span className="text-destructive">*</span></Label>
              <Input id="legalName" name="legalName" required defaultValue={seed.legalName} placeholder="As registered with the state" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName">Store display name</Label>
              <Input id="displayName" name="displayName" defaultValue={seed.displayName} placeholder="What customers see" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Business phone</Label>
              <Input id="phone" name="phone" type="tel" defaultValue={seed.phone} placeholder="(555) 123-4567" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input id="website" name="website" type="url" defaultValue={seed.website} placeholder="https://…" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="businessAddress">Business address</Label>
              <Input id="businessAddress" name="business_address" defaultValue={seed.businessAddress} placeholder="Street, city, state, ZIP" />
            </div>
          </div>
        </section>

        <section className="space-y-3 border-t pt-6">
          <h3 className="text-sm font-semibold">Legal entity <span className="text-destructive">*</span></h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {ENTITY_TYPES.map((t) => (
              <label
                key={t.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/40 has-[:checked]:border-primary/60 has-[:checked]:bg-primary/5"
              >
                <input type="radio" name="entity_type" value={t.id} required defaultChecked={seed.entityType === t.id} className="accent-primary" />
                <span className="text-sm font-medium">{t.label}</span>
              </label>
            ))}
          </div>
          <div className="max-w-sm space-y-2">
            <Label htmlFor="formationState">State of formation</Label>
            <Input id="formationState" name="formation_state" defaultValue={seed.formationState} placeholder="e.g. Tennessee" />
          </div>
        </section>

        <section className="space-y-3 border-t pt-6">
          <h3 className="text-sm font-semibold">Have these ready for Step 4</h3>
          <p className="text-xs text-muted-foreground">
            Verification is bank-grade: the platform reviews these documents before your store can
            sell. Checking them off here is a readiness note on your application — the documents
            themselves are filed at Step 4.
          </p>
          {NEEDS.map((n) => (
            <label
              key={n.id}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors",
                ready[n.id] ? "border-primary/50 bg-primary/5" : "hover:bg-muted/40",
              )}
            >
              <Checkbox
                checked={!!ready[n.id]}
                onCheckedChange={(v) => setReady((s) => ({ ...s, [n.id]: v === true }))}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-semibold">{n.label}</span>
                <span className="block text-xs text-muted-foreground">{n.detail}</span>
              </span>
            </label>
          ))}
        </section>
      </div>
      )}
    </OnboardingShell>
  )
}
