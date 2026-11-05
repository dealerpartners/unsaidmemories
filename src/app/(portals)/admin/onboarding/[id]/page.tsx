"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, ExternalLink, ShieldCheck } from "lucide-react"

// ============================================================================
// Admin · Onboarding case detail (E3) — G13 risk review + G14 activation.
// Shows every gate with its answers/evidence, the append-only events
// timeline, capabilities (vet: per-state), and the V31 determination
// record form. Every action posts to /api/admin/onboarding/[id], which
// writes through the engine (transitionCase / setGateStatus) with the
// acting admin as actor — decisions land as events, never silent edits.
// For vet cases the vocabulary mirrors the telemedicine credentialing
// desk: gate_decision on G6 is the desk's verify/reject-credential step;
// Activate is its create_veterinarian + activate, with the roster row
// linked to the auth user (user_id set — the desk leaves it NULL).
// ============================================================================

type Any = Record<string, any>

const MANUAL_GATES = ["G4", "G5", "G6", "G7", "G8"]
const GATE_TITLES: Record<string, string> = {
  G0: "Classify", G1: "Age", G2: "Account & contact", G3: "Identity",
  G4: "Entity (KYB / UBO)", G5: "Sanctions / PEP / adverse media",
  G6: "Professional credentials", G7: "Insurance", G8: "Background check",
  G9: "Tax identity", G10: "Payout account", G11: "Agreements & policy acceptance",
  G12: "Training & assessment", G13: "Risk scoring & review", G14: "Activation",
}

const STATUS_STYLE: Record<string, string> = {
  passed: "adm-badge adm-badge-green",
  failed: "adm-badge adm-badge-red",
  blocked: "adm-badge adm-badge-red",
  needs_info: "bg-orange-100 text-orange-900",
  verified: "bg-brand-teal/10 text-brand-teal",
}

