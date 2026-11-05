'use client';

// ============================================================================
// PortalEmptyState — the designed empty state for the customer portal's
// My Account tree (spec §7.3: "Empty states are designed, not blank:
// headline + one-line explanation + one CTA").
//
// Every portal route in the owner's tree renders this shape until its real
// data surface comes online — same card, same rhythm, no dead ends.
// ============================================================================

import type { ReactNode } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

export function PortalEmptyState({
  icon: Icon,
  title,
  description,
  cta,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  cta?: { label: string; href: string };
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-10">
      <div className="flex flex-col items-center rounded-xl border border-ink/10 bg-white px-6 py-14 text-center shadow-[0_1px_2px_rgba(28,25,23,0.04)] sm:px-10">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-cream">
          <Icon className="h-6 w-6 text-gold-deep" aria-hidden="true" />
        </div>
        <h1
          className="mt-5 text-[26px] font-semibold leading-tight text-ink sm:text-[30px]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {title}
        </h1>
        <p className="mt-3 max-w-md text-[14px] leading-relaxed text-ink-soft">
          {description}
        </p>
        {cta && (
          <Link
            href={cta.href}
            className="mt-7 inline-flex h-11 items-center justify-center rounded-lg border border-border bg-white px-7 text-[12.5px] font-bold uppercase tracking-[0.1em] text-brand-teal transition-colors hover:border-brand-teal/60 hover:bg-secondary"
          >
            {cta.label}
          </Link>
        )}
        {children}
      </div>
    </div>
  );
}
