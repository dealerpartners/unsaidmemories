// ---------------------------------------------------------------------------
// Sitemap source — the single source of truth for every URL that goes into
// both /sitemap.xml (machine) and /sitemap (human HTML). One source, two
// renderings — they never drift.
//
// Tier 1 — v_sitemap view: when the Pet Supply Taxonomy SQL has been
//   applied AND the taxonomy pages have real content (products + copy),
//   the v_sitemap view generates URLs from every published taxonomy node,
//   brand page, product, and related-search page. GATED by
//   TAXONOMY_SITEMAP_ENABLED — stays false until Wave 1 pages pass §11a
//   (real products + unique copy). This keeps the sitemap honest — no
//   empty taxonomy URLs until the pages render real content.
//
// Tier 2 — taxonomy fallback: flattenTaxonomyDb (taxonomy_nodes) +
//   getProducts + getMerchCollections. This is what runs today. (The
//   legacy pet_product_categories resolver was retired 2026-10-23,
//   FRONT 1 — taxonomy_nodes is the one category system.)
//
// Tier 3 — static routes: always present. Core site pages + location
//   pages + policies.
//
// Hygiene rules (per owner spec):
//   • Only 200-status indexable URLs go in — no redirecting URLs, no
//     filter-param URLs, no test products, no duplicates.
//   • Location pages (/grooming/[slug]) are money pages — always included.
//   • TAXONOMY_SITEMAP_ENABLED gates Tier 1 — flip to true per-wave when
//     pages are ready. Default false = honest ~46-URL sitemap.
// ---------------------------------------------------------------------------

import { SITE_URL } from "@/lib/site-url"
import { BUSINESS } from "@/lib/business"
import { getProducts, getMerchCollections } from "@/lib/shop/catalog"
import { libraryPolicies } from "@/lib/library/reading"
import { pgQuery } from "@/lib/pg"
import { SHOP_NAV_TAXONOMY, departmentPath, subcategoryPath } from "@/lib/shop-nav"
// kinnect-u/taxonomy-data removed (pet education SEO content — not e-commerce)
import { SHOP_SEO_COPY } from "@/lib/shop/seo-copy"
import { flattenTaxonomyDb, resolveTaxPath } from "@/lib/shop/taxonomy-db"
import { resolveTenantId } from "@/lib/tenant-id";

// GATE: Tier 1 (v_sitemap) is disabled until Wave 1 pages have real content.
// Flip to true per-wave when pages pass §11a (products + unique copy).
// Default false = sitemap stays at ~46 honest URLs (old catalog + static +
// location + policies), no empty taxonomy URLs.
const TAXONOMY_SITEMAP_ENABLED = false

export type SitemapEntry = {
  loc: string           // full URL including https://
  path: string          // path only (for HTML rendering)
  lastModified: Date
  changeFrequency: "weekly" | "monthly" | "yearly" | "daily"
  priority: number      // 0.0 - 1.0
  pageType: string      // "home" | "about" | "shop-landing" | "animal" | "department" | "category" | "brand" | "product" | "related-search" | "location" | "policy" | "static"
  label: string         // human-readable label for HTML sitemap
}

const BASE = SITE_URL

