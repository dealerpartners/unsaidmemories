// Shared constants for Supabase clients.
// Reads from process.env (server) and NEXT_PUBLIC_ env (browser).

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  (typeof window !== "undefined"
    ? (window as unknown as { __SUPABASE_URL__?: string }).__SUPABASE_URL__
    : undefined) ??
  "";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  (typeof window !== "undefined"
    ? (window as unknown as { __SUPABASE_ANON_KEY__?: string }).__SUPABASE_ANON_KEY__
    : undefined) ??
  "";

export const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// Cookie name used by @supabase/ssr to store the session. The library picks
// `sb-<project-ref>-auth-token` by default — we don't override it.
export const AUTH_COOKIE_NAME = `sb-${
  SUPABASE_URL.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] ?? "unknown"
}-auth-token`;

/**
 * Returns true iff the Supabase env vars needed to build a client are set.
 *
 * Used by the dev portal's layouts, pages, and API routes to short-circuit
 * BEFORE calling `createBrowserClient()` / `createServerClient()` (which
 * throw on empty URL/key). Without this guard, a misconfigured `.env` would
 * 500 the entire dashboard + signin + API surface — and since the dashboard
 * layout is a server component, error.tsx can't catch its render-time throw
 * (layout errors bubble past same-segment error boundaries).
 *
 * Server-side callers: pass `true` for `requireServiceRole` if the operation
 * needs the service-role key (admin client) in addition to the public URL +
 * anon key.
 */
export function isSupabaseConfigured(options?: {
  requireServiceRole?: boolean;
}): boolean {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  if (options?.requireServiceRole && !SUPABASE_SERVICE_ROLE_KEY) return false;
  return true;
}
