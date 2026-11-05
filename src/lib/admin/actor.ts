import { cookies } from "next/headers"
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/portal-auth"
import { getCurrentUser } from "@/lib/auth/server"

// ---------------------------------------------------------------------------
// resolveAdminActor — who is performing an Admin Tools (K) act?
//
// Identity comes from the same place requireModuleApi reads it: the portal
// session token's email (falling back to the Supabase current user), then
// the actor's crm_staff record by lower(email) — tenant-preferred, the
// requireModuleApi ordering. Used by the K1/K2/K5 routes so every governed
// record they write carries the actor's email, auth user id, and staff id
// as recorded facts, never as client-supplied claims.
// ---------------------------------------------------------------------------

export interface AdminActor {
  email: string | null
  userId: string | null
  staffId: string | null
}

interface PgClientLike {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>
}

export async function resolveAdminActor(
  client: PgClientLike,
  tenantId: string,
): Promise<AdminActor> {
  let email: string | null = null
  let userId: string | null = null
  try {
    const payload = verifySessionToken((await cookies()).get(SESSION_COOKIE_NAME)?.value)
    email = payload?.email?.toLowerCase() ?? null
    userId = payload?.sub ?? null
  } catch {
    // fall through to the Supabase user
  }
  if (!email) {
    try {
      const user = await getCurrentUser()
      email = user?.email?.toLowerCase() ?? null
      userId = userId ?? (user?.id ?? null)
    } catch {
      // actor stays partially unresolved; the routes record what resolved
    }
  }
  let staffId: string | null = null
  if (email) {
    try {
      const { rows } = await client.query(
        `SELECT id::text AS id FROM public.crm_staff
          WHERE lower(email) = $1
          ORDER BY (tenant_id = $2::uuid) DESC
          LIMIT 1`,
        [email, tenantId],
      )
      staffId = rows[0]?.id ?? null
    } catch {
      staffId = null
    }
  }
  return { email, userId, staffId }
}

export function requestIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for")
  if (xff) return xff.split(",")[0].trim() || null
  return req.headers.get("x-real-ip")
}
