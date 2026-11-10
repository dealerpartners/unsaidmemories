import Link from "next/link";
import {
  ArrowRight, ArrowUpRight, Gift, Heart, ShieldCheck, Truck,
} from "lucide-react";
import { departments, collections } from "@/lib/catalog";
import { CatalogCard, type CatalogProduct } from "@/components/catalog-card";
import { createServerClient } from "@/lib/supabase";
import { unstable_cache } from "next/cache";

import { RelationshipArt } from "@/components/relationship-art";
import HeroVisual from "@/components/hero-visual";
import { getWebsiteSettings } from "@/lib/site-settings";
import { RowScrollArrow } from "@/components/row-scroll-arrow";

// The 11 model photos for the "Made for your people." row — the brand's
// relationships, worn. Same card structure (photo · label · title · arrow) as
// the original 3-card .collection-grid, just extended to the full set. The
// row scrolls horizontally; RowScrollArrow pulls in the rest.
const COLLECTION_CARDS: { photo: string; label: string; title: string; href: string }[] = [
  { photo: "/made-for-your-people/02-day-ones.jpg",          label: "01 / THE EVERYDAY ONES",   title: "Day Ones",         href: "/collections/day-ones" },
  { photo: "/made-for-your-people/04-family-by-choice.jpg",  label: "02 / THE FAMILY WE CHOOSE", title: "Family by Choice", href: "/collections/family-by-choice" },
  { photo: "/made-for-your-people/07-just-because.jpg",      label: "03 / NO REASON NEEDED",     title: "Just Because",     href: "/collections/just-because" },
  { photo: "/made-for-your-people/01-kin-keeper.jpg",        label: "04 / KEEPER",               title: "Kin Keeper",       href: "/relationships/kin-keeper" },
  { photo: "/made-for-your-people/03-sister-friend.jpg",     label: "05 / SISTER",               title: "Sister-Friend",    href: "/relationships/sister-friend" },
  { photo: "/made-for-your-people/05-family-by-choice-2.jpg",label: "06 / CHOSEN",               title: "Family by Choice", href: "/collections/family-by-choice" },
  { photo: "/made-for-your-people/06-family-by-choice-3.jpg",label: "07 / CHOSEN",               title: "Family by Choice", href: "/collections/family-by-choice" },
  { photo: "/made-for-your-people/08-just-because-2.jpg",    label: "08 / NO REASON",            title: "Just Because",     href: "/collections/just-because" },
  { photo: "/made-for-your-people/09-ride-or-die.jpg",       label: "09 / ALWAYS",               title: "Ride or Die",      href: "/relationships/ride-or-die" },
  { photo: "/made-for-your-people/10-ride-or-die-2.jpg",     label: "10 / ALWAYS",               title: "Ride or Die",      href: "/relationships/ride-or-die" },
  { photo: "/made-for-your-people/11-i-see-you.jpg",         label: "11 / SIGNATURE",            title: "I See You",        href: "/relationships/i-see-you" },
];

