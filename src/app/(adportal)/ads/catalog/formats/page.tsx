"use client";

import Link from "next/link";

export default function Page() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Catalog Formats</h1>
        <p className="mt-1 text-sm text-neutral-500">Choose a catalog ad format.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/ads/catalog/formats/carousel"
            className="rounded-xl border border-neutral-100 bg-white p-5 transition-colors hover:border-neutral-200 hover:bg-neutral-50"
          >
            <h3 className="text-sm font-semibold text-neutral-900">Carousel</h3>
            <p className="mt-1 text-xs text-neutral-500">Swipeable product carousel</p>
          </Link>
          <Link
            href="/ads/catalog/formats/shoppable"
            className="rounded-xl border border-neutral-100 bg-white p-5 transition-colors hover:border-neutral-200 hover:bg-neutral-50"
          >
            <h3 className="text-sm font-semibold text-neutral-900">Shoppable</h3>
            <p className="mt-1 text-xs text-neutral-500">Directly shoppable product cards</p>
          </Link>
          <Link
            href="/ads/catalog/formats/product-showcase"
            className="rounded-xl border border-neutral-100 bg-white p-5 transition-colors hover:border-neutral-200 hover:bg-neutral-50"
          >
            <h3 className="text-sm font-semibold text-neutral-900">Product Showcase</h3>
            <p className="mt-1 text-xs text-neutral-500">Single product highlight</p>
          </Link>

      </div>
    </div>
  );
}
