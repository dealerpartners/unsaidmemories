import type { Metadata } from "next";
import { BrandPage } from "@/components/brand-page";
import { TrackOrderForm } from "@/components/track-order-form";
import { findBrandPage } from "@/lib/brand-pages";

// The owner's track-order page, with the lookup wired live to
// orders + fulfilment (POST /api/track-order; exact-email match only).
const page = findBrandPage("track-order")!;

export const metadata: Metadata = { title: page.title };

export default function Page() {
  return (
    <BrandPage page={page}>
      <section className="brand-extra">
        <TrackOrderForm />
      </section>
    </BrandPage>
  );
}
