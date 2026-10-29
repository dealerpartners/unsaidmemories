'use client';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '48px 24px',
        color: '#15131d',
        fontFamily: 'inherit',
      }}
    >
      <p style={{ fontSize: 14, letterSpacing: 2, textTransform: 'uppercase', color: '#7254d6', margin: '0 0 12px' }}>
        Something went wrong
      </p>
      <h1 style={{ fontSize: 40, margin: '0 0 12px', color: '#15131d' }}>A little hiccup in the story.</h1>
      <p style={{ color: '#706d7c', maxWidth: 480, margin: '0 0 24px' }}>
        This page ran into a problem loading. Try again — your memories are safe.
      </p>
      <button
        onClick={reset}
        style={{
          background: '#7254d6',
          color: '#fff',
          padding: '12px 28px',
          borderRadius: 999,
          border: 'none',
          cursor: 'pointer',
          fontWeight: 600,
          fontSize: 16,
        }}
      >
        Try again
      </button>
    </div>
  );
}
