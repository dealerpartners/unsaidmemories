'use client'

import { useEffect, useState } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { OnboardingShell } from "@/components/portal/seller/OnboardingWizard"
import { useSellerApi } from "@/components/portal/seller/SellerData"
import { cn } from "@/lib/utils"

interface CatalogData {
  categoryPermissions: Record<string, unknown>[]
}

const REGIONS = [
  { id: "us", label: "United States", detail: "All 50 states" },
  { id: "ca", label: "Canada", detail: "English and French listings" },
  { id: "uk", label: "United Kingdom", detail: "GBP pricing" },
  { id: "eu", label: "European Union", detail: "EUR pricing, VAT handling required" },
  { id: "au", label: "Australia", detail: "AUD pricing" },
]

export default function GlobalMarketsPage() {
  const [selected, setSelected] = useState<Record<string, boolean>>({ us: true })
  const catalog = useSellerApi<CatalogData>("/api/seller/catalog")

  // Resume/edit: when regions were already saved for this step, they
  // replace the first-visit default — otherwise reopening the step and
  // continuing would silently reset the seller's markets to US-only.
  useEffect(() => {
    let cancelled = false
    fetch("/api/seller/onboarding", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { state?: { step: string; data?: Record<string, unknown> }[] } | null) => {
        if (cancelled) return
        const row = (d?.state || []).find((s) => s.step === "step-7" || s.step === "global-markets")
        if (row?.data && Array.isArray(row.data.regions)) {
          setSelected(
            Object.fromEntries(row.data.regions.map((x) => [String(x), true])) as Record<string, boolean>,
          )
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  const shipping = useSellerApi<{ promises: Record<string, unknown>[] }>("/api/seller/shipping")

  const regionsOnFile = new Set(
    (shipping.data?.promises || []).map((p) => String(p.region || "")).filter(Boolean),
  )

  return (
    <OnboardingShell
      step={7}
      title="Global markets"
      description="Choose the regions where you want to sell. You can add or remove regions later from settings."
      collectData={() => ({
        regions: Object.entries(selected).filter(([, v]) => v).map(([k]) => k),
      })}
    >
      <div className="space-y-3">
        {REGIONS.map((region) => (
          <label
            key={region.id}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors",
              selected[region.id] ? "border-primary/50 bg-primary/5" : "hover:bg-muted/40"
            )}
          >
            <Checkbox
              checked={!!selected[region.id]}
              onCheckedChange={(v) => setSelected((s) => ({ ...s, [region.id]: v === true }))}
            />
            <div>
              <p className="text-sm font-semibold">{region.label}</p>
              <p className="text-xs text-muted-foreground">{region.detail}</p>
            </div>
          </label>
        ))}
        <p className="text-xs text-muted-foreground">
          Each region may have its own tax, shipping, and compliance requirements. Currency
          conversion is handled at checkout.
        </p>
      </div>

      {/* The seller's REAL market record: category permissions granted by
          the platform, and regions already covered by delivery promises. */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Your category permissions</h3>
        {(catalog.data?.categoryPermissions || []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No category permissions are on file yet. Category permissions are granted by the
            platform as part of activation — they decide which categories you may list in, and
            whether a category requires Seller Pro.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {(catalog.data?.categoryPermissions || []).map((cp, i) => (
              <li key={String(cp.id ?? i)} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="font-medium">{String(cp.category_key || "").replace(/_/g, " ")}</span>
                <span className="text-muted-foreground">
                  {cp.is_allowed ? "Allowed" : "Not allowed"}
                  {cp.requires_pro ? " · Requires Pro" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        {regionsOnFile.size > 0 && (
          <p className="text-sm text-muted-foreground">
            Delivery promises already cover: {[...regionsOnFile].join(", ")}.
          </p>
        )}
      </div>
    </OnboardingShell>
  )
}
