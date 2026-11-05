import { NextRequest, NextResponse } from "next/server";
import {
  GOOGLE_CALLBACK_PATH,
  OAUTH_BROWSER_COOKIE,
  createOAuthState,
  googleAuthUrl,
  googleCredentials,
  hashBrowserBinding,
  newBrowserBinding,
  sanitizeNext,
} from "@/lib/google-auth";

// ===========================================================================
// GET /api/auth/google
//
// The one and only Google sign-in entry (the AAPawZ pattern): builds the
// Google auth URL against this origin's registered callback, stores the
// single-use server-side state, binds the flow to this browser, and
// redirects. This route never renders — every path is a redirect. If
// sign-in cannot start (keys not set yet), the browser lands back on the
// sign-in page with a short code.
// ===========================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const next = sanitizeNext(req.nextUrl.searchParams.get("next"));
  const { clientId, clientSecret } = await googleCredentials();
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/login?error=google_not_configured", req.nextUrl.origin));
  }

  const portal = req.nextUrl.searchParams.get("portal") === "advertiser" ? "advertiser" : "customer";
  const redirectUri = `${req.nextUrl.origin}${GOOGLE_CALLBACK_PATH}`;
  const binding = newBrowserBinding();
  const state = await createOAuthState(next, redirectUri, hashBrowserBinding(binding), portal);
  if (!state) {
    return NextResponse.redirect(new URL("/login?error=google_unavailable", req.nextUrl.origin));
  }

  const res = NextResponse.redirect(googleAuthUrl(clientId, redirectUri, state));
  res.cookies.set(OAUTH_BROWSER_COOKIE, binding, {
    httpOnly: true,
    secure: req.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
