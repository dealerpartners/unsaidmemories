import type { Metadata } from "next";
import { BrandPage } from "@/components/brand-page";
import { findBrandPage } from "@/lib/brand-pages";
import { GiftFinderBox } from "@/components/gift-finder-box";
import { createServerClient } from "@/lib/supabase";

// Ported from the owner's finished page (gift-finder.html) — his design
// and copy, real routes. See src/lib/brand-pages.ts.
const page = findBrandPage("gift-finder")!;

export const metadata: Metadata = { title: page.title };

export default async function Page() {
  // The interactive finder itself (recipient / occasion / price-band
  // picks against /api/gift-finder). It used to sit on /shop and was
  // removed from there, which left this page — the page every menu and
  // footer link points to — with no finder on it at all. It belongs
  // here, under the owner's intro copy.
  const sb = createServerClient();
  const { count } = await sb
    .from("supplier_catalog_products")
    .select("id", { count: "exact", head: true })
    .eq("is_hidden", false);

  return (
    <>
      <BrandPage page={page} />
      <section className="section" style={{ paddingTop: 0 }}>
        <GiftFinderBox catalogTotal={count ?? 0} />
      </section>
    </>
  );
}