// A hand-written route: everything except what buildSitemap() derives.
type RouteDef = Omit<SitemapEntry, "loc" | "lastModified">
// Static routes — always present. These are the core site pages that don't
// depend on the taxonomy or catalog data layer.
const STATIC_ROUTES: RouteDef[] = [
  // Core site pages
  { path: "",            label: "Home",              pageType: "home",          changeFrequency: "weekly",  priority: 1.0 },
  { path: "/about",      label: "About Us",          pageType: "about",         changeFrequency: "monthly", priority: 0.8 },
  { path: "/services",   label: "Services",          pageType: "services",      changeFrequency: "monthly", priority: 0.9 },
  { path: "/process",    label: "Our Process",       pageType: "static",        changeFrequency: "monthly", priority: 0.7 },
  { path: "/pricing",    label: "Pricing",            pageType: "static",        changeFrequency: "monthly", priority: 0.9 },
  { path: "/gallery",    label: "Gallery",            pageType: "static",        changeFrequency: "monthly", priority: 0.6 },
  { path: "/docs/help/contact/contact-us", label: "Contact Us", pageType: "static", changeFrequency: "monthly", priority: 0.7 },
  { path: "/docs/help/accessibility/website-accessibility", label: "Website Accessibility", pageType: "static", changeFrequency: "monthly", priority: 0.5 },
  { path: "/docs",       label: "Help Center",        pageType: "static",        changeFrequency: "monthly", priority: 0.6 },
  { path: "/docs/help",  label: "Help Guides",        pageType: "static",        changeFrequency: "monthly", priority: 0.6 },
  { path: "/docs/legal", label: "Legal & Policies",   pageType: "static",        changeFrequency: "monthly", priority: 0.6 },
  { path: "/developers", label: "Developer Platform", pageType: "static",    changeFrequency: "monthly", priority: 0.6 },
  { path: "/developers/getting-started", label: "Developer Getting Started", pageType: "static", changeFrequency: "monthly", priority: 0.5 },
  { path: "/developers/api-reference", label: "API Reference", pageType: "static", changeFrequency: "monthly", priority: 0.5 },
  { path: "/developers/guides", label: "Developer Guides", pageType: "static", changeFrequency: "monthly", priority: 0.5 },
  { path: "/developers/legal", label: "Developer Legal", pageType: "static", changeFrequency: "monthly", priority: 0.4 },
  { path: "/docs/staff", label: "Staff Operations",   pageType: "static",        changeFrequency: "monthly", priority: 0.4 },
  { path: "/docs/legal",   label: "Policies",           pageType: "static",        changeFrequency: "monthly", priority: 0.6 },
  { path: "/faq",        label: "FAQ & Policies",     pageType: "static",        changeFrequency: "monthly", priority: 0.6 },
  { path: "/shop",       label: "Shop Home",          pageType: "shop-landing",  changeFrequency: "weekly",  priority: 0.8 },
  { path: "/book",       label: "Booking Overview",   pageType: "static",        changeFrequency: "monthly", priority: 0.9 },
  { path: "/book/appointment",  label: "Book Appointment",    pageType: "static", changeFrequency: "monthly", priority: 0.9 },
  { path: "/book/consultation", label: "Free Consultation",   pageType: "static", changeFrequency: "monthly", priority: 0.8 },
  // Seller program — the only seller URL that is a public page.
  { path: "/veterinary-partners", label: "Veterinary Partners", pageType: "static", changeFrequency: "monthly", priority: 0.5 },
  { path: "/shop/brands", label: "Shop by Brand", pageType: "static", changeFrequency: "weekly", priority: 0.6 },
  { path: "/seller",     label: "Seller Program",     pageType: "seller",        changeFrequency: "monthly", priority: 0.5 },
  // Kinnect U — the unified article library home (articles follow as guide entries).
  { path: "/pet-education",  label: "Pet Education", pageType: "guide", changeFrequency: "monthly", priority: 0.7 },
  // The unified 7-category marketplace hubs (owner directive 2026-10-21 —
  // the same taxonomy as the Pet Education blog; every route is live).
  { path: "/shop/nutrition-and-feeding",   label: "Nutrition & Feeding",   pageType: "static", changeFrequency: "weekly", priority: 0.7 },
  { path: "/shop/nutrition-and-feeding/feeding-and-watering", label: "Feeding & Watering", pageType: "static", changeFrequency: "weekly", priority: 0.6 },
  { path: "/shop/nutrition-and-feeding/treats",               label: "Treats",             pageType: "static", changeFrequency: "weekly", priority: 0.6 },
  { path: "/shop/grooming-and-hygiene",    label: "Grooming & Hygiene",    pageType: "static", changeFrequency: "weekly", priority: 0.7 },
  { path: "/shop/grooming-and-hygiene/grooming-essentials",   label: "Grooming Essentials", pageType: "static", changeFrequency: "weekly", priority: 0.6 },
  { path: "/shop/wellness-and-health",     label: "Wellness & Health",     pageType: "static", changeFrequency: "weekly", priority: 0.7 },
  { path: "/shop/wellness-and-health/wellness",               label: "Wellness",            pageType: "static", changeFrequency: "weekly", priority: 0.6 },
  { path: "/shop/gear-apparel-and-furniture",                label: "Gear, Apparel & Furniture", pageType: "static", changeFrequency: "weekly", priority: 0.7 },
  { path: "/shop/gear-apparel-and-furniture/beds-and-furniture",             label: "Beds & Furniture",   pageType: "static", changeFrequency: "weekly", priority: 0.6 },
  { path: "/shop/gear-apparel-and-furniture/apparel-and-accessories",        label: "Apparel & Accessories", pageType: "static", changeFrequency: "weekly", priority: 0.6 },
  { path: "/shop/gear-apparel-and-furniture/collars-harnesses-and-leashes",  label: "Collars, Harnesses & Leashes", pageType: "static", changeFrequency: "weekly", priority: 0.6 },
  { path: "/shop/travel-and-outdoor",      label: "Travel & Outdoor",      pageType: "static", changeFrequency: "weekly", priority: 0.7 },
  { path: "/shop/travel-and-outdoor/travel-and-outdoor",      label: "Travel & Outdoor Aisle", pageType: "static", changeFrequency: "weekly", priority: 0.6 },
  { path: "/shop/enrichment-and-play",     label: "Enrichment & Play",     pageType: "static", changeFrequency: "weekly", priority: 0.7 },
  { path: "/shop/enrichment-and-play/chew-toys",              label: "Chew Toys",           pageType: "static", changeFrequency: "weekly", priority: 0.6 },
  { path: "/shop/animals",                 label: "Animals",               pageType: "static", changeFrequency: "weekly", priority: 0.7 },
]

