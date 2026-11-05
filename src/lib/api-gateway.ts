import { NextResponse, type NextRequest } from "next/server";
import { findApiKeyByRawSecret } from "@/lib/api-keys";

/**
 * Musicosy Consumer API Gateway — auth + audit layer.
 *
 * Every request to /api/v1/* flows through this helper before reaching a
 * route handler. Responsibilities:
 *
 *   1. Extract the bearer token from `Authorization: Bearer <sk_live_...>`.
 *   2. Look up the API key by hashing the secret (sha-256) and matching
 *      against `api_keys.hashedKey`. Rejects revoked + expired keys.
 *   3. Attach the validated key to the request so handlers can read the
 *      caller's identity (userId, keyId, scopes, label).
 *   4. Record an audit row in `api_key_events` (best-effort, non-blocking).
 *
 * The handler does NOT do rate limiting yet — that's a separate concern
 * (Redis token bucket) that we'll wire up in Priority #3.
 */

export type AuthenticatedKey = {
  id: string;
  userId: string;
  label: string;
  scopes: string;
};

export type GatewayRequest = NextRequest & {
  // Custom property attached by `authenticateRequest`. Handlers read it
  // via `getApiKey(request)`.
  musicosyApiKey?: AuthenticatedKey;
};

declare global {
  // eslint-disable-next-line no-var
  var __musicosyGatewayAuditing: boolean | undefined;
}

/**
 * Extracts the bearer token from the Authorization header.
 * Accepts both `Bearer sk_live_...` and the bare `sk_live_...` form (for
 * convenience in dev; documented as `Authorization: Bearer ...` in the docs).
 */
export function extractBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (match) return match[1].trim();
  // Bare token fallback (dev only — never documented for prod)
  if (/^sk_(live|test)_/.test(auth.trim())) return auth.trim();
  return null;
}

/**
 * Authenticates an incoming consumer API request.
 *
 * Returns:
 *   - { ok: true, key }              on success
 *   - { ok: false, response }        on failure (caller returns `response`)
 *
 * Failure modes:
 *   - 401 missing/invalid Authorization header
 *   - 401 key not found (typo, revoked, or expired)
 *
 * We deliberately return the same 401 body for "missing header" and
 * "invalid key" to avoid leaking which keys exist.
 */
export async function authenticateRequest(
  req: NextRequest,
): Promise<
  | { ok: true; key: AuthenticatedKey }
  | { ok: false; response: NextResponse }
> {
  const token = extractBearerToken(req);
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            code: "missing_authorization",
            message:
              "Provide an API key via the Authorization header: `Authorization: Bearer sk_live_...`",
          },
        },
        { status: 401 },
      ),
    };
  }

  // Format check — fail fast without a DB hit for obviously-wrong tokens.
  if (!/^sk_(live|test)_/.test(token)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            code: "invalid_authorization",
            message:
              "API key must start with `sk_live_` (production) or `sk_test_` (sandbox).",
          },
        },
        { status: 401 },
      ),
    };
  }

  const row = await findApiKeyByRawSecret(token);
  if (!row) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            code: "invalid_api_key",
            message:
              "The API key was not recognized, has been revoked, or has expired.",
          },
        },
        { status: 401 },
      ),
    };
  }

  return {
    ok: true,
    key: {
      id: row.id,
      userId: row.userId,
      label: row.label,
      scopes: row.scopes,
    },
  };
}

/**
 * Handler-side accessor. Reads the validated key from the augmented request.
 */
export function getApiKey(req: GatewayRequest): AuthenticatedKey | undefined {
  return req.musicosyApiKey;
}

/**
 * Records a request audit row to `api_key_events`. Best-effort: failures
 * are swallowed (logged to stderr in dev) so an audit-log outage can never
 * block a consumer request.
 *
 * We don't await this from the gateway path — it fires in the background.
 */
export function recordApiEvent(params: {
  apiKeyId: string;
  userId: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  bytesIn?: number;
  bytesOut?: number;
  errorCode?: string | null;
  requestId?: string | null;
}): void {
  // Fire-and-forget. Don't let audit failures break user requests.
  void (async () => {
    try {
      const { pgPool } = await import("@/lib/pg");
      await pgPool.query(
        `INSERT INTO api_key_events
           (api_key_id, user_id, method, path, status, duration_ms,
            bytes_in, bytes_out, error_code, request_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          params.apiKeyId,
          params.userId,
          params.method,
          params.path,
          params.status,
          params.durationMs,
          params.bytesIn ?? 0,
          params.bytesOut ?? 0,
          params.errorCode ?? null,
          params.requestId ?? null,
        ],
      );
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.error("[gateway] audit log failed:", err);
      }
    }
  })();
}

/**
 * Touches `api_keys.lastUsedAt` and `lastUsedIp` on each request.
 *
 * Best-effort: failures are swallowed. We don't want to block a user's
 * request because the usage touch failed.
 */
export function touchKeyUsage(params: {
  apiKeyId: string;
  ip: string | null;
}): void {
  void (async () => {
    try {
      const { pgPool } = await import("@/lib/pg");
      await pgPool.query(
        `UPDATE api_keys
         SET last_used = now(),
             last_used_ip = $2
         WHERE id = $1`,
        [params.apiKeyId, params.ip],
      );
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.error("[gateway] lastUsed touch failed:", err);
      }
    }
  })();
}

/**
 * Generates a correlation id for every gateway request. Echoed in the
 * `X-Request-Id` response header so users can reference it in support
 * tickets. If the client supplies one, we use that (so they can correlate
 * their own logs with ours).
 */
export function getRequestId(req: NextRequest): string {
  const inbound = req.headers.get("x-request-id");
  if (inbound && /^[a-zA-Z0-9_-]{8,64}$/.test(inbound)) return inbound;
  // Generate a short, URL-safe id. crypto.randomUUID is available in Node 19+
  // and in the Edge runtime.
  const uuid = crypto.randomUUID();
  return uuid.replace(/-/g, "").slice(0, 16);
}

/**
 * Standard JSON error response shape for the consumer API.
 *
 *   { "error": { "code": "...", "message": "...", "details": {...} } }
 *
 * The `code` is a stable identifier from the MusicOSY error catalogue.
 * The `message` is human-readable. `details` is optional and contextual.
 */
export function gatewayError(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status },
  );
}
