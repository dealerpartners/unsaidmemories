import { NextRequest, NextResponse } from 'next/server';
import {
  GOOGLE_CALLBACK_PATH,
  OAUTH_BROWSER_COOKIE,
  createOAuthState,
  googleAuthUrl,
  googleCredentials,
  hashBrowserBinding,
  newBrowserBinding,
  sanitizeNext,
} from '@/lib/googleAuth';

/**
 * GET /api/auth/google — the dashboard's Google sign-in entry. Builds
 * the Google auth URL against this origin's registered callback, stores
 * the single-use server-side state, binds the flow to this browser, and
 * redirects. Never renders.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const next = sanitizeNext(req.nextUrl.searchParams.get('next'));
  const { clientId, clientSecret } = await googleCredentials();
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/login?error=google_not_configured', req.nextUrl.origin));
  }

  const redirectUri = `${req.nextUrl.origin}${GOOGLE_CALLBACK_PATH}`;
  const binding = newBrowserBinding();
  const state = await createOAuthState(next, redirectUri, hashBrowserBinding(binding));
  if (!state) {
    return NextResponse.redirect(new URL('/login?error=google_unavailable', req.nextUrl.origin));
  }

  const res = NextResponse.redirect(googleAuthUrl(clientId, redirectUri, state));
  res.cookies.set(OAUTH_BROWSER_COOKIE, binding, {
    httpOnly: true,
    secure: req.nextUrl.protocol === 'https:',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}
