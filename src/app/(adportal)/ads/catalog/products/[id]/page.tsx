"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<any>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    fetch(`/api/products/${id}`).then((r) => { if (r.status === 404) { setMissing(true); return null; } return r.ok ? r.json() : null; })
      .then(setData).catch(() => {});
  }, [id]);
  const p = data?.product;
  const variants: any[] = data?.variants ?? [];
  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-400"><Link href="/ads/catalog/products" className="hover:underline">Products</Link></p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-900">{missing ? "Product not found" : (p?.name ?? "Loading…")}</h1>
        {p && <p className="mt-1 text-sm text-neutral-500">{p.brand_name ?? p.brand ?? ""}</p>}
      </div>
      {p?.image_url || p?.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.image_url ?? p.image} alt={p.name ?? "Product"} className="mb-6 h-56 w-56 rounded-xl border border-neutral-100 object-cover" />
      ) : null}
      {variants.length > 0 && (
        <div className="rounded-xl border border-neutral-100 bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-100 text-left text-xs font-medium uppercase tracking-wider text-neutral-400">
                <th className="px-4 py-3">Variant</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">Color</th>
                <th className="px-4 py-3">Price</th>
              </tr>
            </thead>
            <tbody>
              {variants.map((v) => (
                <tr key={v.id} className="border-b border-neutral-50">
                  <td className="px-4 py-3 text-sm text-neutral-700">{v.name ?? v.sku ?? v.id}</td>
                  <td className="px-4 py-3 text-sm text-neutral-700">{v.size ?? "—"}</td>
                  <td className="px-4 py-3 text-sm text-neutral-700">{v.color ?? "—"}</td>
                  <td className="px-4 py-3 text-sm text-neutral-700">{v.price != null ? `$${Number(v.price).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {p && variants.length === 0 && <p className="text-sm text-neutral-500">This product has no priced variants recorded.</p>}
    </div>
  );
}
