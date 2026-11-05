import type { Metadata } from "next";
import { BrandPage } from "@/components/brand-page";
import { findBrandPage } from "@/lib/brand-pages";

// /community — the community face of the partnerships the owner specced
// (unsaid-partners.html): the places and people who hold communities
// together, each with its own real pathway route.
const page = findBrandPage("community")!;

export const metadata: Metadata = { title: page.title };

export default function Page() {
  return <BrandPage page={page} />;
}
