'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, X, CheckCircle2, AlertCircle as AlertCircleIcon } from 'lucide-react';
import { useAppStore } from '@/lib/portal-store';
import { createClient } from '@/lib/auth/client';
import type { PortalId } from '@/lib/portal-auth';

// ============================================================================
// EmailPasswordForm — DUMB, presentational (owner's spec §5). It sends
// exactly what the user typed plus which door it sits on: the /api/auth/login
// server route resolves the role from the salon records and validates the
// door server-side — the client never decides who anyone is.
//
// The server's redirectTo is the single routing answer (role-resolved
// destination, or the door's destination, or the same-site ?redirect=
// override the server already validated).
// ============================================================================

interface EmailPasswordFormProps {
  portal: PortalId;
  submitLabel?: string;
  /** Same-site ?redirect= from the door URL — passed through to the server,
   *  which re-validates it (path-relative only). */
  redirectTo?: string;
  initialError?: string | null;
  emailLabel?: string;
  placeholder?: string;
}

export function EmailPasswordForm({
  portal,
  submitLabel = 'LOG IN',
  redirectTo,
  initialError = null,
  emailLabel = 'Email',
  placeholder,
}: EmailPasswordFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          portal,
          ...(redirectTo ? { redirect: redirectTo } : {}),
        }),
      });
      const data = await res.json().catch(() => null);

      if (res.ok && data?.user) {
        useAppStore.getState().setUser(data.user);
        const dest: string =
          typeof data.redirectTo === 'string' && data.redirectTo.startsWith('/')
            ? data.redirectTo
            : '/';
        router.push(dest);
        return; // navigating — keep the spinner up
      }

      setErrorMessage(data?.error || 'Invalid email or password.');
      setIsSubmitting(false);
    } catch {
      setErrorMessage('Invalid email or password.');
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Email */}
      <div>
        <label htmlFor={`door-email-${portal}`} className="block text-[13px] font-normal text-foreground mb-1.5">
          {emailLabel}
        </label>
        <input
          id={`door-email-${portal}`}
          type="text"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={placeholder || 'you@example.com'}
          autoComplete="username"
          className="w-full bg-card border border-border rounded-lg px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-border transition"
        />
      </div>

      {/* Password */}
      <div>
        <label htmlFor={`door-password-${portal}`} className="block text-[13px] font-normal text-foreground mb-1.5">
          Password
        </label>
        <div className="relative">
          <input
            id={`door-password-${portal}`}
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            className="w-full bg-card border border-border rounded-lg px-3.5 pr-10 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-border transition"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground/70 hover:text-foreground cursor-pointer"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        <div className="flex justify-end pt-1.5">
          <ForgotPasswordLink defaultEmail={email} portal={portal} />
        </div>
      </div>

      {/* Error banner (server answer or initial ?error= gate message) */}
      {errorMessage && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-2.5 text-xs text-destructive">
          <AlertCircle />
          <span className="leading-snug">{errorMessage}</span>
        </div>
      )}

      {/* Submit */}
      <div className="pt-2 space-y-2.5">
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 font-medium text-[13px] tracking-[0.18em] uppercase rounded-lg transition shadow-xs flex items-center justify-center cursor-pointer disabled:opacity-60"
        >
          {isSubmitting ? (
            <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <span>{submitLabel}</span>
          )}
        </button>
      </div>
    </form>
  );
}

