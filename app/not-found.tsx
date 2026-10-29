export default function NotFound() {
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
        404 — Page not found
      </p>
      <h1 style={{ fontSize: 40, margin: '0 0 12px', color: '#15131d' }}>This memory isn&apos;t here.</h1>
      <p style={{ color: '#706d7c', maxWidth: 480, margin: '0 0 24px' }}>
        The page you&apos;re looking for may have moved or never existed. Let&apos;s get you back to the good stuff.
      </p>
      <a
        href="/"
        style={{
          background: '#7254d6',
          color: '#fff',
          padding: '12px 28px',
          borderRadius: 999,
          textDecoration: 'none',
          fontWeight: 600,
        }}
      >
        Back to home
      </a>
    </div>
  );
}