// The 11 departments for the "Shop by department." row — same card structure
// (photo · number · title · round-arrow · description) and same color scheme
// as the original 3-card .department-grid, extended to the full set the owner
// supplied. Photos are cropped to 4:3, top-biased. The row scrolls; the same
// RowScrollArrow pulls in the rest.
const DEPARTMENT_CARDS: { photo: string; number: string; title: string; em?: string; description: string; href: string }[] = [
  { photo: "/departments/01-apparel.jpg",          number: "01 / APPAREL",          title: "Clothing, ",  em: "considered.",  description: "Elevated everyday layers for every version of you.",          href: "/shop/apparel" },
  { photo: "/departments/02-home-and-living.jpg",  number: "02 / HOME & LIVING",    title: "Keep it ",    em: "close.",       description: "Objects that make the everyday feel a little more personal.", href: "/shop/home-and-living" },
  { photo: "/departments/03-keepsakes.jpg",        number: "03 / KEEPSAKES",        title: "Just ",       em: "because.",     description: "No occasion required. The feeling is reason enough.",         href: "/shop/keepsakes" },
  { photo: "/departments/04-accessories.jpg",      number: "04 / ACCESSORIES",      title: "Small ",      em: "details.",     description: "Low-key, meaningful additions to every day.",                 href: "/shop/accessories" },
  { photo: "/departments/05-headwear.jpg",         number: "05 / HEADWEAR",         title: "Top it ",     em: "off.",         description: "Everyday headwear with a little meaning built in.",           href: "/shop/headwear" },
  { photo: "/departments/06-drinkware.jpg",        number: "06 / DRINKWARE",        title: "Raise a ",    em: "glass.",       description: "For the slow mornings and the people who make them.",         href: "/shop/drinkware" },
  { photo: "/departments/07-wall-art.jpg",         number: "07 / WALL ART",         title: "Make a ",     em: "space.",       description: "Quiet visual reminders of the people who make it home.",      href: "/shop/wall-art" },
  { photo: "/departments/08-puzzles-games.jpg",    number: "08 / PUZZLES & GAMES",  title: "Pass the ",   em: "time.",        description: "Small ways to gather, slow down, and stay a little longer.",  href: "/shop/games-and-puzzles" },
  { photo: "/departments/09-technology.jpg",       number: "09 / TECHNOLOGY",       title: "Everyday ",   em: "tech.",        description: "Considered carry and covers for the things you use daily.",   href: "/shop/technology" },
  { photo: "/departments/10-wellness.jpg",         number: "10 / WELLNESS",         title: "Take a ",     em: "breath.",      description: "Small rituals for the people who hold it all together.",      href: "/shop/wellness" },
  { photo: "/departments/11-collections.jpg",      number: "11 / COLLECTIONS",      title: "By the ",     em: "occasion.",    description: "Marked moments, made a little more personal.",                href: "/collections" },
];

// Home page — content sections only. Site chrome (announcement bar, header,
// mega menu, quick-add modal, search overlay, mobile drawer, footer) lives in
// SiteShell, which is mounted in the root layout.
//
// Featured products come from the LIVE catalogue (supplier_catalog_
// products): the demo list in lib/catalog linked to product URLs that
// never resolved — the PDP only serves catalogue products — which is
// what broke the home page's product cards. Studio-published designs
// lead; the rest are the newest priced products with photos.
type FeaturedRow = {
  id: string; name: string; image_url: string | null; images: string[] | null;
  brand_name: string | null; external_id: string | null; variant_count: number | null;
  category_id: string | null;
};

async function withPrices(
  sb: ReturnType<typeof createServerClient>,
  rows: FeaturedRow[],
): Promise<CatalogProduct[]> {
  // Fetch variants to get min price + real sizes + colors (same shape as
  // the shop page's fetchMinPricesBatch, so the quick-add modal gets real
  // selectable sizes/colors, not empty arrays).
  const pricing = new Map<string, { minPrice: number | null; variantCount: number; sizes: string[]; colors: string[] }>();
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { data } = await sb
      .from("supplier_catalog_variants")
      .select("supplier_catalog_product_id, price_snapshot, size, color")
      .in("supplier_catalog_product_id", chunk.map((r) => r.id));
    for (const v of data ?? []) {
      const pid = v.supplier_catalog_product_id as string;
      if (!pricing.has(pid)) pricing.set(pid, { minPrice: null, variantCount: 0, sizes: [], colors: [] });
      const entry = pricing.get(pid)!;
      entry.variantCount++;
      const price = Number(v.price_snapshot);
      if (Number.isFinite(price) && price > 0 && (entry.minPrice === null || price < entry.minPrice)) {
        entry.minPrice = price;
      }
      if (v.size && !entry.sizes.includes(v.size)) entry.sizes.push(v.size);
      if (v.color && !entry.colors.includes(v.color)) entry.colors.push(v.color);
    }
  }
  // Include ALL rows — products without a price get minPrice: null
  // (CatalogCard renders "—" for null prices). This ensures the grid
  // shows 1 per category even before retail pricing is set.
  return rows.map((r) => {
    const p = pricing.get(r.id);
    return {
      id: r.id, name: r.name, brand: r.brand_name, image: r.image_url,
      images: r.images, variantCount: p?.variantCount ?? r.variant_count ?? 0,
      minPrice: p?.minPrice ?? null, sizes: p?.sizes ?? [], colors: p?.colors ?? [],
    };
  });
}

