"use client"

import { useCallback, useEffect, useState } from "react"
import { Scale } from "lucide-react"

// Privacy appeals (Admin tree F2 · Privacy appeals, customer side).
// A customer contests the OUTCOME of a privacy request by filing an
// appeal into the platform's appeals store (appeal_type='privacy'),
// decided at the Trust & Safety Appeals desk. The request itself stays
// with the support desk's privacy workflow — this section only files
// and shows appeals, linked to the request by its reference.
type PrivacyRequest = {
  id: string
  ticket_ref: string
  created_at: string
  request_type: string
  outcome: string | null
}

type PrivacyAppeal = {
  id: string
  appeal_text: string | null
  status: string
  decision: string | null
  decided_at: string | null
  created_at: string
  ticket_ref: string | null
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  denied: "bg-red-100 text-red-700",
}

export default function PrivacyAppealsSection() {
  const [requests, setRequests] = useState<PrivacyRequest[]>([])
  const [appeals, setAppeals] = useState<PrivacyAppeal[]>([])
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filing, setFiling] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch("/api/customer/privacy-appeals", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { requests: [], appeals: [] }))
      .then((j) => {
        setRequests(j.requests || [])
        setAppeals(j.appeals || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const appealFor = (ticketRef: string) => appeals.find((a) => a.ticket_ref === ticketRef)

  async function fileAppeal(req: PrivacyRequest) {
    const text = (drafts[req.id] || "").trim()
    if (!text) {
      setError("Write why you believe the outcome should be reconsidered.")
      return
    }
    setError(null)
    setNotice(null)
    setFiling(req.id)
    try {
      const res = await fetch("/api/customer/privacy-appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_id: req.id, appeal_text: text }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(j.error || "The appeal could not be filed.")
        return
      }
      setNotice(`Appeal filed for request ${req.ticket_ref}. It is pending review.`)
      setDrafts((d) => ({ ...d, [req.id]: "" }))
      load()
    } catch {
      setError("The appeal could not be filed.")
    } finally {
      setFiling(null)
    }
  }

  return (
    <section className="rounded-lg border bg-card p-6">
      <div className="mb-4 flex items-center gap-2">
        <Scale className="size-5" />
        <h2 className="text-lg font-semibold">Privacy appeals</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        If a privacy request closed with an outcome you believe is wrong, you can appeal it here.
        The appeal is reviewed by the trust &amp; safety team; the request itself stays with the
        privacy workflow that decided it.
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You have no privacy requests on file, so there is nothing to appeal.
        </p>
      ) : (
        <div className="space-y-4">
          {notice && <p className="text-sm text-emerald-700">{notice}</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {requests.map((r) => {
            const existing = appealFor(r.ticket_ref)
            return (
              <div key={r.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium capitalize">{r.request_type} request</span>
                  <span className="text-muted-foreground">{r.ticket_ref}</span>
                  <span className="text-muted-foreground">
                    Filed {new Date(r.created_at).toLocaleDateString()}
                  </span>
                  <span className="text-muted-foreground">
                    Outcome: {r.outcome ? r.outcome.replace(/_/g, " ") : "in progress"}
                  </span>
                </div>
                {existing ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${STATUS_STYLES[existing.status] || "bg-muted text-muted-foreground"}`}>
                      Appeal {existing.status}
                    </span>
                    <span className="text-muted-foreground">
                      Filed {new Date(existing.created_at).toLocaleDateString()}
                      {existing.decided_at ? ` · Decided ${new Date(existing.decided_at).toLocaleDateString()}` : ""}
                    </span>
                  </div>
                ) : r.outcome ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={drafts[r.id] || ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                      rows={3}
                      placeholder="Why should this outcome be reconsidered?"
                      className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
                    />
                    <button
                      onClick={() => fileAppeal(r)}
                      disabled={filing === r.id}
                      className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {filing === r.id ? "Filing…" : "Appeal this outcome"}
                    </button>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    This request is still being worked — an appeal can be filed once it has an outcome.
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
