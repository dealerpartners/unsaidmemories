'use client'

// Step 6 — Upload item spreadsheet (Tree A). The real bulk import:
// the CSV is parsed in the browser and posted to /api/seller/imports,
// which records the run (seller_catalog_imports) and creates each
// valid item through the canonical catalog import spec
// (lib/sellers/catalog-import-spec). Approved sellers' items publish
// immediately and are shop-live on import — seller approval is the
// only gate; there is no per-product review. The flow is dry-run
// first, mirroring the spreadsheet page: Validate runs the full
// server-side validation with zero writes, and Import unlocks only
// after that report. Importing is capability-gated — the API refuses
// sellers without the bulk-import grant (an onboarding run by a
// seller still applying is the one exception), and says so here.

import { useRef, useState } from "react"
import { Download, Loader2, ShieldCheck, Upload } from "lucide-react"
import { OnboardingShell } from "@/components/portal/seller/OnboardingWizard"
import { sellerPost } from "@/components/portal/seller/SellerData"
import { parseCsv as parseCsvGrid } from "@/lib/sellers/bulk-csv"
import { MAX_IMPORT_ROWS } from "@/lib/sellers/catalog-import-spec"

interface DryRunResult {
  dryRun: true
  total: number
  validProducts: number
  validVariants: number
  newProducts: number
  matchedProducts: number
  errors: { row: number; sku?: string | null; error: string }[]
}

interface ImportResult {
  importId: string
  total: number
  success: number
  created: number
  createdVariants?: number
  matched: { row: number; product_id: string; product_name: string; matched_by: string }[]
  errors: { row: number; sku?: string | null; error: string }[]
}

interface Preview {
  fileName: string
  headers: string[]
  rows: Record<string, string>[]
}

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  // The shared RFC 4180 parser (lib/sellers/bulk-csv) — quoted fields,
  // embedded commas/quotes/newlines — so a product name or description
  // containing a comma imports as one field, not several broken ones.
  // (The naive split(",") this replaced corrupted exactly those rows.)
  const grid = parseCsvGrid(text)
  if (grid.length < 2) return { headers: [], rows: [] }
  const headers = grid[0].map((h) => h.trim().toLowerCase())
  const rows = grid.slice(1).map((cells) => {
    const row: Record<string, string> = {}
    headers.forEach((h, i) => {
      row[h] = (cells[i] ?? "").trim()
    })
    return row
  })
  return { headers, rows }
}

