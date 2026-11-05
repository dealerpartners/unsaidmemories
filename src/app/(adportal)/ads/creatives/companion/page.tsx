"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {
  const [lib, setLib] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/ads/creatives").then((r) => (r.ok ? r.json() : { creatives: [] }))
      .then((d) => setLib((d.creatives ?? []).filter((c: any) => c.type === "image"))).catch(() => {});
  }, []);
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Companion</h1>
        <p className="mt-1 text-sm text-neutral-500">Image creatives that can accompany audio and video ads.</p>
      </div>
      <div className="mb-6 rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>Companions aren't a separate asset type in this system — an image creative is the visual that can pair with an audio or video ad. The image creatives in your library are the companion pool:</p>
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-100 text-left text-xs font-medium uppercase tracking-wider text-neutral-400">
              <th className="px-4 py-3">Creative</th>
              <th className="px-4 py-3">Size</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {lib.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-6 text-sm text-neutral-500">No image creatives yet.</td></tr>
            )}
            {lib.map((c) => (
              <tr key={c.id} className="border-b border-neutral-50">
                <td className="px-4 py-3 text-sm text-neutral-700"><Link href={`/ads/creatives/library/${c.id}`} className="font-medium text-neutral-900 hover:underline">{c.name}</Link></td>
                <td className="px-4 py-3 text-sm text-neutral-700">{c.width && c.height ? `${c.width}×${c.height}` : "—"}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{c.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
