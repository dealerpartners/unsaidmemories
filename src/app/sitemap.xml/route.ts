import { taxonomy, findNodePathByName, type TaxonomyNode } from "@/lib/taxonomy";
import { CITY_GUIDE_SLUGS } from "@/lib/city-guide-slugs";
import { CITY_SHOP_DATA, CITY_SLUGS } from "@/lib/city-shop-data";
import { sizeGuideCharts } from "@/lib/size-guides";
import { helpArticles, ourWorldArticles, relationships } from "@/lib/catalog";
import { createServerClient } from "@/lib/supabase";
import { productSlug } from "@/lib/product-slug";

// /sitemap.xml — the machine-readable map of the store, regenerated
// hourly. Static pages come from the app's own route data, shop pages
// from the real taxonomy, collections and products from the database
// (the same rows shoppers see). The human-readable version is /sitemap.
// Implemented as a route handler (not the app/sitemap.ts metadata
// convention) because the metadata file conflicts with the /sitemap
// page in the production build — that conflict failed three deploys
// on 2026-10-30 before it was caught.

const BASE = (process.env.NEXT_PUBLIC_SITE_URL || "https://unsaidmemories.com").replace(/\/$/, "");


type SitemapUrl = { url: string; lastModified?: Date; changeFrequency?: string; priority?: number };

function taxonomyUrls(): SitemapUrl[] {
  const urls: SitemapUrl[] = [];
  const walk = (node: TaxonomyNode, prefix: string) => {
    const path = prefix ? `${prefix}/${node.slug}` : node.slug;
    urls.push({ url: `${BASE}/shop/${path}`, changeFrequency: "weekly", priority: 0.7 });
    for (const child of node.children) walk(child, path);
  };
  for (const dept of taxonomy) walk(dept, "");
  return urls;
}

async function collectUrls(): Promise<SitemapUrl[]> {
  const now = new Date();
  const urls: SitemapUrl[] = [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/shop`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/departments`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${BASE}/signature`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${BASE}/relationships`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${BASE}/our-world`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
    { url: `${BASE}/help`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/sitemap`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE}/cart`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE}/account`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    // The owner's footer pages (top-level routes).
    ...[
      "how-it-works", "gift-finder", "guides-stories", "kinnectai", "our-story",
      "corporate-gifting", "funeral-homes", "senior-living", "schools-hospitals",
      "wedding-planners", "shipping-returns", "size-guide", "track-order", "contact",
    ].map((slug) => ({
      url: `${BASE}/${slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];

  // Relationship pages exist only where the taxonomy has a matching
  // child category — the lib/catalog list still describes "Ride or Die",
  // but no such category exists in the taxonomy or the DB, so its page
  // 404s. The human-readable /sitemap already filters the same way;
  // the XML sitemap must too, or it advertises a dead URL.
  const relationshipChain = findNodePathByName("Relationships");
  const relationshipSlugs = new Set(
    (relationshipChain?.[relationshipChain.length - 1]?.children ?? []).map((c) => c.slug),
  );
  for (const r of relationships) {
    if (!relationshipSlugs.has(r.slug)) continue;
    urls.push({ url: `${BASE}/relationships/${r.slug}`, changeFrequency: "weekly", priority: 0.6 });
  }
  for (const a of ourWorldArticles) {
    urls.push({ url: `${BASE}/our-world/${a.slug}`, changeFrequency: "monthly", priority: 0.5 });
  }
  for (const a of helpArticles) {
    urls.push({ url: `${BASE}/help/${a.slug}`, changeFrequency: "monthly", priority: 0.4 });
  }
  // Per-product size guides — one URL per chart (the owner's
  // department → category → product pattern, built for search).
  for (const c of sizeGuideCharts) {
    urls.push({ url: `${BASE}/size-guide/${c.slug}`, changeFrequency: "monthly", priority: 0.5 });
  }

  // City guides: 400 static pages in public/guides/, served at clean
  // /guides/{slug} URLs via next.config rewrites.
  urls.push({ url: `${BASE}/guides`, lastModified: now, changeFrequency: "weekly", priority: 0.6 });
  for (const slug of CITY_GUIDE_SLUGS) {
    urls.push({ url: `${BASE}/guides/${slug}`, changeFrequency: "monthly", priority: 0.6 });
  }

  // City shop pages: each city's shop hub plus the category page its
  // guide boasts — the SEO landing pages the guides' Explore action
  // routes to (owner, 2026-11-01).
  for (const slug of CITY_SLUGS) {
    urls.push({ url: `${BASE}/shop/city/${slug}`, changeFrequency: "weekly", priority: 0.6 });
    const boasted = CITY_SHOP_DATA[slug].boasted;
    if (boasted) {
      urls.push({ url: `${BASE}/shop/city/${slug}/${boasted.slug}`, changeFrequency: "weekly", priority: 0.7 });
    }
  }

  urls.push(...taxonomyUrls());

  const sb = createServerClient();

  const { data: collections } = await sb
    .from("collections")
    .select("slug")
    .order("name")
    .limit(200);
  for (const c of collections ?? []) {
    if (c.slug) urls.push({ url: `${BASE}/collections/${c.slug}`, changeFrequency: "weekly", priority: 0.7 });
  }

  // Every catalog product (the PDP table). Paged by 1,000 so the
  // whole catalog lands in the sitemap without one giant query.
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data: products, error } = await sb
      .from("supplier_catalog_products")
      .select("id, name, created_at")
      .eq("is_hidden", false)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error || !products?.length) break;
    for (const p of products) {
      urls.push({
        url: `${BASE}/product/${productSlug(String(p.name), String(p.id))}`,
        lastModified: p.created_at ? new Date(p.created_at) : now,
        changeFrequency: "weekly",
        priority: 0.5,
      });
    }
    if (products.length < PAGE) break;
  }

  return urls;
}

function esc(x: string): string {
  return x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function GET(): Promise<Response> {
  const urls = await collectUrls();
  const parts = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
  for (const u of urls) {
    parts.push("<url>");
    parts.push(`<loc>${esc(u.url)}</loc>`);
    if (u.lastModified) parts.push(`<lastmod>${u.lastModified.toISOString()}</lastmod>`);
    if (u.changeFrequency) parts.push(`<changefreq>${u.changeFrequency}</changefreq>`);
    if (u.priority != null) parts.push(`<priority>${u.priority.toFixed(1)}</priority>`);
    parts.push("</url>");
  }
  parts.push("</urlset>");
  return new Response(parts.join("\n"), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
