import { createServerClient } from "@/lib/supabase";
import { decryptValue } from "./crypto";

/**
 * Social provider registry — the Postiz pattern.
 *
 * One entry per network: its OAuth endpoints, scopes, and where its
 * OAuth *app* credentials live. The app credentials belong to Unsaid's
 * developer app on each network (one per network, not per user); the
 * end user only ever approves scopes on the network's own pages.
 *
 * Credential resolution order: environment variables first
 * (e.g. X_CLIENT_ID / X_CLIENT_SECRET), then the integration_secrets
 * store (service_key = "social_<network>", field_key = client_id /
 * client_secret) which the admin Integrations screen writes to.
 */

export type SocialNetworkId =
  | "x"
  | "facebook"
  | "instagram"
  | "linkedin"
  | "pinterest"
  | "tiktok"
  | "youtube"
  | "threads";

export interface SocialProvider {
  id: SocialNetworkId;
  label: string;
  blurb: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  envClientId: string;
  envClientSecret: string;
  pkce: boolean;
  /** Extra authorize-url params (Google offline access, Meta config, …). */
  authParams?: Record<string, string>;
  /** Token endpoint expects HTTP Basic client auth instead of body params. */
  basicAuth?: boolean;
  /** Token endpoint expects TikTok-style client_key instead of client_id. */
  clientKeyParam?: boolean;
  /** Character limit for a post caption on this network (0 = no limit). */
  captionLimit: number;
  color: string;
}

export const SOCIAL_PROVIDERS: SocialProvider[] = [
  {
    id: "x",
    label: "X (Twitter)",
    blurb: "Post product announcements to your X timeline.",
    authorizeUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.twitter.com/2/oauth2/token",
    scopes: ["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"],
    envClientId: "X_CLIENT_ID",
    envClientSecret: "X_CLIENT_SECRET",
    pkce: true,
    basicAuth: true,
    captionLimit: 280,
    color: "#000000",
  },
  {
    id: "facebook",
    label: "Facebook Page",
    blurb: "Publish to the Facebook Pages you manage.",
    authorizeUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
    scopes: ["public_profile", "pages_show_list", "pages_manage_posts", "pages_read_engagement"],
    envClientId: "FACEBOOK_CLIENT_ID",
    envClientSecret: "FACEBOOK_CLIENT_SECRET",
    pkce: false,
    captionLimit: 0,
    color: "#1877f2",
  },
  {
    id: "instagram",
    label: "Instagram",
    blurb: "Publish photos to an Instagram professional account linked to a Facebook Page.",
    authorizeUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
    scopes: [
      "public_profile",
      "pages_show_list",
      "instagram_basic",
      "instagram_content_publish",
    ],
    envClientId: "FACEBOOK_CLIENT_ID",
    envClientSecret: "FACEBOOK_CLIENT_SECRET",
    pkce: false,
    captionLimit: 2200,
    color: "#d62976",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    blurb: "Share product stories with your professional network.",
    authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    scopes: ["openid", "profile", "w_member_social"],
    envClientId: "LINKEDIN_CLIENT_ID",
    envClientSecret: "LINKEDIN_CLIENT_SECRET",
    pkce: false,
    captionLimit: 3000,
    color: "#0a66c2",
  },
  {
    id: "pinterest",
    label: "Pinterest",
    blurb: "Pin product images to your boards.",
    authorizeUrl: "https://www.pinterest.com/oauth/",
    tokenUrl: "https://api.pinterest.com/v5/oauth/token",
    scopes: ["user_accounts:read", "boards:read", "boards:write", "pins:read", "pins:write"],
    envClientId: "PINTEREST_CLIENT_ID",
    envClientSecret: "PINTEREST_CLIENT_SECRET",
    pkce: false,
    basicAuth: true,
    captionLimit: 0,
    color: "#e60023",
  },
  {
    id: "tiktok",
    label: "TikTok",
    blurb: "Publish product videos and photos to TikTok.",
    authorizeUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    scopes: ["user.info.basic", "video.publish", "video.upload"],
    envClientId: "TIKTOK_CLIENT_KEY",
    envClientSecret: "TIKTOK_CLIENT_SECRET",
    pkce: false,
    clientKeyParam: true,
    captionLimit: 2200,
    color: "#010101",
  },
  {
    id: "youtube",
    label: "YouTube",
    blurb: "Upload product videos to your channel.",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
    ],
    envClientId: "GOOGLE_CLIENT_ID",
    envClientSecret: "GOOGLE_CLIENT_SECRET",
    pkce: true,
    authParams: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
    captionLimit: 5000,
    color: "#ff0000",
  },
  {
    id: "threads",
    label: "Threads",
    blurb: "Post to your Threads profile.",
    authorizeUrl: "https://threads.net/oauth/authorize",
    tokenUrl: "https://graph.threads.net/oauth/access_token",
    scopes: ["threads_basic", "threads_content_publish"],
    envClientId: "THREADS_CLIENT_ID",
    envClientSecret: "THREADS_CLIENT_SECRET",
    pkce: false,
    captionLimit: 500,
    color: "#000000",
  },
];

export function getProvider(id: string): SocialProvider | null {
  return SOCIAL_PROVIDERS.find((p) => p.id === id) ?? null;
}

export interface ProviderCredentials {
  clientId: string;
  clientSecret: string;
  source: "env" | "settings";
}

/** Resolve a network's OAuth app credentials (env → integration_secrets). */
export async function getProviderCredentials(
  provider: SocialProvider
): Promise<ProviderCredentials | null> {
  const envId = process.env[provider.envClientId];
  const envSecret = process.env[provider.envClientSecret];
  if (envId && envSecret) {
    return { clientId: envId, clientSecret: envSecret, source: "env" };
  }
  try {
    const db = createServerClient();
    const { data } = await db
      .from("integration_secrets")
      .select("field_key, value_encrypted, is_set")
      .eq("service_key", `social_${provider.id}`)
      .in("field_key", ["client_id", "client_secret"]);
    const byField = new Map((data ?? []).map((r) => [r.field_key, r]));
    const idRow = byField.get("client_id");
    const secretRow = byField.get("client_secret");
    if (idRow?.is_set && idRow.value_encrypted && secretRow?.is_set && secretRow.value_encrypted) {
      return {
        clientId: decryptValue(idRow.value_encrypted),
        clientSecret: decryptValue(secretRow.value_encrypted),
        source: "settings",
      };
    }
  } catch {
    // integration_secrets unreachable — treat as unconfigured.
  }
  return null;
}

export async function providerConfigured(provider: SocialProvider): Promise<boolean> {
  return (await getProviderCredentials(provider)) !== null;
}

/** App base URL used to build OAuth redirect URIs. */
export function appBaseUrl(req?: Request): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL.replace(/\/$/, "");
  if (req) {
    const url = new URL(req.url);
    return `${url.protocol}//${url.host}`;
  }
  return "http://localhost:3000";
}

export function redirectUri(provider: SocialProvider, req?: Request): string {
  return `${appBaseUrl(req)}/api/admin/integrations/social/callback/${provider.id}`;
}
