"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<any>(null);
  useEffect(() => { fetch(`/api/products/${id}`).then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => {}); }, [id]);
  const p = data?.product;
  const variants: any[] = data?.variants ?? [];
  const priced = variants.filter((v) => v.price != null);
  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-400"><Link href="/ads/assets/catalogs" className="hover:underline">Catalog Assets</Link></p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-900">{p ? p.name : "Loading…"}</h1>
        {p && <p className="mt-1 text-sm text-neutral-500">{p.brand_name ?? p.brand ?? ""} · {variants.length} variants{priced.length ? ` · from $${Math.min(...priced.map((v) => Number(v.price))).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : ""}</p>}
      </div>
      <p className="text-sm"><Link href={`/ads/catalog/products/${id}`} className="font-medium text-neutral-900 underline">Open the full product record</Link></p>
    </div>
  );
}
