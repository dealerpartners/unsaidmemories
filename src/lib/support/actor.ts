import { cookies } from "next/headers"
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/portal-auth"
import { getCurrentUser } from "@/lib/auth/server"
import { withPg, TENANT_ID } from "@/lib/crm/enterprise"

// ============================================================================
// resolveActingStaff — WHO on staff is working the desk right now?
// Same resolution the module-permission gate uses: the session email →
// the caller's active crm_staff row (tenant-preferred). The desk's admin
// gate has already passed when this runs; a platform admin without a
// staff row resolves to null and their replies are attributed to the
// desk itself rather than to a person who doesn't exist in the data.
// ============================================================================

export interface ActingStaff {
  staffId: string
  name: string | null
  email: string
}

export async function resolveActingStaff(): Promise<ActingStaff | null> {
  let email: string | undefined
  try {
    const payload = verifySessionToken((await cookies()).get(SESSION_COOKIE_NAME)?.value)
    email = payload?.email?.toLowerCase()
    if (!email) email = (await getCurrentUser())?.email?.toLowerCase()
  } catch {
    email = undefined
  }
  if (!email) return null
  const staff = await withPg(async (c) => {
    const { rows } = await c.query(
      `SELECT id::text AS id, display_name
         FROM public.crm_staff
        WHERE lower(email) = $1 AND is_active
        ORDER BY (tenant_id = $2) DESC
        LIMIT 1`,
      [email, TENANT_ID()],
    )
    return rows[0] ? { staffId: rows[0].id, name: rows[0].display_name ?? null, email } : null
  })
  return staff ?? null
}
