import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BRAND_ASIDE, type BrandPageData } from "@/lib/brand-pages";

/**
 * BrandPage — the shared shell of the owner's fifteen footer pages,
 * ported into the storefront's design system (app tokens: --ink,
 * --lilac, --accent, Georgia serif). Mirrors his HTML structure:
 * split hero with art card + floating notes → intro → numbered/tagged
 * tile grid → dark point-of-view statement band. Page-specific blocks
 * (size charts, the track-order lookup, the contact form, the FAQ
 * accordion) slot in via `children` between the tiles and the
 * statement.
 */
export function BrandPage({
  page,
  children,
}: {
  page: BrandPageData;
  children?: React.ReactNode;
}) {
  return (
    <main className="brand-main">
      <section className="brand-hero">
        <div className="brand-hero-copy">
          <div className="eyebrow">{page.eyebrow}</div>
          <h1>
            {page.h1} <em>{page.h1Em}</em>
          </h1>
          <p>{page.heroCopy}</p>
          <Link className="button button-dark" href={page.cta.href}>
            {page.cta.label} <ArrowRight size={15} />
          </Link>
        </div>
        <div className="brand-hero-art" aria-hidden="true">
          <div className="brand-orbit" />
          <div className="brand-art-card">
            <div className="brand-art-icon">{page.art.icon}</div>
            <strong>{page.art.title}</strong>
            <span>
              UNSAID MEMORIES <b>·</b> KEEP WHAT MATTERS
            </span>
          </div>
          <div className="brand-float brand-float-a">
            <small>THE LITTLE THINGS</small>
            Hold onto what matters
          </div>
          <div className="brand-float brand-float-b">
            <small>THE BIGGER STORY</small>
            Make meaning shareable
          </div>
        </div>
      </section>

      <section className="brand-intro">
        <div>
          <div className="eyebrow">A THOUGHTFUL PLACE TO BEGIN</div>
          <h2>{page.introTitle}</h2>
        </div>
        <div className="brand-intro-copy">
          {page.introParas.map((para, i) =>
            para.startsWith("Keep the object. Keep the story.") ? (
              <p key={i}>
                <strong>Keep the object. Keep the story.</strong>
                {para.replace("Keep the object. Keep the story.", "")}
              </p>
            ) : (
              <p key={i}>{para}</p>
            ),
          )}
        </div>
      </section>

      {page.tiles.length > 0 && (
        <section className="brand-content">
          <div className="brand-section-head">
            <div>
              <div className="eyebrow">EXPLORE THE DETAILS</div>
              <h2>{page.sectionTitle}</h2>
            </div>
            <p>{BRAND_ASIDE}</p>
          </div>
          <div className="brand-grid">
            {page.tiles.map((tile) => (
              <article className="brand-tile" key={tile.title}>
                <span className="brand-tile-tag">{tile.tag}</span>
                <h3>{tile.title}</h3>
                <p>{tile.body}</p>
                {tile.foot && <small>{tile.foot}</small>}
              </article>
            ))}
          </div>
        </section>
      )}

      {children}

      <section className="brand-statement">
        <div className="brand-statement-inner">
          <div>
            <div className="eyebrow brand-eyebrow-light">THE UNSAID MEMORIES POINT OF VIEW</div>
            <h2>{page.statement.title}</h2>
          </div>
          <div>
            <p>{page.statement.body}</p>
            <Link className="button button-light" href={page.statement.ctaHref}>
              {page.statement.ctaLabel} <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
