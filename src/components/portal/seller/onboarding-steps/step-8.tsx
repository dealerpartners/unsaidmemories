'use client'

// Step 8 — Policy acceptance (§1.5). Two records, both real:
//   · every published marketplace policy (seller_policies via
//     /api/seller/policies) accepted individually — accepting WRITES
//     the seller_policy_acceptances row at the policy's current
//     version, the record the admin side reads; this step cannot be
//     saved while a published policy is unaccepted;
//   · the referral fee schedule acknowledgment (the marketplace's real
//     published schedules via /api/seller/payments), recorded in this
//     step's seller_onboarding_state.data against the schedule ids
//     that were in front of the seller.

import { useEffect, useState } from "react"
import { CheckCircle2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { OnboardingShell } from "@/components/portal/seller/OnboardingWizard"
import { fmtDate, fmtDollars, sellerPost, useSellerApi } from "@/components/portal/seller/SellerData"

interface PoliciesData {
  policies: Record<string, unknown>[]
  acceptances: Record<string, unknown>[]
}
interface PaymentsData {
  fees: Record<string, unknown>[]
}

export default function Step8Page() {
  const policiesApi = useSellerApi<PoliciesData>("/api/seller/policies")
  const payments = useSellerApi<PaymentsData>("/api/seller/payments")
  const [ack, setAck] = useState(false)
  // Resume/edit: a fee acknowledgment recorded on an earlier visit is
  // still on the step's saved state — re-hydrate it so revisiting this
  // step doesn't demand (or misreport) a fresh acknowledgment.
  useEffect(() => {
    let cancelled = false
    fetch("/api/seller/onboarding", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { state?: { step: string; data?: Record<string, unknown> }[] } | null) => {
        if (cancelled) return
        const row = (d?.state || []).find((s) => s.step === "step-8" || s.step === "policy-acceptance")
        if (row?.data?.acknowledged_fees === true) setAck(true)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const policies = policiesApi.data?.policies || []
  const fees = payments.data?.fees || []

  const acceptedAt = (p: Record<string, unknown>) => {
    const a = (policiesApi.data?.acceptances || []).find(
      (x) => String(x.policy_id) === String(p.id) && Number(x.policy_version) === Number(p.current_version ?? 1),
    )
    return a ? String(a.accepted_at) : null
  }
  const unaccepted = policies.filter((p) => !acceptedAt(p))

  async function accept(p: Record<string, unknown>) {
    setBusy(String(p.id))
    setNotice(null)
    try {
      await sellerPost("/api/seller/policies", { policy_id: String(p.id) })
      setNotice(`Accepted "${String(p.title)}" — your acceptance is on record.`)
      policiesApi.reload()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Failed to record acceptance")
    } finally {
      setBusy(null)
    }
  }

  return (
    <OnboardingShell
      step={8}
      title="Policy acceptance"
      description="The marketplace policies that govern your seller account, and the referral fees that apply to your sales — accepted on the record, in writing, before you list anything."
      submitLabel="Record acceptance & continue"
      collectData={() => ({
        acknowledged_fees: ack,
        schedule_ids: fees.map((f) => String(f.id)),
        accepted_policy_ids: policies.filter((p) => acceptedAt(p)).map((p) => String(p.id)),
      })}
      onSave={async (data) => {
        if (unaccepted.length > 0) {
          throw new Error(
            `${unaccepted.length} published ${unaccepted.length === 1 ? "policy is" : "policies are"} still unaccepted — accept each policy above, then continue.`,
          )
        }
        if (fees.length > 0 && !ack) {
          throw new Error("Acknowledge the referral fee schedule above, then continue.")
        }
        await sellerPost("/api/seller/onboarding", { step: "step-8", status: "completed", data })
      }}
    >
      <div className="space-y-8">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Marketplace policies</h3>
          {notice && (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{notice}</span>
            </div>
          )}
          {policiesApi.loading ? (
            <p className="text-sm text-muted-foreground">Loading published policies…</p>
          ) : policiesApi.error ? (
            <p className="text-sm text-destructive">
              Couldn&apos;t load the published policies ({policiesApi.error}). Policy acceptance
              can&apos;t be recorded until they load — reload to try again.
            </p>
          ) : policies.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No marketplace policies are published for your marketplace yet. When the platform
              publishes them, they appear here and under Governance → Policies for your review and
              acceptance — and this step records that none were outstanding.
            </p>
          ) : (
            <div className="space-y-3">
              {policies.map((p) => {
                const accepted = acceptedAt(p)
                return (
                  <div key={String(p.id)} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-semibold">{String(p.title)}</h4>
                      <Badge variant="outline">v{String(p.current_version ?? 1)}</Badge>
                      {p.category ? <Badge variant="secondary">{String(p.category)}</Badge> : null}
                      {accepted ? (
                        <Badge variant="default" className="ml-auto">Accepted {fmtDate(accepted)}</Badge>
                      ) : (
                        <button
                          type="button"
                          disabled={busy === String(p.id)}
                          onClick={() => accept(p)}
                          className="ml-auto rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                          {busy === String(p.id) ? "Recording…" : "Accept policy"}
                        </button>
                      )}
                    </div>
                    {p.body ? (
                      <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{String(p.body)}</p>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="space-y-4 border-t pt-6">
          <h3 className="text-sm font-semibold">Referral fee schedule</h3>
          {payments.loading ? (
            <p className="text-sm text-muted-foreground">Loading the fee schedule…</p>
          ) : fees.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No fee schedules are published for your marketplace yet. When they are, they will be
              listed here and under Payments → Fees — and your acknowledgment will be recorded
              against them.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left">
                      <th className="px-4 py-2.5 font-medium">Category</th>
                      <th className="px-4 py-2.5 font-medium">Type</th>
                      <th className="px-4 py-2.5 font-medium">Referral fee</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {fees.map((f, i) => (
                      <tr key={String(f.id ?? i)}>
                        <td className="px-4 py-2.5 font-medium">{String(f.category_name || "All categories")}</td>
                        <td className="px-4 py-2.5 capitalize text-muted-foreground">{String(f.fee_type || "").replace(/_/g, " ")}</td>
                        <td className="px-4 py-2.5">
                          {(Number(f.rate ?? 0) * 100).toFixed(2)}%
                          {Number(f.flat_amount ?? 0) > 0 ? ` + ${fmtDollars(f.flat_amount)}` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 hover:bg-muted/40">
                <Checkbox checked={ack} onCheckedChange={(v) => setAck(v === true)} className="mt-0.5" />
                <span className="text-sm">
                  I have read the referral fee schedule and understand it applies to my sales from
                  activation.
                </span>
              </label>
            </>
          )}
        </section>
      </div>
    </OnboardingShell>
  )
}
