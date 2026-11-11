import { createServerClient as createSSRClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { sessionCookieDomain } from "@/lib/google-auth";

/**
 * Server-side Supabase client for auth (uses anon key, respects RLS,
 * reads/writes the auth session via cookies).
 *
 * Use in Server Components, Server Actions, and Route Handlers.
 * For service-role (bypasses RLS) work, use createServerClient()
 * from @/lib/supabase instead.
 */
export async function createAuthClient() {
  const cookieStore = await cookies();
  const domain = sessionCookieDomain((await headers()).get("host"));

  return createSSRClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, domain ? { ...options, domain } : options)
            );
          } catch {
            // Called from a Server Component — cookies can only be
            // modified in a Server Action or Route Handler. The
            // middleware refresh keeps the session alive instead.
          }
        },
      },
    }
  );
}

/**
 * AdPortal compatibility: Sunny's Ad Center API routes import
 * createServerClient from this module. Same SSR cookie client as
 * createAuthClient above (anon key, RLS-respecting).
 */
export async function createServerClient() {
  return createAuthClient();
}
