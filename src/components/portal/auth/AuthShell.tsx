import Image from 'next/image';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';

// ============================================================================
// AuthShell — the DUMB door layout (the owner's imported Serviceportals
// design, verbatim visuals): full-bleed salon image on the left, the auth
// column on the right, the minimalist salon footer below.
//
// It carries ZERO role logic and zero branching: each of the five doors
// (/access-customer, /employee, /access-seller, /admin-login,
// /learn/sign-in) is its OWN page that composes this shell with its own
// badge, title, subtitle and forms — the route IS the identity.
// ============================================================================

interface AuthShellProps {
  /** Small pill above the title, e.g. "SALON TEAM". Omit for the customer door. */
  badge?: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

export function AuthShell({ badge, title, subtitle, children }: AuthShellProps) {
  return (
    <div className="w-full min-h-screen bg-black flex flex-col antialiased selection:bg-warning/100 selection:text-white">
      <main className="w-full grid grid-cols-1 lg:grid-cols-2 bg-black flex-1">
        {/* LEFT HALF: full image in natural flow */}
        <section
          aria-label="UnSaid Memories Presentation"
          className="w-full bg-black flex flex-col items-center justify-start select-none"
        >
          <div className="w-full bg-black flex items-center justify-center">
            <Image
              src="/assets/auth_image.png_2K_202609060354.jpeg"
              alt="UnSaid Memories - Luxury Grooming Salon"
              width={1000}
              height={1400}
              priority
              className="w-full h-auto object-contain block"
              referrerPolicy="no-referrer"
            />
          </div>
        </section>

        {/* RIGHT HALF: this door's authentication column. WHITE — owner
            directive 2026-10-22: "why are the login pages tan or brown."
            The old bg-card carried the retired salon cream (#f9f7f2). Skin
            only — the auth logic inside is untouched.
            2026-10-20 redo: the column is scoped `.portal-theme` — the
            current portal design tokens (white card, ink foreground,
            teal primary/ring, neutral muted + hairline borders). The
            doors sit at the app root, where :root still resolves the
            retired warm salon palette; without this scope the form
            inputs, badge, divider and recovery modal rendered in that
            cream. The black image panel + footer keep their explicit
            black (a current brand surface). */}
        <section
          aria-label={`${title} sign in`}
          className="portal-theme bg-white flex flex-col items-center justify-center p-6 sm:p-12 lg:p-16 min-h-[500px]"
        >
          <div className="w-full max-w-[360px] flex flex-col my-auto py-8">
            <div className="text-center mb-6">
              {badge && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-secondary text-primary border border-border rounded-full text-[10px] font-semibold tracking-wider uppercase mb-2">
                  <ShieldCheck className="w-3.5 h-3.5" /> {badge}
                </div>
              )}
              <h1 className="text-2xl sm:text-[26px] font-serif tracking-[0.14em] text-foreground uppercase font-normal">
                {title}
              </h1>
              <p className="text-[12px] text-muted-foreground/70 font-light mt-1 leading-relaxed">
                {subtitle}
              </p>
            </div>

            {children}
          </div>
        </section>
      </main>

      {/* MINIMALIST SALON FOOTER */}
      <footer className="w-full bg-black border-t border-border text-muted-foreground py-4 px-6 sm:px-10">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] tracking-wide">
          <div className="flex items-center gap-2 text-muted-foreground/70">
            <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
              UNSAID MEMORIES
            </span>
            <span>·</span>
            <span>© {new Date().getFullYear()}</span>
          </div>

          <div className="flex items-center gap-5 text-muted-foreground/70">
            <Link href="/access-customer" className="hover:text-white transition cursor-pointer">
              Customer
            </Link>
            <Link href="/employee" className="hover:text-white transition cursor-pointer">
              Employee
            </Link>
            <Link href="/access-seller" className="hover:text-white transition cursor-pointer">
              Seller
            </Link>
            <Link href="/learn/sign-in" className="hover:text-white transition cursor-pointer">
              Learn
            </Link>
            <span className="text-foreground">|</span>
            <Link href="/admin-login" className="hover:text-white transition cursor-pointer">
              Admin
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** The error banner every door renders above its forms (dumb). */
export function DoorErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-2.5 text-xs text-destructive">
      <AlertCircleIcon />
      <span className="leading-snug">{message}</span>
    </div>
  );
}

/** Inline icon — kept local so AuthShell stays a server component. */
function AlertCircleIcon() {
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

/** The per-door hint line under the Google button (dumb). */
export function DoorHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-center text-[11px] text-muted-foreground/80 mb-5 leading-relaxed">{children}</p>
  );
}

/** The "or with email" divider (dumb). */
export function DoorDivider() {
  return (
    <div className="relative flex items-center justify-center mb-5">
      <div className="border-t border-border w-full" />
      <span className="bg-card px-3 text-[11px] text-muted-foreground/70 uppercase tracking-wider">
        Or with email
      </span>
      <div className="border-t border-border w-full" />
    </div>
  );
}
