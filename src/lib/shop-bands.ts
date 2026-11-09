import { unstable_cache } from "next/cache";
import { createServerClient } from "@/lib/supabase";
import { getCachedCategoryProducts } from "@/lib/catalog-cache";

/**
 * shop-bands — data for the two editorial bands above the footer on
 * every shop page (owner's reference: notes/shop-feature-bands-
 * reference.png). Every card routes to a real page:
 *  - the four named collections are taxonomy categories AND curated
 *    DB collections — they render at /collections/<slug>;
 *  - "Seasonal edits" / "Celebration moments" / "New season, new
 *    meaning" have no collection page of their own, so they route to
 *    the closest real taxonomy pages (Holiday Season, the UnSaid
 *    Holidays grouping, New Apparel Variants) and Gift-ready bundles
 *    to the real Bundles category;
 *  - relationships route to /relationships/<slug> ("The ones who
 *    guide us" is the grouping card — it routes to /relationships).
 * Images are real catalogue imagery only: a collection's own first
 * product (product_collections) or the first product of the card's
 * category. Where a category has no imaged product, image is null
 * and the card renders its lilac placeholder — never a stock photo.
 */

export interface BandCard {
  label: string;
  href: string;
  image: string | null;
  badge?: string;
  icon?: "heart" | "users" | "heart-handshake" | "star" | "graduation-cap";
}

export interface ShopBandsData {
  collections: BandCard[];
  relationships: BandCard[];
  feelings: { label: string; href: string }[];
}

const HOLIDAYS = "collections-and-occasions/unsaid-holidays";
const COLLECTIONS = "collections-and-occasions/collections";
const RELATIONSHIPS = "collections-and-occasions/relationships";

async function categoryImage(path: string): Promise<string | null> {
  const { products } = await getCachedCategoryProducts(path, 8, 0);
  return products.find((p) => p.image)?.image ?? null;
}

async function collectionImage(slug: string): Promise<string | null> {
  const sb = createServerClient();
  const { data: col } = await sb.from("collections").select("id").eq("slug", slug).maybeSingle();
  if (!col) return null;
  const { data: links } = await sb
    .from("product_collections")
    .select("product_id")
    .eq("collection_id", col.id)
    .limit(24);
  const ids = (links ?? []).map((l) => String(l.product_id));
  if (!ids.length) return null;
  const { data: rows } = await sb
    .from("supplier_catalog_products")
    .select("image_url, images")
    .eq("is_hidden", false)
    .in("id", ids);
  for (const r of rows ?? []) {
    const img = (r.image_url as string | null) || (r.images as string[] | null)?.[0];
    if (img) return img;
  }
  return null;
}

/**
 * Last-resort imagery: a keyword-matched product from the live
 * catalogue. Several of the owner's collections/relationships are
 * named in the taxonomy and the collections table but hold no imaged
 * products yet (their categories measure 0 products in the DB), so a
 * card's own imagery often does not exist. Rather than hotlink stock
 * or leave every card blank, the card borrows the first imaged
 * catalogue product matching its own words — real catalogue imagery,
 * disclosed here and in the build report. No match → the card keeps
 * its lilac placeholder.
 */
async function keywordImage(keywords: string[]): Promise<string | null> {
  const sb = createServerClient();
  for (const kw of keywords) {
    // No image_url filter: much of the catalogue carries its photo in
    // images[0] with image_url null — take the first row that has
    // either (same precedence as the shop cards).
    const { data } = await sb
      .from("supplier_catalog_products")
      .select("image_url, images")
      .eq("is_hidden", false)
      .ilike("name", `%${kw}%`)
      .order("created_at", { ascending: false })
      .limit(12);
    for (const r of data ?? []) {
      const img = (r.image_url as string | null) || (r.images as string[] | null)?.[0];
      if (img) return img;
    }
  }
  return null;
}

/** Imagery of a published studio design's base product (the Kin
 *  Keeper Tee's garment photo) — the brand's own product imagery for
 *  the cards named after that design. */
async function designImage(namePattern: string): Promise<string | null> {
  const sb = createServerClient();
  const { data: designs } = await sb
    .from("designs")
    .select("supplier_catalog_product_id")
    .ilike("name", `%${namePattern}%`)
    .eq("status", "published")
    .not("supplier_catalog_product_id", "is", null)
    .limit(4);
  const ids = [...new Set((designs ?? []).map((d) => String(d.supplier_catalog_product_id)))];
  if (!ids.length) return null;
  const { data: rows } = await sb
    .from("supplier_catalog_products")
    .select("image_url, images")
    .eq("is_hidden", false)
    .in("id", ids);
  for (const r of rows ?? []) {
    const img = (r.image_url as string | null) || (r.images as string[] | null)?.[0];
    if (img) return img;
  }
  return null;
}

async function collectionCard(
  label: string,
  slug: string,
  keywords: string[],
): Promise<BandCard> {
  const image =
    (await collectionImage(slug)) ??
    (await categoryImage(`${HOLIDAYS}/${slug}`)) ??
    (await keywordImage(keywords));
  return { label, href: `/collections/${slug}`, image };
}

