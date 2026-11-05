import ShopApp from "@/app/shop/shop-app";
import { findNodePathByName } from "@/lib/taxonomy";
import { fetchProductsForStaticPath } from "@/lib/static-catalog";
import { fetchDbCollectionProducts, fetchCollectionName } from "@/lib/db-collection";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

const PER_PAGE = 32;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const chain = findNodePathByName("Relationships");
  const relNode = chain?.[chain.length - 1];
  const child = relNode?.children.find(
    (c) => c.slug === slug || c.name.toLowerCase().replace(/\s+/g, "-") === slug,
  );
  if (child) return { title: `${child.name} — UnSaid` };
  const name = await fetchCollectionName(slug);
  return { title: name ? `${name} — UnSaid` : "Relationships — UnSaid" };
}

export default async function RelationshipDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  let slug = rawSlug;
  try {
    slug = decodeURIComponent(rawSlug);
  } catch {
    /* keep raw */
  }

  // "Relationships" is nested under Collections & Occasions — resolve
  // the full chain (the old top-level find() missed it and 404'd every
  // relationship page) and render that category's real products.
  const chain = findNodePathByName("Relationships");
  if (!chain) notFound();
  const relNode = chain[chain.length - 1];

  const child = relNode.children.find(
    (c) => c.slug === slug || c.name.toLowerCase().replace(/\s+/g, "-") === slug,
  );
  if (!child) {
    // Not a taxonomy child — the current relationship pages (A Little
    // Encouragement, I See You, Thank You for Showing Up, Ride or Die)
    // live as curated DB collections; render their real members
    // instead of 404ing (menu audit 2026-11-01: 4 relationship 404s).
    const db = await fetchDbCollectionProducts(slug);
    if (db) {
      return (
        <ShopApp
          slugs={[]}
          title={db.name}
          initialProducts={db.products}
          initialTotal={db.total}
          perPage={PER_PAGE}
        />
      );
    }
    notFound();
  }

  const slugs = [...chain.map((n) => n.slug), child.slug];
  // Static-path resolver (as /shop + /api/products): relationship
  // membership lives in product_taxonomy_links, which only that
  // resolver merges; the legacy category fetch rendered these empty.
  const { products, total } = await fetchProductsForStaticPath(slugs.join("/"), PER_PAGE, 0);
  return (
    <ShopApp
      slugs={slugs}
      title={child.name}
      initialProducts={products}
      initialTotal={total}
      perPage={PER_PAGE}
    />
  );
}

export async function generateStaticParams() {
  const chain = findNodePathByName("Relationships");
  const relNode = chain?.[chain.length - 1];
  return (relNode?.children ?? []).map((c) => ({ slug: c.slug }));
}
