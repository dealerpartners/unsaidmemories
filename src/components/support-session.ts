"use client";

import { useEffect, useState } from "react";

/**
 * The signed-in shopper behind the support surfaces, from
 * /api/customers/me (401 when there is no session). Support is a
 * customer surface (owner ruling, 2026-11-03): guests read the FAQ;
 * writing to the team — and reading the thread — happens signed in,
 * inside the account. The contact forms use this to show a sign-in
 * prompt instead of a guest ticket form.
 */
export type SupportSession =
  | { state: "loading" }
  | { state: "out" }
  | { state: "in"; name: string; email: string };

export function useSupportSession(): SupportSession {
  const [session, setSession] = useState<SupportSession>({ state: "loading" });
  useEffect(() => {
    let live = true;
    fetch("/api/customers/me", { cache: "no-store" })
      .then(async (r) => {
        if (!live) return;
        if (!r.ok) {
          setSession({ state: "out" });
          return;
        }
        const j = await r.json().catch(() => ({}));
        setSession({
          state: "in",
          name: typeof j?.name === "string" ? j.name : "",
          email: typeof j?.email === "string" ? j.email : "",
        });
      })
      .catch(() => {
        if (live) setSession({ state: "out" });
      });
    return () => {
      live = false;
    };
  }, []);
  return session;
}
