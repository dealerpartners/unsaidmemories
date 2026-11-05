import { createHmac, timingSafeEqual } from "crypto";
import { SITE_URL } from "@/lib/site-url";

// One-click unsubscribe for marketing email. Every marketing message
// carries a link built by unsubscribeUrl(); the token is an HMAC of
// the customer's auth id under a server-only key, so the link works
// without signing in and cannot be forged for another customer.

function hmacKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  return key;
}

export function unsubscribeToken(userId: string): string {
  return createHmac("sha256", hmacKey()).update(`unsub:${userId}`).digest("hex");
}

export function verifyUnsubscribeToken(userId: string, token: string): boolean {
  try {
    const expected = Buffer.from(unsubscribeToken(userId), "hex");
    const given = Buffer.from(token, "hex");
    return expected.length === given.length && timingSafeEqual(expected, given);
  } catch {
    return false;
  }
}

export function unsubscribeUrl(userId: string): string {
  return `${SITE_URL}/api/unsubscribe?u=${encodeURIComponent(userId)}&t=${unsubscribeToken(userId)}`;
}
