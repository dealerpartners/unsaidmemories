import { NextRequest, NextResponse } from 'next/server';
import {
  GOOGLE_CALLBACK_PATH,
  OAUTH_BROWSER_COOKIE,
  createOAuthState,
  googleAuthUrl,
  googleCredentials,
  hashBrowserBinding,
  newBrowserBinding,
  publicOrigin,
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
    return NextResponse.redirect(new URL('/login?error=google_not_configured', publicOrigin(req)));
  }

  const redirectUri = `${publicOrigin(req)}${GOOGLE_CALLBACK_PATH}`;
  const binding = newBrowserBinding();
  const state = await createOAuthState(next, redirectUri, hashBrowserBinding(binding));
  if (!state) {
    return NextResponse.redirect(new URL('/login?error=google_unavailable', publicOrigin(req)));
  }

  const res = NextResponse.redirect(googleAuthUrl(clientId, redirectUri, state));
  res.cookies.set(OAUTH_BROWSER_COOKIE, binding, {
    httpOnly: true,
    secure: publicOrigin(req).startsWith('https:'),
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}
