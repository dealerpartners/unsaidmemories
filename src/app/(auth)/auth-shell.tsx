import Link from "next/link";

/**
 * Two-column auth shell.
 * Left: brand panel (ink background, serif headline, gradient orb —
 * same aesthetic as the storefront hero/editorial sections).
 * Right: the form column (children).
 */
export function AuthShell({
  eyebrow,
  heading,
  sub,
  children,
}: {
  eyebrow: string;
  heading: React.ReactNode;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <main className="auth-wrap">
      {/* Left — brand */}
      <aside className="auth-brand">
        <div className="auth-orb auth-orb-one" />
        <div className="auth-orb auth-orb-two" />
        <Link href="/" className="auth-wordmark" aria-label="UnSaid home">
          un<span>said</span>
          <i>®</i>
        </Link>
        <div className="auth-brand-copy">
          <span className="eyebrow light">
            <span className="eyebrow-line" /> {eyebrow}
          </span>
          <h1>{heading}</h1>
          <p>{sub}</p>
        </div>
        <div className="auth-brand-foot">
          <span>Thoughtfully made for connection</span>
        </div>
      </aside>

      {/* Right — form */}
      <section className="auth-form-col">
        <div className="auth-form-inner">{children}</div>
      </section>
    </main>
  );
}
