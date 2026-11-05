'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Gift, Copy, Check, CalendarDays, ShoppingBag, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// OffersSection — the portal dashboard's FIRST section (owner spec §4:
// fixed order — Offers above Appointments). Lists every published offer the
// logged-in user is eligible for (evaluated per user server-side). Each
// card: title + description, code with tap-to-copy, CTA (Book for grooming
// offers / Shop for product offers) deep-linking into the flow with the
// code pre-attached. Empty state: the section hides entirely.
// ============================================================================

type Offer = {
  id: string;
  name: string;
  code: string;
  kind: 'standard' | 'cause';
  description: string | null;
  finePrint: string | null;
  ctaLabel: string | null;
};

function OfferCard({ offer }: { offer: Offer }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(offer.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — the code is still readable/selectable
    }
  };

  // Grooming offers deep-link into the booking flow with the code
  // pre-attached; product offers head to the shop.
  const ctaHref = `/book/appointment?promo=${encodeURIComponent(offer.code)}`;
  const ctaLabel = offer.ctaLabel || 'Book';
  const isShopCta = /shop/i.test(ctaLabel);
  const finalHref = isShopCta ? `/shop?promo=${encodeURIComponent(offer.code)}` : ctaHref;

  return (
    <div
      className={cn(
        'flex flex-col justify-between gap-4 rounded-lg border p-4 transition-colors sm:flex-row sm:items-center',
        offer.kind === 'cause'
          ? 'border-pink-200 bg-pink-50/50 hover:border-pink-300'
          : 'border-neutral-200 bg-white hover:border-neutral-300',
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Tag className={cn('h-4 w-4 shrink-0', offer.kind === 'cause' ? 'text-pink-600' : 'text-gold-deep')} aria-hidden="true" />
          <p className="text-[14px] font-bold text-foreground">{offer.name}</p>
        </div>
        {offer.description && (
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{offer.description}</p>
        )}
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy promo code ${offer.code}`}
          className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-bold tracking-[0.08em] text-foreground ring-1 ring-neutral-200 transition-colors hover:ring-gold-deep"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-600" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
          {offer.code}
          {copied && <span className="font-semibold normal-case tracking-normal text-green-600">Copied</span>}
        </button>
        {offer.finePrint && (
          <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground/70">{offer.finePrint}</p>
        )}
      </div>
      <Link
        href={finalHref}
        className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-card px-5 text-[12px] font-bold uppercase tracking-[0.08em] text-brand-teal transition-colors hover:border-brand-teal/60 hover:bg-brand-teal/5"
      >
        {isShopCta ? <ShoppingBag className="h-4 w-4" aria-hidden="true" /> : <CalendarDays className="h-4 w-4" aria-hidden="true" />}
        {ctaLabel}
      </Link>
    </div>
  );
}

export function OffersSection() {
  const [offers, setOffers] = useState<Offer[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/promos/eligible?placement=portal', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { offers: [] }))
      .then((d) => {
        if (alive) setOffers(Array.isArray(d?.offers) ? d.offers : []);
      })
      .catch(() => {
        if (alive) setOffers([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Loading → nothing yet (the dashboard paints without a hole).
  if (offers === null) return null;

  // Empty state: the section hides entirely — no empty box above
  // Appointments (owner spec).
  if (offers.length === 0) return null;

  return (
    <section aria-labelledby="offers-heading" className="mb-8">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Gift className="h-5 w-5 text-gold-deep" aria-hidden="true" />
          <h2 id="offers-heading" className="text-[15px] font-bold text-foreground">
            Your offers
          </h2>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-gold-deep">
            {offers.length}
          </span>
        </div>
      </div>
      <div className="grid gap-3">
        {offers.map((o) => (
          <OfferCard key={o.id} offer={o} />
        ))}
      </div>
    </section>
  );
}
