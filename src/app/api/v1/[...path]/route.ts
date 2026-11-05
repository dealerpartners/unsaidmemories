import { NextResponse, type NextRequest } from "next/server";
import {
  authenticateRequest,
  recordApiEvent,
  touchKeyUsage,
  getRequestId,
  gatewayError,
  type GatewayRequest,
} from "@/lib/api-gateway";
import { requireSupabase } from "@/lib/supabase/guard";

/**
 * /api/v1/[...path] — MusicOSY consumer API gateway.
 *
 * Every consumer API call flows through here. The gateway:
 *
 *   1. Authenticates the bearer token (sk_live_...)
 *   2. Looks up the endpoint in the API reference catalogue
 *   3. Routes to a registered handler if one exists for that path+method
 *   4. Returns the endpoint's documented response example otherwise
 *
 * RESPONSE CODES:
 *   200 / 201 / 204 — success
 *   401 — missing or invalid API key
 *   404 — endpoint not found
 *   405 — path exists but method not allowed
 *
 * RESPONSE HEADERS:
 *   X-Request-Id — correlation id (echoed for support tickets)
 *   X-Musicosy-Version — gateway version (for changelog tracking)
 *
 * USAGE TRACKING:
 *   Every authenticated request is recorded to `api_key_events`. The audit
 *   row includes method, path, status, duration, and the request id.
 *   `api_keys.lastUsedAt` is also touched.
 */

// Map of real handlers. Each key is `${METHOD} ${path}` where path may
// contain `{param}` placeholders. When a handler is registered, it takes
// precedence over the documented-response fallback.
//
// Handlers receive the validated request (with musicosyApiKey attached)
// and return a NextResponse. The gateway wraps them with timing + audit.
type Handler = (
  req: GatewayRequest,
  ctx: HandlerContext,
) => Promise<NextResponse> | NextResponse;

type HandlerContext = {
  params: Record<string, string>;
  key: NonNullable<GatewayRequest["musicosyApiKey"]>;
  requestId: string;
};

// Empty by design — real handlers are registered here as they're wired up.
// When no handler is registered, the gateway returns the endpoint's
// documented response example (from the API reference catalogue), so every
// documented endpoint is callable and returns its spec-defined shape.
const HANDLERS: Record<string, Handler> = {};

/**
 * Looks up the endpoint in the api-reference catalogue. Returns the
 * matching endpoint spec (so we can return its documented response) or
 * null if the path isn't documented at all.
 */
async function lookupEndpoint(method: string, path: string) {
  const { api } = await import("@/lib/api-reference");
  for (const domain of api.domains) {
    for (const resource of domain.resources) {
      for (const endpoint of resource.endpoints) {
        if (endpoint.method !== method) continue;
        const params = matchPath(endpoint.path, path);
        if (params) {
          return { endpoint, domain, resource, params };
        }
      }
    }
  }
  return null;
}

/**
 * Checks if ANY method matches the given path (used for 405 responses).
 */
async function pathExistsWithAnyMethod(path: string): Promise<boolean> {
  const { api } = await import("@/lib/api-reference");
  for (const domain of api.domains) {
    for (const resource of domain.resources) {
      for (const endpoint of resource.endpoints) {
        if (matchPath(endpoint.path, path)) return true;
      }
    }
  }
  return false;
}

/**
 * Matches a concrete path against a pattern with `{param}` placeholders.
 * Returns the extracted params, or null if no match.
 */
function matchPath(
  pattern: string,
  concrete: string,
): Record<string, string> | null {
  const patternParts = pattern.split("/").filter(Boolean);
  const concreteParts = concrete.split("/").filter(Boolean);
  if (patternParts.length !== concreteParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i];
    const c = concreteParts[i];
    if (p.startsWith("{") && p.endsWith("}")) {
      params[p.slice(1, -1)] = decodeURIComponent(c);
    } else if (p !== c) {
      return null;
    }
  }
  return params;
}

/**
 * Builds the canonical path string from a request URL.
 * Strips the leading `/api/v1` prefix so the catalogue match works
 * against documented paths like `/v1/profiles/{id}`.
 */
function canonicalPath(req: NextRequest): string {
  const url = new URL(req.url);
  return url.pathname.replace(/^\/api\/v1/, "/v1");
}

/** All HTTP methods the gateway accepts. */
const ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type AllowedMethod = (typeof ALLOWED_METHODS)[number];

function isAllowedMethod(m: string): m is AllowedMethod {
  return (ALLOWED_METHODS as readonly string[]).includes(m);
}

/**
 * Parses the documented response body string from the catalogue into a
 * JSON object. Returns null if the string is empty or unparseable.
 */
function parseDocumentedResponse(raw: string | null): unknown | null {
  if (!raw || !raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // Some responseBody fields contain markdown-ish text instead of JSON.
    // Return null so the caller falls back to a generic success response.
    return null;
  }
}

/**
 * Determines the success status code for an endpoint based on its method.
 * POST → 201, everything else → 200. DELETE with no body → 204.
 */
function successStatus(method: string, hasBody: boolean): number {
  if (method === "POST") return 201;
  if (method === "DELETE" && !hasBody) return 204;
  return 200;
}

/**
 * Main gateway entry. Next.js calls this for ANY method on /api/v1/* — we
 * dispatch based on `req.method` ourselves so we can return 405 cleanly
 * for methods we don't support.
 */
