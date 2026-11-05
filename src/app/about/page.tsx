import type { Metadata } from "next";
import { BrandPage } from "@/components/brand-page";
import { findBrandPage } from "@/lib/brand-pages";

// /about — the main navigation links here ("ABOUT US"); the content is
// the owner's Our Story page (our-story.html), also served at /our-story.
const page = findBrandPage("our-story")!;

export const metadata: Metadata = { title: page.title };

export default function Page() {
  return <BrandPage page={page} />;
}
