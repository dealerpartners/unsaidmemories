// Envelope encryption for secrets at rest — AES-256-GCM.
// Used for: OAuth tokens (oauth_tokens via bytea adapter in lib/supabase/queries),
// operator platform keys (platform_apps ciphertext columns as JSON envelope text).
// Server-only: reads TOKEN_ENCRYPTION_KEY from env. Never import from client code.
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

export interface Envelope { keyId: string; iv: string; tag: string; data: string }

function decodeKey(raw: string): Buffer {
  const buf = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("Encryption keys must decode to exactly 32 bytes.");
  return buf;
}
export const keyId = () => process.env.TOKEN_ENCRYPTION_KEY_ID ?? "prod-1";
/** All keys the vault can decrypt with, by key id. Rotation (security
 * review fix): the donor's decrypt ignored the envelope keyId, so rotating
 * the single env key orphaned every stored token. Now TOKEN_ENCRYPTION_KEYS
 * may hold a JSON map {"prod-1": "<key>", "prod-2": "<key>"}; encryption
 * always uses the ACTIVE id (TOKEN_ENCRYPTION_KEY_ID), decryption selects
 * by the envelope's stamped keyId and falls back to the legacy single key. */
function keyRing(): Map<string, Buffer> {
  const ring = new Map<string, Buffer>();
  if (process.env.TOKEN_ENCRYPTION_KEYS) {
    try {
      const parsed = JSON.parse(process.env.TOKEN_ENCRYPTION_KEYS) as Record<string, string>;
      for (const [id, raw] of Object.entries(parsed)) ring.set(id, decodeKey(raw));
    } catch { throw new Error("TOKEN_ENCRYPTION_KEYS is not a valid JSON key map."); }
  }
  if (process.env.TOKEN_ENCRYPTION_KEY) ring.set(keyId(), decodeKey(process.env.TOKEN_ENCRYPTION_KEY));
  if (!ring.size) throw new Error("No token encryption keys configured (TOKEN_ENCRYPTION_KEY or TOKEN_ENCRYPTION_KEYS).");
  return ring;
}
function masterKey(forKeyId?: string): Buffer {
  const ring = keyRing();
  if (forKeyId && ring.has(forKeyId)) return ring.get(forKeyId)!;
  const active = ring.get(keyId());
  if (active) return active;
  if (forKeyId) throw new Error(`No decryption key for keyId "${forKeyId}" — it may have been retired too early.`);
  return [...ring.values()][0];
}

export function encryptSecret(plaintext: string): Envelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { keyId: keyId(), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") };
}
export function decryptSecret(env: Envelope): string {
  const decipher = createDecipheriv("aes-256-gcm", masterKey(env.keyId), Buffer.from(env.iv, "base64"));
  decipher.setAuthTag(Buffer.from(env.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(env.data, "base64")), decipher.final()]).toString("utf8");
}
export const encryptToText = (s: string) => JSON.stringify(encryptSecret(s));
export function decryptFromText(t: string): string {
  // Accepts envelope JSON; throws on tamper (GCM auth) — by design.
  return decryptSecret(JSON.parse(t) as Envelope);
}
// Bytea form for oauth_tokens columns (stores the envelope JSON bytes).
export const encryptToBytes = (s: string) => Buffer.from(encryptToText(s), "utf8");
export const decryptFromBytes = (b: Buffer | Uint8Array) => decryptFromText(Buffer.from(b).toString("utf8"));
export const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");
export const randomToken = (bytes = 24) => randomBytes(bytes).toString("base64url");