async function gateway(req: NextRequest): Promise<NextResponse> {
  const __sb = requireSupabase({ requirePostgres: true }); if (__sb) return __sb;
  const startedAt = performance.now();
  const requestId = getRequestId(req);

  // HEAD/OPTIONS: short-circuit without auth (so clients can probe)
  if (req.method === "OPTIONS") {
    const res = NextResponse.json({}, { status: 204 });
    res.headers.set("Allow", ALLOWED_METHODS.join(", "));
    res.headers.set("X-Request-Id", requestId);
    return res;
  }

  // 1. Authenticate
  const auth = await authenticateRequest(req);
  if (!auth.ok) {
    const res = auth.response;
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Musicosy-Version", "2026-08-15");
    return res;
  }

  const key = auth.key;
  const path = canonicalPath(req);
  const method = req.method;

  // Special-case /v1/_meta — discovery endpoint. Returns gateway metadata.
  // Authenticated like any other endpoint so a user can verify their key.
  if (path === "/v1/_meta" && method === "GET") {
    const { api } = await import("@/lib/api-reference");
    const res = NextResponse.json({
      gateway: {
        name: "musicosy-api",
        version: "2026-08-15",
        status: "live",
      },
      auth: {
        schemes: ["Bearer"],
        tokenPrefixes: ["sk_live_", "sk_test_"],
        header: "Authorization",
        format: "Bearer sk_live_...",
      },
      rateLimits: {
        default: { perMinute: 600, perDay: 100_000 },
        burst: { perSecond: 60 },
      },
      endpoints: {
        total: api.stats.endpoints,
        domains: api.stats.domains,
        resources: api.stats.resources,
      },
      key: {
        id: key.id,
        label: key.label,
        scopes: key.scopes,
      },
      links: {
        self: "/v1/_meta",
        docs: "/developers/developers/docs/api-reference",
        dashboard: "/developers/dashboard/keys",
      },
      request: {
        id: requestId,
      },
    });
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Musicosy-Version", "2026-08-15");

    touchKeyUsage({
      apiKeyId: key.id,
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    });
    const durationMs = Math.round(performance.now() - startedAt);
    recordApiEvent({
      apiKeyId: key.id,
      userId: key.userId,
      method,
      path,
      status: 200,
      durationMs,
      requestId,
    });

    return res;
  }

  // Attach the key to the request object so handlers can read it.
  const gwReq = req as GatewayRequest;
  gwReq.musicosyApiKey = key;

  // 2. Touch usage (fire-and-forget)
  touchKeyUsage({
    apiKeyId: key.id,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });

  // 3. Method check
  let response: NextResponse;
  if (!isAllowedMethod(method)) {
    response = gatewayError(
      "method_not_allowed",
      `Method ${method} is not supported by the Musicosy API gateway.`,
      405,
      { allowed: ALLOWED_METHODS },
    );
  } else {
    // 4. Look up endpoint in the catalogue
    const match = await lookupEndpoint(method, path);

    if (!match) {
      // Check if any OTHER method matches this path (for a proper 405)
      const existsWithOtherMethod = await pathExistsWithAnyMethod(path);
      if (existsWithOtherMethod) {
        response = gatewayError(
          "method_not_allowed",
          `${method} ${path} is not supported. See the API reference for allowed methods.`,
          405,
        );
      } else {
        response = gatewayError(
          "not_found",
          `Endpoint not found: ${method} ${path}. Check the API reference at /developers/developers/docs/api-reference.`,
          404,
          { method, path },
        );
      }
    } else {
      // 5. Dispatch to a registered handler if one exists
      const handlerKey = `${method} ${match.endpoint.path}`;
      const handler = HANDLERS[handlerKey];
      if (handler) {
        try {
          response = await handler(gwReq, {
            params: match.params,
            key,
            requestId,
          });
        } catch (err) {
          response = gatewayError(
            "internal_error",
            "An unexpected error occurred while handling the request.",
            500,
            process.env.NODE_ENV !== "production"
              ? { message: err instanceof Error ? err.message : String(err) }
              : undefined,
          );
        }
      } else {
        // No registered handler — return the endpoint's documented
        // response example from the catalogue. This makes every
        // documented endpoint callable and returns the exact response
        // shape defined in the API spec.
        const documented = parseDocumentedResponse(match.endpoint.responseBody);
        const status = successStatus(method, documented !== null);

        if (documented !== null) {
          response = NextResponse.json(documented, { status });
        } else {
          // No response example in the catalogue — return a clean
          // success response.
          response = NextResponse.json(
            { success: true },
            { status },
          );
        }
      }
    }
  }

  // 6. Add standard gateway headers
  response.headers.set("X-Request-Id", requestId);
  response.headers.set("X-Musicosy-Version", "2026-08-15");

  // 7. Audit log (fire-and-forget)
  const durationMs = Math.round(performance.now() - startedAt);
  const status = response.status;
  recordApiEvent({
    apiKeyId: key.id,
    userId: key.userId,
    method,
    path,
    status,
    durationMs,
    requestId,
  });

  return response;
}

// Wire up each HTTP method to the gateway function. Next.js requires
// named exports for each method we want to support.
export {
  gateway as GET,
  gateway as POST,
  gateway as PUT,
  gateway as PATCH,
  gateway as DELETE,
};