// ── Featured-product category allowlist ──────────────────────────
// The home page's "Good things. Good people." grid shows ONE product per
// luxury department — never shoes, ornaments, phone cases, or flags. We
// resolve the 8 department categories by slug, pull their subcategory IDs,
// drop a small blocklist (footwear, face masks, swimwear, phone cases —
// not luxury gift territory), and query only within the remaining IDs.
// Then we dedupe to 1 product per parent department (newest with a price
// wins) so the grid shows variety across departments, not 4 of the same.
const FEATURED_DEPARTMENT_SLUGS = [
  "apparel", "home-and-living", "keepsakes", "accessories",
  "headwear", "drinkware", "wall-art-2", "wellness",
  "games", "technology",
  "memory-gifts", "sentimental", "outerwear",
] as const;

const FEATURED_SUBCATEGORY_BLOCKLIST = new Set([
  // Apparel — cheap/non-gift subcategories
  "bottoms-3", "dresses-11", "swimwear-79", "apparel-for-babys",
  // Accessories — not luxury gift territory
  "footwear-205", "face-masks-126", "all-accessories-229",
  // Other non-gift
  "phone-cases-244",
]);

async function resolveFeaturedCategoryTree(
  sb: ReturnType<typeof createServerClient>,
): Promise<{ allowedIds: string[]; childToParent: Map<string, string>; deptOrder: string[] }> {
  const { data: parents } = await sb
    .from("categories")
    .select("id, slug")
    .in("slug", [...FEATURED_DEPARTMENT_SLUGS]);
  const parentById = new Map((parents ?? []).map((p) => [p.id as string, p.id as string]));
  const parentIds = [...parentById.keys()];
  if (parentIds.length === 0) return { allowedIds: [], childToParent: new Map(), deptOrder: [] };
  const deptOrder = FEATURED_DEPARTMENT_SLUGS
    .map((slug) => (parents ?? []).find((p) => p.slug === slug)?.id as string | undefined)
    .filter((id): id is string => Boolean(id));

  const { data: children } = await sb
    .from("categories")
    .select("id, slug, parent_id")
    .in("parent_id", parentIds);
  const childToParent = new Map<string, string>();
  const allowedIds = [...parentIds];
  for (const c of children ?? []) {
    if (FEATURED_SUBCATEGORY_BLOCKLIST.has(c.slug as string)) continue;
    allowedIds.push(c.id as string);
    childToParent.set(c.id as string, (c.parent_id as string) ?? c.id as string);
  }
  return { allowedIds, childToParent, deptOrder };
}

const getHomeFeatured = unstable_cache(
  async (): Promise<CatalogProduct[]> => {
    const sb = createServerClient();
    const cols = "id, name, image_url, images, brand_name, external_id, category_id, variant_count";

    // Stage 1 — studio-published designs still lead (unchanged).
    const { data: studio } = await sb
      .from("supplier_catalog_products")
      .select(cols)
      .eq("is_hidden", false)
      .like("external_id", "studio-%")
      .order("created_at", { ascending: false })
      .limit(12);
    let featured = await withPrices(sb, (studio ?? []) as FeaturedRow[]);

    // Stage 2 — fallback: 1 newest product per department. Each
    // department is queried on its own: a single global "newest 400"
    // window starved whole departments whenever bulk ingests tied on
    // created_at, so departments with older stock never appeared.
    if (featured.length < 8) {
      const { allowedIds, childToParent, deptOrder } = await resolveFeaturedCategoryTree(sb);
      if (allowedIds.length > 0) {
        const idsByDept = new Map<string, string[]>();
        for (const id of allowedIds) {
          const dept = childToParent.get(id) ?? id;
          if (!idsByDept.has(dept)) idsByDept.set(dept, []);
          idsByDept.get(dept)!.push(id);
        }
        const picks: FeaturedRow[] = [];
        for (const deptId of deptOrder) {
          const ids = idsByDept.get(deptId);
          if (!ids || ids.length === 0) continue;
          const { data: rows } = await sb
            .from("supplier_catalog_products")
            .select(cols)
            .eq("is_hidden", false)
            .not("image_url", "is", null)
            .in("category_id", ids)
            .order("created_at", { ascending: false })
            .limit(1);
          if (rows && rows[0]) picks.push(rows[0] as FeaturedRow);
        }
        const priced = await withPrices(sb, picks);
        const seenIds = new Set(featured.map((f) => f.id));
        featured = [...featured, ...priced.filter((f) => !seenIds.has(f.id))];
      }
    }
    return featured.slice(0, 13);
  },
  ["home-featured-v5"],
  { tags: ["home-featured"] },
);

