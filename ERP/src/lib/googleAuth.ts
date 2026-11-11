import { createHash, randomBytes } from 'crypto';
import { supabaseAdmin } from './supabaseAdmin';
import { getIntegrationKey } from './supplierKeys';

/**
 * Google sign-in for the dashboard — the platform's own pattern (the
 * storefront / AAPawZ pattern): the OAuth dance runs against the
 * platform's OWN Google client (keys in integration_keys:
 * GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET), the verified Google
 * identity lands in Supabase (find-or-create the auth user server-side),
 * and the session is minted as a normal Supabase session. Supabase's
 * built-in Google provider is not used.
 */

export const GOOGLE_CALLBACK_PATH = '/api/auth/google/callback';
export const OAUTH_BROWSER_COOKIE = 'uns_oauth_b';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export async function googleCredentials(): Promise<{ clientId: string; clientSecret: string }> {
  const [clientId, clientSecret] = await Promise.all([
    getIntegrationKey('GOOGLE_CLIENT_ID'),
    getIntegrationKey('GOOGLE_CLIENT_SECRET'),
  ]);
  return { clientId: clientId || '', clientSecret: clientSecret || '' };
}

export function newBrowserBinding(): string {
  return randomBytes(32).toString('base64url');
}

export function hashBrowserBinding(value: string | undefined | null): string | null {
  if (!value) return null;
  return createHash('sha256').update(value).digest('hex');
}

export interface OAuthStateRow {
  nonce: string;
  portal: string | null;
  redirect_to: string;
  redirect_uri: string | null;
  browser_hash: string | null;
}

export async function createOAuthState(
  redirectTo: string,
  redirectUri: string,
  browserHash: string | null,
): Promise<string | null> {
  const admin = supabaseAdmin();
  try {
    await admin
      .from('oauth_states')
      .delete()
      .lt('expires_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  } catch {
    /* hygiene is best-effort */
  }
  const nonce = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString();
  const { error } = await admin.from('oauth_states').insert({
    nonce,
    portal: 'admin',
    redirect_to: redirectTo,
    redirect_uri: redirectUri,
    return_origin: null,
    browser_hash: browserHash,
    expires_at: expiresAt,
    used: false,
  });
  if (error) {
    console.error('[google-auth] createOAuthState:', error.message);
    return null;
  }
  return nonce;
}

export async function consumeOAuthState(state: string | null | undefined): Promise<OAuthStateRow | null> {
  if (!state) return null;
  const admin = supabaseAdmin();
  const { data } = await admin
    .from('oauth_states')
    .select('nonce, portal, redirect_to, redirect_uri, browser_hash, expires_at, used')
    .eq('nonce', state)
    .maybeSingle();
  if (!data || data.used) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  const { error } = await admin
    .from('oauth_states')
    .update({ used: true })
    .eq('nonce', state)
    .eq('used', false);
  if (error) return null;
  return {
    nonce: data.nonce,
    portal: data.portal,
    redirect_to: data.redirect_to,
    redirect_uri: data.redirect_uri,
    browser_hash: data.browser_hash,
  };
}

export function googleAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

export async function exchangeGoogleCode(
  code: string,
  redirectUri: string,
): Promise<{ profile: GoogleProfile | null; error?: string }> {
  const { clientId, clientSecret } = await googleCredentials();
  if (!clientId || !clientSecret) return { profile: null, error: 'Google sign-in is not configured.' };
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData: any = await tokenRes.json();
    if (!tokenRes.ok) {
      return { profile: null, error: tokenData?.error_description || tokenData?.error || 'Google token exchange failed.' };
    }
    // The id_token came directly from Google's token endpoint over TLS —
    // decoding the payload (no local signature check needed) is standard.
    const idToken = tokenData.id_token as string | undefined;
    if (!idToken) return { profile: null, error: 'Google response did not include an identity token.' };
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf-8')) as any;
    if (!payload?.sub || !payload?.email) {
      return { profile: null, error: 'Google identity token is missing an email.' };
    }
    if (payload.email_verified === false) {
      return { profile: null, error: 'Google account email is not verified.' };
    }
    return {
      profile: {
        sub: String(payload.sub),
        email: String(payload.email).toLowerCase(),
        name: payload.name,
        picture: payload.picture,
      },
    };
  } catch (e: any) {
    return { profile: null, error: e?.message || 'Google code exchange failed.' };
  }
}

export async function findAuthUserByEmail(admin: any, email: string): Promise<any | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) return null;
    const hit = data.users.find((u: any) => (u.email || '').toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 1000) return null;
  }
  return null;
}

/**
 * The public origin of this deployment, from the proxy's forwarded
 * headers. Behind the reverse proxy the route handlers otherwise see
 * the internal listen address (0.0.0.0:3001) as the request origin,
 * which would poison the OAuth redirect_uri.
 */
export function publicOrigin(req: { headers: Headers; url: string }): string {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  if (host) return `${proto}://${host}`;
  return new URL(req.url).origin;
}

/** Only same-site paths may be a post-sign-in destination. */
export function sanitizeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}
