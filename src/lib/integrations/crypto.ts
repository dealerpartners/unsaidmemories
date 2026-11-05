import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/**
 * AES-256-GCM encryption for values stored at rest (OAuth tokens in
 * social_accounts, OAuth app secrets in integration_secrets).
 * Key material comes from INTEGRATIONS_ENCRYPTION_KEY when set, and is
 * otherwise derived from the service-role key — either way it exists
 * only on the server and is never sent to a client.
 */
function key(): Buffer {
  const material =
    process.env.INTEGRATIONS_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!material) throw new Error("No encryption key material configured.");
  return createHash("sha256").update(material).digest();
}

export function encryptValue(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptValue(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export function lastFour(value: string): string {
  return value.length <= 4 ? value : value.slice(-4);
}
