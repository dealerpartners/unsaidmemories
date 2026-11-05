// Operator key resolution: DB (platform_apps, set in /app/admin/keys) first,
// env fallback second. Secrets are decrypted in memory only, on the server.
import { createServiceClient } from "../host";
import { decryptFromText } from "../crypto/vault";
import { PLATFORM_CONFIG, type PlatformId } from "./config";

// env var -> key field, per platform (clientId first, clientSecret second, extras after)
const ENV_MAP: Partial<Record<PlatformId, Record<string, string>>> = {
  facebook: { clientId: "META_APP_ID", clientSecret: "META_APP_SECRET" },
  instagram: { clientId: "META_APP_ID", clientSecret: "META_APP_SECRET" },
  threads: { clientId: "META_APP_ID", clientSecret: "META_APP_SECRET" },
  whatsapp: { accessToken: "WHATSAPP_ACCESS_TOKEN", phoneNumberId: "WHATSAPP_PHONE_NUMBER_ID", wabaId: "WHATSAPP_WABA_ID" },
  tiktok: { clientId: "TIKTOK_CLIENT_KEY", clientSecret: "TIKTOK_CLIENT_SECRET" },
  youtube: { clientId: "GOOGLE_CLIENT_ID", clientSecret: "GOOGLE_CLIENT_SECRET" },
  google_business: { clientId: "GOOGLE_CLIENT_ID", clientSecret: "GOOGLE_CLIENT_SECRET" },
  x: { clientId: "X_CLIENT_ID", clientSecret: "X_CLIENT_SECRET" },
  linkedin: { clientId: "LINKEDIN_CLIENT_ID", clientSecret: "LINKEDIN_CLIENT_SECRET" },
  reddit: { clientId: "REDDIT_CLIENT_ID", clientSecret: "REDDIT_CLIENT_SECRET" },
  pinterest: { clientId: "PINTEREST_APP_ID", clientSecret: "PINTEREST_APP_SECRET" },
  wordpress: { clientId: "WORDPRESS_CLIENT_ID", clientSecret: "WORDPRESS_CLIENT_SECRET" },
  telegram: { botToken: "TELEGRAM_BOT_TOKEN" },
  discord: { botToken: "DISCORD_BOT_TOKEN", clientId: "DISCORD_CLIENT_ID" },
  slack: { clientId: "SLACK_CLIENT_ID", clientSecret: "SLACK_CLIENT_SECRET" },
  shopify: { clientId: "SHOPIFY_API_KEY", clientSecret: "SHOPIFY_API_SECRET" },
};

export async function getOperatorKeys(platform: PlatformId): Promise<Record<string, string>> {
  const cfg = PLATFORM_CONFIG[platform];
  const out: Record<string, string> = {};
  // 1) DB row (admin-set keys win)
  try {
    const admin = createServiceClient();
    const { data } = await admin.from("social_platform_apps").select("client_id, client_secret_ciphertext, extra_ciphertext").eq("platform", cfg.db).maybeSingle();
    if (data) {
      if (data.client_id) out.clientId = data.client_id;
      if (data.client_secret_ciphertext) {
        const secret = decryptFromText(data.client_secret_ciphertext);
        // Field name for the primary secret depends on the platform's first secret key field
        const secretField = cfg.adminKeys.find((k) => k.secret)?.key ?? "clientSecret";
        out[secretField] = secret;
        if (platform === "whatsapp") out.accessToken = secret;
      }
      if (data.extra_ciphertext) {
        const extra = JSON.parse(decryptFromText(data.extra_ciphertext)) as Record<string, string>;
        Object.assign(out, extra);
      }
    }
  } catch { /* DB not configured yet — env fallback below still applies */ }
  // 2) env fallback for anything missing
  for (const [field, envName] of Object.entries(ENV_MAP[platform] ?? {})) {
    if (!out[field] && process.env[envName]) out[field] = process.env[envName]!;
  }
  return out;
}

/** Which admin key fields are still missing for this platform (names only, never values). */
export function missingKeyFields(platform: PlatformId, keys: Record<string, string>): string[] {
  const cfg = PLATFORM_CONFIG[platform];
  return cfg.adminKeys.filter((f) => !keys[f.key]).map((f) => f.label);
}
export const platformConfigured = (platform: PlatformId, keys: Record<string, string>) =>
  PLATFORM_CONFIG[platform].adminKeys.length === 0 || missingKeyFields(platform, keys).length === 0;
