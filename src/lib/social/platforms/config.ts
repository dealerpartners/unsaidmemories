// Platform registry — single source of truth for plug-and-play.
// Admin sets operator keys per platform (AdminKeyField[]); users then connect
// their own accounts via the flow named by authType. Endpoints verified
// 2026-10-16 (see docs/PLATFORM_KEYS_AND_APPROVALS.md).
export type PlatformId =
  | "facebook" | "instagram" | "threads" | "whatsapp" | "tiktok" | "youtube"
  | "google_business" | "x" | "linkedin" | "reddit" | "pinterest"
  | "wordpress" | "wordpress_self" | "bluesky" | "telegram" | "discord"
  | "slack" | "shopify" | "snapchat" | "messages";

// Maps UI platform -> DB enum public.platform (wordpress variants share 'wordpress')
export type DbPlatform =
  | "facebook" | "instagram" | "threads" | "whatsapp" | "tiktok" | "youtube"
  | "google_business" | "x" | "linkedin" | "reddit" | "pinterest" | "wordpress"
  | "bluesky" | "telegram" | "discord" | "slack" | "shopify" | "snapchat" | "messages";

export type AuthType =
  | "oauth2"          // standard code flow with operator client id/secret
  | "oauth2_pkce"     // code flow + PKCE (X, Google)
  | "per_shop_oauth"  // Shopify: authorize URL is per-shop domain
  | "bot_channel"     // Telegram/Discord: operator bot token; user supplies chat/channel target
  | "app_password"    // Bluesky: handle + app password per user
  | "site_password"   // WordPress self-hosted: site URL + user + app password per site
  | "operator_only"   // WhatsApp: operator system-user token + phone number; users just enable it
  | "handoff";        // Snapchat / Messages: no server publish API — user completes in-app

export interface AdminKeyField { key: "clientId" | "clientSecret" | "botToken" | "accessToken" | "phoneNumberId" | "wabaId"; label: string; secret: boolean }
export interface OAuthCfg {
  authorizeUrl: string; tokenUrl: string; scopes: string[];
  pkce?: boolean; extraAuthorizeParams?: Record<string, string>; tokenAuth?: "body" | "basic";
}
export interface PlatformCfg {
  id: PlatformId; db: DbPlatform; label: string; authType: AuthType;
  capability: "server_publish" | "messaging" | "user_handoff" | "store_content";
  maxChars: number; adminKeys: AdminKeyField[]; oauth?: OAuthCfg;
  portalUrl: string; keysHelp: string; envFallback: string[]; // env var names checked if no DB row
}

const CID: AdminKeyField = { key: "clientId", label: "Client / App ID", secret: false };
const CSEC: AdminKeyField = { key: "clientSecret", label: "Client / App Secret", secret: true };