// Learning Academy routes
const LEARN_ROUTES: RouteDef[] = [
  { path: "/learn",                          label: "Learning Academy",              pageType: "learn",     changeFrequency: "monthly", priority: 0.7 },
  { path: "/learn/courses",                  label: "Course Catalog",                pageType: "learn",     changeFrequency: "weekly",  priority: 0.7 },
  { path: "/learn/enroll",                   label: "Enroll",                        pageType: "learn",     changeFrequency: "monthly", priority: 0.6 },
  // Individual courses (15 from footer)
  { path: "/learn/courses/animal-behavior-technician",         label: "Animal Behavior Technician",         pageType: "course", changeFrequency: "monthly", priority: 0.6 },
  { path: "/learn/courses/animal-care-assistant",              label: "Animal Care Assistant",             pageType: "course", changeFrequency: "monthly", priority: 0.6 },
  { path: "/learn/courses/equine-nursing-technicians",         label: "Equine Nursing Technicians",        pageType: "course", changeFrequency: "monthly", priority: 0.6 },
  { path: "/learn/courses/felines-and-health",                 label: "Felines & Health",                   pageType: "course", changeFrequency: "monthly", priority: 0.6 },
  { path: "/learn/courses/pet-grooming",                       label: "Pet Grooming",                      pageType: "course", changeFrequency: "monthly", priority: 0.6 },
  { path: "/learn/courses/grooming-salon-practice-management", label: "Grooming Salon Practice Management", pageType: "course", changeFrequency: "monthly", priority: 0.6 },
  { path: "/learn/courses/professional-trainer",              label: "Professional Trainer",              pageType: "course", changeFrequency: "monthly", priority: 0.6 },
  { path: "/learn/courses/pre-veterinary-medicine",            label: "Pre-Veterinary Medicine",            pageType: "course", changeFrequency: "monthly", priority: 0.6 },
  { path: "/learn/courses/veterinary-assistant",               label: "Veterinary Assistant",              pageType: "course", changeFrequency: "monthly", priority: 0.6 },
  { path: "/learn/courses/veterinary-practice-management",     label: "Veterinary Practice Management",     pageType: "course", changeFrequency: "monthly", priority: 0.6 },
  { path: "/learn/courses/veterinary-pathology-technician",    label: "Veterinary Pathology Technician",    pageType: "course", changeFrequency: "monthly", priority: 0.6 },
  { path: "/learn/courses/veterinary-surgical-technician",    label: "Veterinary Surgical Technician",    pageType: "course", changeFrequency: "monthly", priority: 0.6 },
  { path: "/learn/courses/veterinary-technician",             label: "Veterinary Technician",             pageType: "course", changeFrequency: "monthly", priority: 0.6 },
  { path: "/learn/courses/veterinary-technology",             label: "Veterinary Technology",              pageType: "course", changeFrequency: "monthly", priority: 0.6 },
  { path: "/learn/courses/zookeeper-assistant",               label: "Zookeeper Assistant",               pageType: "course", changeFrequency: "monthly", priority: 0.6 },
]

