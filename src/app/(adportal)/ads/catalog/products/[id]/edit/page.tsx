"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [p, setP] = useState<any>(null);
  useEffect(() => {
    fetch(`/api/products/${id}`).then((r) => (r.ok ? r.json() : null)).then((d) => setP(d?.product ?? null)).catch(() => {});
  }, [id]);
  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-400"><Link href="/ads/catalog/products" className="hover:underline">Products</Link></p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-900">Edit Product</h1>
        <p className="mt-1 text-sm text-neutral-500">{p ? p.name : "Loading…"}</p>
      </div>
      <div className="max-w-2xl rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>Catalog products aren't edited from the ads portal — this product is a store catalog record (sourced from its supplier), and its name, images and prices are maintained where the catalog is managed, not here. The ads side only reads it, which is why the sample edit form that used to sit on this page has been removed.</p>
        <p className="mt-3"><Link href={`/ads/catalog/products/${id}`} className="font-medium text-neutral-900 underline">View the product as ads see it</Link></p>
      </div>
    </div>
  );
}