function DataBlock({ data }: { data: Any }) {
  const entries = Object.entries(data ?? {}).filter(([, v]) => v !== "" && v != null)
  if (!entries.length) return <p className="text-[13px] text-muted-foreground">No answers recorded on this gate.</p>
  return (
    <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
      {entries.map(([k, v]) => (
        <div key={k} className="flex gap-2 text-[13px]">
          <dt className="shrink-0 font-medium text-muted-foreground">{k}</dt>
          <dd className="break-words font-medium">
            {typeof v === "boolean" ? (v ? "Yes" : "No") : typeof v === "object" ? JSON.stringify(v) : String(v)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export default function AdminOnboardingCasePage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const [detail, setDetail] = useState<Any | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [acting, setActing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [reason, setReason] = useState("")
  const [message, setMessage] = useState("")
  const [gateReason, setGateReason] = useState<Record<string, string>>({})
  const [gateEvidence, setGateEvidence] = useState<Record<string, string>>({})
  const [determination, setDetermination] = useState("")
  const [basis, setBasis] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/onboarding/${id}`)
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || "Failed to load case")
      setDetail(body)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  async function act(action: string, extra: Any = {}) {
    setActing(true)
    setNotice(null)
    try {
      const res = await fetch(`/api/admin/onboarding/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason, ...extra }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || "Action failed")
      if (action === "activate" && body.provision) {
        const p = body.provision
        setNotice(
          `Activated — auth user ${p.auth_user_id} (${p.auth_invited ? "invited" : "existing"}), portal_users ${p.portal_user_id || "—"} as ${p.role_type}. ` +
          `Capabilities: ${(body.capabilities?.activated ?? []).join(", ") || "none"}${(body.capabilities?.referralOnly ?? []).length ? `; referral-only: ${body.capabilities.referralOnly.join(", ")}` : ""}.` +
          `${(p.notes ?? []).length ? ` Notes: ${p.notes.join(" ")}` : ""}`,
        )
        setDetail(body)
      } else {
        setNotice(`Done — case is now "${body.case?.state ?? "updated"}".`)
        setDetail(body)
      }
    } catch (e) {
      setNotice((e as Error).message)
    } finally {
      setActing(false)
    }
  }

  if (loading) return <div className="mx-auto w-full max-w-[1200px] px-5 py-8 text-sm text-muted-foreground">Loading case…</div>
  if (error || !detail?.case) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-5 py-8">
        <Link href="/admin/onboarding" className="inline-flex items-center gap-1 text-sm hover:underline"><ArrowLeft className="size-4" /> All cases</Link>
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error || "Case not found"}</div>
      </div>
    )
  }

  const c = detail.case as Any
  const gates = (detail.gates ?? []) as Any[]
  const caps = (detail.capabilities ?? []) as Any[]
  const events = (detail.events ?? []) as Any[]
  const determinations = (detail.determinations ?? []) as Any[]
  const insurance = detail.insurance as Any
  const state = String(c.state)
  const inReview = ["READY_FOR_REVIEW", "UNDER_REVIEW", "NEEDS_INFO", "BLOCKED_PENDING", "IN_GATES"].includes(state)

  const btn = "rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
  const primary = "rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"

  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 py-8">
      <Link href="/admin/onboarding" className="inline-flex items-center gap-1 text-sm hover:underline">
        <ArrowLeft className="size-4" /> All cases
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold">{c.applicant_name || c.business_name || c.applicant_email || c.id}</h1>
        </div>
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-semibold">{state}</span>
      </div>

      {notice && <div className="mt-4 rounded-lg border bg-muted/40 px-4 py-3 text-sm">{notice}</div>}

      {/* Review actions */}
      <section className="mt-6 rounded-lg border">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <ShieldCheck className="size-5" style={{ color: "oklch(0.64 0.088 66)" }} aria-hidden="true" /> Review actions (G13 / G14)
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-muted-foreground">Reason (recorded on the event)</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-lg border bg-background px-2 py-1.5" placeholder="Decision reason" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-muted-foreground">Message to applicant (request info)</span>
            <input value={message} onChange={(e) => setMessage(e.target.value)} className="w-full rounded-lg border bg-background px-2 py-1.5" placeholder="What is missing?" />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {state === "READY_FOR_REVIEW" || state === "NEEDS_INFO" || state === "BLOCKED_PENDING" ? (
            <button disabled={acting} onClick={() => void act("begin_review")} className={btn}>Begin review</button>
          ) : null}
          {inReview && (
            <button disabled={acting} onClick={() => void act("request_info", { message })} className={btn}>Request info</button>
          )}
          {inReview && (
            <button disabled={acting || !reason} onClick={() => void act("reject")} className={`${btn} border-red-300 text-red-800`}>Reject</button>
          )}
          {(state === "UNDER_REVIEW" || state === "READY_FOR_REVIEW") && (
            <button disabled={acting} onClick={() => void act("approve")} className={primary} style={{ background: "oklch(0.64 0.088 66)" }}>Approve (G13)</button>
          )}
          {state === "APPROVED" && (
            <button disabled={acting} onClick={() => void act("activate")} className={primary} style={{ background: "oklch(0.64 0.088 66)" }}>Activate (G14)</button>
          )}
          {state === "ACTIVE" && (
            <>
              <button disabled={acting} onClick={() => void act("restrict")} className={btn}>Restrict</button>
              <button disabled={acting} onClick={() => void act("suspend")} className={btn}>Suspend</button>
              <button disabled={acting} onClick={() => void act("offboard")} className={`${btn} border-red-300 text-red-800`}>Offboard</button>
            </>
          )}
          {state === "RESTRICTED" && (
            <>
              <button disabled={acting} onClick={() => void act("reinstate")} className={btn}>Reinstate to active</button>
              <button disabled={acting} onClick={() => void act("suspend")} className={btn}>Suspend</button>
              <button disabled={acting} onClick={() => void act("offboard")} className={`${btn} border-red-300 text-red-800`}>Offboard</button>
            </>
          )}
          {state === "SUSPENDED" && (
            <>
              <button disabled={acting} onClick={() => void act("reinstate")} className={btn}>Reinstate to restricted (cure step)</button>
              <button disabled={acting} onClick={() => void act("offboard")} className={`${btn} border-red-300 text-red-800`}>Offboard</button>
            </>
          )}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Approve / activate / reject / request-info all email the applicant (best-effort, house pattern) and
          write an append-only event naming you as actor. Activation provisions in order: auth account
          (invite if none) → portal_users with user_id → the party&apos;s own records (profiles / roster /
          tenant), then flips VERIFIED capabilities active.
        </p>
      </section>

      {/* Gates */}
      <section className="mt-6 rounded-lg border">
        <h2 className="text-base font-semibold">Gates</h2>
        {insurance?.checked && (
          <p className={`mt-2 rounded-lg px-3 py-2 text-sm ${insurance.belowFloor ? "adm-badge adm-badge-red" : "adm-badge adm-badge-green"}`}>
            Insurance (G7): per-occurrence {insurance.perOccurrence != null ? `$${Number(insurance.perOccurrence).toLocaleString()}` : "—"},
            aggregate {insurance.aggregate != null ? `$${Number(insurance.aggregate).toLocaleString()}` : "—"}
            {insurance.floorAggregate ? ` · POLICY floors: $${Number(insurance.floorPerOccurrence ?? 0).toLocaleString()} / $${Number(insurance.floorAggregate).toLocaleString()}` : ""}
            {insurance.belowFloor ? ` — BELOW FLOOR (${insurance.detail})` : ""}
          </p>
        )}
        <div className="mt-3 space-y-4">
          {gates.map((g) => (
            <div key={g.gate_key} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{g.gate_key} · {GATE_TITLES[g.gate_key] || g.gate_key}</h3>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[String(g.status).toLowerCase()] || "bg-neutral-100 text-neutral-800"}`}>{g.status}</span>
              </div>
              <div className="mt-2"><DataBlock data={g.data} /></div>
              <p className="mt-2 text-xs text-muted-foreground">
                {g.decided_by ? `Decided by ${g.decided_by}${g.updated_at ? ` · ${new Date(g.updated_at).toLocaleString()}` : ""}` : "Not yet decided"}
                {g.reason ? ` · ${g.reason}` : ""}
                {g.expires_at ? ` · evidence expires ${new Date(g.expires_at).toLocaleDateString()}` : ""}
              </p>
              {g.evidence_ref && (
                <p className="mt-1 text-xs">
                  Evidence:{" "}
                  {/^https?:\/\//.test(String(g.evidence_ref)) ? (
                    <a href={String(g.evidence_ref)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium hover:underline" style={{ color: "oklch(0.64 0.088 66)" }}>
                      {String(g.evidence_ref)} <ExternalLink className="size-3" />
                    </a>
                  ) : (
                    <span className="font-medium">{String(g.evidence_ref)}</span>
                  )}
                </p>
              )}
              {MANUAL_GATES.includes(g.gate_key) && inReview && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                  <input
                    value={gateReason[g.gate_key] || ""}
                    onChange={(e) => setGateReason((s) => ({ ...s, [g.gate_key]: e.target.value }))}
                    className="min-w-48 flex-1 rounded-lg border bg-background px-2 py-1.5 text-sm"
                    placeholder="Decision reason"
                  />
                  <input
                    value={gateEvidence[g.gate_key] || ""}
                    onChange={(e) => setGateEvidence((s) => ({ ...s, [g.gate_key]: e.target.value }))}
                    className="min-w-48 flex-1 rounded-lg border bg-background px-2 py-1.5 text-sm"
                    placeholder="Evidence reference (URL or document id)"
                  />
                  {(["pass", "fail", "needs_info"] as const).map((d) => (
                    <button
                      key={d}
                      disabled={acting}
                      onClick={() => void act("gate_decision", {
                        gate_key: g.gate_key,
                        decision: d,
                        reason: gateReason[g.gate_key] || reason || null,
                        evidence_ref: gateEvidence[g.gate_key] || null,
                      })}
                      className={btn}
                    >
                      {d === "pass" ? "Pass" : d === "fail" ? "Fail" : "Needs info"}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {gates.length === 0 && <p className="text-sm text-muted-foreground">No gate rows on this case yet.</p>}
        </div>
      </section>

      {/* Capabilities */}
      <section className="mt-6 rounded-lg border">
        <h2 className="text-base font-semibold">Capabilities{c.type === "veterinarian" ? " — per state" : ""}</h2>
        {caps.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No capability records on this case.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {caps.map((cap) => (
              <li key={cap.id || `${cap.capability}-${cap.jurisdiction}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{cap.capability}</span>
                  {cap.jurisdiction ? ` · ${cap.jurisdiction}` : ""}
                  {cap.license_no ? ` · license ${cap.license_no}` : ""}
                  {cap.expires_at ? ` · expires ${new Date(cap.expires_at).toLocaleDateString()}` : ""}
                </span>
                <span className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[String(cap.status).toLowerCase()] || "bg-neutral-100 text-neutral-800"}`}>{cap.status}</span>
                  {String(cap.status).startsWith("ACTIVE") && (
                    <button disabled={acting} onClick={() => void act("capability_restrict", { capability_id: cap.id })} className={btn}>Restrict</button>
                  )}
                  {cap.status === "RESTRICTED" && (
                    <button disabled={acting} onClick={() => void act("capability_restore", { capability_id: cap.id })} className={btn}>Restore to verified</button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {c.type === "veterinarian" && (
          <p className="mt-2 text-xs text-muted-foreground">
            Matching reads only ACTIVE_TELEMEDICINE rows; referral states stay ACTIVE_REFERRAL_ONLY (spec §4).
            Restricting one state removes the vet from that state&apos;s matches and nowhere else.
          </p>
        )}
      </section>

      {/* V31 determination — vet only */}
      {c.type === "veterinarian" && (
        <section className="mt-6 rounded-lg border">
          <h2 className="text-base font-semibold">Employment classification determination (V31)</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Classification comes from the facts of the relationship — the platform records its
            determination and its basis here. This is a determination record, not an acknowledgment checkbox.
          </p>
          {determinations.length > 0 && (
            <ul className="mt-3 space-y-2">
              {determinations.map((dRec: Any) => (
                <li key={dRec.id} className="rounded-lg border px-3 py-2 text-sm">
                  <span className="font-medium">{dRec.determination}</span>
                  <span className="block text-muted-foreground">Basis: {dRec.basis}</span>
                  <span className="block text-xs text-muted-foreground">
                    {dRec.decided_by || ""} · {dRec.at ? new Date(dRec.at).toLocaleString() : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-muted-foreground">Determination</span>
              <input value={determination} onChange={(e) => setDetermination(e.target.value)} className="w-full rounded-lg border bg-background px-2 py-1.5" placeholder="e.g. Independent contractor" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-muted-foreground">Basis (facts relied on)</span>
              <input value={basis} onChange={(e) => setBasis(e.target.value)} className="w-full rounded-lg border bg-background px-2 py-1.5" placeholder="e.g. Controls own schedule, tools and other clients…" />
            </label>
          </div>
          <button
            disabled={acting || !determination || !basis}
            onClick={() => void act("determination", { determination, basis })}
            className={`${btn} mt-3`}
          >
            Record determination
          </button>
        </section>
      )}

      {/* Case answers */}
      <section className="mt-6 rounded-lg border">
        <h2 className="text-base font-semibold">Case answers</h2>
        <div className="mt-2"><DataBlock data={c.answers} /></div>
      </section>

      {/* Events timeline */}
      <section className="mt-6 rounded-lg border">
        <h2 className="text-base font-semibold">Events (append-only)</h2>
        {events.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No events recorded yet.</p>
        ) : (
          <ol className="mt-3 space-y-2">
            {events.map((ev: Any, i: number) => (
              <li key={ev.id || i} className="flex gap-3 text-sm">
                <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: "oklch(0.64 0.088 66)" }} />
                <div>
                  <span className="font-medium">
                    {ev.gate_key ? `Gate ${ev.gate_key}: ` : ""}{ev.from ?? "—"} → {ev.to ?? "—"}
                  </span>
                  <span className="block text-muted-foreground">
                    {ev.actor || "system"}{ev.created_at ? ` · ${new Date(ev.created_at).toLocaleString()}` : ""}
                    {ev.reason ? ` · ${ev.reason}` : ""}
                    {ev.evidence_ref ? ` · evidence: ${ev.evidence_ref}` : ""}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