// Special Occasions collections (/shop/collections/*)
const COLLECTION_ROUTES: RouteDef[] = [
  { path: "/shop/collections/my-human-favorites",            label: "$10 & Under My Human Favorites",  pageType: "collection", changeFrequency: "weekly", priority: 0.5 },
  { path: "/shop/collections/back-to-school",                 label: "Back to School",                   pageType: "collection", changeFrequency: "weekly", priority: 0.5 },
  { path: "/shop/collections/better-for-your-dog",            label: "Better for Your Dog",             pageType: "collection", changeFrequency: "monthly", priority: 0.4 },
  { path: "/shop/collections/birthday",                       label: "Birthday",                        pageType: "collection", changeFrequency: "monthly", priority: 0.4 },
  { path: "/shop/collections/birthday/pet-birthday-cakes-treats",       label: "Pet Birthday Cakes & Treats",     pageType: "collection", changeFrequency: "monthly", priority: 0.4 },
  { path: "/shop/collections/birthday/pet-birthday-hats-outfits",       label: "Pet Birthday Hats & Outfits",     pageType: "collection", changeFrequency: "monthly", priority: 0.4 },
  { path: "/shop/collections/birthday/pet-birthday-party-supplies-gifts", label: "Pet Birthday Party Supplies & Gifts", pageType: "collection", changeFrequency: "monthly", priority: 0.4 },
  { path: "/shop/collections/birthday/pet-birthday-toys",     label: "Pet Birthday Toys",                pageType: "collection", changeFrequency: "monthly", priority: 0.4 },
  { path: "/shop/collections/easter",                         label: "Easter",                          pageType: "collection", changeFrequency: "monthly", priority: 0.4 },
  { path: "/shop/collections/easter/cat-easter",              label: "Cat Easter",                      pageType: "collection", changeFrequency: "monthly", priority: 0.4 },
  { path: "/shop/collections/easter/dog-easter",              label: "Dog Easter",                      pageType: "collection", changeFrequency: "monthly", priority: 0.4 },
  { path: "/shop/collections/exclusively-by-all-about-portal",  label: "Exclusively by UnSaid Memories",  pageType: "collection", changeFrequency: "monthly", priority: 0.5 },
  { path: "/shop/collections/fall",                           label: "Fall",                            pageType: "collection", changeFrequency: "monthly", priority: 0.4 },
  { path: "/shop/collections/fall/cozy-beds-furniture-more",  label: "Cozy Beds, Furniture & More",     pageType: "collection", changeFrequency: "monthly", priority: 0.4 },
  { path: "/shop/collections/fall/fall-flavors",              label: "Fall Flavors",                    pageType: "collection", changeFrequency: "monthly", priority: 0.4 },
  { path: "/shop/collections/fall/fall-pet-apparel",          label: "Fall Pet Apparel",                pageType: "collection", changeFrequency: "monthly", priority: 0.4 },
  { path: "/shop/collections/fall/travel-essentials",        label: "Travel Essentials",               pageType: "collection", changeFrequency: "monthly", priority: 0.4 },
  { path: "/shop/collections/family-game-night",              label: "Family Game Night",               pageType: "collection", changeFrequency: "monthly", priority: 0.4 },
  { path: "/shop/collections/fathers-day",                   label: "Father's Day",                    pageType: "collection", changeFrequency: "monthly", priority: 0.4 },
  { path: "/shop/collections/fourth-of-july",                 label: "Fourth of July",                  pageType: "collection", changeFrequency: "monthly", priority: 0.4 },
  { path: "/shop/collections/fourth-of-july/calming-supplements",  label: "Calming Supplements",       pageType: "collection", changeFrequency: "monthly", priority: 0.3 },
  { path: "/shop/collections/fourth-of-july/clothes-accessories",  label: "Clothes & Accessories",     pageType: "collection", changeFrequency: "monthly", priority: 0.3 },
  { path: "/shop/collections/fourth-of-july/collars-leashes-harnesses", label: "Collars, Leashes & Harnesses", pageType: "collection", changeFrequency: "monthly", priority: 0.3 },
  { path: "/shop/collections/fourth-of-july/food-treats",     label: "Food & Treats",                   pageType: "collection", changeFrequency: "monthly", priority: 0.3 },
  { path: "/shop/collections/fourth-of-july/toys",            label: "Toys",                            pageType: "collection", changeFrequency: "monthly", priority: 0.3 },
  { path: "/shop/collections/fresh-finds-under-20",          label: "Fresh Finds Under $20",          pageType: "collection", changeFrequency: "weekly",  priority: 0.5 },
  { path: "/shop/collections/get-outside",                    label: "Get Outside",                     pageType: "collection", changeFrequency: "monthly", priority: 0.4 },
  { path: "/shop/collections/low-prices-everyday-essentials", label: "Low Prices Everyday Essentials", pageType: "collection", changeFrequency: "weekly",  priority: 0.5 },
  { path: "/shop/collections/mothers-day",                    label: "Mother's Day",                    pageType: "collection", changeFrequency: "monthly", priority: 0.4 },
  { path: "/shop/collections/new-pet-essentials",             label: "New Pet Essentials",              pageType: "collection", changeFrequency: "monthly", priority: 0.5 },
  { path: "/shop/collections/new",                            label: "New",                             pageType: "collection", changeFrequency: "weekly",  priority: 0.6 },
  { path: "/shop/collections/new/new-for-cats",               label: "New for Cats",                   pageType: "collection", changeFrequency: "weekly",  priority: 0.5 },
  { path: "/shop/collections/new/new-for-dogs",               label: "New for Dogs",                    pageType: "collection", changeFrequency: "weekly",  priority: 0.5 },
  { path: "/shop/collections/new/new-for-pet-parents",        label: "New for Pet Parents",              pageType: "collection", changeFrequency: "weekly",  priority: 0.5 },
  { path: "/shop/collections/all-about-portal-picks",          label: "UnSaid Memories Picks",           pageType: "collection", changeFrequency: "weekly",  priority: 0.5 },
  { path: "/shop/collections/pride-for-pets",                 label: "Pride for Pets",                  pageType: "collection", changeFrequency: "monthly", priority: 0.4 },
  { path: "/shop/collections/pride-for-pets/dog-pride",       label: "Dog Pride",                      pageType: "collection", changeFrequency: "monthly", priority: 0.4 },
  { path: "/shop/collections/spring",                          label: "Spring",                          pageType: "collection", changeFrequency: "monthly", priority: 0.4 },
  { path: "/shop/collections/spring/spring-cleaning",         label: "Spring Cleaning",                pageType: "collection", changeFrequency: "monthly", priority: 0.4 },
  { path: "/shop/collections/spring/spring-fashion",          label: "Spring Fashion",                  pageType: "collection", changeFrequency: "monthly", priority: 0.4 },
  { path: "/shop/collections/spring/spring-travel",           label: "Spring Travel",                   pageType: "collection", changeFrequency: "monthly", priority: 0.4 },
  { path: "/shop/collections/st-patricks-day",                label: "St. Patrick's Day",              pageType: "collection", changeFrequency: "monthly", priority: 0.4 },
  { path: "/shop/collections/st-patricks-day/st-patricks-day-cat",     label: "St. Patrick's Day Cat",  pageType: "collection", changeFrequency: "monthly", priority: 0.3 },
  { path: "/shop/collections/st-patricks-day/st-patricks-day-my-human", label: "St. Patrick's Day My Human", pageType: "collection", changeFrequency: "monthly", priority: 0.3 },
  { path: "/shop/collections/summer-adventures",              label: "Summer Adventures",              pageType: "collection", changeFrequency: "monthly", priority: 0.4 },
  { path: "/shop/collections/summer-adventures/hydrating-food-treats",      label: "Hydrating Food & Treats", pageType: "collection", changeFrequency: "monthly", priority: 0.3 },
  { path: "/shop/collections/summer-adventures/summer-clothing-accessories", label: "Summer Clothing & Accessories", pageType: "collection", changeFrequency: "monthly", priority: 0.3 },
  { path: "/shop/collections/summer-adventures/summer-toys",  label: "Summer Toys",                    pageType: "collection", changeFrequency: "monthly", priority: 0.3 },
  { path: "/shop/collections/summer-bbq",                     label: "Summer BBQ",                     pageType: "collection", changeFrequency: "monthly", priority: 0.4 },
  { path: "/shop/collections/trending-now",                   label: "Trending Now",                   pageType: "collection", changeFrequency: "weekly",  priority: 0.5 },
  { path: "/shop/collections/valentines-day",                 label: "Valentine's Day",                pageType: "collection", changeFrequency: "monthly", priority: 0.4 },
  { path: "/shop/collections/valentines-day/my-human-valentines-day", label: "My Human Valentine's Day", pageType: "collection", changeFrequency: "monthly", priority: 0.3 },
  { path: "/shop/collections/winter",                         label: "Winter",                         pageType: "collection", changeFrequency: "monthly", priority: 0.4 },
  { path: "/shop/collections/winter/winter-toys-treats",      label: "Winter Toys & Treats",           pageType: "collection", changeFrequency: "monthly", priority: 0.3 },
  { path: "/shop/collections/winter/winter-weather-essentials", label: "Winter Weather Essentials",     pageType: "collection", changeFrequency: "monthly", priority: 0.3 },
]

