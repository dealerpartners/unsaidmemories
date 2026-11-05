'use client'

// Step 9 — Tax classifications (Tree A). Two things: re-confirm the
// tax identity on file (last four shown; a new number re-files it
// through verification), and see the classification system that
// applies to your products (the platform's live tax rules).
//
// The Form W-9 uploads FOR REAL, like Step 4's documents: choosing
// the file POSTs it to /api/seller/onboarding/documents with
// document_id "w9", which stores it in the private seller-documents
// bucket and records the storage path on a tax_verification task and
// in this step's state. The step save carries that entry in its
// documents list (collectData) so the wholesale step-data write can't
// drop the storage path the upload just recorded.

import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { OnboardingShell } from "@/components/portal/seller/OnboardingWizard"
import { field, useSellerApi } from "@/components/portal/seller/SellerData"

interface TaxData {
  taxIdLast4: string | null
  rules: Record<string, unknown>[]
}

interface W9Doc {
  id: string
  fileName: string
  size: number
  type: string
  storagePath?: string
}

interface W9State extends Partial<W9Doc> {
  uploading?: boolean
  error?: string
}

export default function Step9Page() {
  const tax = useSellerApi<TaxData>("/api/seller/tax")
  const [w9, setW9] = useState<W9State | null>(null)
  const [savedDocs, setSavedDocs] = useState<W9Doc[]>([])

  // Resume/edit: documents already filed with this step (e.g. a W-9
  // uploaded on an earlier visit) are shown and carried forward.
  useEffect(() => {
    let cancelled = false
    fetch("/api/seller/onboarding", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { state?: { step: string; data?: Record<string, unknown> }[] } | null) => {
        if (cancelled) return
        const row = (d?.state || []).find((s) => s.step === "step-9" || s.step === "tax-identity")
        const docs = Array.isArray(row?.data?.documents) ? (row!.data!.documents as Record<string, unknown>[]) : []
        setSavedDocs(
          docs
            .filter((doc) => typeof doc.id === "string")
            .map((doc) => ({
              id: String(doc.id),
              fileName: String(doc.fileName || "file"),
              size: Number(doc.size || 0),
              type: String(doc.type || ""),
              ...(typeof doc.storagePath === "string" ? { storagePath: doc.storagePath } : {}),
            })),
        )
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  async function uploadW9(file: File) {
    setW9({ id: "w9", fileName: file.name, size: file.size, type: file.type, uploading: true })
    try {
      const form = new FormData()
      form.set("file", file)
      form.set("document_id", "w9")
      const r = await fetch("/api/seller/onboarding/documents", { method: "POST", body: form })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `Upload failed (${r.status})`)
      setW9({
        id: "w9",
        fileName: file.name,
        size: file.size,
        type: file.type,
        storagePath: String(d.storagePath || ""),
      })
    } catch (err) {
      setW9({
        id: "w9",
        fileName: file.name,
        size: file.size,
        type: file.type,
        error: err instanceof Error ? err.message : "Upload failed",
      })
    }
  }

  const classes = new Map<string, number>()
  for (const r of tax.data?.rules || []) {
    const key = field(r, "classification") !== "—" ? field(r, "classification") : field(r, "tax_type")
    classes.set(key, (classes.get(key) || 0) + 1)
  }

  const savedW9 = savedDocs.find((d) => d.id === "w9")

  return (
    <OnboardingShell
      step={9}
      title="Tax identity"
      description="Your tax identity, and how products are classified for tax on this marketplace."
      submitLabel="Save tax identity"
      collectData={() => {
        // A failed read of what's already on file blocks the save: the
        // checks below would otherwise run against a null record and
        // misstate the filing. (Census fix, 2026-10-23.)
        if (tax.error) {
          throw new Error(
            `Your saved tax identity couldn't be loaded (${tax.error}). Reload the step before submitting — saving now could misstate what is on file.`,
          )
        }
        // Submitting tax identity requires a tax identity: one already
        // on file (shown above), or a number typed in this visit. Saving
        // the step "completed" with neither would record a submission
        // that never happened.
        const typedTaxId =
          typeof document !== "undefined"
            ? (document.getElementById("taxId") as HTMLInputElement | null)?.value.trim() ?? ""
            : ""
        if (!tax.data?.taxIdLast4 && !typedTaxId) {
          throw new Error(
            "Enter your Tax ID (EIN or SSN) — or file it at Step 4 — before submitting your tax identity. Only the last four digits are stored.",
          )
        }
        // The documents this save records: a W-9 chosen in this visit
        // (uploaded for real above) replaces the saved one; untouched,
        // the previously filed documents carry forward unchanged.
        if (w9?.fileName) {
          const entry: W9Doc = {
            id: "w9",
            fileName: w9.fileName,
            size: w9.size ?? 0,
            type: w9.type ?? "",
            ...(w9.storagePath ? { storagePath: w9.storagePath } : {}),
          }
          return { documents: [entry, ...savedDocs.filter((d) => d.id !== "w9")] }
        }
        // Carried forward unchanged — recorded on the step, but not a
        // new filing for the review desk.
        return savedDocs.length ? { documents: savedDocs, documents_refiling: false } : {}
      }}
    >
      <div className="space-y-6">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Tax identity</h3>
          {tax.error ? (
            <p className="text-sm text-destructive">
              Couldn&apos;t load your saved tax identity ({tax.error}). What&apos;s on file
              can&apos;t be shown until it loads — reload to try again. Saving is blocked
              until then, so a filed tax ID is never mistaken for a missing one.
            </p>
          ) : tax.data?.taxIdLast4 ? (
            <p className="text-sm text-muted-foreground">
              Tax ID on file ending in <span className="font-medium text-foreground">{tax.data.taxIdLast4}</span>.
              Enter a new number below only if it has changed — a change re-files your tax verification.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No tax ID on file. Enter it here (or at Step 4) so the platform can report your income.
            </p>
          )}
          <div className="max-w-sm space-y-2">
            <Label htmlFor="taxId">Tax ID (EIN or SSN)</Label>
            <Input id="taxId" name="taxId" inputMode="numeric" autoComplete="off" placeholder="Only the last four are stored" />
          </div>
          <div className="max-w-sm space-y-2">
            <Label htmlFor="w9">Form W-9</Label>
            <div className="flex items-center gap-3">
              <label className="cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted">
                Choose file
                <input
                  type="file"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void uploadW9(f)
                  }}
                />
              </label>
              {w9?.uploading && (
                <span className="text-sm text-muted-foreground">Uploading {w9.fileName}…</span>
              )}
              {w9?.storagePath && (
                <span className="text-sm font-medium text-primary">{w9.fileName} — uploaded, on your tax file</span>
              )}
              {w9?.error && (
                <span className="text-sm font-medium text-destructive">
                  {w9.fileName} — upload failed: {w9.error} Saving still records it by name; choose the file again to retry.
                </span>
              )}
              {!w9 && savedW9 && (
                <span className="text-sm text-muted-foreground">
                  On file: {savedW9.fileName}
                  {savedW9.storagePath ? " (uploaded)" : ""}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              The file uploads to private storage when you choose it, and its storage path is
              recorded on a tax verification filing for the review team. Your resale certificate
              lives at Step 4 with the rest of your verification documents.
            </p>
          </div>
        </section>

        <section className="space-y-3 border-t pt-5">
          <h3 className="text-sm font-semibold">Classifications in force</h3>
          {tax.error ? (
            <p className="text-sm text-destructive">
              Couldn&apos;t load the tax classifications ({tax.error}) — reload to try again.
            </p>
          ) : classes.size === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tax rules are configured for this marketplace yet. When they are, the classifications
              applied to your products — goods, services, and their rates per jurisdiction — will be
              listed here and under Tax → Classifications.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {[...classes.entries()].map(([klass, count]) => (
                <li key={klass} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="font-medium capitalize">{klass.replace(/_/g, " ")}</span>
                  <span className="text-muted-foreground">{count} rule{count === 1 ? "" : "s"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </OnboardingShell>
  )
}
