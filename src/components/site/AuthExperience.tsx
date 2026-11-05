"use client"

/**
 * The auth doors from Jaizon's unsaid-login.html / unsaid-create-account.html,
 * wired to the platform's REAL auth (nothing new invented):
 *   • Sign in      → POST /api/auth/login {email, password, portal:"customer"}
 *                    — the server resolves the person's roles from their
 *                    records and returns the one redirectTo (same contract
 *                    as EmailPasswordForm). Everybody enters as a customer;
 *                    staff/seller provisioning gates live on their own
 *                    doors, never here.
 *   • Google       → /api/auth/google?portal=customer[&next=…] (server-side
 *                    initiator, signed state — same as GoogleButton).
 *   • Forgot       → the existing recovery flow: Supabase
 *                    resetPasswordForEmail (→ /auth/set-password), then the
 *                    6-digit code verifyOtp(type:"recovery") + updateUser.
 *   • Create       → POST /api/auth/signup {email, password}, then the same
 *                    /api/auth/login to land the new user in their portal.
 *   • Apple        → no Apple initiator exists in /api/auth — the button is
 *                    honest about it instead of faking a flow.
 */
import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAppStore } from "@/lib/portal-store"
import { createClient } from "@/lib/auth/client"
import "./auth.css"

const LOGO = "/AaPORTALFOOGTERLOGOTRANAPARENT.png"

function BrandSide() {
  return (
    <section className="brand-side">
      <Link className="logo-lockup" href="/" aria-label="UnSaid Memories home">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO} alt="UnSaid Memories" />
      </Link>
      <div className="brand-copy">
        <p className="eyebrow">UnSaid Memories · One account</p>
        <h1>Everything your shopping life needs, <em>together.</em></h1>
        <p>Shop, save favorites, follow your orders, and stay connected to the things that make life better.</p>
        <div className="promise-row">
          <span className="promise"><i /> Customer-first</span>
          <span className="promise"><i /> Secure access</span>
          <span className="promise"><i /> One account</span>
        </div>
      </div>
      <Link className="back-link" href="/">← Back to UnSaid Memories</Link>
    </section>
  )
}

