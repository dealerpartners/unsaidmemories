// Middleware entry for the src/ layout.
//
// The middleware implementation lives at the project root (middleware.ts),
// but with the app under src/app Next does not execute a root-level
// middleware file in this project (verified in the dev sandbox: the
// middleware manifest stayed empty and /admin/dashboard rendered for a
// signed-out visitor instead of redirecting). This file wires that same
// implementation in as the src/ entry — the root file is untouched, and
// the session-refresh + /admin protection logic lives in exactly one
// place. The matcher is defined here (not re-exported) because Next
// does not recognize a re-exported `config` field.
export { middleware } from "../middleware";

export const config = {
  matcher: [
    /*
     * Run on everything except static assets and Next internals.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
