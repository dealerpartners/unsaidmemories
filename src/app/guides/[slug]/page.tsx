import { promises as fs } from "fs";
import path from "path";
import Link from "next/link";
import { ArrowRight, ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CITY_GUIDE_SLUGS } from "@/lib/city-guide-slugs";
import { CITY_SHOP_DATA } from "@/lib/city-shop-data";

// /guides/[slug] — the 4,955 SEO city-guide pages, wrapped in the site's
// navigation and footer (via the root layout's SiteShell). The guide's
// own CSS is scoped by prefixing every selector with .city-guide-content
// so it can't conflict with the site's CSS (.hero, .section, etc.).

const GUIDES_DIR = path.join(process.cwd(), "public", "guides");

export function generateStaticParams() {
  return CITY_GUIDE_SLUGS.map((slug) => ({ slug }));
}

export const dynamicParams = true;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const file = path.join(GUIDES_DIR, `${slug}.html`);
  try {
    const html = await fs.readFile(file, "utf-8");
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const descMatch = html.match(/<meta name="description" content="([^"]+)"/);
    return {
      title: titleMatch ? titleMatch[1] : "UnSaid City Guide",
      description: descMatch ? descMatch[1] : undefined,
    };
  } catch {
    return { title: "UnSaid City Guide" };
  }
}

// Scope the guide's CSS so it only applies inside .city-guide-content.
// Handles :root, body, html, *, tag selectors, class selectors, comma-
// separated selectors, and @media/@keyframes blocks.
function scopeCss(css: string): string {
  let result = "";
  let i = 0;
  while (i < css.length) {
    // Find the next selector block
    const braceOpen = css.indexOf("{", i);
    if (braceOpen === -1) break;

    const selectorPart = css.slice(i, braceOpen).trim();
    const braceClose = css.indexOf("}", braceOpen);
    if (braceClose === -1) break;
    const body = css.slice(braceOpen, braceClose + 1);

    if (selectorPart.startsWith("@media") || selectorPart.startsWith("@supports")) {
      // For @media/@supports, scope the inner rules
      const inner = css.slice(braceOpen + 1, braceClose);
      const scopedInner = scopeCss(inner);
      result += `${selectorPart} {${scopedInner}}`;
    } else if (selectorPart.startsWith("@keyframes") || selectorPart.startsWith("@font-face")) {
      // Keep @keyframes/@font-face as-is (they're already scoped by name)
      result += `${selectorPart} ${body}`;
    } else {
      // Scope each comma-separated selector
      const scoped = selectorPart
        .split(",")
        .map((s) => {
          s = s.trim();
          if (!s) return s;
          // :root → .city-guide-content (variables scoped to container)
          if (s === ":root") return ".city-guide-content";
          // body, html → .city-guide-content
          if (s === "body" || s === "html") return ".city-guide-content";
          // body.something, html.something → .city-guide-content.something
          if (s.startsWith("body.") || s.startsWith("html.")) {
            return ".city-guide-content" + s.slice(4);
          }
          // * → .city-guide-content *
          if (s === "*") return ".city-guide-content *";
          // Everything else: prefix with .city-guide-content
          return `.city-guide-content ${s}`;
        })
        .join(", ");
      result += `${scoped} ${body}`;
    }

    i = braceClose + 1;
  }
  return result;
}

export default async function CityGuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const file = path.join(GUIDES_DIR, `${slug}.html`);

  let html: string;
  try {
    html = await fs.readFile(file, "utf-8");
  } catch {
    notFound();
  }

  // Extract the <style> block from the head (the guide's own CSS).
  const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
  const guideStyle = styleMatch ? scopeCss(styleMatch[1]) : "";

  // Extract the body content.
  const bodyMatch = html.match(/<body>([\s\S]*?)<\/body>/);
  let body = bodyMatch ? bodyMatch[1] : "";

  // Strip the standalone nav/footer/announcement — the site's SiteShell
  // provides these. Keep the hero and all content sections.
  body = body
    .replace(/<div class="announcement">[\s\S]*?<\/div>/, "")
    .replace(/<header[\s\S]*?<\/header>/, "")
    .replace(/<footer[\s\S]*?<\/footer>/, "")
    .replace(/<nav class="nav"[\s\S]*?<\/nav>/, "");

  // Rewrite Wikimedia image URLs to local files when they exist.
  const heroLocal = path.join(GUIDES_DIR, "images", `${slug}-hero.jpg`);
  const spotLocal = path.join(GUIDES_DIR, "images", `${slug}-spot.jpg`);
  try { await fs.access(heroLocal); body = body.replace(/src="https:\/\/upload\.wikimedia\.org\/[^"]*"/, `src="/guides/images/${slug}-hero.jpg"`); } catch {}
  try { await fs.access(spotLocal); body = body.replace(/src="https:\/\/upload\.wikimedia\.org\/[^"]*"/, `src="/guides/images/${slug}-spot.jpg"`); } catch {}

  // Rewrite "Explore <category>" button links from #about to the city's
  // boasted category shop page (/shop/city/{slug}/{category}). The guide
  // HTML has href="#about" on the Explore button — that just scrolls down.
  // It should route to the city's category shop page so clicking "Explore
  // Lockets" goes to /shop/city/nashville-tennessee/kin-keeper.
  const cityShop = CITY_SHOP_DATA[slug];
  if (cityShop?.boasted) {
    const cityShopUrl = `/shop/city/${slug}/${cityShop.boasted.slug}`;
    // Replace the FIRST href="#about" that's inside an <a class="btn..."> —
    // that's the "Explore <category>" button. Leave the "Discover the city"
    // link (also #about) alone — it's a legitimate scroll link.
    body = body.replace(
      /(<a class="btn btn-primary" href="#about")/,
      `<a class="btn btn-primary" href="${cityShopUrl}"`,
    );
  }

  return (
    <main className="city-guide-wrap">
      <div className="city-guide-back">
        <Link href="/guides-stories">
          <ArrowLeft size={14} /> All city guides
        </Link>
      </div>

      <style dangerouslySetInnerHTML={{ __html: guideStyle }} />

      <div
        className="city-guide-content"
        dangerouslySetInnerHTML={{ __html: body }}
      />

      <div className="city-guide-footer-link">
        <Link href="/guides-stories" className="text-link">
          Browse all city guides <ArrowRight size={15} />
        </Link>
      </div>
    </main>
  );
}
