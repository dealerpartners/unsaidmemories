import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * Guard for dev-portal API routes.
 *
 * Returns `null` when Supabase is configured (caller proceeds normally).
 * Returns a 503 JSON response when it isn't — so the API fails cleanly
 * with a useful message instead of a 500 from `createServerClient()` or
 * `pgPool.query()` throwing on empty env vars.
 *
 * Usage at the top of any route handler:
 *
 *   export async function GET() {
 *     const unavailable = requireSupabase();
 *     if (unavailable) return unavailable;
 *     // ...rest of handler
 *   }
 *
 * Pass `requireServiceRole: true` for routes that use `createAdminClient()`
 * (e.g. /api/auth/check-email). Pass `requirePostgres: true` for routes
 * that use the raw `pgPool` (e.g. /api/auth/signup, /api/v1/*).
 */
export function requireSupabase(options?: {
  requireServiceRole?: boolean;
  requirePostgres?: boolean;
}): NextResponse | null {
  if (isSupabaseConfigured(options)) {
    // For Postgres-dependent routes, also verify the DB URL is set.
    if (options?.requirePostgres) {
      const dbUrl =
        process.env.SUPABASE_DB_POOLER_URL || process.env.DATABASE_URL;
      if (!dbUrl || !dbUrl.startsWith("postgres")) {
        return NextResponse.json(
          {
            error:
              "Postgres connection not configured. Set DATABASE_URL (and optionally SUPABASE_DB_POOLER_URL) in .env to a postgresql:// URL.",
          },
          { status: 503 },
        );
      }
    }
    return null;
  }

  const missing: string[] = [];
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (options?.requireServiceRole && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  return NextResponse.json(
    {
      error: {
        code: "supabase_not_configured",
        message: `Supabase is not configured. Missing env vars: ${missing.join(", ")}. Set them in .env and restart the dev server.`,
      },
    },
    { status: 503 },
  );
}