// Location pages — removed (this is an online store, not a local service
// with city landing pages). Kept as an empty array so downstream code
// that spreads LOCATION_ROUTES still works.
const LOCATION_ROUTES: RouteDef[] = []

// ---------------------------------------------------------------------------
// Taxonomy routes — generated from SHOP_NAV_TAXONOMY in shop-nav.ts.
// All routes now return 200 (wired in /shop/[...slug]/page.tsx via
// resolveTaxonomyPage). These are the animal landings, departments,
// and subcategories from the full cat/dog taxonomy tree.
// ---------------------------------------------------------------------------
const TAXONOMY_ROUTES: RouteDef[] = []
for (const animal of SHOP_NAV_TAXONOMY) {
  // Animal landing: /shop/dog, /shop/cat
  TAXONOMY_ROUTES.push({
    path: `/shop/${animal.slug}`,
    label: animal.name,
    pageType: "animal",
    changeFrequency: "weekly",
    priority: 0.8,
  })
  for (const dept of animal.departments) {
    // Department: /shop/dog/food, /shop/cat/beds-bedding
    TAXONOMY_ROUTES.push({
      path: departmentPath(animal.slug, dept.slug),
      label: dept.name,
      pageType: "department",
      changeFrequency: "weekly",
      priority: 0.7,
    })
    for (const sub of dept.subcategories) {
      // Subcategory: /shop/cat/beds-bedding/bolster-cat-beds
      TAXONOMY_ROUTES.push({
        path: subcategoryPath(animal.slug, dept.slug, sub.slug),
        label: sub.name,
        pageType: "subcategory",
        changeFrequency: "weekly",
        priority: 0.6,
      })
    }
  }
}

// ---------------------------------------------------------------------------
// Tier 1 — v_sitemap view query. Returns empty if the view doesn't exist
// (taxonomy SQL not yet applied). Never throws — the caller falls back.
// ---------------------------------------------------------------------------
async function tryVSitemap(): Promise<SitemapEntry[]> {
  // GATE: Tier 1 is disabled until Wave 1 pages have real content.
  // When false, returns empty → buildSitemap() falls back to Tier 2
  // (old catalog resolvers) → sitemap stays honest at ~46 URLs.
  if (!TAXONOMY_SITEMAP_ENABLED) return []
  try {
    const rows = await pgQuery<{ loc: string; lastmod: string | null; page_type: string }>(
      `SELECT loc, lastmod, page_type FROM public.v_sitemap WHERE tenant_id = $1::uuid`,
      [resolveTenantId()],
    )
    if (!rows || rows.length === 0) return []
    return rows.map((r) => {
      const path = r.loc.replace(BASE, "").replace(/^\/?$/, "")
      return {
        loc: r.loc,
        path: path === "" ? "" : path.startsWith("/") ? path : `/${path}`,
        lastModified: r.lastmod ? new Date(r.lastmod) : new Date(),
        changeFrequency: r.page_type === "product" ? "weekly" : "monthly",
        priority: priorityForPageType(r.page_type),
        pageType: r.page_type,
        label: labelFromPath(path, r.page_type),
      }
    })
  } catch {
    // v_sitemap view doesn't exist yet (taxonomy SQL not applied) or query
    // failed. Fall back to catalog resolvers.
    return []
  }
}

