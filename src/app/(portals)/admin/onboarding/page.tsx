"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, ClipboardList, Inbox } from "lucide-react"

// ============================================================================
// Admin · Onboarding engine — case queue (E3). ONE engine for every party
// type (ONBOARDING_ENGINE_SPEC.md): the queue lists onboarding_cases with
// type/state filters, gate progress, and flags computed from gate data —
// failed/blocked gates, expired evidence, and insurance below the POLICY
// floors (vet aggregate $3M, groomer $1M/$2M — policy config, spec §7).
// Data: /api/admin/onboarding.
// ============================================================================

type Any = Record<string, any>

const STATE_BADGE: Record<string, string> = {
  READY_FOR_REVIEW: "adm-badge adm-badge-amber",
  UNDER_REVIEW: "adm-badge adm-badge-amber",
  NEEDS_INFO: "bg-orange-100 text-orange-900",
  BLOCKED_PENDING: "adm-badge adm-badge-red",
  REJECTED: "adm-badge adm-badge-red",
  APPROVED: "adm-badge adm-badge-green",
  ACTIVE: "adm-badge adm-badge-green",
  RESTRICTED: "bg-orange-100 text-orange-900",
  SUSPENDED: "adm-badge adm-badge-red",
  OFFBOARDED: "bg-neutral-200 text-neutral-700",
}

export default function AdminOnboardingQueuePage() {
  const [cases, setCases] = useState<Any[]>([])
  const [states, setStates] = useState<string[]>([])
  const [types, setTypes] = useState<string[]>([])
  const [state, setState] = useState("")
  const [type, setType] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams()
      if (state) qs.set("state", state)
      if (type) qs.set("type", type)
      const res = await fetch(`/api/admin/onboarding${qs.toString() ? `?${qs}` : ""}`)
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || "Failed to load cases")
      setCases(body.cases ?? [])
      setStates(body.states ?? [])
      setTypes(body.types ?? [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [state, type])

  useEffect(() => { void load() }, [load])

  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 py-8">
      <h1 className="flex items-center gap-2 font-serif text-2xl font-bold">
        <ClipboardList className="size-6" style={{ color: "oklch(0.64 0.088 66)" }} aria-hidden="true" />
        Onboarding cases
      </h1>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="text-sm">
          <span className="mr-2 font-medium text-muted-foreground">State</span>
          <select value={state} onChange={(e) => setState(e.target.value)} className="rounded-lg border bg-background px-2 py-1.5 text-sm">
            <option value="">All states</option>
            {states.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="mr-2 font-medium text-muted-foreground">Type</span>
          <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-lg border bg-background px-2 py-1.5 text-sm">
            <option value="">All types</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <span className="text-sm text-muted-foreground">{cases.length} case{cases.length === 1 ? "" : "s"}</span>
      </div>

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>
      )}

      {loading ? (
        <p className="mt-10 text-sm text-muted-foreground">Loading cases…</p>
      ) : cases.length === 0 && !error ? (
        <div className="mt-10 flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-14 text-center">
          <Inbox className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium">No cases match this filter.</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Cases appear here when an applicant starts the onboarding engine (intake is E2&apos;s surface).
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Applicant</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">State</th>
                <th className="px-4 py-3 font-medium">Gates</th>
                <th className="px-4 py-3 font-medium">Flags</th>
                <th className="px-4 py-3 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link href={`/admin/onboarding/${c.id}`} className="font-medium hover:underline" style={{ color: "oklch(0.64 0.088 66)" }}>
                      {c.applicant_name || c.business_name || c.applicant_email || c.id}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {[c.business_name && c.applicant_name ? c.business_name : null, c.applicant_email].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td className="px-4 py-3">{c.type}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATE_BADGE[c.state] || "bg-neutral-100 text-neutral-800"}`}>
                      {c.state}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {c.gates_passed}/{c.gates_total} passed
                    <div className="mt-1 h-1.5 w-24 overflow-hidden rounded bg-neutral-200">
                      <div
                        className="h-full"
                        style={{
                          width: c.gates_total ? `${Math.round((c.gates_passed / c.gates_total) * 100)}%` : "0%",
                          background: "oklch(0.64 0.088 66)",
                        }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {(c.flags ?? []).length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <ul className="space-y-1">
                        {c.flags.map((f: Any, i: number) => (
                          <li key={i} className="flex items-start gap-1 text-xs font-medium text-red-800">
                            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                            <span>{f.label}{f.detail ? <span className="block font-normal text-red-700">{f.detail}</span> : null}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.updated_at || c.created_at ? new Date(c.updated_at || c.created_at).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  )
}
