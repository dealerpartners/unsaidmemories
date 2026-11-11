import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createAuthServerClient } from '@/lib/supabase/server';
import { resolveStaff } from '@/lib/staffGate';
import {
  GOOGLE_CALLBACK_PATH,
  OAUTH_BROWSER_COOKIE,
  consumeOAuthState,
  exchangeGoogleCode,
  findAuthUserByEmail,
  hashBrowserBinding,
  publicOrigin,
  sanitizeNext,
} from '@/lib/googleAuth';

/**
 * GET /api/auth/google/callback — verifies and consumes the single-use
 * state, checks the browser binding, exchanges the code, resolves (or
 * creates) the Supabase auth user, confirms STAFF access (non-staff are
 * bounced with no session minted), then mints the normal Supabase
 * session (magic-link token verified through the SSR client, exactly as
 * the storefront callback does) and redirects to the destination.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function bounce(req: NextRequest, error?: string): NextResponse {
  const url = new URL('/login', publicOrigin(req));
  if (error) url.searchParams.set('error', error);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const googleError = searchParams.get('error');

  const stateRow = await consumeOAuthState(state);
  if (!stateRow) return bounce(req);
  if (googleError || !code) return bounce(req);

  if (stateRow.browser_hash) {
    const cookieValue = (await cookies()).get(OAUTH_BROWSER_COOKIE)?.value;
    const hash = hashBrowserBinding(cookieValue);
    if (!hash || hash !== stateRow.browser_hash) return bounce(req);
  }

  const admin = supabaseAdmin();
  const redirectUri = stateRow.redirect_uri || `${publicOrigin(req)}${GOOGLE_CALLBACK_PATH}`;
  const { profile, error: exchangeError } = await exchangeGoogleCode(code, redirectUri);
  if (!profile) {
    console.warn(`[auth/google/callback] exchange failed — ${exchangeError || 'unknown'}`);
    return bounce(req, 'google_failed');
  }

  let authUser: any = null;
  try {
    authUser = await findAuthUserByEmail(admin, profile.email);
  } catch {
    return bounce(req, 'google_failed');
  }

  if (!authUser) {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: profile.email,
      email_confirm: true,
      user_metadata: {
        display_name: profile.name || profile.email.split('@')[0],
        full_name: profile.name || undefined,
        avatar_url: profile.picture || undefined,
        provider: 'google',
        google_sub: profile.sub,
        audience: 'admin',
      },
    });
    if (createError || !created?.user) return bounce(req, 'google_failed');
    authUser = created.user;
  } else if (!authUser.user_metadata?.google_sub) {
    try {
      await admin.auth.admin.updateUserById(authUser.id, {
        user_metadata: {
          ...(authUser.user_metadata || {}),
          provider: authUser.user_metadata?.provider || 'google',
          google_sub: profile.sub,
          avatar_url: authUser.user_metadata?.avatar_url || profile.picture || undefined,
        },
      });
    } catch {
      /* best-effort */
    }
  }

  // The dashboard is staff-only: no staff row, no session.
  const staff = await resolveStaff(authUser.id, profile.email);
  if (!staff) return bounce(req, 'staff');

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: profile.email,
  });
  const tokenHash = (link as any)?.properties?.hashed_token as string | undefined;
  if (linkError || !tokenHash) return bounce(req, 'session_failed');

  const authClient = await createAuthServerClient();
  const { error: verifyError } = await authClient.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });
  if (verifyError) return bounce(req, 'session_failed');

  const destination = sanitizeNext(stateRow.redirect_to);
  return NextResponse.redirect(new URL(destination, publicOrigin(req)));
}
