import type { Metadata } from "next";
import { BrandPage } from "@/components/brand-page";
import { findBrandPage } from "@/lib/brand-pages";

// Ported from the owner's finished page (senior-living.html) — his design
// and copy, real routes. See src/lib/brand-pages.ts.
const page = findBrandPage("senior-living")!;

export const metadata: Metadata = { title: page.title };

export default function Page() {
  return <BrandPage page={page} />;
}
