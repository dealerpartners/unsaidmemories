import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ProductWithPricing } from "@/lib/supabase";

type MarketplaceProductCardProps = {
  product: ProductWithPricing;
  index?: number;
};

function formatPrice(value: number) {
  return `$${value.toFixed(2)}`;
}

/**
 * Marketplace product card — works with the Supabase `Product` type
 * augmented with pricing (see `ProductWithPricing` in `src/lib/supabase.ts`).
 *
 * The Supabase products table has no image column yet, so this card renders
 * a deterministic gradient placeholder built from the product slug. When a
 * real image URL becomes available, swap the gradient for an <img>.
 *
 * Reuses the existing `.product-card`, `.product-image-wrap`,
 * `.product-details`, `.product-category`, `.product-price` classes from
 * globals.css so it sits inside the storefront design without a separate
 * stylesheet.
 */
export function MarketplaceProductCard({
  product,
  index = 0,
}: MarketplaceProductCardProps) {
  // Deterministic gradient based on the product slug — gives every card a
  // distinct, stable "thumbnail" until real images are wired up.
  const hue = Array.from(product.slug || product.name).reduce(
    (acc, ch) => acc + ch.charCodeAt(0),
    0,
  ) % 360;
  const gradient = `linear-gradient(135deg, hsl(${hue} 36% 80%), hsl(${(hue + 42) % 360} 40% 70%))`;

  const priceLabel = product.minPrice != null
    ? formatPrice(product.minPrice)
    : "Price TBD";

  return (
    <article
      className="product-card marketplace-product-card"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="product-image-wrap">
        <Link
          href={`/shop?focus=${encodeURIComponent(product.id)}`}
          className="product-image-link marketplace-product-media"
          aria-label={`View ${product.name}`}
          style={{ background: gradient }}
        >
          <span className="marketplace-product-glyph" aria-hidden="true">
            {product.name.charAt(0).toUpperCase()}
          </span>
          <span className="marketplace-product-name-mark">
            {product.name}
          </span>
        </Link>
        {product.compareAtPrice != null && product.minPrice != null && product.compareAtPrice > product.minPrice ? (
          <span className="product-badge">Sale</span>
        ) : null}
      </div>
      <div className="product-details">
        <div>
          <span className="product-category">UnSaid edit</span>
          <h3>{product.name}</h3>
        </div>
        <span className="product-price">{priceLabel}</span>
      </div>
      {product.description ? (
        <p className="marketplace-product-desc">{product.description}</p>
      ) : null}
      <div className="marketplace-product-cta">
        <Link href={`/shop?focus=${encodeURIComponent(product.id)}`}>
          View <ArrowRight size={13} />
        </Link>
      </div>
    </article>
  );
}
