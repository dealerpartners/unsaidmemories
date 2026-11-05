import type { Metadata } from "next";
import { BrandPage } from "@/components/brand-page";
import { findBrandPage } from "@/lib/brand-pages";
import { CityGuideDirectory } from "@/components/city-guide-directory";

// /guides-stories — the owner's brand page on top, then the city guide
// directory below it: 51 state cards that expand to show cities, matching
// the sitemap template exactly. Click a city → /guides/{slug}.
const page = findBrandPage("guides-stories")!;

export const metadata: Metadata = { title: page.title };

export default function Page() {
  return (
    <>
      <BrandPage page={page} />
      <CityGuideDirectory />
    </>
  );
}