function AlertCircle() {
  return (
    <svg
      className="w-4 h-4 shrink-0 mt-0.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Forgot password — REAL: requests an actual Supabase reset email. The
// confirmation state shows for any address so it never reveals which emails
// exist. Self-contained: trigger link + modal.
// ---------------------------------------------------------------------------
function ForgotPasswordLink({ defaultEmail, portal }: { defaultEmail: string; portal: PortalId }) {
  const router = useRouter();
  // 3-step OTP recovery flow — no email links, no redirect URLs needed.
  // Step 1: enter email → Supabase sends a 6-digit code
  // Step 2: enter the 6-digit code → verifyOtp({ type: 'recovery' })
  // Step 3: enter a new password → updateUser({ password })
  // Then redirect to the portal the user was trying to reach.
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const portalPath: Record<PortalId, string> = {
    admin: '/admin/dashboard',
    customer: '/customer/dashboard',
    seller: '/seller/dashboard',
    groomer: '/employee/dashboard',
    lms: '/learn/classroom',
  };

  const close = () => {
    setOpen(false);
    // Reset for next time
    setTimeout(() => {
      setStep(1);
      setEmail('');
      setCode('');
      setNewPassword('');
      setConfirmPassword('');
      setError(null);
      setBusy(false);
    }, 200);
  };

  // Step 1: send the recovery email (Supabase sends a 6-digit OTP code).
  const sendCode = async (emailValue: string) => {
    const em = String(emailValue || '').trim().toLowerCase();
    if (!em || busy) return;
    setBusy(true);
    setError(null);
    try {
      // A Google account has no password to reset — recognize it and
      // say so instead of mailing a reset that can never complete.
      const chk = await fetch('/api/auth/provider-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: em }),
      }).then((r) => r.json()).catch(() => null);
      if (chk?.googleAccount) {
        setError('This account signs in with Google. Head back to sign in and choose Continue with Google — there\'s no password on this account to reset.');
        setBusy(false);
        return;
      }
      const supabase = createClient();
      const { error: err } = await supabase.auth.resetPasswordForEmail(em, {
        redirectTo: `${window.location.origin}/auth/set-password`,
      });
      if (err) {
        setError(err.message || 'Could not send recovery code. Please try again.');
        setBusy(false);
        return;
      }
      setEmail(em);
      setStep(2);
    } catch {
      setError('Could not send recovery code. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  // Step 2: verify the 6-digit code Supabase sent.
  const verifyCode = async (e?: any) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!code || code.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: 'recovery',
      });
      if (err) {
        setError(err.message || 'Invalid or expired code. Please try again.');
        setBusy(false);
        return;
      }
      // Code verified — user now has a session. Move to password entry.
      setStep(3);
    } catch {
      setError('Invalid or expired code. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  // Step 3: set the new password (user already has a session from step 2).
  const submitNewPassword = async (e?: any) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (busy) return;
    if (newPassword.length < 8) {
      setError('Choose a password with at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.updateUser({ password: newPassword });
      if (err) {
        setError(err.message || 'Could not save the password. Please try again.');
        setBusy(false);
        return;
      }
      // Password set — redirect to the portal the user was trying to reach.
      close();
      router.push(portalPath[portal] || '/');
    } catch {
      setError('Could not save the password. Please try again.');
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[12px] text-muted-foreground hover:text-foreground font-serif italic transition cursor-pointer"
      >
        Forgot Password?
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/90 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-card rounded-2xl shadow-2xl border border-border p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                {step === 1 ? 'Reset Your Password' : step === 2 ? 'Enter the Code' : 'Set New Password'}
              </h3>
              <button
                onClick={close}
                className="text-muted-foreground/70 hover:text-foreground p-1 rounded-lg"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-2 text-[10px] font-medium tracking-wider uppercase text-muted-foreground">
              <span className={step >= 1 ? 'text-foreground' : ''}>1 · Email</span>
              <span className="text-muted-foreground/40">→</span>
              <span className={step >= 2 ? 'text-foreground' : ''}>2 · Code</span>
              <span className="text-muted-foreground/40">→</span>
              <span className={step >= 3 ? 'text-foreground' : ''}>3 · Password</span>
            </div>

            {error && (
              <div className="p-2.5 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-2 text-[12px] text-destructive">
                <AlertCircleIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span className="leading-snug">{error}</span>
              </div>
            )}

            {/* STEP 1: Enter email */}
            {step === 1 && (
              <div className="space-y-3">
                <p className="text-[13px] text-muted-foreground">
                  Enter your registered email and we'll send you a 6-digit verification code.
                </p>
                <input
                  type="email"
                  name="otp-email"
                  required
                  defaultValue={defaultEmail}
                  placeholder="Enter your email"
                  className="w-full border border-border rounded-lg px-3 py-2 text-[13px] text-foreground focus:outline-none focus:border-border"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const form = e.currentTarget.closest('div'); const inp = form?.querySelector('input[type=email]') as HTMLInputElement; if (inp) sendCode(inp.value); } }}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => { const inp = document.querySelector('input[name=otp-email]') as HTMLInputElement; if (inp) sendCode(inp.value); }}
                  className="w-full py-2.5 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 font-semibold text-[13px] rounded-lg transition cursor-pointer disabled:opacity-60"
                >
                  {busy ? 'Sending…' : 'Send Recovery Code'}
                </button>
              </div>
            )}

            {/* STEP 2: Enter the 6-digit code */}
            {step === 2 && (
              <div className="space-y-3">
                <p className="text-[13px] text-muted-foreground">
                  We sent a 6-digit code to <strong className="text-foreground">{email}</strong>.
                  Enter it below to verify your identity.
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); verifyCode(e as any); } }}
                  placeholder="000000"
                  className="w-full border border-border rounded-lg px-3 py-3 text-center text-[20px] font-mono tracking-[0.5em] text-foreground focus:outline-none focus:border-border"
                  autoFocus
                />
                <button
                  type="button"
                  disabled={busy || code.length !== 6}
                  onClick={() => verifyCode({ preventDefault: () => {}, stopPropagation: () => {} } as any)}
                  className="w-full py-2.5 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 font-semibold text-[13px] rounded-lg transition cursor-pointer disabled:opacity-60"
                >
                  {busy ? 'Verifying…' : 'Verify Code'}
                </button>
                <button
                  type="button"
                  onClick={() => { setStep(1); setCode(''); setError(null); }}
                  className="w-full text-[12px] text-muted-foreground hover:text-foreground transition cursor-pointer"
                >
                  ← Use a different email
                </button>
              </div>
            )}

            {/* STEP 3: Set new password (user has a session from step 2) */}
            {step === 3 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-[12px] text-success">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Identity verified. Choose your new password.</span>
                </div>
                <div>
                  <label className="block text-[12px] font-normal text-foreground mb-1">New Password</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full border border-border rounded-lg px-3 py-2 text-[13px] text-foreground focus:outline-none focus:border-border"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-normal text-foreground mb-1">Confirm Password</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full border border-border rounded-lg px-3 py-2 text-[13px] text-foreground focus:outline-none focus:border-border"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitNewPassword({ preventDefault: () => {}, stopPropagation: () => {} } as any); } }}
                  />
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => submitNewPassword({ preventDefault: () => {}, stopPropagation: () => {} } as any)}
                  className="w-full py-2.5 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 font-semibold text-[13px] rounded-lg transition cursor-pointer disabled:opacity-60"
                >
                  {busy ? 'Saving…' : 'Set Password & Sign In'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
