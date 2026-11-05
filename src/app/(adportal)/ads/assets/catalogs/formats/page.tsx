"use client";

import Link from "next/link";

const FORMATS = [
  { label: "Carousel", href: "/ads/catalog/formats/carousel", desc: "Products with two or more images" },
  { label: "Product Showcase", href: "/ads/catalog/formats/product-showcase", desc: "Products with an image to front the ad" },
  { label: "Shoppable", href: "/ads/catalog/formats/shoppable", desc: "Products with a price" },
];

export default function Page() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Catalog Formats</h1>
        <p className="mt-1 text-sm text-neutral-500">The catalog ad formats and the products eligible for each — the full lists live in the Catalog section.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {FORMATS.map((f) => (
          <Link key={f.label} href={f.href} className="rounded-xl border border-neutral-100 bg-white p-5 transition-colors hover:border-neutral-200 hover:bg-neutral-50">
            <h3 className="text-sm font-semibold text-neutral-900">{f.label}</h3>
            <p className="mt-1 text-xs text-neutral-500">{f.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
