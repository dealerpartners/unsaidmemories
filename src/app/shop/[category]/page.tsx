/**
 * /shop/<single segment> — department & top-level category pages.
 *
 * A single-segment shop address is just a depth-1 category path, so
 * this route delegates to the [...slug] category page, which
 * resolves the store's own category tree (generated from the
 * `categories` table) and renders the live catalog through ShopApp.
 * Slugs that are not categories 404 from that page.
 *
 * The demo-era slugs from lib/catalog are folded into their real
 * homes — existing URLs never die: the three old department slugs
 * and six old category slugs redirect to the department that
 * carries their products today.
 */

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import SlugPage from "../[...slug]/page";
import { findCategoryByPath } from "@/lib/taxonomy";

export const dynamic = "force-dynamic";

const LEGACY_ALIASES: Record<string, string> = {
  // Old lib/catalog departments → taxonomy departments.
  "home-living": "home-and-living",
  "gifts-objects": "keepsakes",
  // Old lib/catalog categories → the department carrying them now.
  "everyday-essentials": "apparel",
  "fleece-layers": "apparel",
  "objects-with-meaning": "keepsakes",
  "bags-carry": "accessories",
  "home-keepsakes": "home-and-living",
};

type Props = {
  params: Promise<{ category: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category: raw } = await params;
  let slug = raw;
  try {
    slug = decodeURIComponent(raw);
  } catch {
    /* keep raw */
  }
  const found = findCategoryByPath([slug]);
  return { title: found ? `${found.node.name} — UnSaid Shop` : "Shop — UnSaid" };
}

export default async function ShopSingleSegmentPage({ params, searchParams }: Props) {
  const { category: raw } = await params;
  let slug = raw;
  try {
    slug = decodeURIComponent(raw);
  } catch {
    /* keep raw */
  }

  const alias = LEGACY_ALIASES[slug];
  if (alias) redirect(`/shop/${alias}`);

  return SlugPage({
    params: Promise.resolve({ slug: [slug] }),
    searchParams,
  });
}
