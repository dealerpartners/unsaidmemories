import Link from "next/link";
import { notFound } from "next/navigation";
import ShopApp from "@/app/shop/shop-app";
import { CITY_SHOP_DATA, CITY_SLUGS } from "@/lib/city-shop-data";
import { fetchDbCollectionProducts } from "@/lib/db-collection";
import { getCachedCategoryProducts } from "@/lib/catalog-cache";
import type { CatalogProduct } from "@/components/catalog-card";

const PER_PAGE = 32;

// The named collections a city's guide calls out, mapped to their real
// shop collections. Anything else a pill names falls back to the shop.
const PILL_COLLECTIONS: Record<string, string> = {
  "Kin Keeper": "kin-keeper-month",
  "Family by Choice": "family-by-choice",
};

export function generateStaticParams() {
  return CITY_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const city = CITY_SHOP_DATA[slug];
  if (!city) return { title: "City Shop — UnSaid" };
  return {
    title: `Shop ${city.city}, ${city.state} — UnSaid`,
    description: `Shop the ${city.city} collection: ${city.tagline}`,
  };
}

export default async function CityShopPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const city = CITY_SHOP_DATA[slug];
  if (!city) notFound();

  // Real products, city first: the collections this city's guide names,
  // then the wider catalog so the page is a full shop for every city.
  const seen = new Set<string>();
  const products: CatalogProduct[] = [];
  const namedSlugs = new Set<string>();
  for (const card of city.cards) {
    for (const pill of card.pills) {
      const col = PILL_COLLECTIONS[pill];
      if (col) namedSlugs.add(col);
    }
  }
  for (const col of namedSlugs) {
    const db = await fetchDbCollectionProducts(col).catch(() => null);
    for (const p of db?.products ?? []) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        products.push(p);
      }
    }
  }
  if (products.length < PER_PAGE) {
    const fill = await getCachedCategoryProducts("", PER_PAGE - products.length, 0).catch(() => null);
    for (const p of fill?.products ?? []) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        products.push(p);
      }
    }
  }

  return (
    <main>
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "40px clamp(20px,4vw,56px) 8px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "#77748f" }}>
          City Shop · {city.state}
        </div>
        <h1 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "clamp(40px,6vw,64px)", lineHeight: 1.05, margin: "10px 0 6px", color: "#211d3b" }}>
          Shop {city.city}
        </h1>
        <p style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic", fontSize: 20, color: "#55516e", margin: "0 0 14px" }}>
          {city.tagline}
        </p>
        <p style={{ maxWidth: 720, fontSize: 16, lineHeight: 1.65, color: "#3c3852" }}>{city.intro}</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "20px 0 8px" }}>
          <a
            href={city.govUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ background: "#fff", color: "#211d3b", border: "1px solid #211d3b", padding: "11px 20px", fontSize: 12, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", borderRadius: 3, textDecoration: "none" }}
          >
            View the city ↗
          </a>
          <Link
            href={`/guides/${city.slug}`}
            style={{ background: "#211d3b", color: "#fff", padding: "12px 22px", fontSize: 12, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", borderRadius: 3, textDecoration: "none" }}
          >
            Read the {city.city} guide
          </Link>
        </div>
      </section>

      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "16px clamp(20px,4vw,56px) 0", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 }}>
        {city.cards.map((card) => (
          <article key={card.title} style={{ border: "1px solid #e9e5f5", borderRadius: 6, padding: 20, background: "#fff" }}>
            <h2 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 22, margin: "0 0 8px", color: "#211d3b" }}>{card.title}</h2>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: "#3c3852", margin: "0 0 12px" }}>{card.text}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {card.pills.map((pill) => {
                const col = PILL_COLLECTIONS[pill];
                return (
                  <Link
                    key={pill}
                    href={col ? `/collections/${col}` : "/shop"}
                    style={{ background: "#f0edff", color: "#211d3b", padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, textDecoration: "none" }}
                  >
                    {pill}
                  </Link>
                );
              })}
            </div>
          </article>
        ))}
      </section>

      <ShopApp slugs={[]} initialProducts={products} initialTotal={products.length} perPage={PER_PAGE} />
    </main>
  );
}
