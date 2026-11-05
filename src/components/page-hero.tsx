import Link from "next/link";
import { ArrowRight } from "lucide-react";

type PageHeroProps = {
  eyebrow?: string;
  title: string;
  titleEm?: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaHref?: string;
};

// Reusable compact hero for inner pages. Reuses the existing `.hero` class
// structure with a `.page-hero` modifier (defined in globals.css) so inner
// pages get a smaller, left-aligned editorial header without the full-bleed
// background image of the home hero.
export function PageHero({ eyebrow, title, titleEm, subtitle, ctaLabel, ctaHref }: PageHeroProps) {
  return (
    <section className="hero page-hero">
      <div className="hero-shade" />
      <div className="hero-copy">
        {eyebrow && (
          <div className="eyebrow light">
            <span className="eyebrow-line" /> {eyebrow}
          </div>
        )}
        <h1>
          {title}
          {titleEm && <em> {titleEm}</em>}
        </h1>
        {subtitle && <p>{subtitle}</p>}
        {ctaLabel && ctaHref && (
          <div className="hero-ctas">
            <Link className="button button-light" href={ctaHref}>
              {ctaLabel} <ArrowRight size={16} />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
