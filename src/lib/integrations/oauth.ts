import { createHash, randomBytes, randomUUID } from "crypto";
import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase";
import { TENANT_ID } from "@/lib/admin/gate";
import { encryptValue, decryptValue } from "./crypto";
import {
  getProvider,
  getProviderCredentials,
  redirectUri,
  type SocialProvider,
} from "./providers";

/**
 * OAuth connect flow — the Postiz pattern.
 *
 * Connect:  build the network's authorize URL (client id from Unsaid's
 *           registered OAuth app, this app's callback as redirect_uri,
 *           the provider's scopes, a random `state`, PKCE where the
 *           network requires it) and redirect the user to the network.
 * Callback: verify `state`, exchange the code server-side, fetch the
 *           connected profile from the network, and upsert the account
 *           into social_accounts with tokens encrypted at rest.
 */

const STATE_COOKIE = "unsaid_social_oauth";

interface OAuthSession {
  network: string;
  state: string;
  verifier?: string;
  userId: string;
}

export async function beginOAuth(
  provider: SocialProvider,
  userId: string,
  req: Request
): Promise<{ url: string } | { error: string }> {
  const creds = await getProviderCredentials(provider);
  if (!creds) {
    return {
      error: `${provider.label} is not configured yet. Add its OAuth app credentials (${provider.envClientId} / ${provider.envClientSecret}) in Integrations settings first.`,
    };
  }
  const state = randomUUID();
  const session: OAuthSession = { network: provider.id, state, userId };
  const params = new URLSearchParams();
  params.set(provider.clientKeyParam ? "client_key" : "client_id", creds.clientId);
  params.set("redirect_uri", redirectUri(provider, req));
  params.set("response_type", "code");
  params.set("scope", provider.scopes.join(provider.id === "tiktok" ? "," : " "));
  params.set("state", state);
  if (provider.pkce) {
    const verifier = randomBytes(32).toString("base64url");
    session.verifier = verifier;
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    params.set("code_challenge", challenge);
    params.set("code_challenge_method", "S256");
  }
  for (const [k, v] of Object.entries(provider.authParams ?? {})) params.set(k, v);
  const store = await cookies();
  store.set(STATE_COOKIE, JSON.stringify(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return { url: `${provider.authorizeUrl}?${params.toString()}` };
}

interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  raw: Record<string, unknown>;
}

async function tokenRequest(
  provider: SocialProvider,
  body: URLSearchParams,
  creds: { clientId: string; clientSecret: string }
): Promise<TokenSet> {
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  if (provider.basicAuth) {
    headers.Authorization = `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64")}`;
  } else if (!provider.clientKeyParam) {
    body.set("client_id", creds.clientId);
    body.set("client_secret", creds.clientSecret);
  } else {
    body.set("client_key", creds.clientId);
    body.set("client_secret", creds.clientSecret);
  }
  const res = await fetch(provider.tokenUrl, { method: "POST", headers, body });
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || !raw.access_token) {
    throw new Error(
      `${provider.label} token exchange failed (${res.status}): ${JSON.stringify(raw).slice(0, 300)}`
    );
  }
  const expiresIn = typeof raw.expires_in === "number" ? raw.expires_in : undefined;
  return {
    accessToken: String(raw.access_token),
    refreshToken: raw.refresh_token ? String(raw.refresh_token) : undefined,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : undefined,
    raw,
  };
}

export interface ResolvedAccount {
  externalId: string;
  handle: string;
  displayName: string;
  avatarUrl?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

async function getJson(url: string, accessToken: string): Promise<any> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Profile fetch failed (${res.status}): ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}

