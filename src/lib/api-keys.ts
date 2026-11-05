import { createHash, randomBytes } from "node:crypto";

/**
 * Musicosy API key generation + hashing utilities.
 *
 * Format of the raw secret shown to the user:
 *   sk_live_<43 chars of url-safe base64>
 *
 * The full secret is 51 chars including the `sk_live_` prefix. The prefix is
 * fixed; only the 43-char tail is the secret.
 *
 * Storage:
 *   - `hashedKey` (sha-256 hex of the FULL secret including prefix) — used for
 *     lookup at request time. Indexed + unique.
 *   - `prefix` (first 8 chars of the secret tail) — shown in the UI so the
 *     user can identify which key it is.
 *   - `lastFour` (last 4 chars of the secret tail) — shown alongside prefix
 *     so the user can confirm "this is the one".
 *
 * We never store the raw secret. If lost, the user must roll the key.
 */

const PREFIX = "sk_live_";
const SECRET_BYTES = 32; // 32 bytes → 43 chars url-safe base64

export function generateApiKey() {
  const random = randomBytes(SECRET_BYTES);
  const tail = random.toString("base64url"); // 43 chars
  const rawSecret = `${PREFIX}${tail}`;
  return {
    rawSecret,
    hashedKey: hashApiKey(rawSecret),
    prefix: tail.slice(0, 8),
    lastFour: tail.slice(-4),
  };
}

export function hashApiKey(rawSecret: string): string {
  return createHash("sha256").update(rawSecret).digest("hex");
}

/**
 * Looks up an API key by hashing the incoming secret and matching against
 * `api_keys.key_hash`. Returns the key row (without the hash) or null.
 *
 * Schema (after the full-schema-migration, 2026-08-16):
 *   api_keys (
 *     id, organization_id, user_id, name, label,
 *     key_hash, prefix, last_four, scopes TEXT[],
 *     last_used, last_used_ip, expires_at,
 *     revoked BOOLEAN, revoked_at,
 *     created_at, updated_at
 *   )
 *
 * Uses the direct pg pool instead of Prisma to avoid the "prepared statement
 * already exists" error that occurs with Supabase's transaction-mode pooler.
 */
export async function findApiKeyByRawSecret(rawSecret: string) {
  const { pgPool } = await import("@/lib/pg");
  const hashedKey = hashApiKey(rawSecret);
  const result = await pgPool.query<{
    id: string;
    user_id: string | null;
    organization_id: string | null;
    label: string | null;
    name: string;
    scopes: string[] | null;
    revoked: boolean;
    expires_at: Date | null;
  }>(
    `SELECT id, user_id, organization_id, label, name, scopes, revoked, expires_at
     FROM api_keys
     WHERE key_hash = $1
     LIMIT 1`,
    [hashedKey],
  );
  const row = result.rows[0];
  if (!row) return null;
  if (row.revoked) return null;
  if (row.expires_at && row.expires_at.getTime() < Date.now()) return null;
  return {
    id: row.id,
    userId: row.user_id ?? row.organization_id ?? row.name,
    label: row.label ?? row.name,
    scopes: Array.isArray(row.scopes) ? row.scopes.join(",") : (row.scopes ?? ""),
    revokedAt: row.revoked ? new Date() : null,
    expiresAt: row.expires_at,
  };
}
