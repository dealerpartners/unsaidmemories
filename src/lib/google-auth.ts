import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "crypto";
import { getIntegrationKey } from "@/lib/integrations/keys";

/**
 * Google sign-in — the All About Pawz pattern, folded into Unsaid:
 * the OAuth dance runs in Next.js against the store's OWN Google
 * client (one client, one callback), and the verified Google identity
 * lands in Supabase — find-or-create the auth user server-side, then
 * mint the app's normal Supabase session. The client never decides
 * anything; the database record is the account.
 *
 * Keys live in Connections & Keys (GOOGLE_CLIENT_ID /
 * GOOGLE_CLIENT_SECRET) with env fallback, so the owner can re-key
 * without a developer. Nothing here runs until both are set.
 */

export const GOOGLE_CALLBACK_PATH = "/api/auth/google/callback";
export const OAUTH_BROWSER_COOKIE = "uns_oauth_b";
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

const SB_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export function getGoogleAdmin() {
  if (!SB_URL || !SB_SERVICE_KEY) return null;
  return createClient(SB_URL, SB_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function googleCredentials(): Promise<{ clientId: string; clientSecret: string }> {
  const [clientId, clientSecret] = await Promise.all([
    getIntegrationKey("GOOGLE_CLIENT_ID"),
    getIntegrationKey("GOOGLE_CLIENT_SECRET"),
  ]);
  return { clientId: clientId || "", clientSecret: clientSecret || "" };
}

export async function googleConfigured(): Promise<boolean> {
  const { clientId, clientSecret } = await googleCredentials();
  return Boolean(clientId && clientSecret);
}

// --- Browser binding (login-CSRF guard): the initiator sets a random
// cookie in the browser and stores only its hash in the state row; the
// callback refuses a state presented by any other browser.

export function newBrowserBinding(): string {
  return randomBytes(32).toString("base64url");
}

export function hashBrowserBinding(value: string | undefined | null): string | null {
  if (!value) return null;
  return createHash("sha256").update(value).digest("hex");
}

// --- Single-use server-side state (oauth_states — same table shape
// the pattern was built on).

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
  portal: string = "customer",
): Promise<string | null> {
  const admin = getGoogleAdmin();
  if (!admin) return null;
  // Housekeeping: sweep states dead for over a day (best-effort).
  try {
    await admin
      .from("oauth_states")
      .delete()
      .lt("expires_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  } catch {
    /* hygiene is best-effort */
  }
  const nonce = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString();
  const { error } = await admin.from("oauth_states").insert({
    nonce,
    portal,
    redirect_to: redirectTo,
    redirect_uri: redirectUri,
    return_origin: null,
    browser_hash: browserHash,
    expires_at: expiresAt,
    used: false,
  });
  if (error) {
    console.error("[google-auth] createOAuthState:", error.message);
    return null;
  }
  return nonce;
}

export async function consumeOAuthState(state: string | null | undefined): Promise<OAuthStateRow | null> {
  if (!state) return null;
  const admin = getGoogleAdmin();
  if (!admin) return null;
  const { data } = await admin
    .from("oauth_states")
    .select("nonce, portal, redirect_to, redirect_uri, browser_hash, expires_at, used")
    .eq("nonce", state)
    .maybeSingle();
  if (!data || data.used) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  const { error } = await admin.from("oauth_states").update({ used: true }).eq("nonce", state).eq("used", false);
  if (error) return null;
  return {
    nonce: data.nonce,
    portal: data.portal,
    redirect_to: data.redirect_to,
    redirect_uri: data.redirect_uri,
    browser_hash: data.browser_hash,
  };
}

// --- The Google endpoints.

export function googleAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    // The People scopes ride along (owner order, 2026-11-04): the
    // consent screen lists them, so Google shows the customer exactly
    // what is being asked — phone numbers and addresses from their
    // Google profile, read-only. The callback's People capture reads
    // them into the customer record; possession of the phone is
    // still proven by Twilio, never by this claim.
    scope:
      "openid email profile https://www.googleapis.com/auth/user.phonenumbers.read https://www.googleapis.com/auth/user.addresses.read",
    state,
    access_type: "online",
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
): Promise<{ profile: GoogleProfile | null; error?: string; accessToken?: string }> {
  const { clientId, clientSecret } = await googleCredentials();
  if (!clientId || !clientSecret) return { profile: null, error: "Google sign-in is not configured." };
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokenData: any = await tokenRes.json();
    if (!tokenRes.ok) {
      return { profile: null, error: tokenData?.error_description || tokenData?.error || "Google token exchange failed." };
    }
    // The id_token came directly from Google's token endpoint over TLS —
    // decoding the payload (no local signature check needed) is standard.
    const idToken = tokenData.id_token as string | undefined;
    if (!idToken) return { profile: null, error: "Google response did not include an identity token." };
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf-8")) as any;
    if (!payload?.sub || !payload?.email) {
      return { profile: null, error: "Google identity token is missing an email." };
    }
    if (payload.email_verified === false) {
      return { profile: null, error: "Google account email is not verified." };
    }
    return {
      profile: {
        sub: String(payload.sub),
        email: String(payload.email).toLowerCase(),
        name: payload.name,
        picture: payload.picture,
      },
      // The access token rides along for the People API capture
      // (phone + address) — it used to be discarded here.
      accessToken: typeof tokenData.access_token === "string" ? tokenData.access_token : undefined,
    };
  } catch (e: any) {
    return { profile: null, error: e?.message || "Google code exchange failed." };
  }
}

