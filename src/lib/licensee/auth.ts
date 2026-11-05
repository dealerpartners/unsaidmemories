import "server-only";
import { createHash, randomBytes } from "crypto";
import { pgQuery, pgQueryStrict } from "@/lib/pg";

// ============================================================================
// Licensee API auth (Kinnect licensee ad engine, W5 2026-10-30).
//
// Advertisers self-serve: POST /api/v1/licensee/accounts creates the
// account and returns ONE raw key, shown once. Only its SHA-256 hash is
// stored (licensee_api_keys.key_hash). Every other licensee route takes
// the key as `Authorization: Bearer lk_...` or `x-licensee-api-key`.
// This is a licensee API, not an affiliate system: no affiliate tables,
// routes, or payout logic exist anywhere in this engine.
// ============================================================================

export interface LicenseeAuth {
  advertiserId: string; // licensee_advertisers.id (uuid)
  adAdvertiserId: string; // ad_advertisers.id (bigint, as text)
  displayName: string;
  contactEmail: string;
  keyId: string;
  scopes: string[];
}

export function hashLicenseeKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function newLicenseeKey(): { raw: string; prefix: string; hash: string } {
  const raw = `lk_${randomBytes(24).toString("base64url")}`;
  return { raw, prefix: raw.slice(0, 12), hash: hashLicenseeKey(raw) };
}

export function readLicenseeKey(req: Request): string {
  const auth = req.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return (req.headers.get("x-licensee-api-key") ?? "").trim();
}

export async function authenticateLicensee(
  req: Request,
): Promise<LicenseeAuth | null> {
  const raw = readLicenseeKey(req);
  if (!raw || !raw.startsWith("lk_")) return null;
  try {
    const rows = await pgQueryStrict<{
      advertiser_id: string;
      ad_advertiser_id: string;
      display_name: string;
      contact_email: string;
      key_id: string;
      scopes: string[];
    }>(
      `SELECT k.advertiser_id::text AS advertiser_id,
              a.ad_advertiser_id::text AS ad_advertiser_id,
              a.display_name, a.contact_email,
              k.id::text AS key_id, k.scopes
         FROM public.licensee_api_keys k
         JOIN public.licensee_advertisers a ON a.id = k.advertiser_id
        WHERE k.key_hash = $1 AND k.revoked_at IS NULL
          AND a.status = 'active'
        LIMIT 1`,
      [hashLicenseeKey(raw)],
    );
    const row = rows[0];
    if (!row) return null;
    // Best-effort last-used stamp; a failure here must never fail auth.
    void pgQuery(
      `UPDATE public.licensee_api_keys SET last_used_at = now() WHERE id = $1`,
      [row.key_id],
    );
    return {
      advertiserId: row.advertiser_id,
      adAdvertiserId: row.ad_advertiser_id,
      displayName: row.display_name,
      contactEmail: row.contact_email,
      keyId: row.key_id,
      scopes: row.scopes ?? [],
    };
  } catch {
    return null;
  }
}

export function hasScope(auth: LicenseeAuth, scope: string): boolean {
  return auth.scopes.includes(scope);
}