export function AuthExperience({
  mode,
  initialError = null,
  redirectTo,
}: {
  mode: "login" | "signup"
  initialError?: string | null
  redirectTo?: string
}) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(initialError)
  const [toast, setToast] = useState("")
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // recovery sub-flow (login mode): "signin" → "verify" (code sent)
  const [view, setView] = useState<"signin" | "verify">("signin")
  const [code, setCode] = useState("")
  const [newPassword, setNewPassword] = useState("")

  const showToast = (msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(""), 3200)
  }

  const googleMark = (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  )

  const goGoogle = () => {
    const base = `/api/auth/google?portal=${encodeURIComponent("customer")}`
    window.location.href =
      redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//")
        ? `${base}&next=${encodeURIComponent(redirectTo)}`
        : base
  }

  const goApple = () =>
    showToast("Apple sign-in isn't available yet — continue with Google or email.")

  async function doLogin(emailV: string, passwordV: string) {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: emailV.trim().toLowerCase(),
        password: passwordV,
        portal: "customer",
        ...(redirectTo ? { redirect: redirectTo } : {}),
      }),
    })
    const data = await res.json().catch(() => null)
    if (res.ok && data?.user) {
      useAppStore.getState().setUser(data.user)
      const dest =
        typeof data.redirectTo === "string" && data.redirectTo.startsWith("/")
          ? data.redirectTo
          : "/"
      router.push(dest)
      return true
    }
    setError(data?.error || "Invalid email or password.")
    return false
  }

  async function submitLogin(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (!(await doLogin(email, password))) setBusy(false)
    } catch {
      setError("Invalid email or password.")
      setBusy(false)
    }
  }

  async function submitSignup(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password, name: name.trim() || undefined }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(
          res.status === 409
            ? "That email already has an account — sign in instead."
            : data?.error || "Could not create your account. Please try again.",
        )
        setBusy(false)
        return
      }
      // Account created (the endpoint does not issue a session) — sign in
      // with the same credentials to land in the portal.
      if (!(await doLogin(email, password))) {
        router.push("/access-customer")
      }
    } catch {
      setError("Could not create your account. Please try again.")
      setBusy(false)
    }
  }

  // ---- password recovery (the platform's existing flow) ----
  async function sendCode() {
    const em = email.trim().toLowerCase()
    if (!em) {
      setError("Enter your email address first, then choose Forgot password.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      // A Google account has no password to reset — recognize it and
      // say so instead of mailing a reset that can never complete.
      const chk = await fetch("/api/auth/provider-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: em }),
      }).then((r) => r.json()).catch(() => null)
      if (chk?.googleAccount) {
        setError("This account signs in with Google. Head back to sign in and choose Continue with Google — there's no password on this account to reset.")
        setBusy(false)
        return
      }
      const supabase = createClient()
      const { error: err } = await supabase.auth.resetPasswordForEmail(em, {
        redirectTo: `${window.location.origin}/auth/set-password`,
      })
      if (err) {
        setError(err.message || "Could not send recovery code. Please try again.")
        return
      }
      setEmail(em)
      setView("verify")
      showToast("Recovery code sent — check your email.")
    } catch {
      setError("Could not send recovery code. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  async function verifyAndSet(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      const { error: err } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code.trim(),
        // PROVEN 2026-10-21 against the live auth service: this project's
        // recovery codes verify under type "email" — type "recovery"
        // returns otp_expired for even a brand-new code, which stranded
        // every user at "Token has expired or is invalid."
        type: "email",
      })
      if (err) {
        setError(err.message || "That code didn't work. Please try again.")
        return
      }
      const { error: upErr } = await supabase.auth.updateUser({ password: newPassword })
      if (upErr) {
        setError(upErr.message || "Could not set your new password.")
        return
      }
      router.push("/customer")
    } catch {
      setError("Could not complete recovery. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  const passwordField = (opts: { id: string; label: string; autoComplete: string; placeholder: string; value: string; onChange: (v: string) => void; minLength?: number }) => (
    <div className="field">
      <label htmlFor={opts.id}>{opts.label}</label>
      <div className="password-row">
        <input
          id={opts.id}
          type={showPw ? "text" : "password"}
          autoComplete={opts.autoComplete}
          placeholder={opts.placeholder}
          required
          minLength={opts.minLength}
          value={opts.value}
          onChange={(e) => opts.onChange(e.target.value)}
        />
        <button className="show-btn" type="button" onClick={() => setShowPw((v) => !v)}>
          {showPw ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  )

  return (
    <div className="auth-page">
      <main className="auth-shell">
        <BrandSide />
        <section className="form-side">
          <div className="form-wrap">
            <Link className="mobile-logo" href="/" aria-label="UnSaid Memories home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={LOGO} alt="UnSaid Memories" />
            </Link>

            {mode === "login" && view === "verify" ? (
              <>
                <div className="form-top">
                  <div>
                    <p className="form-kicker">Password recovery</p>
                    <h2>Check your email.</h2>
                    <p className="form-intro">Enter the 6-digit code we sent to {email} and choose a new password.</p>
                  </div>
                </div>
                <form className="form" onSubmit={verifyAndSet}>
                  <div className="field">
                    <label htmlFor="code">Recovery code</label>
                    <input id="code" inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" required value={code} onChange={(e) => setCode(e.target.value)} />
                  </div>
                  {passwordField({ id: "new-password", label: "New password", autoComplete: "new-password", placeholder: "Enter a new password", value: newPassword, onChange: setNewPassword, minLength: 8 })}
                  {error && <p className="form-error" role="alert">{error}</p>}
                  <button className="primary-btn" type="submit" disabled={busy}>{busy ? "One moment…" : "Verify & set password"}</button>
                </form>
                <p className="switch">
                  Didn&apos;t get it, or it expired?{" "}
                  <a href="#" onClick={(e) => { e.preventDefault(); setCode(""); void sendCode() }}>Resend code</a>
                  {" "}— only the newest code works; earlier ones are invalidated.
                </p>
                <p className="switch">
                  <a href="#" onClick={(e) => { e.preventDefault(); setView("signin"); setError(null) }}>← Back to sign in</a>
                </p>
              </>
            ) : mode === "login" ? (
              <>
                <div className="form-top">
                  <div>
                    <p className="form-kicker">Member access</p>
                    <h2>Welcome back.</h2>
                    <p className="form-intro">Sign in to keep your orders, favorites, and your UnSaid Memories experience together.</p>
                  </div>
                </div>
                <form className="form" onSubmit={submitLogin}>
                  <div className="field">
                    <label htmlFor="email">Email address</label>
                    <input id="email" type="email" autoComplete="email" placeholder="you@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  {passwordField({ id: "password", label: "Password", autoComplete: "current-password", placeholder: "Enter your password", value: password, onChange: setPassword })}
                  <div className="form-options">
                    <label className="check"><input type="checkbox" name="remember" /> <span>Keep me signed in</span></label>
                    <a className="text-link" href="#" onClick={(e) => { e.preventDefault(); void sendCode() }}>Forgot password?</a>
                  </div>
                  {error && <p className="form-error" role="alert">{error}</p>}
                  <button className="primary-btn" type="submit" disabled={busy}>{busy ? "One moment…" : "Sign in"}</button>
                  <div className="divider"><span>or continue with</span></div>
                  <div className="oauth-grid">
                    <button className="oauth" type="button" onClick={goGoogle}>{googleMark} Sign in with Google</button>
                    <button className="oauth" type="button" onClick={goApple}>Apple</button>
                  </div>
                </form>
                <p className="switch">New to UnSaid Memories? <Link href={redirectTo ? `/create-account?redirect=${encodeURIComponent(redirectTo)}` : "/create-account"}>Create an account</Link></p>
                <p className="legal-note">By continuing, you acknowledge that your account is subject to UnSaid Memories terms, privacy practices, and applicable policies.</p>
              </>
            ) : (
              <>
                <div className="form-top">
                  <div>
                    <p className="form-kicker">Join UnSaid Memories</p>
                    <h2>Create your account.</h2>
                    <p className="form-intro">Create one account for shopping, learning, and everything UnSaid Memories.</p>
                  </div>
                </div>
                <form className="form" onSubmit={submitSignup}>
                  <div className="field">
                    <label htmlFor="name">Full name</label>
                    <input id="name" type="text" autoComplete="name" placeholder="Your name" required value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="email">Email address</label>
                    <input id="email" type="email" autoComplete="email" placeholder="you@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  {passwordField({ id: "password", label: "Password", autoComplete: "new-password", placeholder: "Enter your password", value: password, onChange: setPassword, minLength: 8 })}
                  <div className="form-options">
                    <label className="check"><input type="checkbox" name="terms" required /> <span>I agree to the <Link className="text-link" href="/legal/everyone/terms-of-use">terms</Link></span></label>
                  </div>
                  {error && <p className="form-error" role="alert">{error}</p>}
                  <button className="primary-btn" type="submit" disabled={busy}>{busy ? "One moment…" : "Create account"}</button>
                  <div className="divider"><span>or continue with</span></div>
                  <div className="oauth-grid">
                    <button className="oauth" type="button" onClick={goGoogle}>{googleMark} Sign up with Google</button>
                    <button className="oauth" type="button" onClick={goApple}>Apple</button>
                  </div>
                </form>
                <p className="switch">Already have an account? <Link href={redirectTo ? `/access-customer?redirect=${encodeURIComponent(redirectTo)}` : "/access-customer"}>Sign in</Link></p>
                <p className="legal-note">By continuing, you acknowledge that your account is subject to UnSaid Memories terms, privacy practices, and applicable policies.</p>
              </>
            )}
          </div>
        </section>
      </main>
      <div className={`toast${toast ? " show" : ""}`} role="status" aria-live="polite">{toast}</div>
    </div>
  )
}
