"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * Shared Musicosy sign-in form — used by all three portals.
 *
 * Each portal passes its own `redirectTo` (where to land after auth) and
 * `callbackPath` (the OAuth callback URL Supabase should return to):
 *
 *   - Marketing  : redirectTo="/dashboard",          callbackPath="/auth/callback"
 *   - Ads         : redirectTo="/ads",                callbackPath="/ads/auth/callback"
 *   - Developer   : redirectTo="/developers/dashboard", callbackPath="/developers/auth/callback"
 *
 * Auth flow (identical to devportal commit 337d0c8):
 *   1. Phone OTP card   → supabase.auth.signInWithOtp({ phone }) → verifyOtp
 *   2. Google OAuth     → supabase.auth.signInWithOAuth({ provider: "google", redirectTo })
 *   3. Apple OAuth      → supabase.auth.signInWithOAuth({ provider: "apple",  redirectTo })
 *   4. Email + password → check-email → if !exists, /api/auth/signup → signInWithPassword
 *
 * `next` query param overrides `redirectTo` (set by middleware when bouncing
 * an unauthenticated user back to signin — preserves their intended destination).
 *
 * MUST be wrapped in <Suspense> by the parent page because it calls
 * `useSearchParams()`.
 *
 * Layout: 2-column on lg+ viewports.
 *   - LEFT  : oversized transparent Musicosy logo on white background
 *   - RIGHT : vertical stack of auth cards (Phone / Google / Apple / Email)
 *
 * On <lg viewports the logo stacks above the auth panel.
 */