export const getShopBands = unstable_cache(
  async (): Promise<ShopBandsData> => {
    const [
      kinKeeper,
      familyByChoice,
      justBecause,
      dayOnes,
      seasonal,
      unsaidHolidays,
      celebration,
      newSeason,
      bundles,
      relKin,
      relBestie,
      relChosen,
      relCaregiver,
      relGuide,
      relMentor,
      relGodparent,
      relSister,
    ] = await Promise.all([
      collectionCard("Kin Keeper Month", "kin-keeper-month", ["kin keeper"]),
      collectionCard("Family by Choice", "family-by-choice", ["family"]),
      collectionCard("Just Because", "just-because", ["just because", "love"]),
      collectionCard("Day Ones", "day-ones", ["day ones", "friend"]),
      categoryImage(`${COLLECTIONS}/holiday-season`),
      collectionCard("UnSaid Holidays", "all-unsaid-holidays", ["holiday", "christmas"]),
      categoryImage(HOLIDAYS),
      categoryImage(`${COLLECTIONS}/new-apparel-variants`),
      categoryImage("keepsakes/bundles"),
      categoryImage(`${RELATIONSHIPS}/kin-keeper`),
      categoryImage(`${RELATIONSHIPS}/work-bestie`),
      categoryImage(`${RELATIONSHIPS}/chosen-family`),
      categoryImage(`${RELATIONSHIPS}/caregiver`),
      categoryImage(RELATIONSHIPS),
      categoryImage(`${RELATIONSHIPS}/mentor`),
      categoryImage(`${RELATIONSHIPS}/godparent`),
      categoryImage(`${RELATIONSHIPS}/sister-friend`),
    ]);

    // Keyword fallbacks for cards whose own category holds no imaged
    // product yet (see keywordImage).
    const seasonalImg = seasonal ?? (await keywordImage(["christmas", "holiday"]));
    const celebrationImg = celebration ?? (await keywordImage(["celebration", "anniversary", "party"]));
    const newSeasonImg = newSeason ?? (await keywordImage(["spring", "floral"]));
    const bundlesImg = bundles ?? (await keywordImage(["bundle", "gift set"]));
    const relKinImg =
      relKin ?? (await keywordImage(["kin keeper"])) ?? (await designImage("kin keeper"));
    const kinKeeperMonthImg =
      kinKeeper.image ?? (await designImage("kin keeper"));  
    const relBestieImg = relBestie ?? (await keywordImage(["bestie", "work"]));
    const relChosenImg = relChosen ?? (await keywordImage(["family"]));
    const relCaregiverImg = relCaregiver ?? (await keywordImage(["caregiver", "nurse"]));
    const relGuideImg = relGuide ?? (await keywordImage(["grandma", "grandmother"]));
    const relMentorImg = relMentor ?? (await keywordImage(["mentor", "teacher"]));
    const relGodparentImg = relGodparent ?? (await keywordImage(["godparent", "baby"]));
    const relSisterImg = relSister ?? (await keywordImage(["sister"]));

    return {
      collections: [
        { ...kinKeeper, image: kinKeeperMonthImg },
        familyByChoice,
        justBecause,
        dayOnes,
        {
          label: "Seasonal edits",
          href: `/shop/${COLLECTIONS}/holiday-season`,
          image: seasonalImg,
          badge: "NEW",
        },
        unsaidHolidays,
        {
          label: "Celebration moments",
          href: `/shop/${HOLIDAYS}`,
          image: celebrationImg,
        },
        {
          label: "New season, new meaning",
          href: `/shop/${COLLECTIONS}/new-apparel-variants`,
          image: newSeasonImg,
        },
        { label: "Gift-ready bundles", href: "/shop/keepsakes/bundles", image: bundlesImg },
      ],
      relationships: [
        { label: "Kin Keeper", href: "/relationships/kin-keeper", image: relKinImg, icon: "heart" },
        { label: "Work Bestie", href: "/relationships/work-bestie", image: relBestieImg, icon: "users" },
        { label: "Chosen family", href: "/relationships/chosen-family", image: relChosenImg, icon: "users" },
        { label: "Caregiver", href: "/relationships/caregiver", image: relCaregiverImg, icon: "heart-handshake" },
        { label: "The ones who guide us", href: "/relationships", image: relGuideImg, icon: "star" },
        { label: "Mentor", href: "/relationships/mentor", image: relMentorImg, icon: "graduation-cap" },
        { label: "Godparent", href: "/relationships/godparent", image: relGodparentImg, icon: "heart" },
        { label: "Sister-Friend", href: "/relationships/sister-friend", image: relSisterImg, icon: "users" },
      ],
      // The site's own "Shop by feeling" mapping (header mega menu,
      // src/lib/catalog.ts) — same labels, same destinations.
      feelings: [
        { label: "I see you", href: "/relationships" },
        { label: "Thank you for showing up", href: "/relationships" },
        { label: "Just because", href: "/collections/just-because" },
        { label: "A little encouragement", href: "/relationships" },
      ],
    };
  },
  ["shop-bands-v4"],
  { revalidate: 3600, tags: ["shop-bands"] },
);
