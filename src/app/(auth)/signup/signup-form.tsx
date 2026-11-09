"use client";

import { useActionState, useState } from "react";
import { ArrowRight, MailCheck } from "lucide-react";
import { signUp, type AuthResult } from "../actions";
import { GoogleMark } from "@/components/google-mark";

const initialState: AuthResult = {};

export function SignupForm({
  next,
}: {
  next: string;
  audience?: string;
}) {
  const [state, formAction, pending] = useActionState(signUp, initialState);
  const [terms, setTerms] = useState(false);
  const [termsError, setTermsError] = useState(false);
  const checkEmail = state.error === "__CHECK_EMAIL__";

  // One account for everyone — advertising is a privilege the account
  // turns on inside, not a separate signup. Google sits at the top:
  // one click, no scrolling. The terms agreement is still required
  // first — the callback stamps the acceptance on the account.
  function goGoogle() {
    if (!terms) {
      setTermsError(true);
      return;
    }
    window.location.href = `/api/auth/google?next=${encodeURIComponent(next)}`;
  }

  return (
    <>
      <h2>Create your account.</h2>
      <p>Join UnSaid to design, publish, and share pieces that say what matters.</p>

      {checkEmail ? (
        <div className="auth-success">
          <span style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
            <MailCheck size={17} /> Check your inbox
          </span>
          We sent a confirmation link to your email. Click it to finish creating
          your account.
        </div>
      ) : (
        <>
          {state.error && <div className="auth-error">{state.error}</div>}
          {termsError && (
            <div className="auth-error">Please agree to the Terms and Privacy Policy below first.</div>
          )}
          <button type="button" className="auth-google" onClick={goGoogle}>
            <GoogleMark /> Sign up with Google
          </button>
          <div className="auth-or"><span>or</span></div>

          <form action={formAction}>
            <input type="hidden" name="next" value={next} />
            <div className="auth-field">
              <label htmlFor="name">Your name</label>
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                placeholder="What should we call you?"
              />
            </div>
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
                autoComplete="new-password"
                placeholder="At least 8 characters"
                required
                minLength={8}
              />
            </div>
            <div>
              <label className="auth-terms">
                <input
                  type="checkbox"
                  name="terms"
                  required
                  checked={terms}
                  onChange={(e) => { setTerms(e.target.checked); if (e.target.checked) setTermsError(false); }}
                />
                <span>
                  I agree to the{" "}
                  <a href="/legal/terms-of-service" target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
                    Terms
                  </a>{" "}
                  and{" "}
                  <a href="/legal/privacy-policy" target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
                    Privacy Policy
                  </a>
                  .
                </span>
              </label>
            </div>
            <button type="submit" className="auth-submit" disabled={pending}>
              {pending ? "Creating account…" : <>Create account <ArrowRight size={15} /></>}
            </button>
          </form>
        </>
      )}

      <div className="auth-alt">
        Already have an account? <a href={`/login${next !== "/account" ? `?next=${encodeURIComponent(next)}` : ""}`}>Sign in</a>
      </div>
    </>
  );
}
