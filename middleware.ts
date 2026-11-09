import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * - Refreshes the Supabase auth session on every request.
 * - Sends already-signed-in visitors away from /login and /signup to
 *   their destination (the `next` param, defaulting to /account).
 *
 * When Supabase is not configured (local sandbox previews), creating the
 * client THROWS on every request, 500-ing the whole site. In that case
 * there is no session to refresh, so the request passes through
 * untouched.
 */
export async function middleware(request: NextRequest) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return NextResponse.next();
  }

  const { supabaseResponse, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isAuthRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/auth/");

  // Already signed in and hitting login/signup — send them on.
  if (isAuthRoute && user && !pathname.startsWith("/auth/")) {
    const next = request.nextUrl.searchParams.get("next") || "/account";
    const destUrl = request.nextUrl.clone();
    destUrl.pathname = next;
    destUrl.search = "";
    return Response.redirect(destUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Run on everything except static assets and Next internals.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
