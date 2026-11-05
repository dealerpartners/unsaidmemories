import Link from "next/link";
import { MarketplaceCard, type MarketplaceCardData } from "@/components/marketplace-card";

/**
 * The category chips (filter strip) — copied verbatim from the mockup. Each
 * chip links to the matching top-level Supabase category page (or /marketplace
 * for "All products").
 */
const CHIPS: { label: string; href: string }[] = [
  { label: "All products", href: "/marketplace" },
  { label: "Apparel", href: "/marketplace/apparel" },
  { label: "Accessories", href: "/marketplace/accessories" },
  { label: "Drinkware", href: "/marketplace/drinkware" },
  { label: "Wall art", href: "/marketplace/wall-art-2" },
  { label: "Home & living", href: "/marketplace/home-and-living" },
  { label: "Keepsakes", href: "/marketplace/keepsakes" },
  { label: "Relationships", href: "/marketplace/relationships" },
  { label: "UnSaid Holidays", href: "/marketplace/unsaid-holidays" },
];

/**
 * Pagination UI — the mockup's exact .pagination markup, as server-rendered
 * Links. Shows up to 7 page numbers around the current page plus prev/next.
 */
function Pagination({
  page,
  pages,
  baseHref,
  query,
}: {
  page: number;
  pages: number;
  baseHref: string;
  query?: string;
}) {
  if (pages <= 1) return null;

  const pageHref = (n: number) => {
    const params = new URLSearchParams();
    if (n !== 1) params.set("page", String(n));
    if (query) params.set("q", query);
    const qs = params.toString();
    return qs ? `${baseHref}?${qs}` : baseHref;
  };

  // Build a window of page numbers: show first, last, and a window around current.
  const nums: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(pages, page + 2);
  if (start > 1) nums.push(1);
  if (start > 2) nums.push(-1); // ellipsis
  for (let i = start; i <= end; i++) nums.push(i);
  if (end < pages - 1) nums.push(-1);
  if (end < pages) nums.push(pages);

  return (
    <div className="pagination">
      {page > 1 ? (
        <Link className="page" href={pageHref(page - 1)}>
          ←
        </Link>
      ) : (
        <button className="page" disabled aria-disabled>
          ←
        </button>
      )}
      {nums.map((n, i) =>
        n === -1 ? (
          <span key={`e${i}`} className="page" aria-hidden style={{ border: "none", background: "transparent" }}>
            …
          </span>
        ) : (
          <Link
            key={n}
            className={`page ${n === page ? "active" : ""}`}
            href={pageHref(n)}
          >
            {n}
          </Link>
        ),
      )}
      {page < pages ? (
        <Link className="page" href={pageHref(page + 1)}>
          NEXT →
        </Link>
      ) : (
        <button className="page" disabled aria-disabled>
          NEXT →
        </button>
      )}
    </div>
  );
}

/**
 * Shared marketplace listing — the mockup's chips + listing-toolbar + grid +
 * pagination + ad-banner + footer. Rendered by both the landing and the
 * category catch-all.
 */
export function MarketplaceListing({
  title,
  resultMeta,
  cards,
  page,
  perPage,
  total,
  baseHref,
  query,
  activeChipHref,
}: {
  title: string;
  resultMeta: string;
  cards: MarketplaceCardData[];
  page: number;
  perPage: number;
  total: number;
  baseHref: string;
  query?: string;
  activeChipHref?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / perPage));

  return (
    <>
      <div className="category-strip" id="chips">
        {CHIPS.map((chip) => (
          <Link
            key={chip.href}
            className={`chip ${
              (activeChipHref ?? "/marketplace") === chip.href ? "active" : ""
            }`}
            href={chip.href}
          >
            {chip.label}
          </Link>
        ))}
      </div>

      <div className="listing-toolbar" id="products">
        <div>
          <h2 className="serif">{title}</h2>
          <div className="listing-meta">{resultMeta}</div>
        </div>
        <div className="toolbar-right">
          <button className="filter-button" type="button">
            ☷ &nbsp; Filters
          </button>
          <select className="sort-select" aria-label="Sort products" defaultValue="featured">
            <option value="featured">Sort by: Featured</option>
            <option value="low">Price: Low to high</option>
            <option value="high">Price: High to low</option>
            <option value="name">Name: A to Z</option>
          </select>
        </div>
      </div>

      {cards.length > 0 ? (
        <div className="grid" id="productGrid">
          {cards.map((c) => (
            <MarketplaceCard key={c.id} product={c} />
          ))}
        </div>
      ) : (
        <div
          style={{ gridColumn: "1 / -1", padding: 70, textAlign: "center" }}
        >
          <h3 className="serif">No products found</h3>
          <p style={{ color: "var(--muted)" }}>
            Try a different search or category.
          </p>
          <Link className="page" href="/marketplace">
            Show all products
          </Link>
        </div>
      )}

      <Pagination
        page={page}
        pages={pages}
        baseHref={baseHref}
        query={query}
      />

      <section className="ad-banner">
        <div>
          <h3 className="serif">Built around the people who matter.</h3>
          <p>
            Explore collections for your chosen family, day ones, and every
            connection in between.
          </p>
        </div>
        <Link href="/relationships">EXPLORE COLLECTIONS ↗</Link>
      </section>

      <footer className="footer">
        <span>© 2026 UNSAID MARKETPLACE</span>
        <span>PRODUCTS · COLLECTIONS · MEANING</span>
        <span>SUPPORT &nbsp; / &nbsp; SHIPPING &nbsp; / &nbsp; RETURNS</span>
      </footer>
    </>
  );
}