export default function SignInForm({
  redirectTo,
  callbackPath,
}: {
  redirectTo: string;
  callbackPath: string;
}) {
  const params = useSearchParams();
  // middleware sets ?next=<original-path> when bouncing an unauthed user
  const next = params.get("next") || redirectTo;

  // Mock mode when Supabase env vars aren't configured — render the auth
  // card anyway (its only job is auth) so the page is previewable. Every
  // action falls through to `finish()` which redirects to the portal.
  const configured = isSupabaseConfigured();
  const supabase = configured ? createBrowserClient() : null;
  const [pending, startTransition] = useTransition();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [showPhone, setShowPhone] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // exists → "signin", !exists → "signup"
  const [flow, setFlow] = useState<"signin" | "signup" | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);

  void startTransition;

  function finish() {
    // Hard navigation — session cookie must be in the request headers when
    // the destination route's middleware runs. router.replace + router.refresh
    // races the cookie write and bounces back to /signin.
    window.location.assign(next);
  }

  // --- Phone OTP ---
  async function sendOtp() {
    setError(null);
    setInfo(null);
    if (!supabase) { setOtpSent(true); setInfo("Code sent — check your phone."); return; }
    const { error } = await supabase.auth.signInWithOtp({
      phone: phone.trim(),
      options: { shouldCreateUser: true },
    });
    if (error) {
      setError(error.message);
      return;
    }
    setOtpSent(true);
    setInfo("Code sent — check your phone.");
  }

  async function verifyOtp() {
    setError(null);
    setInfo(null);
    if (!supabase) { finish(); return; }
    const { error } = await supabase.auth.verifyOtp({
      phone: phone.trim(),
      token: otpCode.trim(),
      type: "sms",
    });
    if (error) {
      setError(error.message);
      return;
    }
    finish();
  }

  // --- OAuth ---
  async function oauth(provider: "google" | "apple") {
    setError(null);
    setInfo(null);
    if (provider === "google") {
      // First-party Next.js OAuth (the AAPawZ pattern): the button goes
      // to our own initiator route; the callback lands the user in
      // Supabase with a normal session. No Supabase OAuth provider.
      window.location.href = `/api/auth/google?next=${encodeURIComponent(next)}`;
      return;
    }
    if (!supabase) { finish(); return; }
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}${callbackPath}?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) setError(error.message);
  }

  // --- Email + password ---
  async function checkEmailAndContinue() {
    setError(null);
    setInfo(null);
    if (!configured) {
      setFlow("signin");
      setShowPassword(true);
      return;
    }
    setCheckingEmail(true);
    try {
      const res = await fetch("/api/auth/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not verify email. Try again.");
        return;
      }
      const { exists } = await res.json();
      setFlow(exists ? "signin" : "signup");
      setShowPassword(true);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setCheckingEmail(false);
    }
  }

  // 4 attempts w/ 600ms gap — covers GoTrue eventual consistency between an
  // auth.users INSERT (via direct pg) and GoTrue's read path.
  async function signInWithRetry(emailVal: string, passwordVal: string, attempts = 4) {
    if (!supabase) return null;
    for (let i = 0; i < attempts; i++) {
      const { error } = await supabase.auth.signInWithPassword({
        email: emailVal,
        password: passwordVal,
      });
      if (!error) return null;
      if (error.message.toLowerCase().includes("invalid login")) return error;
      await new Promise((r) => setTimeout(r, 600));
    }
    return (await supabase!.auth.signInWithPassword({ email: emailVal, password: passwordVal })).error;
  }

  async function submitPassword() {
    setError(null);
    setInfo(null);

    if (!supabase) { finish(); return; }

    if (flow === "signin") {
      const err = await signInWithRetry(email.trim(), password);
      if (err) {
        setError(err.message);
        return;
      }
      finish();
      return;
    }

    // flow === "signup"
    let signupRes;
    try {
      signupRes = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
    } catch {
      setError("Network error during sign-up. Try again.");
      return;
    }
    if (!signupRes.ok) {
      const data = await signupRes.json().catch(() => ({}));
      if (signupRes.status === 409) {
        setFlow("signin");
        setInfo("That email is already registered. Sign in with your password.");
        return;
      }
      setError(data.error || "Sign-up failed. Try again.");
      return;
    }

    const err = await signInWithRetry(email.trim(), password);
    if (err) {
      setInfo("Account created. Please sign in with your email and password.");
      setFlow("signin");
      setPassword("");
      return;
    }
    finish();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white text-neutral-900">
      <div className="mx-auto grid w-full max-w-5xl grid-cols-1 items-center gap-12 px-6 py-12 md:px-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-12 lg:px-16">
        {/* Left: oversized transparent Musicosy logo */}
        <div className="flex items-center justify-start">
          <img
            src="/musicosy-logo.png"
            alt="Musicosy"
            className="w-full max-w-[420px] lg:max-w-[560px]"
          />
        </div>

        {/* Right: auth panel */}
        <div className="w-full max-w-md justify-self-center lg:justify-self-end">
          {/* === CARD 1: Phone OTP === */}
          <button
            type="button"
            disabled={pending}
            onClick={() => setShowPhone(!showPhone)}
            className="flex h-14 w-full items-center justify-center gap-3 rounded-full bg-neutral-900 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <PhoneIcon /> Continue with phone
          </button>

          <div
            className={`grid transition-all duration-500 ease-in-out ${
              showPhone ? "mt-3 max-h-80 opacity-100" : "mt-0 max-h-0 opacity-0"
            }`}
            style={{ overflow: showPhone ? "visible" : "hidden" }}
          >
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (555) 000-0000"
              className="h-14 w-full rounded-xl border border-neutral-200 bg-white px-4 text-base text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none"
            />
            {!otpSent ? (
              <button
                type="button"
                disabled={!phone.trim() || pending}
                onClick={sendOtp}
                className={`mt-2 flex h-12 items-center justify-center rounded-full bg-neutral-900 font-medium text-white transition-opacity hover:opacity-90 ${
                  !phone.trim() ? "pointer-events-none opacity-40" : ""
                }`}
              >
                Send code
              </button>
            ) : (
              <>
                <input
                  type="text"
                  inputMode="numeric"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="6-digit code"
                  className="mt-2 h-14 w-full rounded-xl border border-neutral-200 bg-white px-4 text-base text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={otpCode.trim().length < 6 || pending}
                  onClick={verifyOtp}
                  className={`mt-2 flex h-12 items-center justify-center rounded-full bg-neutral-900 font-medium text-white transition-opacity hover:opacity-90 ${
                    otpCode.trim().length < 6 ? "pointer-events-none opacity-40" : ""
                  }`}
                >
                  Verify & continue
                </button>
              </>
            )}
          </div>

          {/* === CARD 2: Google OAuth === */}
          <button
            type="button"
            disabled={pending}
            onClick={() => oauth("google")}
            className="mt-3 flex h-14 w-full items-center justify-center gap-3 rounded-full border border-neutral-200 bg-white font-medium text-neutral-900 transition-colors hover:bg-neutral-50 disabled:opacity-50"
          >
            <GoogleIcon /> Continue with Google
          </button>

          {/* === CARD 3: Apple OAuth === */}
          <button
            type="button"
            disabled={pending}
            onClick={() => oauth("apple")}
            className="mt-3 flex h-14 w-full items-center justify-center gap-3 rounded-full border border-neutral-200 bg-white font-medium text-neutral-900 transition-colors hover:bg-neutral-50 disabled:opacity-50"
          >
            <AppleIcon /> Continue with Apple
          </button>

          <div className="my-6 flex items-center gap-4">
            <span className="h-px flex-1 bg-neutral-200" />
            <span className="text-sm text-neutral-500">or</span>
            <span className="h-px flex-1 bg-neutral-200" />
          </div>

          {/* === CARD 4: Email + password === */}
          <div>
            <label htmlFor="identifier" className="sr-only">
              Email or username
            </label>
            <input
              id="identifier"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (flow) {
                  setFlow(null);
                  setShowPassword(false);
                }
              }}
              placeholder="Email or username"
              className="h-14 w-full rounded-xl border border-neutral-200 bg-white px-4 text-base text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none"
            />
            <button
              type="button"
              disabled={!email.trim() || checkingEmail || pending}
              onClick={checkEmailAndContinue}
              className="mt-4 h-14 w-full rounded-full bg-neutral-900 font-medium text-white transition-opacity hover:opacity-90 disabled:bg-neutral-200 disabled:text-neutral-400"
            >
              {checkingEmail ? "Checking…" : "Continue"}
            </button>
          </div>

          <div
            className={`grid transition-all duration-500 ease-in-out ${
              showPassword ? "mt-4 max-h-40 opacity-100" : "mt-0 max-h-0 opacity-0"
            }`}
            style={{ overflow: showPassword ? "visible" : "hidden" }}
          >
            <label htmlFor="password" className="sr-only">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={flow === "signup" ? "Create a password (8+ chars)" : "Password"}
              className="h-14 w-full rounded-xl border border-neutral-200 bg-white px-4 text-base text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none"
            />
            <button
              type="button"
              disabled={!password.trim() || pending}
              onClick={submitPassword}
              className={`mt-3 flex h-14 items-center justify-center rounded-full bg-neutral-900 font-medium text-white transition-opacity hover:opacity-90 ${
                !password.trim() ? "pointer-events-none opacity-40" : ""
              }`}
            >
              {flow === "signup" ? "Create account" : "Sign in"}
            </button>
          </div>

          {error && (
            <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}

          {info && (
            <p className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs leading-relaxed text-neutral-900">
              {info}
            </p>
          )}

          <p className="mt-5 text-center text-xs leading-relaxed text-neutral-500">
            By continuing, you agree to our{" "}
            <span className="font-semibold text-neutral-900">Terms of Service</span>,{" "}
            <span className="font-semibold text-neutral-900">Privacy Policy</span> and{" "}
            <span className="font-semibold text-neutral-900">Cookie Use</span>.
          </p>
        </div>
      </div>
    </main>
  );
}

function PhoneIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z" />
      <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.4a12 12 0 0 0 0 10.7l4-3z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.7l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.4 12.7c0-2.6 2.1-3.9 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.3-.9-1.7 0-3.3 1-4.1 2.5-1.8 3.1-.5 7.6 1.3 10.1.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8s2 .8 3.3.8c1.4 0 2.3-1.2 3.1-2.5.6-.9 1-1.8 1.3-2.8-3.3-1.3-2.7-4-2.7-4zM14 4.9c.7-.9 1.2-2.1 1.1-3.3-1 0-2.3.7-3.1 1.6-.7.8-1.3 2-1.1 3.2 1.2.1 2.4-.6 3.1-1.5z" />
    </svg>
  );
}
