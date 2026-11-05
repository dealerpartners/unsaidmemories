import { NextResponse, type NextRequest } from "next/server";
import { createAuthClient } from "@/lib/supabase/server";

/**
 * Ads portal OAuth callback (mounted at /ads/auth/callback).
 *
 * Supabase redirects here with `?code=...` after the user finishes the
 * Google/Apple flow. We exchange the code for a session, then redirect to
 * the `next` param (or /ads for the ads portal).
 *
 * On error we send the user back to the ads sign-in page at /ads/signin.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/ads";

  if (code) {
    const supabase = await createAuthClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    return NextResponse.redirect(
      `${origin}/ads/signin?next=${encodeURIComponent(next)}&error=${encodeURIComponent(error.message)}`,
    );
  }

  return NextResponse.redirect(`${origin}/ads/signin?next=${encodeURIComponent(next)}`);
}
