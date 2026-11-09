"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { signIn, type AuthResult } from "../actions";
import { GoogleMark } from "@/components/google-mark";

const initialState: AuthResult = {};

/**
 * Consumes a session delivered in the URL fragment (#access_token=…&
 * refresh_token=…&type=magiclink). Links generated outside the app's own
 * client flow — e.g. admin-generated magic links — finish Supabase
 * verification by landing here with the tokens in the hash, which the
 * PKCE-only /auth/callback route never sees. We exchange the fragment
 * tokens for the cookie session the server understands, then send the
 * user on to `next`. The browser client is @supabase/ssr's: the plain
 * supabase-js client would park the session in localStorage, where the
 * cookie-based middleware/server session can't read it.
 */
function useFragmentSession(next: string) {
  const [linkError, setLinkError] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const hash = window.location.hash;
    if (!hash || hash.length < 2) return;
    const params = new URLSearchParams(hash.slice(1));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken || !refreshToken) return;

    // Consume the fragment immediately so the tokens don't linger in
    // the address bar or history, whatever happens next.
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );

    const url =
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const key =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY;
    if (!url || !key) {
      setLinkError(true);
      return;
    }

    const supabase = createBrowserClient(url, key, {
      auth: { detectSessionInUrl: false },
    });

    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ data, error }) => {
        if (error || !data.session) {
          // Stay on the form — the user can still sign in normally.
          setLinkError(true);
          return;
        }
        const target =
          next.startsWith("/") && !next.startsWith("//") ? next : "/account";
        window.location.replace(target);
      })
      .catch(() => setLinkError(true));
  }, [next]);

  return linkError;
}

export function LoginForm({ next, confirmError }: { next: string; confirmError: boolean }) {
  const [state, formAction, pending] = useActionState(signIn, initialState);
  const linkError = useFragmentSession(next);

  return (
    <>
      <h2>Welcome back.</h2>
      <p>Sign in to manage your studio, collections, and orders.</p>

      {confirmError && (
        <div className="auth-error">
          That confirmation link didn&apos;t work. Try signing in — or request a
          new link from your inbox.
        </div>
      )}
      {linkError && (
        <div className="auth-error">
          That sign-in link didn&apos;t work. Try signing in — or request a
          new link from your inbox.
        </div>
      )}
      {state.error && <div className="auth-error">{state.error}</div>}

      <a className="auth-google" href={`/api/auth/google?next=${encodeURIComponent(next)}`}>
        <GoogleMark /> Sign in with Google
      </a>
      <div className="auth-or"><span>or</span></div>

      <form action={formAction}>
        <input type="hidden" name="next" value={next} />
        <div className="auth-field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
          />
        </div>
        <div className="auth-field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            required
          />
        </div>
        <button type="submit" className="auth-submit" disabled={pending}>
          {pending ? "Signing in…" : <>Sign in <ArrowRight size={15} /></>}
        </button>
      </form>

      <div className="auth-alt">
        New to UnSaid? <a href={`/signup${next !== "/account" ? `?next=${encodeURIComponent(next)}` : ""}`}>Create an account</a>
      </div>
    </>
  );
}