export default function Step6Page() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null)
  const [busy, setBusy] = useState<"validate" | "import" | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFile = async (file: File | undefined) => {
    setError(null)
    setPreview(null)
    setDryRun(null)
    setResult(null)
    if (!file) return
    try {
      const parsed = parseCsv(await file.text())
      if (parsed.rows.length === 0) {
        setError("No data rows found — the file needs a header row and at least one item.")
        return
      }
      if (parsed.rows.length > MAX_IMPORT_ROWS) {
        setError(`This file has ${parsed.rows.length} rows; imports are limited to ${MAX_IMPORT_ROWS} rows per run.`)
        return
      }
      setPreview({ fileName: file.name, headers: parsed.headers, rows: parsed.rows })
    } catch {
      setError("Could not read the file.")
    }
  }

  const post = async (isDryRun: boolean) => {
    if (!preview) return null
    return sellerPost("/api/seller/imports", {
      filename: preview.fileName,
      source: "onboarding",
      headers: preview.headers,
      rows: preview.rows,
      dryRun: isDryRun,
    })
  }

  const runValidate = async () => {
    setBusy("validate")
    setError(null)
    try {
      const out = (await post(true)) as DryRunResult
      setDryRun(out)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation failed")
    } finally {
      setBusy(null)
    }
  }

  const runImport = async () => {
    setBusy("import")
    setError(null)
    setResult(null)
    try {
      const out = (await post(false)) as ImportResult
      setResult(out)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed")
    } finally {
      setBusy(null)
    }
  }

  return (
    <OnboardingShell
      step={6}
      title="First listing"
      description="Your first listing, two ways: add one product, or bring your catalog in one spreadsheet. Approved sellers' items publish immediately and are shop-live on import; the import and its results are recorded on your account."
      submitLabel="Continue"
    >
      <div className="space-y-4">
        <div className="rounded-lg border p-4">
          <p className="text-sm font-semibold">One product at a time</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Prefer to start with a single product? The listing builder walks one product through
            title, price, photos, and shipping — approved sellers' listings go live in the shop
            right away.
          </p>
          <a
            href="/seller/catalog/listings/new/single"
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            Add a single listing
          </a>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm font-semibold">Spreadsheet format</p>
          <p className="mt-1 text-xs text-muted-foreground">
            CSV with a header row carrying the canonical columns:{" "}
            <span className="font-mono">parent_key, sku, title, brand, category, price, quantity</span>{" "}
            — every one is required, and each row also needs a <span className="font-mono">gtin</span>{" "}
            value. One row per variant; rows sharing a parent_key become one product. Prices are
            dollars. Up to {MAX_IMPORT_ROWS} rows per import. Start from the template so the
            format is exact.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <a
              href="/api/seller/imports/template"
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted"
            >
              <Download className="h-4 w-4" />
              Download the template
            </a>
            <label className="cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted">
              Choose CSV
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => void handleFile(e.target.files?.[0])}
              />
            </label>
            {preview && <span className="text-sm text-muted-foreground">{preview.fileName}</span>}
          </div>

          {preview && !result && (
            <div className="mt-3">
              <p className="text-sm text-muted-foreground">
                {preview.rows.length} data row{preview.rows.length === 1 ? "" : "s"} detected — all
                columns are sent for validation, nothing is trimmed in the browser.
              </p>
              {dryRun && (
                <div className="mt-3 rounded-lg bg-muted/50 p-3 text-sm">
                  <p className="flex items-center gap-1.5 font-medium">
                    <ShieldCheck className="h-4 w-4" /> Validation (dry run — nothing was written)
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {dryRun.validProducts} product{dryRun.validProducts === 1 ? "" : "s"} /{" "}
                    {dryRun.validVariants} variant{dryRun.validVariants === 1 ? "" : "s"} ready —{" "}
                    {dryRun.newProducts} new, {dryRun.matchedProducts} matching existing catalog
                    products.{" "}
                    {dryRun.errors.length > 0
                      ? `${dryRun.errors.length} row${dryRun.errors.length === 1 ? "" : "s"} will be rejected:`
                      : "No row errors."}
                  </p>
                  {dryRun.errors.length > 0 && (
                    <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                      {dryRun.errors.slice(0, 5).map((e, i) => (
                        <li key={i}>
                          Row {e.row}
                          {e.sku ? ` (${e.sku})` : ""}: {e.error}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={runValidate}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  {busy === "validate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Validate (dry run)
                </button>
                <button
                  type="button"
                  onClick={runImport}
                  disabled={busy !== null || !dryRun}
                  title={!dryRun ? "Validate first — the import button unlocks after a dry run" : undefined}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {busy === "import" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Run import
                </button>
              </div>
              {!dryRun && (
                <p className="mt-2 text-xs text-muted-foreground">
                  The import button unlocks after a validation dry run, so you see every rejection
                  before anything is written.
                </p>
              )}
            </div>
          )}

          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          {result && (
            <div className="mt-3 rounded-lg bg-muted/50 p-3 text-sm">
              <p className="font-medium">
                Import recorded: {result.success} of {result.total} items imported
                {result.errors.length > 0 ? `, ${result.errors.length} failed` : ""}.
              </p>
              {result.matched.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                  {result.matched.slice(0, 5).map((m, i) => (
                    <li key={i}>
                      Row {m.row}: matched the existing product “{m.product_name}” — your offer was
                      attached to it; no duplicate listing was created.
                    </li>
                  ))}
                </ul>
              )}
              {result.errors.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                  {result.errors.slice(0, 5).map((e, i) => (
                    <li key={i}>
                      Row {e.row}
                      {e.sku ? ` (${e.sku})` : ""}: {e.error}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-muted-foreground">
                Approved sellers' items are live in the shop now — find them under Products.
              </p>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          No spreadsheet? Continue — you can add products one at a time from the catalog, and return to
          bulk import any time under Catalog → Imports.
        </p>
      </div>
    </OnboardingShell>
  )
}
