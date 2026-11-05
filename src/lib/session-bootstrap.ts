// ---------------------------------------------------------------------------
// session-bootstrap — the ONE per-pageview session call (Slice 2).
//
// Every always-mounted chrome component used to fetch
// /api/auth/portal-session on mount (and again on portal:session-changed),
// the root layout fetched /api/portal/flags, and the impersonation
// banner fetched /api/impersonation/session — 4–6 separate requests per
// pageview for what is one visitor's session. They all now share this
// module-level promise for GET /api/session/bootstrap, whose flat body
// is the superset of the three old bodies (see that route's header):
//   { user, audience, flags, details, impersonation }
//
// Parsing is unchanged for every caller: portal-session callers read
// `.user`, flags callers read `.flags` / `.details`, the banner reads
// `.impersonation`.
//
// A FAILED fetch is never memoized (the promise resets so the next
// caller retries) and resolves to the same empty shape the old callers
// used as their failure fallback — never a throw, so a session-endpoint
// outage can never break chrome rendering.
// Call refreshSessionBootstrap() on portal:session-changed, exactly where
// callers used to re-fetch portal-session.
// ---------------------------------------------------------------------------

export type SessionBootstrap = {
  user: Record<string, unknown> | null;
  audience: string;
  flags: Record<string, boolean>;
  details: Array<{ key: string; audience: string; description: string | null }>;
  impersonation: Record<string, unknown> | null;
};

export const EMPTY_BOOTSTRAP: SessionBootstrap = {
  user: null,
  audience: "global",
  flags: {},
  details: [],
  impersonation: null,
};

let bootstrapPromise: Promise<SessionBootstrap> | null = null;

export function loadSessionBootstrap(): Promise<SessionBootstrap> {
  if (!bootstrapPromise) {
    bootstrapPromise = fetch("/api/session/bootstrap", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j || typeof j !== "object") {
          bootstrapPromise = null;
          return EMPTY_BOOTSTRAP;
        }
        return {
          user: (j as SessionBootstrap).user ?? null,
          audience: (j as SessionBootstrap).audience ?? "global",
          flags: (j as SessionBootstrap).flags ?? {},
          details: (j as SessionBootstrap).details ?? [],
          impersonation: (j as SessionBootstrap).impersonation ?? null,
        } satisfies SessionBootstrap;
      })
      .catch(() => {
        bootstrapPromise = null;
        return EMPTY_BOOTSTRAP;
      });
  }
  return bootstrapPromise;
}

/** Drop the memoized answer and re-fetch — for portal:session-changed. */
export function refreshSessionBootstrap(): Promise<SessionBootstrap> {
  bootstrapPromise = null;
  return loadSessionBootstrap();
}
