import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { requireSupabase } from "@/lib/supabase/guard";

/**
 * GET /api/me — returns the bare minimum identity info for the dashboard
 * shell: { id, email, metadata }. Called from the client the moment the
 * shell mounts.
 *
 * This is the ONLY session call the dashboard shell needs to render the
 * header ("Welcome, <email>"). All heavier data (keys, webhooks, usage) is
 * fetched by each page's own hook — not here.
 *
 * The middleware has already verified the session before this route runs,
 * so `getCurrentUser()` is just reading the JWT out of the cookie — no DB
 * round-trip, no RLS evaluation, ~5-10ms typical.
 */
export async function GET() {
  const __sb = requireSupabase(); if (__sb) return __sb;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ user: null }, { status: 200 });
  }
  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
      // user_metadata is a small JSONB blob on auth.users — display_name,
      // company_name, website. Cheap to ship down.
      metadata: user.user_metadata ?? {},
    },
  });
}