function priorityForPageType(pt: string): number {
  switch (pt) {
    case "shop-landing": return 0.8
    case "animal": return 0.8
    case "department": return 0.7
    case "category": return 0.7
    case "brand": return 0.6
    case "product": return 0.7
    case "related-search": return 0.5
    default: return 0.5
  }
}

function labelFromPath(path: string, pageType: string): string {
  if (!path) return "Shop Home"
  const parts = path.split("/").filter(Boolean)
  const last = parts[parts.length - 1] || "Shop"
  const formatted = last
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
  if (pageType === "brand") return `${formatted} (Brand)`
  if (pageType === "product") return formatted
  return formatted
}

// ---------------------------------------------------------------------------
// Tier 2 — taxonomy fallback. Builds entries from flattenTaxonomyDb
// (taxonomy_nodes) + getMerchCollections plus the ENTERPRISE product
// slugs. Shallower coverage than v_sitemap but functional.
// ---------------------------------------------------------------------------
/**
 * Enterprise product slugs — the sitemap needs only slugs + dates, NEVER the
 * full catalog object graph. (listCatalogProducts with its per-item media
 * LATERAL aggregation timed out build workers once the enterprise tables
 * filled with the 12.8k feed items.)
 */
async function getEnterpriseProductSlugs(): Promise<{ slug: string; name: string; created_at: string | null }[]> {
  const tenant = resolveTenantId()
  return pgQuery<{ slug: string; name: string; created_at: string | null }>(
    `SELECT ci.metadata->>'slug' AS slug, ci.name, ci.created_at
       FROM commerce_catalog_items ci
      WHERE ci.tenant_id = $1::uuid
        AND ci.active = true AND ci.ecommerce_enabled = true AND ci.sellable = true
        AND COALESCE(ci.metadata->>'slug','') <> ''
      ORDER BY ci.created_at DESC NULLS LAST`,
    [tenant],
  )
}

async function fallbackCatalogEntries(includeProducts: boolean): Promise<SitemapEntry[]> {
  const now = new Date()
  const entries: SitemapEntry[] = []

  try {
    // Taxonomy fallback (taxonomy_nodes via flattenTaxonomyDb) — the
    // legacy pet_product_categories nav tree that used to feed this
    // fallback was removed 2026-10-23 (FRONT 1).
    const nodes = await flattenTaxonomyDb()
    for (const node of nodes) {
      const level = node.path.split("/").filter(Boolean).length - 2 // /shop/<animal> = 0
      // Include species landings (level 0) + departments (level 1) + any
      // node with products. Deeper levels (subcategories, leaf categories)
      // are included when v_sitemap exists (Tier 1).
      if (level <= 2 || node.count > 0) {
        entries.push({
          loc: `${BASE}${node.path}`,
          path: node.path,
          lastModified: now,
          changeFrequency: "weekly",
          priority: level === 0 ? 0.8 : level === 1 ? 0.7 : 0.6,
          pageType: level === 0 ? "animal" : level === 1 ? "department" : "category",
          label: node.name,
        })
      }
    }
  } catch {
    // Catalog unavailable — static routes still stand.
  }

  try {
    for (const m of await getMerchCollections()) {
      entries.push({
        loc: `${BASE}${m.path}`,
        path: m.path,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.6,
        pageType: "category",
        label: m.displayName,
      })
    }
  } catch {
    // Merch collections unavailable.
  }

  try {
    for (const p of includeProducts ? await getEnterpriseProductSlugs() : []) {
      entries.push({
        loc: `${BASE}/products/${p.slug}`,
        path: `/products/${p.slug}`,
        lastModified: p.created_at ? new Date(p.created_at) : now,
        changeFrequency: "weekly",
        priority: 0.7,
        pageType: "product",
        label: p.name,
      })
    }
  } catch {
    // Products unavailable.
  }

  return entries
}

// ---------------------------------------------------------------------------
// Category pages from the live taxonomy (animal → department → subcategory).
// Empty categories are skipped so the sitemap never lists a "no products" page.
// ---------------------------------------------------------------------------
async function dbCategoryEntries(now: Date): Promise<SitemapEntry[]> {
  // A taxonomy read failure throws to buildSitemap's caller (the sitemap
  // route) instead of silently publishing a sitemap with no categories.
  const nodes = await flattenTaxonomyDb()
  return nodes
      .filter((n) => n.count > 0)
      .map((n) => {
        const depth = n.path.split("/").filter(Boolean).length
        return {
          loc: `${BASE}${n.path}`,
          path: n.path,
          lastModified: now,
          changeFrequency: "weekly" as const,
          priority: depth === 2 ? 0.8 : depth === 3 ? 0.7 : 0.6,
          pageType: depth === 2 ? "animal" : depth === 3 ? "department" : "subcategory",
          label: n.name,
        }
      })
}