/** Turn a fresh token set into the connected account(s) on that network. */
async function resolveAccounts(
  provider: SocialProvider,
  tokens: TokenSet,
  creds: { clientId: string; clientSecret: string },
  req: Request
): Promise<ResolvedAccount[]> {
  const t = tokens.accessToken;
  switch (provider.id) {
    case "x": {
      const me = await getJson("https://api.twitter.com/2/users/me?user.fields=profile_image_url", t);
      return [{
        externalId: me.data.id,
        handle: `@${me.data.username}`,
        displayName: me.data.name,
        avatarUrl: me.data.profile_image_url,
        accessToken: t,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      }];
    }
    case "facebook": {
      // Exchange for a long-lived user token, then one account per Page.
      const ll = await fetch(
        `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${creds.clientId}&client_secret=${creds.clientSecret}&fb_exchange_token=${encodeURIComponent(t)}`
      ).then((r) => r.json()).catch(() => ({}));
      const userToken = ll.access_token ?? t;
      const pages = await getJson(
        "https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,picture{url}&limit=100",
        userToken
      );
      return (pages.data ?? []).map((p: any) => ({
        externalId: p.id,
        handle: p.name,
        displayName: p.name,
        avatarUrl: p.picture?.data?.url,
        accessToken: p.access_token,
        metadata: { kind: "page" },
      }));
    }
    case "instagram": {
      const pages = await getJson(
        "https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,profile_picture_url}&limit=100",
        t
      );
      return (pages.data ?? [])
        .filter((p: any) => p.instagram_business_account)
        .map((p: any) => ({
          externalId: p.instagram_business_account.id,
          handle: `@${p.instagram_business_account.username}`,
          displayName: p.instagram_business_account.username,
          avatarUrl: p.instagram_business_account.profile_picture_url,
          accessToken: p.access_token,
          metadata: { kind: "instagram", page_id: p.id, page_name: p.name },
        }));
    }
    case "linkedin": {
      const me = await getJson("https://api.linkedin.com/v2/userinfo", t);
      return [{
        externalId: me.sub,
        handle: me.name,
        displayName: me.name,
        avatarUrl: me.picture,
        accessToken: t,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      }];
    }
    case "pinterest": {
      const me = await getJson("https://api.pinterest.com/v5/user_account", t);
      return [{
        externalId: me.id,
        handle: `@${me.username}`,
        displayName: me.username,
        avatarUrl: me.profile_image,
        accessToken: t,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      }];
    }
    case "tiktok": {
      const openId = String(tokens.raw.open_id ?? "");
      const me = await getJson(
        "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url",
        t
      );
      return [{
        externalId: openId || me.data?.user?.open_id,
        handle: me.data?.user?.display_name ?? "TikTok account",
        displayName: me.data?.user?.display_name ?? "TikTok account",
        avatarUrl: me.data?.user?.avatar_url,
        accessToken: t,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      }];
    }
    case "youtube": {
      const me = await getJson(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
        t
      );
      const ch = me.items?.[0];
      if (!ch) throw new Error("No YouTube channel found on this Google account.");
      return [{
        externalId: ch.id,
        handle: ch.snippet.title,
        displayName: ch.snippet.title,
        avatarUrl: ch.snippet.thumbnails?.default?.url,
        accessToken: t,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      }];
    }
    case "threads": {
      const userId = String(tokens.raw.user_id ?? "");
      const ll = await fetch(
        `https://graph.threads.net/v1.0/access_token?grant_type=th_exchange_token&client_secret=${encodeURIComponent(creds.clientSecret)}&access_token=${encodeURIComponent(t)}`
      ).then((r) => r.json()).catch(() => ({}));
      const longToken = ll.access_token ?? t;
      const expiresAt = ll.expires_in
        ? new Date(Date.now() + Number(ll.expires_in) * 1000).toISOString()
        : undefined;
      const me = await getJson(
        `https://graph.threads.net/v1.0/${userId}?fields=id,username,threads_profile_picture_url`,
        longToken
      );
      return [{
        externalId: me.id ?? userId,
        handle: `@${me.username}`,
        displayName: me.username,
        avatarUrl: me.threads_profile_picture_url,
        accessToken: longToken,
        expiresAt,
      }];
    }
  }
}

export async function completeOAuth(
  provider: SocialProvider,
  code: string,
  state: string,
  req: Request
): Promise<{ accounts: number }> {
  const store = await cookies();
  const raw = store.get(STATE_COOKIE)?.value;
  if (!raw) throw new Error("OAuth session expired. Start the connection again.");
  const session = JSON.parse(raw) as OAuthSession;
  if (session.network !== provider.id || session.state !== state) {
    throw new Error("OAuth state mismatch. Start the connection again.");
  }
  store.delete(STATE_COOKIE);
  const creds = await getProviderCredentials(provider);
  if (!creds) throw new Error(`${provider.label} is not configured.`);
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("redirect_uri", redirectUri(provider, req));
  if (provider.pkce && session.verifier) body.set("code_verifier", session.verifier);
  const tokens = await tokenRequest(provider, body, creds);
  const accounts = await resolveAccounts(provider, tokens, creds, req);
  if (accounts.length === 0) {
    throw new Error(
      provider.id === "instagram"
        ? "No Instagram professional account is linked to a Facebook Page on this account."
        : `No ${provider.label} account could be connected from this login.`
    );
  }
  const db = createServerClient();
  for (const account of accounts) {
    const { error } = await db
      .from("social_accounts")
      .upsert(
        {
          tenant_id: TENANT_ID,
          network: provider.id,
          external_account_id: account.externalId,
          handle: account.handle,
          display_name: account.displayName,
          avatar_url: account.avatarUrl ?? null,
          access_token_encrypted: encryptValue(account.accessToken),
          refresh_token_encrypted: account.refreshToken ? encryptValue(account.refreshToken) : null,
          token_expires_at: account.expiresAt ?? null,
          scopes: provider.scopes,
          status: "connected",
          connected_by: session.userId,
          metadata: account.metadata ?? {},
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,network,external_account_id" }
      );
    if (error) throw new Error(`Saving the ${provider.label} connection failed: ${error.message}`);
  }
  return { accounts: accounts.length };
}

/** Return a usable access token for an account, refreshing first if expired. */
export async function usableAccessToken(account: {
  id: string;
  network: string;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
}): Promise<string> {
  if (!account.access_token_encrypted) {
    throw new Error("This account has no stored token. Reconnect it.");
  }
  const current = decryptValue(account.access_token_encrypted);
  const expired =
    account.token_expires_at && new Date(account.token_expires_at).getTime() < Date.now() + 60_000;
  if (!expired) return current;
  if (!account.refresh_token_encrypted) return current;
  const provider = getProvider(account.network);
  if (!provider) return current;
  const creds = await getProviderCredentials(provider);
  if (!creds) return current;
  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", decryptValue(account.refresh_token_encrypted));
  const refreshed = await tokenRequest(provider, body, creds);
  const db = createServerClient();
  await db
    .from("social_accounts")
    .update({
      access_token_encrypted: encryptValue(refreshed.accessToken),
      refresh_token_encrypted: refreshed.refreshToken
        ? encryptValue(refreshed.refreshToken)
        : account.refresh_token_encrypted,
      token_expires_at: refreshed.expiresAt ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", account.id);
  return refreshed.accessToken;
}
