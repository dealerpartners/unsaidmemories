'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createAuthBrowserClient } from '@/lib/supabase/client';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/';
  const error = params.get('error');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    // Already signed in (staff session) — go straight through.
    createAuthBrowserClient()
      .auth.getUser()
      .then(({ data }) => {
        if (data.user && !error) router.replace(next);
      })
      .catch(() => {});
  }, [router, next, error]);

  async function signInWithGoogle() {
    setBusy(true);
    setFailed(null);
    const supabase = createAuthBrowserClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (oauthError) {
      setFailed(oauthError.message);
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f6f6f4',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      }}
    >
      <div
        style={{
          background: '#fff',
          border: '1px solid #e3e3de',
          borderRadius: 12,
          padding: '36px 40px',
          width: 360,
          maxWidth: '90vw',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 700, color: '#14231a' }}>Unsaid</div>
        <p style={{ color: '#5a655e', fontSize: 14, margin: '8px 0 24px' }}>
          Admin sign-in. Staff only.
        </p>
        {error === 'staff' && (
          <p style={{ color: '#b3261e', fontSize: 13, margin: '0 0 16px' }}>
            That account is signed in but has no staff access to this dashboard.
          </p>
        )}
        {failed && (
          <p style={{ color: '#b3261e', fontSize: 13, margin: '0 0 16px' }}>{failed}</p>
        )}
        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={busy}
          style={{
            width: '100%',
            padding: '12px 16px',
            fontSize: 15,
            fontWeight: 600,
            color: '#fff',
            background: '#1a7f37',
            border: 'none',
            borderRadius: 8,
            cursor: busy ? 'wait' : 'pointer',
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? 'Opening Google…' : 'Sign in with Google'}
        </button>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
