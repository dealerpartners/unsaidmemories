'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

const ERRORS: Record<string, string> = {
  staff: 'That account is signed in but has no staff access to this dashboard.',
  google_not_configured: 'Google sign-in is not configured yet.',
  google_unavailable: 'Google sign-in could not start. Try again.',
  google_failed: 'Google sign-in failed. Try again.',
  session_failed: 'Your session could not be started. Try again.',
};

function LoginCard() {
  const params = useSearchParams();
  const next = params.get('next') || '/';
  const error = params.get('error');
  const href = `https://unsaidmemories.com/api/auth/google?portal=admin&next=${encodeURIComponent(next)}`;

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
        {error && ERRORS[error] && (
          <p style={{ color: '#b3261e', fontSize: 13, margin: '0 0 16px' }}>{ERRORS[error]}</p>
        )}
        <a
          href={href}
          style={{
            display: 'block',
            width: '100%',
            padding: '12px 16px',
            fontSize: 15,
            fontWeight: 600,
            color: '#fff',
            background: '#1a7f37',
            borderRadius: 8,
            textDecoration: 'none',
            boxSizing: 'border-box',
          }}
        >
          Sign in with Google
        </a>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginCard />
    </Suspense>
  );
}
