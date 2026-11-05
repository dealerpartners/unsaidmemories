"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {

  const [products, setProducts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const load = (search = "") => {
    fetch(`/api/products?perPage=50${search ? `&search=${encodeURIComponent(search)}` : ""}`)
      .then((r) => (r.ok ? r.json() : { products: [], total: 0 }))
      .then((d) => { setProducts(d.products ?? []); setTotal(d.total ?? 0); }).catch(() => {});
  };
  useEffect(() => { load(); }, []);
  const shown = products;
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Products</h1>
        <p className="mt-1 text-sm text-neutral-500">The store's sellable products — the catalog catalog ads draw from. {total.toLocaleString("en-US")} in the catalog; this page shows the first {products.length}.</p>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); load(q); }} className="mb-4 flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" className="h-10 flex-1 rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none" />
        <button type="submit" className="rounded-lg bg-[#f2eafe] px-4 text-sm font-medium text-[#6942c2]">Search</button>
      </form>
      <div className="rounded-xl border border-neutral-100 bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-100 text-left text-xs font-medium uppercase tracking-wider text-neutral-400">
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Brand</th>
              <th className="px-4 py-3">Price from</th>
              <th className="px-4 py-3">Variants</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-sm text-neutral-500">No products match.</td></tr>}
            {shown.map((p) => (
              <tr key={p.id} className="border-b border-neutral-50">
                <td className="px-4 py-3 text-sm text-neutral-700"><Link href={`/ads/catalog/products/${p.id}`} className="font-medium text-neutral-900 hover:underline">{p.name}</Link></td>
                <td className="px-4 py-3 text-sm text-neutral-700">{p.brand ?? "—"}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{p.minPrice != null ? `$${Number(p.minPrice).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{p.variantCount ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
