import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Category } from "@/lib/supabase";

type CategoryCardProps = {
  category: Category;
  /** Slugs of all ancestor categories in order (top → bottom). */
  parentSlugs: string[];
  /** Direct product count in this category (not recursive). Optional. */
  productCount?: number;
  index?: number;
};

/**
 * Marketplace category card — used by /shop and every category page that has
 * child categories. Each card links to the category's own /shop/[...slugs]
 * route and shows a deterministic gradient placeholder + name + count.
 *
 * Reuses the existing `.department-card` style from globals.css as a base
 * so it sits comfortably inside the storefront design.
 */
export function CategoryCard({
  category,
  parentSlugs,
  productCount,
  index = 0,
}: CategoryCardProps) {
  const href = `/shop/${[...parentSlugs, category.slug].join("/")}`;
  // Deterministic gradient based on the slug so every category has a
  // consistent "thumbnail" without needing real images.
  const hue = Array.from(category.slug).reduce(
    (acc, ch) => acc + ch.charCodeAt(0),
    0,
  ) % 360;
  const gradient = `linear-gradient(135deg, hsl(${hue} 38% 78%), hsl(${(hue + 38) % 360} 42% 68%))`;

  return (
    <Link
      href={href}
      className="marketplace-cat-card"
      style={{ animationDelay: `${index * 60}ms` }}
      aria-label={`Browse ${category.name}`}
    >
      <div
        className="marketplace-cat-art"
        style={{ background: gradient }}
        aria-hidden="true"
      >
        <span className="marketplace-cat-glyph">
          {category.name.charAt(0).toUpperCase()}
        </span>
        <span className="marketplace-cat-arrow">
          <ArrowUpRight size={16} />
        </span>
      </div>
      <div className="marketplace-cat-body">
        <h3>{category.name}</h3>
        {category.description ? (
          <p>{category.description}</p>
        ) : null}
        <span className="marketplace-cat-meta">
          {typeof productCount === "number"
            ? `${productCount} product${productCount === 1 ? "" : "s"}`
            : "Browse"}
        </span>
      </div>
    </Link>
  );
}
