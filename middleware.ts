import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * - Refreshes the Supabase auth session on every request.
 * - Protects /admin/*: unauthenticated visitors are redirected to /login
 *   with a `next` param so they land back where they were headed.
 *
 * When Supabase is not configured (local sandbox previews), creating the
 * client THROWS on every request, 500-ing the whole site. In that case
 * there is no session to refresh and no session to gate on, so the
 * request passes through untouched — the (portals) admin layout still
 * guards /admin with its own session check and bounces signed-out
 * visitors to the admin door.
 */
export async function middleware(request: NextRequest) {
  // Workspace tabs: pages loaded inside a shell tab frame carry
  // ?embed=1 — stamp it as a header so the admin layout renders the
  // bare content (no second shell inside the frame).
  if (request.nextUrl.pathname.startsWith("/admin") && request.nextUrl.searchParams.get("embed") === "1") {
    request.headers.set("x-workspace-embed", "1");
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return NextResponse.next();
  }

  const { supabaseResponse, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isAdminRoute = pathname.startsWith("/admin");
  const isAuthRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/auth/");

  // Lock down the admin — no session, no entry.
  if (isAdminRoute && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return Response.redirect(loginUrl);
  }

  // Already signed in and hitting login/signup — send them to the admin.
  if (isAuthRoute && user && !pathname.startsWith("/auth/")) {
    const next = request.nextUrl.searchParams.get("next") || "/admin";
    const adminUrl = request.nextUrl.clone();
    adminUrl.pathname = next;
    adminUrl.search = "";
    return Response.redirect(adminUrl);
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
