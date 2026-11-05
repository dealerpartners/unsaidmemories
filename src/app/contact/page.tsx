import type { Metadata } from "next";
import { BrandPage } from "@/components/brand-page";
import { ContactPageForm } from "@/components/contact-page-form";
import { findBrandPage } from "@/lib/brand-pages";

// The owner's contact page. The form posts to the canonical
// POST /api/support/contact, which creates a real Support Desk
// ticket staff work from. Partnership and
// programme CTAs across his pages arrive with ?topic=partnerships.
const page = findBrandPage("contact")!;

export const metadata: Metadata = { title: page.title };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  const { topic } = await searchParams;
  return (
    <BrandPage page={page}>
      <section className="brand-extra">
        <ContactPageForm initialTopic={topic} />
      </section>
    </BrandPage>
  );
}
