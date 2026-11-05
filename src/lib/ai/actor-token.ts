// ===========================================================================
// lib/ai/actor-token.ts — M6: the scoped actor token.
//
// A token is minted for ONE actor + ONE grant + ONE purpose + ONE
// capability set, with a 15-minute expiry. It REPLACES cookie replay as
// the AI execution path (DOCX §5.1: "the tool executor receives the
// caller's session and replays it" is exactly the defect — for admin it
// made an admin cookie the AI's authority). The token carries no
// authority of its own: verification checks signature, expiry, and that
// every presented scope (actor, grant, purpose, capability, object)
// matches the minted scope. Replay outside that scope is refused.
//
// Format mirrors the portal session token (portal-auth.ts): base64url
// payload + HMAC-SHA256, keyed by the same server secret
// (SUPABASE_SERVICE_ROLE_KEY, never leaving the server). Stateless: no
// token table exists to become a second permission store (§7.0), and
// the 15-minute expiry bounds any replay window. Revocation rides the
// grant: a revoked grant fails the router's grant check before any
// token is minted, and a presented token naming a revoked grant is
// refused by the router's grant re-check on the HTTP verify path.
// ===========================================================================

import { createHmac, randomUUID, timingSafeEqual } from "crypto";

export const ACTOR_TOKEN_TTL_SECONDS = 15 * 60;
export const ACTOR_TOKEN_AGENT = "kinnect";

export interface ActorTokenPayload {
  v: 1;
  /** Token id, carried into the §2.6 event row for audit linkage. */
  jti: string;
  /** auth.users.id, or null for a guest actor. */
  sub: string | null;
  /** The ONE active identity_grants.id, or null for guests. */
  grant: string | null;
  /** Audience lens the token renders through (scope word / 'guest'). */
  lens: string;
  purpose: string;
  capabilities: string[];
  objectType: string;
  objectId: string | null;
  agent: string;
  exp: number;
}

function secret(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!key) throw new Error("ACTOR_TOKEN_SECRET_NOT_CONFIGURED: SUPABASE_SERVICE_ROLE_KEY is not set");
  return key;
}

function b64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function unb64url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

export function mintActorToken(input: {
  authUserId: string | null;
  grantId: string | null;
  lens: string;
  purpose: string;
  capabilities: string[];
  objectType: string;
  objectId: string | null;
}): { token: string; payload: ActorTokenPayload } {
  const payload: ActorTokenPayload = {
    v: 1,
    jti: randomUUID(),
    sub: input.authUserId,
    grant: input.grantId,
    lens: input.lens,
    purpose: input.purpose,
    capabilities: [...input.capabilities],
    objectType: input.objectType,
    objectId: input.objectId,
    agent: ACTOR_TOKEN_AGENT,
    exp: Math.floor(Date.now() / 1000) + ACTOR_TOKEN_TTL_SECONDS,
  };
  const body = b64url(JSON.stringify(payload));
  const mac = createHmac("sha256", secret()).update(body).digest("base64url");
  return { token: `${body}.${mac}`, payload };
}

export type TokenDenialCode =
  | "token_invalid"
  | "token_expired"
  | "token_actor_mismatch"
  | "token_grant_mismatch"
  | "token_purpose_mismatch"
  | "token_capability_mismatch"
  | "token_object_mismatch";

export function decodeActorToken(token: string): ActorTokenPayload | null {
  try {
    const [body, mac] = String(token || "").split(".");
    if (!body || !mac) return null;
    const expected = createHmac("sha256", secret()).update(body).digest("base64url");
    const a = Buffer.from(mac);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(unb64url(body)) as ActorTokenPayload;
    if (payload?.v !== 1 || payload?.agent !== ACTOR_TOKEN_AGENT) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Verify a presented token against the scope it is presented for.
 *  Every expectation field given must match the minted scope; an
 *  omitted expectation is not checked (the caller asserts what it
 *  knows). Expiry is always checked. */
export function verifyActorToken(
  token: string,
  expectation: {
    authUserId?: string | null;
    grantId?: string | null;
    purpose?: string;
    capability?: string;
    objectType?: string;
    objectId?: string | null;
  } = {},
): { ok: true; payload: ActorTokenPayload } | { ok: false; code: TokenDenialCode; reason: string } {
  const payload = decodeActorToken(token);
  if (!payload) return { ok: false, code: "token_invalid", reason: "The actor token is not a token this router minted." };
  if (payload.exp * 1000 <= Date.now()) {
    return { ok: false, code: "token_expired", reason: "The actor token expired — intents are minted fresh per execution." };
  }
  if (expectation.authUserId !== undefined && payload.sub !== expectation.authUserId) {
    return { ok: false, code: "token_actor_mismatch", reason: "The actor token belongs to a different actor." };
  }
  if (expectation.grantId !== undefined && payload.grant !== expectation.grantId) {
    return { ok: false, code: "token_grant_mismatch", reason: "The actor token was minted under a different grant." };
  }
  if (expectation.purpose !== undefined && payload.purpose !== expectation.purpose) {
    return { ok: false, code: "token_purpose_mismatch", reason: "The actor token was minted for a different purpose." };
  }
  if (expectation.capability !== undefined && !payload.capabilities.includes(expectation.capability)) {
    return { ok: false, code: "token_capability_mismatch", reason: "The actor token does not carry that capability." };
  }
  if (expectation.objectType !== undefined && payload.objectType !== expectation.objectType) {
    return { ok: false, code: "token_object_mismatch", reason: "The actor token was minted for a different object type." };
  }
  if (expectation.objectId !== undefined && payload.objectId !== expectation.objectId) {
    return { ok: false, code: "token_object_mismatch", reason: "The actor token was minted for a different object." };
  }
  return { ok: true, payload };
}
