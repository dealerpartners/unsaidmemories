'use client'

// Seller governance policies — the acceptance half of the policies page.
// Policy READING comes from the compiled document library (server-rendered
// by the page); this island owns only the acceptance ledger state: it
// fetches /api/seller/policies ONCE (via a provider shared by every card)
// to learn, per slug, the seller_policies ledger row id + current_version
// and the seller's own acceptances, and it POSTs acceptances back to the
// same route. Bundle policies are matched to ledger rows BY SLUG; a
// bundle policy with no ledger row yet renders no status control at all
// (read-only until its row exists).

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react"
import { CheckCircle2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { fmtDate, sellerPost, useSellerApi } from "@/components/portal/seller/SellerData"

interface SellerPoliciesData {
  policies: Record<string, unknown>[]
  acceptances: Record<string, unknown>[]
}

interface PolicyAcceptanceContextValue {
  data: SellerPoliciesData | null
  busyId: string | null
  accept: (policyId: string, title: string) => Promise<void>
}

const PolicyAcceptanceContext = createContext<PolicyAcceptanceContextValue | null>(null)

export function PolicyAcceptanceProvider({ children }: { children: ReactNode }) {
  const { data, reload } = useSellerApi<SellerPoliciesData>("/api/seller/policies")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function accept(policyId: string, title: string) {
    setBusyId(policyId)
    setNotice(null)
    try {
      await sellerPost("/api/seller/policies", { policy_id: policyId })
      setNotice(`Accepted "${title}" — your acceptance is on record.`)
      reload()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Failed to record acceptance")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <PolicyAcceptanceContext.Provider value={{ data, busyId, accept }}>
      {notice && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}
      {children}
    </PolicyAcceptanceContext.Provider>
  )
}

/**
 * The per-policy status area for a governance policy card: the ledger
 * version badge plus either the Accepted badge (an acceptance exists at
 * the ledger row's current version) or the Accept button. Renders nothing
 * while the ledger is still loading, and nothing at all when the bundle
 * policy has no ledger row yet.
 */
export function PolicyAcceptance({ slug, title }: { slug: string; title: string }) {
  const ctx = useContext(PolicyAcceptanceContext)
  if (!ctx || !ctx.data) return null

  const row = ctx.data.policies.find((p) => String(p.slug ?? "") === slug)
  if (!row) return null

  const policyId = String(row.id)
  const version = Number(row.current_version ?? 1) || 1
  const acceptance = ctx.data.acceptances.find(
    (a) => String(a.policy_id) === policyId && Number(a.policy_version) === version,
  )

  return (
    <>
      <Badge variant="outline">v{version}</Badge>
      {acceptance ? (
        <Badge variant="default" className="ml-auto">
          Accepted {fmtDate(acceptance.accepted_at)}
        </Badge>
      ) : (
        <button
          type="button"
          disabled={ctx.busyId === policyId}
          onClick={() => void ctx.accept(policyId, title)}
          className="ml-auto rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {ctx.busyId === policyId ? "Recording…" : "Accept policy"}
        </button>
      )}
    </>
  )
}
