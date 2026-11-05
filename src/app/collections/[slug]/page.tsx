import ShopApp from "@/app/shop/shop-app";
import { findNodePathByName } from "@/lib/taxonomy";
import { fetchProductsForStaticPath } from "@/lib/static-catalog";
import { fetchDbCollectionProducts, fetchCollectionName } from "@/lib/db-collection";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

const PER_PAGE = 32;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  for (const nodeName of ["UnSaid Holidays", "Collections"]) {
    const chain = findNodePathByName(nodeName);
    const node = chain?.[chain.length - 1];
    const child = node?.children.find((c) => c.slug === slug);
    if (child) return { title: `${child.name} — UnSaid` };
  }
  const name = await fetchCollectionName(slug);
  return { title: name ? `${name} — UnSaid` : "Collections — UnSaid" };
}

async function renderCollection(slugs: string[], title: string) {
  // Taxonomy-chain collections resolve through the static-path resolver
  // (the same cached fetch /shop and /api/products use for this path):
  // collection membership lives in product_taxonomy_links, which only
  // that resolver merges — the legacy category fetch cannot see it, so
  // these pages rendered empty despite the membership existing.
  const { products, total } = await fetchProductsForStaticPath(slugs.join("/"), PER_PAGE, 0);
  return (
    <ShopApp
      slugs={slugs}
      title={title}
      initialProducts={products}
      initialTotal={total}
      perPage={PER_PAGE}
    />
  );
}

/** Curated DB collections that are not taxonomy categories (e.g. Kin
 *  Score, slug "kin-score") — render their real member products from
 *  product_collections instead of 404ing. Membership references the
 *  canonical products table; the shared fetcher resolves each member
 *  from the owner's published line (variants + publication mockups)
 *  or the supplier catalog. */
async function renderDbCollection(slug: string) {
  const db = await fetchDbCollectionProducts(slug);
  if (!db) return null;
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

export default async function CollectionDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  let slug = rawSlug;
  try {
    slug = decodeURIComponent(rawSlug);
  } catch {
    /* keep raw */
  }

  // Taxonomy collections — "UnSaid Holidays" and the Home & Living
  // "Collections" node are both nested below department level; the
  // old top-level find() missed them and every collection page 404'd.
  // /collections/day-ones → Collections & Occasions > UnSaid Holidays > Day Ones
  for (const nodeName of ["UnSaid Holidays", "Collections"]) {
    const chain = findNodePathByName(nodeName);
    const node = chain?.[chain.length - 1];
    const child = node?.children.find((c) => c.slug === slug);
    if (chain && child) {
      return renderCollection([...chain.map((n) => n.slug), child.slug], child.name);
    }
  }

  // Curated DB collections (Kin Score & friends).
  const dbPage = await renderDbCollection(slug);
  if (dbPage) return dbPage;

  notFound();
}

export async function generateStaticParams() {
  const params: { slug: string }[] = [];
  for (const nodeName of ["UnSaid Holidays", "Collections"]) {
    const chain = findNodePathByName(nodeName);
    const node = chain?.[chain.length - 1];
    for (const c of node?.children ?? []) params.push({ slug: c.slug });
  }
  return params;
}
