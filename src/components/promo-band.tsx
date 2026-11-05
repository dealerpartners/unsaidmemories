import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

// PromoBand — the lavender promotional banner ("Built around the people who
// matter." / Explore collections). Replaces the old newsletter band on every
// page (per user instruction — 3rd request) and is also inserted every 8 cards
// in the shop product grid. Reuses the existing `.newsletter` container classes
// (lavender gradient + padding + grid) so no new CSS is needed.
export function PromoBand() {
  return (
    <section className="newsletter promo-band">
      <div className="newsletter-copy">
        <span className="eyebrow">UnSaid collections</span>
        <h2>Built around the people who matter.</h2>
        <p>Explore collections for your chosen family, day ones, and every connection in between.</p>
      </div>
      <div className="newsletter-form promo-band-cta">
        <Link className="button button-dark" href="/collections">
          Explore collections <ArrowUpRight size={16} />
        </Link>
      </div>
    </section>
  );
}