export default async function Home() {
  // No-DB guard: in environments without Supabase env vars (local preview,
  // hand-off sandbox), let the hardcoded fallbacks below render instead of
  // 500-ing. Same graceful-degradation contract the CMS calls below already
  // use (.catch). No content or visual change — just lets the fallback path
  // execute when the catalogue/settings reads can't reach the DB.
  let featured: CatalogProduct[] = [];
  let settings: { heroImageUrl: string | null } = { heroImageUrl: null };
  try {
    featured = await getHomeFeatured();
  } catch {}
  try {
    settings = await getWebsiteSettings();
  } catch {}
  const heroSrc = settings.heroImageUrl || "/hero-main.jpg";

  // CMS-managed content — fetch all published blocks + global copy
  // Falls back to hardcoded values if no CMS data exists (graceful degradation)
  const { getCmsHero, getCmsCopy } = await import("@/lib/cms/storefront");
  const { getContentBlocks } = await import("@/lib/cms");
  const [cmsHero, copy, allBlocks] = await Promise.all([
    getCmsHero().catch(() => null),
    getCmsCopy().catch(() => ({} as Record<string, string>)),
    getContentBlocks({ status: "published", locale: "en-US" }).catch(() => []),
  ]);

  // Find specific section blocks from the CMS
  const trustBlock = allBlocks.find(b => b.component_type === "TrustStrip");
  const editorialBlock = allBlocks.find(b => b.component_type === "EditorialFeature");
  const newsletterBlock = allBlocks.find(b => b.component_type === "NewsletterSignup");
  const statementBlock = allBlocks.find(b => b.component_type === "StatementBlock");

  return (
    <main>
      {/* Hero photo fetches first, ahead of every other asset, so it
          never queues behind anything else on the page. */}
      <link rel="preload" as="image" href={heroSrc} fetchPriority="high" />
      <section className="hero hero-gated">
        <HeroVisual imageUrl={heroSrc} />
        <div className="hero-copy">
          <h1>
            {cmsHero?.headline ? (
              // Parse the CMS headline for emphasis + line breaks so the
              // design intent (purple "felt.") survives even when the hero
              // is CMS-managed. Convention: *word* → <em>, | → <br/>.
              // Falls back to plain text if no markup is present.
              (() => {
                const parts = cmsHero.headline.split("|");
                return parts.map((part, i) => {
                  const emph = part.split(/(\*[^*]+\*)/g);
                  return (
                    <span key={i}>
                      {emph.map((e, j) =>
                        e.startsWith("*") && e.endsWith("*") ? (
                          <em key={j}>{e.slice(1, -1)}</em>
                        ) : (
                          <span key={j}>{e}</span>
                        ),
                      )}
                      {i < parts.length - 1 && <br />}
                    </span>
                  );
                });
              })()
            ) : (
              <>Some things<br />are better <em>felt.</em></>
            )}
          </h1>
          <p>{cmsHero?.subtitle || copy["hero.subtitle"] || "Wear it. Give it. Keep it close. Thoughtful pieces for the people who make your world."}</p>
          <div className="hero-ctas">
            <Link className="button button-light" href={cmsHero?.ctaPrimaryHref || "/shop"}>{cmsHero?.ctaPrimaryLabel || copy["hero.cta_primary"] || "Shop the collection"} <ArrowRight size={16} /></Link>
            <Link className="hero-secondary" href={cmsHero?.ctaSecondaryHref || "/our-story"}>{cmsHero?.ctaSecondaryLabel || copy["hero.cta_secondary"] || "Discover our world"} <ArrowUpRight size={15} /></Link>
          </div>
        </div>
      </section>

      <section className="trust-strip">
        <div><span className="trust-icon"><Truck size={19} /></span><p><b>Free shipping</b><small>On orders $75 and over</small></p></div>
        <div><span className="trust-icon"><ShieldCheck size={19} /></span><p><b>Considered quality</b><small>Made for everyday living</small></p></div>
        <div><span className="trust-icon"><Gift size={19} /></span><p><b>Gift-ready by design</b><small>Meaningful, from the start</small></p></div>
        <div><span className="trust-icon"><Heart size={19} /></span><p><b>Made around connection</b><small>Because people are the point</small></p></div>
      </section>

      <section className="section shop-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">The considered edit / 001</span>
            <h2>Good things.<br /><em>Good people.</em></h2>
          </div>
          <div className="heading-aside">
            <p>Everyday essentials, meaningful objects, and small reminders of the people who matter most.</p>
            <Link href="/shop" className="text-link">Shop all products <ArrowRight size={15} /></Link>
          </div>
        </div>
        <div className="product-toolbar">
          <div className="product-count">A few things we love <span>{String(featured.length).padStart(2, "0")} featured</span></div>
          <Link href="/shop" className="filter-link">Explore all <ArrowUpRight size={15} /></Link>
        </div>
        <div className="product-row">
          <div className="product-grid product-grid--scroll">
            {featured.map((p, i) => (
              <CatalogCard key={p.id} p={p} index={i} />
            ))}
          </div>
          <RowScrollArrow gridSelector=".product-row .product-grid--scroll" arrowClassName="product-scroll-arrow" />
        </div>
      </section>

      <section className="editorial">
        <div className="editorial-image">
          <div className="editorial-image-overlay" />
          <div className="image-label">THE UNSAID SIGNATURE <span>— 01 / 03</span></div>
          <div className="editorial-quote">For all the things<br />you <em>never quite say.</em></div>
        </div>
        <div className="editorial-content">
          <span className="eyebrow">A little more personal</span>
          <h2>Say it without<br />saying <em>everything.</em></h2>
          <p>Some people just know. Others deserve a reminder. Our signature line turns the words that stay with us into pieces you can wear, share, and keep close.</p>
          <Link className="button button-dark" href="/signature">Discover the signature <ArrowRight size={16} /></Link>
          <div className="editorial-bottom"><span>01</span><i /><span>Thoughtfully made for connection</span></div>
        </div>
      </section>

      <section className="section department-section">
        <div className="section-heading compact">
          <div>
            <span className="eyebrow">Find your kind of something</span>
            <h2>Shop by <em>department.</em></h2>
          </div>
          <Link href="/departments" className="text-link">View all departments <ArrowRight size={15} /></Link>
        </div>
        <div className="department-row">
          <div className="department-grid department-grid--scroll">
            {DEPARTMENT_CARDS.map((d) => (
              <Link
                key={d.photo}
                className="department-card"
                href={d.href}
              >
                <div
                  className="dept-photo"
                  style={{ backgroundImage: `url("${d.photo}")`, backgroundPosition: "center top" }}
                />
                <span className="dept-number">{d.number}</span>
                <div className="dept-bottom">
                  <h3>{d.title}{d.em && <em>{d.em}</em>}</h3>
                  <span className="round-arrow"><ArrowUpRight size={18} /></span>
                </div>
                <p>{d.description}</p>
              </Link>
            ))}
          </div>
          <RowScrollArrow gridSelector=".department-row .department-grid--scroll" arrowClassName="department-scroll-arrow" />
        </div>
      </section>

      <section className="relationship-band">
        <RelationshipArt />
        <div className="relationship-copy">
          <span className="eyebrow">Our world is people</span>
          <h2>Every relationship<br />has its own <em>language.</em></h2>
          <p>Kin Keeper. Work Bestie. Chosen family. The ones who make the hard days lighter and the good days better. Find the words that feel like yours.</p>
          <Link className="button button-dark" href="/relationships">Find your people <ArrowRight size={16} /></Link>
          <div className="relationship-meta">
            <span>Relationships, celebrated</span>
            <span>EST. WITH LOVE&nbsp; / &nbsp;UNSAID</span>
          </div>
        </div>
      </section>

      <section className="section collection-section">
        <div className="section-heading compact">
          <div>
            <span className="eyebrow">The feeling behind the gift</span>
            <h2>Made for <em>your people.</em></h2>
          </div>
          <p className="section-description">Shop by the connection, not the calendar.</p>
        </div>
        <div className="collection-row">
          <div className="collection-grid collection-grid--scroll">
            {COLLECTION_CARDS.map((c) => (
              <Link
                key={c.photo}
                href={c.href}
                className="collection-card"
              >
                <div
                  className="collection-photo"
                  style={{ backgroundImage: `url("${c.photo}")`, backgroundPosition: "center top" }}
                />
                <span className="collection-label">{c.label}</span>
                <div className="collection-title">
                  <h3>{c.title}</h3>
                  <ArrowUpRight size={18} />
                </div>
              </Link>
            ))}
          </div>
          <RowScrollArrow gridSelector=".collection-row .collection-grid--scroll" />
        </div>
      </section>

      <section className="quote-section">
        <div className="quote-left">
          <span className="quote-mark">&ldquo;</span>
          <p>Connection isn&apos;t always a grand gesture.<br />Sometimes it&apos;s a <em>small thing, said well.</em></p>
          <span className="quote-attribution">THE UNSAID POINT OF VIEW</span>
          <div className="quote-decoration"><span>u.</span><i /><span>MEAN MORE</span></div>
        </div>
        <div className="quote-right">
          <div className="section-head">
            <div>
              <div className="eyebrow">Shop by relationship</div>
              <h2>For the people who are your people.</h2>
            </div>
            <p className="section-intro">Every connection has its own language. Explore a point of view made for the people who show up, stay close, and make a difference.</p>
          </div>
          <div className="relationship-grid">
            <Link className="relationship" href="/relationships/kin-keeper"><div className="rel-icon">✳</div><strong>Kin Keeper</strong><span>For the heart of it ↗</span><i className="rel-blob" /></Link>
            <Link className="relationship" href="/relationships/work-bestie"><div className="rel-icon">✦</div><strong>Work Bestie</strong><span>Better, together ↗</span><i className="rel-blob" /></Link>
            <Link className="relationship" href="/relationships/chosen-family"><div className="rel-icon">♡</div><strong>Chosen Family</strong><span>Love is who you choose ↗</span><i className="rel-blob" /></Link>
            <Link className="relationship" href="/relationships/mentor"><div className="rel-icon">✧</div><strong>Mentor</strong><span>For the ones who guide ↗</span><i className="rel-blob" /></Link>
            <Link className="relationship" href="/relationships/ride-or-die"><div className="rel-icon">∞</div><strong>Ride or Die</strong><span>Always in your corner ↗</span><i className="rel-blob" /></Link>
          </div>
        </div>
      </section>

      {/* Video feature: Made for your people. Above-footer fixture with the
          uploaded video as background. DO NOT change the styling here — it
          was fixed per user feedback (purple-to-pink gradient, no blue,
          light white overlay over the video). */}
      <section className="video-feature" aria-label="Made for your people">
        <video autoPlay muted loop playsInline>
          <source src="/made-for-your-people.mp4" type="video/mp4" />
        </video>
        <div className="video-band" />
        <div className="video-frame" />
        <div className="video-type">Made for<br /><span>your people.</span><small>UNSAID · THOUGHTFUL BY DESIGN</small></div>
        <span className="video-side-label">Every bond · Every chapter · Every day</span>
        <span className="video-index">02 / 04</span>
        <span className="video-caption">MADE FOR YOUR PEOPLE</span>
      </section>
    </main>
  );
}