// ---------------------------------------------------------------------------
// Tier 3 — policies. Enumerated from the compiled library bundle (code).
// ---------------------------------------------------------------------------
async function policyEntries(): Promise<SitemapEntry[]> {
  const now = new Date()
  // Policies are code (owner ruling 2026-10-18): the sitemap enumerates
  // the compiled library bundle, plus the salon house-rule pages that
  // live only in the code registry — never the CMS resource.
  const extras: [string, string][] = [
    ["Cancellations", "/docs/legal/groomers/booking-cancellation-and-no-show"],
    ["Late Arrivals", "/docs/legal/groomers/booking-cancellation-and-no-show"],
    ["Vaccinations", "/docs/legal/groomers/vaccination-requirements"],
    ["Matted Coats", "/docs/legal/groomers/pet-safety-and-handling"],
    ["Refunds & Returns", "/docs/legal/everyone/returns-and-refunds-policy"],
    ["Shipping & Delivery", "/docs/legal/everyone/shipping-and-delivery-policy"],
    ["Your Privacy Choices", "/docs/legal/everyone/privacy-policy"],
    ["Sustainability", "/docs/legal"],
  ]
  const seen = new Set<string>()
  const resolved: SitemapEntry[] = []
  const push = (label: string, path: string) => {
    if (seen.has(path)) return
    seen.add(path)
    resolved.push({
      loc: `${BASE}${path}`,
      path,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
      pageType: "policy",
      label,
    })
  }
  // Policies live in the Help Center now (owner ruling 2026-10-20): the
  // sitemap advertises each policy at its canonical /docs/legal URL.
  for (const p of libraryPolicies()) push(p.title, `/docs/legal/${p.sectionSlug}/${p.slug}`)
  for (const [label, path] of extras) push(label, path)
  return resolved
}

// ---------------------------------------------------------------------------
// Pet breed library detail pages removed (FIX-AE): the /learn/breeds/<dog|cat>/<slug>
// routes the catalogue backed never shipped to the storefront, and the pet
// breed catalogue (lib/pets/) was deleted alongside the rest of the pet-salon
// cleanup. The sitemap no longer advertises breed URLs that 404.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// buildSitemap — the single entry point both /sitemap.xml and /sitemap
// call. Returns the full URL set with no duplicates, sorted by priority
// descending then by path. Excludes filter-param URLs (none are generated
// here — filter state is query-string only, never a route) and any URL
// that's known to redirect (the 5 redirecting URLs from GSC will be
// excluded here once identified in Phase 2).
// ---------------------------------------------------------------------------

// URLs known to redirect (Phase 2 will populate this). For now, empty —
// the redirect audit hasn't run yet.
const KNOWN_REDIRECT_PATHS = new Set<string>([
  "/shop/collections/gift-cards", // → /gift-cards
  "/sustainability", // → /policies/sustainability
  // Collection child shells (link/404 census 2026-10-15 §D): each now 308s
  // to its parent collection in next.config.ts — never advertised here.
  "/shop/collections/new-pet-essentials", // → /shop/collections/new/new-pet-essentials
  "/shop/collections/low-prices-everyday-essentials/cat-food",
  "/shop/collections/low-prices-everyday-essentials/cat-supplies-under-20",
  "/shop/collections/low-prices-everyday-essentials/dog-cat-food-bags-under-19-99",
  "/shop/collections/low-prices-everyday-essentials/dog-cat-food-toppers-under-10",
  "/shop/collections/low-prices-everyday-essentials/dog-cat-toys-under-5",
  "/shop/collections/low-prices-everyday-essentials/flea-tick-solutions",
  "/shop/collections/pride-for-pets/dog-pride",
  "/shop/collections/spring/spring-cleaning",
  "/shop/collections/spring/spring-fashion",
  "/shop/collections/spring/spring-travel",
  "/shop/collections/fourth-of-july/calming-supplements",
  "/shop/collections/fourth-of-july/clothes-accessories",
  "/shop/collections/fourth-of-july/collars-leashes-harnesses",
  "/shop/collections/fourth-of-july/food-treats",
  "/shop/collections/fourth-of-july/toys",
  "/shop/collections/st-patricks-day/st-patricks-day-cat",
  "/shop/collections/st-patricks-day/st-patricks-day-my-human",
  "/shop/collections/summer-adventures/hydrating-food-treats",
  "/shop/collections/summer-adventures/summer-clothing-accessories",
  "/shop/collections/summer-adventures/summer-toys",
  "/shop/collections/valentines-day/my-human-valentines-day",
  "/shop/collections/winter/winter-toys-treats",
  "/shop/collections/winter/winter-weather-essentials",
])

// Collection paths with written SEO copy but no product-backed page
// (census §D2–D8). Removed from the sitemap until each is built with real
// products; the URLs themselves answer an honest 404 in the meantime.
// Relist by deleting the path here when its collection ships.
const DELISTED_COLLECTION_PATHS = new Set<string>([
  "/shop/collections/pet-supply-influencers",
  "/shop/collections/products-with-impact",
  "/shop/collections/products-with-impact/clean-products",
  "/shop/collections/products-with-impact/sustainable-products",
  "/shop/collections/purina-cat-items",
  "/shop/collections/purina-cat-items/the-golden-girl",
  "/shop/collections/purina-cat-items/the-stage-5-clinger",
])

