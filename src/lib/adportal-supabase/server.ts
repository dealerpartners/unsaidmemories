import { createServerClient as createSSRServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./env";

/**
 * Server-side Supabase client for Server Components and Server Actions.
 * Reads + writes session cookies via the `next/headers` cookies() API.
 *
 * Important: this function MUST be awaited — `cookies()` is async in
 * Next.js 15+ (App Router). Always call it inside `await`.
 */
export async function createServerClient() {
  const cookieStore = await cookies();

  return createSSRServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component — can't write cookies there.
          // Safe to ignore; middleware will refresh the session.
        }
      },
    },
  });
}
