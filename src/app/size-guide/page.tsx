import type { Metadata } from "next";
import { BrandPage } from "@/components/brand-page";
import { SizeGuideDirectory } from "@/components/size-guide-directory";
import { findBrandPage } from "@/lib/brand-pages";
import "@/components/size-guide.css";

// The owner's size-guide page (his editorial frame) + his directory
// structure (unsaid-size-guide.html): departments → categories →
// one guide per product, each guide a real route under
// /size-guide/<slug>. Vendor names appear nowhere.
const page = findBrandPage("size-guide")!;

export const metadata: Metadata = { title: page.title };

export default function Page() {
  return (
    <BrandPage page={page}>
      <section className="brand-extra">
        <SizeGuideDirectory />
        <div className="sg-seo">
          <h2>How to choose the right size</h2>
          <p>
            Size labels are not universal. A medium in one style may not match a medium in
            another, so use the measurements for the exact product you are buying. Some
            charts describe the garment laid flat; others describe the body measurements
            the garment is designed to fit. Check the measurement labels before comparing
            numbers.
          </p>
          <p>
            For a garment measured flat, lay a similar item you own on a level surface and
            compare the width and length. For body measurements, use a soft tape measure
            and keep it comfortably close to the body without pulling tight. If you are
            between sizes, follow the fit advice shown with that product.
          </p>
          <p>
            Measurements are presented as published in the supplied product sizing
            information. Small production tolerances may occur. If an individual product
            page includes its own size chart, that chart takes precedence over this
            general guide.
          </p>
        </div>
      </section>
    </BrandPage>
  );
}
