import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { isSupabaseAdmin } from "@/lib/portal-auth"

export async function createServerSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  )
}

// Get the current authenticated user (or null)
export async function getSession() {
  const supabase = await createServerSupabase()
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

// Get the current authenticated user with profile (or null)
export async function getCurrentUser() {
  const session = await getSession()
  if (!session?.user) return null
  return session.user
}

// Check if current user is an admin. Admin status lives in Supabase
// (platform_admins / tenant_memberships) — see isSupabaseAdmin.
export async function isAdmin() {
  const user = await getCurrentUser()
  if (!user) return false
  return isSupabaseAdmin(user.id)
}
