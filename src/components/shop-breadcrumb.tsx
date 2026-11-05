import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Category } from "@/lib/supabase";

type ShopBreadcrumbProps = {
  /** The full chain of ancestors PLUS the current category (current last). */
  trail: Category[];
};

/**
 * Breadcrumb trail for the marketplace: Home → Shop → ancestor → … → current.
 * The trail is the list returned by `fetchCategoryByPath` (ancestors) with
 * the current category appended by the page. Each crumb links to the slug
 * path up to that point so every step is one click away.
 */
export function ShopBreadcrumb({ trail }: ShopBreadcrumbProps) {
  const crumbs = [
    { label: "Home", href: "/" },
    { label: "Shop", href: "/shop" },
    ...trail.map((c, i) => {
      const slugs = trail.slice(0, i + 1).map((t) => t.slug);
      return {
        label: c.name,
        href: `/shop/${slugs.join("/")}`,
      };
    }),
  ];

  return (
    <nav className="shop-breadcrumb" aria-label="Breadcrumb">
      <ol>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={c.href} aria-current={last ? "page" : undefined}>
              {last ? (
                <span>{c.label}</span>
              ) : (
                <Link href={c.href}>{c.label}</Link>
              )}
              {!last && <ChevronRight size={12} aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