export const PLATFORM_CONFIG: Record<PlatformId, PlatformCfg> = {
  facebook: { id: "facebook", db: "facebook", label: "Facebook Pages", authType: "oauth2", capability: "server_publish", maxChars: 63206,
    adminKeys: [CID, CSEC], portalUrl: "https://developers.facebook.com/apps", keysHelp: "Meta app (Business) → Settings → Basic. Needs App Review + Business Verification for public use.",
    envFallback: ["META_APP_ID", "META_APP_SECRET"],
    oauth: { authorizeUrl: "https://www.facebook.com/v21.0/dialog/oauth", tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token", scopes: ["pages_manage_posts", "pages_show_list", "pages_read_engagement", "publish_video"], tokenAuth: "body" } },
  instagram: { id: "instagram", db: "instagram", label: "Instagram", authType: "oauth2", capability: "server_publish", maxChars: 2200,
    adminKeys: [CID, CSEC], portalUrl: "https://developers.facebook.com/apps", keysHelp: "Same Meta app → Instagram product (Instagram Login). Business/Creator accounts only.",
    envFallback: ["META_APP_ID", "META_APP_SECRET"],
    oauth: { authorizeUrl: "https://www.instagram.com/oauth/authorize", tokenUrl: "https://api.instagram.com/oauth/access_token", scopes: ["instagram_business_basic", "instagram_business_content_publish"], tokenAuth: "body" } },
  threads: { id: "threads", db: "threads", label: "Threads", authType: "oauth2", capability: "server_publish", maxChars: 500,
    adminKeys: [CID, CSEC], portalUrl: "https://developers.facebook.com/apps", keysHelp: "Meta app → Threads use case. Threads Testers must accept the invite in Threads settings.",
    envFallback: ["META_APP_ID", "META_APP_SECRET"],
    oauth: { authorizeUrl: "https://threads.net/oauth/authorize", tokenUrl: "https://graph.threads.net/oauth/access_token", scopes: ["threads_basic", "threads_content_publish"], tokenAuth: "body" } },
  whatsapp: { id: "whatsapp", db: "whatsapp", label: "WhatsApp", authType: "operator_only", capability: "messaging", maxChars: 4096,
    adminKeys: [CSEC, { key: "phoneNumberId", label: "Phone Number ID", secret: false }, { key: "wabaId", label: "WhatsApp Business Account ID", secret: false }],
    portalUrl: "https://developers.facebook.com/apps", keysHelp: "Meta app → WhatsApp → API Setup. CSEC field stores the permanent System User token. Templates must be approved in Meta before sending.",
    envFallback: ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_WABA_ID"] },
  tiktok: { id: "tiktok", db: "tiktok", label: "TikTok", authType: "oauth2", capability: "server_publish", maxChars: 2200,
    adminKeys: [CID, CSEC], portalUrl: "https://developers.tiktok.com/apps", keysHelp: "TikTok app → Login Kit + Content Posting API. Unaudited apps post SELF_ONLY (private) only.",
    envFallback: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
    oauth: { authorizeUrl: "https://www.tiktok.com/v2/auth/authorize/", tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/", scopes: ["user.info.basic", "video.publish", "video.upload"], tokenAuth: "body" } },
  youtube: { id: "youtube", db: "youtube", label: "YouTube", authType: "oauth2_pkce", capability: "server_publish", maxChars: 5000,
    adminKeys: [CID, CSEC], portalUrl: "https://console.cloud.google.com/apis/credentials", keysHelp: "Google Cloud → YouTube Data API v3 → OAuth Web client. Unverified projects upload private-only.",
    envFallback: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    oauth: { authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth", tokenUrl: "https://oauth2.googleapis.com/token", scopes: ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"], pkce: true, extraAuthorizeParams: { access_type: "offline", prompt: "consent" }, tokenAuth: "body" } },
  google_business: { id: "google_business", db: "google_business", label: "Google Business", authType: "oauth2_pkce", capability: "server_publish", maxChars: 1500,
    adminKeys: [CID, CSEC], portalUrl: "https://console.cloud.google.com/apis/credentials", keysHelp: "Same Google Cloud project as YouTube + GBP API access approval (quota 0 until approved).",
    envFallback: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    oauth: { authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth", tokenUrl: "https://oauth2.googleapis.com/token", scopes: ["https://www.googleapis.com/auth/business.manage"], pkce: true, extraAuthorizeParams: { access_type: "offline", prompt: "consent" }, tokenAuth: "body" } },
  x: { id: "x", db: "x", label: "X (Twitter)", authType: "oauth2_pkce", capability: "server_publish", maxChars: 280,
    adminKeys: [CID, CSEC], portalUrl: "https://developer.x.com/en/portal/dashboard", keysHelp: "X app → Keys and Tokens → OAuth 2.0 Client ID/Secret. Set app type to Web App and the callback URL below.",
    envFallback: ["X_CLIENT_ID", "X_CLIENT_SECRET"],
    oauth: { authorizeUrl: "https://twitter.com/i/oauth2/authorize", tokenUrl: "https://api.twitter.com/2/oauth2/token", scopes: ["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"], pkce: true, tokenAuth: "basic" } },
  linkedin: { id: "linkedin", db: "linkedin", label: "LinkedIn", authType: "oauth2", capability: "server_publish", maxChars: 3000,
    adminKeys: [CID, CSEC], portalUrl: "https://www.linkedin.com/developers/apps", keysHelp: "LinkedIn app → Auth tab. Personal posting (w_member_social) is self-serve; Page posting needs Community Management approval.",
    envFallback: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
    oauth: { authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization", tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken", scopes: ["openid", "profile", "w_member_social"], tokenAuth: "body" } },
  reddit: { id: "reddit", db: "reddit", label: "Reddit", authType: "oauth2", capability: "server_publish", maxChars: 40000,
    adminKeys: [CID, CSEC], portalUrl: "https://www.reddit.com/prefs/apps", keysHelp: "Create a 'web app' in prefs/apps, then request Responsible Builder approval for commercial use.",
    envFallback: ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET"],
    oauth: { authorizeUrl: "https://www.reddit.com/api/v1/authorize", tokenUrl: "https://www.reddit.com/api/v1/access_token", scopes: ["submit", "read", "identity"], extraAuthorizeParams: { duration: "permanent" }, tokenAuth: "basic" } },
  pinterest: { id: "pinterest", db: "pinterest", label: "Pinterest", authType: "oauth2", capability: "server_publish", maxChars: 500,
    adminKeys: [CID, CSEC], portalUrl: "https://developers.pinterest.com/apps/", keysHelp: "Pinterest Business account → My Apps. Trial pins are not public until Standard access is approved.",
    envFallback: ["PINTEREST_APP_ID", "PINTEREST_APP_SECRET"],
    oauth: { authorizeUrl: "https://www.pinterest.com/oauth/", tokenUrl: "https://api.pinterest.com/v5/oauth/token", scopes: ["pins:read", "pins:write", "boards:read", "boards:write", "user_accounts:read"], tokenAuth: "basic" } },
  wordpress: { id: "wordpress", db: "wordpress", label: "WordPress.com", authType: "oauth2", capability: "server_publish", maxChars: 100000,
    adminKeys: [CID, CSEC], portalUrl: "https://developer.wordpress.com/apps/", keysHelp: "WordPress.com app → OAuth Information gives Client ID/Secret.",
    envFallback: ["WORDPRESS_CLIENT_ID", "WORDPRESS_CLIENT_SECRET"],
    oauth: { authorizeUrl: "https://public-api.wordpress.com/oauth2/authorize", tokenUrl: "https://public-api.wordpress.com/oauth2/token", scopes: ["auth"], tokenAuth: "body" } },
  wordpress_self: { id: "wordpress_self", db: "wordpress", label: "WordPress (self-hosted)", authType: "site_password", capability: "server_publish", maxChars: 100000,
    adminKeys: [], portalUrl: "https://developer.wordpress.org/advanced-administration/security/application-passwords/", keysHelp: "No operator keys. Each user connects their own site with an Application Password (wp-admin → Users → Profile).",
    envFallback: [] },
  bluesky: { id: "bluesky", db: "bluesky", label: "Bluesky", authType: "app_password", capability: "server_publish", maxChars: 300,
    adminKeys: [], portalUrl: "https://bsky.app/settings/app-passwords", keysHelp: "No operator keys. Each user creates an App Password in Bluesky settings and connects with handle + app password.",
    envFallback: [] },
  telegram: { id: "telegram", db: "telegram", label: "Telegram", authType: "bot_channel", capability: "messaging", maxChars: 4096,
    adminKeys: [{ key: "botToken", label: "Bot Token (from @BotFather)", secret: true }], portalUrl: "https://core.telegram.org/bots/api", keysHelp: "Chat @BotFather → /newbot → copy the token. Users add the bot as channel admin, then connect with the channel @username or chat ID.",
    envFallback: ["TELEGRAM_BOT_TOKEN"] },
  discord: { id: "discord", db: "discord", label: "Discord", authType: "bot_channel", capability: "messaging", maxChars: 2000,
    adminKeys: [{ key: "botToken", label: "Bot Token", secret: true }, CID], portalUrl: "https://discord.com/developers/applications", keysHelp: "Discord app → Bot → Reset Token. Users install the bot in their server (invite link on the connect page), then connect with the channel ID.",
    envFallback: ["DISCORD_BOT_TOKEN", "DISCORD_CLIENT_ID"] },
  slack: { id: "slack", db: "slack", label: "Slack", authType: "oauth2", capability: "messaging", maxChars: 40000,
    adminKeys: [CID, CSEC], portalUrl: "https://api.slack.com/apps", keysHelp: "Slack app → OAuth & Permissions → bot scopes chat:write, chat:write.public, channels:read, files:write. Enable Public Distribution for multi-workspace.",
    envFallback: ["SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET"],
    oauth: { authorizeUrl: "https://slack.com/oauth/v2/authorize", tokenUrl: "https://slack.com/api/oauth.v2.access", scopes: ["chat:write", "chat:write.public", "channels:read", "files:write"], tokenAuth: "body" } },
  shopify: { id: "shopify", db: "shopify", label: "Shopify", authType: "per_shop_oauth", capability: "store_content", maxChars: 100000,
    adminKeys: [CID, CSEC], portalUrl: "https://dev.shopify.com/dashboard", keysHelp: "Shopify app → client credentials. Users connect by entering their shop domain and approving install. Publishing = blog articles / pages / product publications.",
    envFallback: ["SHOPIFY_API_KEY", "SHOPIFY_API_SECRET"],
    oauth: { authorizeUrl: "", tokenUrl: "", scopes: ["write_products", "read_products", "write_content", "write_online_store_pages", "write_publications"], tokenAuth: "body" } },
  snapchat: { id: "snapchat", db: "snapchat", label: "Snapchat", authType: "handoff", capability: "user_handoff", maxChars: 250,
    adminKeys: [], portalUrl: "https://developers.snap.com/", keysHelp: "Snapchat has NO server publish API. Connect = save the user's Snapchat username; publishing creates a handoff task the user completes in Snapchat (Creative Kit share).",
    envFallback: [] },
  messages: { id: "messages", db: "messages", label: "Messages", authType: "handoff", capability: "user_handoff", maxChars: 10000,
    adminKeys: [], portalUrl: "", keysHelp: "No public publishing API exists for iMessage. Connect = save a contact handle; publishing creates a handoff task.",
    envFallback: [] },
};

export const PLATFORM_LIST = Object.values(PLATFORM_CONFIG);
export const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const callbackUrl = (id: PlatformId) => `${appUrl()}/api/seller/social/connect/callback/${id}`;