// --- People API capture: what Google can pass beyond identity.
//
// Google CAN hand over the phone number and postal address on the
// person's Google profile — when the app asks for the scopes
// (user.phonenumbers.read / user.addresses.read) and the person's
// profile carries them. The reader below is deliberately inert
// until those scopes are granted: any failure — scopes not yet on
// the consent screen, People API not enabled, an empty profile —
// returns null and sign-in proceeds exactly as before. The phone it
// returns is a CLAIM from the profile, never a verification: Twilio
// still proves possession before anything is stamped verified.

export interface GooglePeopleCapture {
  phone: string | null;
  address: {
    first_name?: string;
    last_name?: string;
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postal_code: string;
    country_code?: string;
  } | null;
  partialAddress: Record<string, string> | null;
}

export async function fetchGooglePeople(accessToken: string): Promise<GooglePeopleCapture | null> {
  try {
    const res = await fetch(
      "https://people.googleapis.com/v1/people/me?personFields=names,phoneNumbers,addresses",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) return null;
    const data: any = await res.json();

    let phone: string | null = null;
    const phones = Array.isArray(data?.phoneNumbers) ? data.phoneNumbers : [];
    if (phones.length) {
      phone = String(phones[0].canonicalForm || phones[0].value || "") || null;
    }

    let address: GooglePeopleCapture["address"] = null;
    let partialAddress: Record<string, string> | null = null;
    const addrs = Array.isArray(data?.addresses) ? data.addresses : [];
    if (addrs.length) {
      const a = addrs[0] ?? {};
      const parts: Record<string, string> = {};
      if (a.streetAddress) parts.line1 = String(a.streetAddress);
      if (a.extendedAddress) parts.line2 = String(a.extendedAddress);
      if (a.city) parts.city = String(a.city);
      if (a.region) parts.state = String(a.region);
      if (a.postalCode) parts.postal_code = String(a.postalCode);
      if (a.countryCode) parts.country_code = String(a.countryCode);
      if (Object.keys(parts).length) partialAddress = parts;
      if (parts.line1 && parts.city && parts.postal_code) {
        const names = Array.isArray(data?.names) ? data.names : [];
        const given = names[0]?.givenName ? String(names[0].givenName) : undefined;
        const family = names[0]?.familyName ? String(names[0].familyName) : undefined;
        address = {
          first_name: given,
          last_name: family,
          line1: parts.line1,
          line2: parts.line2,
          city: parts.city,
          state: parts.state,
          postal_code: parts.postal_code,
          country_code: parts.country_code || "US",
        };
      }
    }
    if (!phone && !partialAddress) return null;
    return { phone, address, partialAddress };
  } catch {
    return null;
  }
}

// --- Landing in Supabase: resolve the auth user by email.

export async function findAuthUserByEmail(admin: any, email: string): Promise<any | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) return null;
    const hit = data.users.find((u: any) => (u.email || "").toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 1000) return null;
  }
  return null;
}

/** Only same-site paths may be a post-sign-in destination. */
export function sanitizeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/account";
  return next;
}