export async function buildSitemap(
  opts: { includeProducts?: boolean } = {},
): Promise<SitemapEntry[]> {
  const { includeProducts = true } = opts
  const now = new Date()

  // Tier 1: try v_sitemap view (when taxonomy SQL is applied).
  const vSitemap = await tryVSitemap()

  // Tier 2: fallback to catalog resolvers if v_sitemap is empty.
  const catalogEntries = vSitemap.length > 0 ? [] : await fallbackCatalogEntries(includeProducts)

  // Tier 3: static + location + policies (always present).
  const staticEntries: SitemapEntry[] = STATIC_ROUTES.map((r) => ({
    ...r,
    loc: `${BASE}${r.path}`,
    lastModified: now,
  }))
  const locationEntries: SitemapEntry[] = LOCATION_ROUTES.map((r) => ({
    ...r,
    loc: `${BASE}${r.path}`,
    lastModified: now,
  }))
  // Taxonomy entries — all animal landings, departments, and subcategories
  // from SHOP_NAV_TAXONOMY. All routes now return 200 (wired in the
  // /shop/[...slug] catch-all via resolveTaxonomyPage).
  const taxonomyEntries: SitemapEntry[] = TAXONOMY_ROUTES.map((r) => ({
    ...r,
    loc: `${BASE}${r.path}`,
    lastModified: now,
  }))
  const policyEntriesResolved = await policyEntries()

  // Merge + dedupe by path + exclude known redirects.
  // Convert all route arrays to full SitemapEntry with loc + lastModified
  const learnEntries: SitemapEntry[] = LEARN_ROUTES.map((r) => ({ ...r, loc: `${BASE}${r.path}`, lastModified: now }))
  // Collections: the hand-curated list plus every collection in the SEO copy.
  const collectionEntries: SitemapEntry[] = [
    ...COLLECTION_ROUTES,
    ...SHOP_SEO_COPY.filter((b) => b.type === "collection").map<RouteDef>((b) => ({
      path: b.path,
      label: b.h1,
      pageType: "collection",
      changeFrequency: "monthly",
      priority: 0.4,
    })),
  ]
    .filter((r) => !DELISTED_COLLECTION_PATHS.has(r.path))
    .map((r) => ({ ...r, loc: `${BASE}${r.path}`, lastModified: now }))
  // Category pages — parents and children straight from the live taxonomy.
  const categoryEntries = await dbCategoryEntries(now)
  // Pet education guide entries removed (kinnect-u library deleted — not e-commerce)
  const guideEntries: SitemapEntry[] = []

  // Merge + dedupe by path + exclude known redirects.
  const all = [...staticEntries, ...locationEntries, ...taxonomyEntries, ...categoryEntries, ...learnEntries, ...collectionEntries, ...guideEntries, ...vSitemap, ...catalogEntries, ...policyEntriesResolved]
  // Only URLs that render a real page are advertised: every category path is
  // resolved against the live taxonomy; unpublished or unknown ones are dropped.
  const isTaxonomyPath = (path: string) =>
    path.startsWith("/shop/") && !/^\/shop\/(collections|category|new-arrivals|sale|bag|brands)(\/|$)/.test(path)
  const dead = new Set<string>()
  try {
    const taxPaths = [...new Set(all.map((e) => e.path).filter(isTaxonomyPath))]
    for (let i = 0; i < taxPaths.length; i += 8) {
      await Promise.all(
        taxPaths.slice(i, i + 8).map(async (path) => {
          const hit = await resolveTaxPath(path.replace(/^\/shop\//, "").split("/"))
          if (!hit || hit.notFound) dead.add(path)
        }),
      )
    }
  } catch {
    dead.clear()
  }
  const seen = new Set<string>()
  const deduped = all
    .filter((e) => {
      if (dead.has(e.path)) return false
      if (KNOWN_REDIRECT_PATHS.has(e.path)) return false
      if (seen.has(e.path)) return false
      seen.add(e.path)
      return true
    })
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority
      return a.path.localeCompare(b.path)
    })

  return deduped
}

// Convenience — for the HTML sitemap page, group entries by section.
// Product URLs are skipped by default: a human page doesn't list 12.8k items.
export async function buildSitemapSections() {
  const entries = await buildSitemap({ includeProducts: false })
  return {
    salon: entries.filter((e) =>
      ["home", "about", "services", "static"].includes(e.pageType) &&
      !e.path.startsWith("/book") &&
      !e.path.startsWith("/shop") &&
      !e.path.startsWith("/grooming") &&
      !e.path.startsWith("/docs/legal") &&
      !e.path.startsWith("/guides") &&
      !e.path.startsWith("/learn") &&
      !e.path.startsWith("/seller")
    ),
    booking: entries.filter((e) => e.path.startsWith("/book")),
    boutique: entries.filter((e) =>
      e.path.startsWith("/shop") || ["shop-landing", "animal", "department", "category", "subcategory", "brand", "related-search", "collection"].includes(e.pageType)
    ),
    products: entries.filter((e) => e.pageType === "product"),
    serving: entries.filter((e) => e.pageType === "location"),
    policies: entries.filter((e) => e.pageType === "policy"),
    guides: entries.filter((e) => e.pageType === "guide"),
    learn: entries.filter((e) => e.pageType === "learn" || e.pageType === "course"),
    seller: entries.filter((e) => e.path === "/seller"),
    total: entries.length,
  }
}
