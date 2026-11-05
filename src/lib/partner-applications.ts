// Shared helpers for the public partner-application intake routes
// (/api/partner-applications/*). Same rate-limit pattern as /api/vet-leads.
import { ADMIN_TENANT_ID } from "@/lib/admin-api"

const hits = new Map<string, { n: number; t: number }>()

export function partnerAppRateLimited(ip: string): boolean {
  const now = Date.now()
  const h = hits.get(ip)
  if (!h || now - h.t > 600_000) {
    hits.set(ip, { n: 1, t: now })
    return false
  }
  return ++h.n > 5
}

export const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "")

export const emailOk = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)

/** Public-site tenant for intake rows. */
export const tenantId = () => ADMIN_TENANT_ID()

/**
 * True when the insert failed because the target table does not exist yet.
 * The partner-application tables are created by the SQL in
 * unsaid-docs/partner-applications-schema.sql; until they exist the routes
 * answer 503 honestly instead of mocking a successful insert.
 */
export function isMissingTable(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code
  const msg = e instanceof Error ? e.message : String(e)
  return code === "42P01" || /relation .* does not exist/i.test(msg)
}
