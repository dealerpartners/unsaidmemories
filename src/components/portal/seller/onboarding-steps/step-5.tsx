'use client'

import { useEffect, useState } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { OnboardingShell } from "@/components/portal/seller/OnboardingWizard"
import { cn } from "@/lib/utils"

const PLACEMENTS = [
  { id: "homepage", label: "Homepage carousel", detail: "Rotating featured products on the storefront" },
  { id: "category", label: "Category spotlight", detail: "Top placement in your best categories" },
  { id: "deals", label: "Deals & promotions", detail: "Eligible for sale events and coupon pages" },
  { id: "email", label: "Email newsletters", detail: "Consideration for curated customer emails" },
]

const CATEGORIES = ["Dog food", "Dog toys", "Cat food", "Cat toys", "Grooming", "Health & wellness", "Accessories"]

export default function CustomerFavoritesPage() {
  const [placements, setPlacements] = useState<Record<string, boolean>>({})
  const [categories, setCategories] = useState<Record<string, boolean>>({})
  const [savedTagline, setSavedTagline] = useState("")
  const [hydrated, setHydrated] = useState(false)

  // Resume/edit: hydrate from the step's saved state (GET
  // /api/seller/onboarding) so reopening this step shows the choices
  // already on the application — and re-saving can't wipe them with
  // the empty initial state.
  useEffect(() => {
    let cancelled = false
    fetch("/api/seller/onboarding", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { state?: { step: string; data?: Record<string, unknown> }[] } | null) => {
        if (cancelled) return
        const row = (d?.state || []).find((s) => s.step === "step-5" || s.step === "customer-favorites")
        const data = row?.data
        if (data) {
          const toMap = (v: unknown) =>
            Object.fromEntries((Array.isArray(v) ? v : []).map((x) => [String(x), true])) as Record<string, boolean>
          setPlacements(toMap(data.placements))
          setCategories(toMap(data.primary_categories))
          if (typeof data.tagline === "string") setSavedTagline(data.tagline)
        }
        setHydrated(true)
      })
      .catch(() => {
        if (!cancelled) setHydrated(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const toggle = (
    setter: React.Dispatch<React.SetStateAction<Record<string, boolean>>>,
    id: string,
    value: boolean | "indeterminate"
  ) => setter((s) => ({ ...s, [id]: value === true }))

  return (
    <OnboardingShell
      step={5}
      title="Customer favorites"
      description="Tell us where you'd like your products to be featured. Placement is merit-based — strong ratings and fulfillment performance earn more visibility."
      collectData={() => ({
        placements: Object.entries(placements).filter(([, v]) => v).map(([k]) => k),
        primary_categories: Object.entries(categories).filter(([, v]) => v).map(([k]) => k),
      })}
    >
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Featured placement interests</h3>
        {PLACEMENTS.map((p) => (
          <label
            key={p.id}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors",
              placements[p.id] ? "border-primary/50 bg-primary/5" : "hover:bg-muted/40"
            )}
          >
            <Checkbox
              checked={!!placements[p.id]}
              onCheckedChange={(v) => toggle(setPlacements, p.id, v)}
            />
            <div>
              <p className="text-sm font-semibold">{p.label}</p>
              <p className="text-xs text-muted-foreground">{p.detail}</p>
            </div>
          </label>
        ))}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Primary categories</h3>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <label
              key={c}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                categories[c] ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted"
              )}
            >
              <Checkbox
                checked={!!categories[c]}
                onCheckedChange={(v) => toggle(setCategories, c, v)}
                className="sr-only"
              />
              {c}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="tagline">Brand tagline</Label>
        <Input
          key={hydrated ? "saved" : "pending"}
          id="tagline"
          name="tagline"
          defaultValue={savedTagline}
          placeholder="e.g. Small-batch treats for happy pups"
          maxLength={80}
        />
        <p className="text-xs text-muted-foreground">Shown on your storefront and featured placements.</p>
      </div>
    </OnboardingShell>
  )
}
