'use client'

// ---------------------------------------------------------------------------
// SellerData — the shared client kit for seller-center surfaces.
//
// Every seller surface reads through useSellerApi (session-scoped seller
// APIs under /api/seller/*) and renders one of three truthful states:
// loading, the real rows, or an honest empty state. A FAILED read is not
// a fourth state: it throws to the seller segment's error boundary
// (SellerLoadError below is the one shared throw point) — no page
// renders a designed failure wall in place of its content. Formatters
// match the money units of the layer they serve: commerce totals are
// cents, seller_* money columns are dollars.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

export function useSellerApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    fetch(path, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`)
        return d as T
      })
      .then((d) => {
        if (!cancelled) {
          setData(d)
          setError(null)
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [path, reloadKey])

  return { data, loading, error, reload: () => setReloadKey((k) => k + 1) }
}

export async function sellerPost(path: string, body: Record<string, unknown>) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) {
    const err = new Error(d.error || `Request failed (${r.status})`) as Error & { code?: string }
    if (typeof d.code === "string") err.code = d.code
    throw err
  }
  return d
}

/** sellerPost for the other verbs (PATCH/DELETE writers). Throws an
 *  Error carrying the API's own message — including its `code` when the
 *  API names one (e.g. preferences_store_missing) via `err.code`. */
export async function sellerSend(
  method: "PATCH" | "DELETE" | "PUT",
  path: string,
  body: Record<string, unknown>,
) {
  const r = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) {
    const err = new Error(d.error || `Request failed (${r.status})`) as Error & { code?: string }
    if (typeof d.code === "string") err.code = d.code
    throw err
  }
  return d
}

export function SellerLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[240px] items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" /> {label}
    </div>
  )
}

/**
 * The seller portal's ONE load-failure point. It does not render: it
 * THROWS, so the failure lands on the seller segment's error boundary
 * (src/app/(portals)/seller/error.tsx) inside the intact shell, with a
 * retry — instead of the red inline wall this used to paint in place of
 * the page (148 call sites rendered a "Couldn't load this page" card
 * and called it a page). Every page that branches on a failed read into
 * <SellerLoadError/> inherits the throw from here — one definition,
 * never per-page failure walls.
 */
export function SellerLoadError({
  error,
  message,
}: {
  error?: string | null
  message?: string | null
}): never {
  throw new Error(error || message || "Something went wrong")
}

/** First present value among keys — seller rows are schemaless JSON here. */
export function field(row: Record<string, unknown> | null | undefined, ...keys: string[]): string {
  if (!row) return "—"
  for (const k of keys) {
    const v = row[k]
    if (v !== null && v !== undefined && v !== "") return String(v)
  }
  return "—"
}

export function fmtDate(iso?: unknown): string {
  if (!iso) return "—"
  const d = new Date(String(iso))
  return isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

export function fmtDateTime(iso?: unknown): string {
  if (!iso) return "—"
  const d = new Date(String(iso))
  return isNaN(d.getTime())
    ? "—"
    : d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
}

/** seller_* money columns are dollars. */
export function fmtDollars(v?: unknown): string {
  const n = Number(v)
  return isNaN(n) ? "—" : `$${n.toFixed(2)}`
}

/** commerce_* totals are cents. */
export function fmtCents(v?: unknown): string {
  const n = Number(v)
  return isNaN(n) ? "—" : `$${(n / 100).toFixed(2)}`
}

export function StatusPill({ value, status }: { value?: unknown; status?: unknown }) {
  const label = String(value ?? status ?? "—").replace(/_/g, " ")
  return (
    <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium capitalize text-muted-foreground">
      {label}
    </span>
  )
}

export interface SellerColumn {
  header: string
  cell: (row: Record<string, unknown>) => React.ReactNode
  className?: string
}

/** Alternate column shape used by newer surfaces: { key, label, render }. */
export interface SellerColumnAlt {
  key: string
  label?: string
  render: (row: Record<string, unknown>) => React.ReactNode
  className?: string
}

export function SellerTable({
  columns,
  rows,
  empty,
}: {
  columns: (SellerColumn | SellerColumnAlt)[]
  rows: Record<string, unknown>[]
  empty: React.ReactNode
}) {
  if (rows.length === 0) return <>{empty}</>
  const cols: SellerColumn[] = columns.map((c) =>
    "cell" in c
      ? c
      : { header: c.label || c.key, cell: c.render, className: c.className },
  )
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left">
            {cols.map((c) => (
              <th key={c.header} className="px-4 py-3 font-medium text-muted-foreground">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={String(row.id ?? i)} className="border-b last:border-0 hover:bg-muted/30">
              {cols.map((c) => (
                <td key={c.header} className={`px-4 py-3 ${c.className || ""}`}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
