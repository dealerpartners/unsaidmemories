import Link from "next/link";
import { notFound } from "next/navigation";
import ShopApp from "@/app/shop/shop-app";
import { CITY_SHOP_DATA, CITY_SLUGS } from "@/lib/city-shop-data";
import { fetchDbCollectionProducts } from "@/lib/db-collection";
import { fetchProductsForStaticPath } from "@/lib/static-catalog";
import { getCachedCategoryProducts } from "@/lib/catalog-cache";
import { findNodePathByName } from "@/lib/taxonomy";
import type { CatalogProduct } from "@/components/catalog-card";

const PER_PAGE = 32;

// /shop/city/<city>/<category> — the shop page for the category a city's
// guide boasts (owner, 2026-11-01: "Nashville has Kin Keeper — route to a
// Kin Keeper shop page for Nashville"). The guides' Explore <City> action
// lands here. Built for SEO: one real, product-carrying landing page per
// city × its boasted category.
export function generateStaticParams() {
  return CITY_SLUGS.flatMap((slug) => {
    const b = CITY_SHOP_DATA[slug].boasted;
    return b ? [{ slug, category: b.slug }] : [];
  });
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; category: string }> }) {
  const { slug, category } = await params;
  const city = CITY_SHOP_DATA[slug];
  if (!city || !city.boasted || city.boasted.slug !== category) return { title: "Shop — UnSaid" };
  return {
    title: `${city.boasted.name} Gifts in ${city.city}, ${city.state} | UnSaid`,
    description: `${city.boasted.name} in ${city.city}: ${city.spotCopy}`,
    alternates: { canonical: `https://www.unsaidmemories.com/shop/city/${slug}/${category}` },
  };
}

export default async function CityCategoryShopPage({ params }: { params: Promise<{ slug: string; category: string }> }) {
  const { slug, category } = await params;
  const city = CITY_SHOP_DATA[slug];
  if (!city || !city.boasted || city.boasted.slug !== category) notFound();
  const boasted = city.boasted;

  const seen = new Set<string>();
  const products: CatalogProduct[] = [];
  const push = (list: CatalogProduct[] | undefined | null) => {
    for (const p of list ?? []) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        products.push(p);
      }
    }
  };
  // 1) The boasted category's own collection, when it is a curated one.
  if (boasted.collection) {
    const db = await fetchDbCollectionProducts(boasted.collection).catch(() => null);
    push(db?.products);
  }
  // 2) The taxonomy node the category names, when one exists.
  if (products.length < PER_PAGE) {
    const chain = findNodePathByName(boasted.name);
    if (chain) {
      const { products: tax } = await fetchProductsForStaticPath(chain.map((n) => n.slug).join("/"), PER_PAGE - products.length, 0).catch(() => ({ products: [] as CatalogProduct[] }));
      push(tax);
    }
  }
  // 3) The wider catalog, so every city's page is a full shop.
  if (products.length < PER_PAGE) {
    const fill = await getCachedCategoryProducts("", PER_PAGE - products.length, 0).catch(() => null);
    push(fill?.products);
  }

  return (
    <main>
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "40px clamp(20px,4vw,56px) 8px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "#77748f" }}>
          {boasted.name} · {city.state}
        </div>
        <h1 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "clamp(38px,5.5vw,58px)", lineHeight: 1.05, margin: "10px 0 6px", color: "#211d3b" }}>
          {boasted.name} in {city.city}
        </h1>
        <p style={{ maxWidth: 720, fontSize: 16, lineHeight: 1.65, color: "#3c3852" }}>{city.spotCopy}</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "20px 0 8px" }}>
          <Link
            href={`/guides/${city.slug}`}
            style={{ background: "#211d3b", color: "#fff", padding: "12px 22px", fontSize: 12, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", borderRadius: 3, textDecoration: "none" }}
          >
            The {city.city} guide
          </Link>
          <Link
            href={`/shop/city/${city.slug}`}
            style={{ background: "#fff", color: "#211d3b", border: "1px solid #211d3b", padding: "11px 20px", fontSize: 12, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", borderRadius: 3, textDecoration: "none" }}
          >
            All of {city.city}&rsquo;s shop
          </Link>
          <a
            href={city.govUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ background: "#fff", color: "#211d3b", border: "1px solid #211d3b", padding: "11px 20px", fontSize: 12, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", borderRadius: 3, textDecoration: "none" }}
          >
            View the city ↗
          </a>
        </div>
      </section>
      <ShopApp slugs={[]} initialProducts={products} initialTotal={products.length} perPage={PER_PAGE} />
    </main>
  );
}
