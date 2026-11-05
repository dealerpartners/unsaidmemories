"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type LibRow = { id: string; name: string; type: string; size: string; status: string; updated: string; tags: string };

export default function Page() {
  const [rows, setRows] = useState<LibRow[]>([]);
  useEffect(() => {
    fetch("/api/ads/creatives").then((r) => (r.ok ? r.json() : { creatives: [] }))
      .then((d) => setRows(((d.creatives ?? []) as any[]).map((c) => ({
        id: String(c.id), name: c.name,
        type: c.type ? c.type.charAt(0).toUpperCase() + c.type.slice(1) : "Image",
        size: c.width && c.height ? `${c.width}×${c.height}` : "—",
        status: c.status === "approved" ? "Approved" : c.status === "pending_review" ? "Pending Review" : c.status === "in_review" ? "In Review" : c.status === "rejected" ? "Rejected" : c.status,
        updated: c.updated_at ? new Date(c.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—",
        tags: "—",
      })))).catch(() => {});
  }, []);
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Creative Library</h1>
          <p className="mt-1 text-sm text-neutral-500">Store and reuse approved creative assets. Search, tag, and manage versions.</p>
        </div>
                <Link
          href="/ads/creatives/create"
          className="flex h-9 items-center gap-2 rounded-lg bg-[#f2eafe] px-4 text-sm font-medium text-[#6942c2] transition-colors hover:bg-[#e7dbfc]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          Upload Asset
        </Link>
      </div>

      <div className="rounded-xl border border-neutral-100 bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-100 text-left text-xs font-medium uppercase tracking-wider text-neutral-400">
              <th className="px-4 py-3">Asset</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Size</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last updated</th>
              <th className="px-4 py-3">Tags</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-sm text-neutral-500">No creatives yet — create one and it will appear here.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-neutral-50">
                <td className="px-4 py-3 text-sm text-neutral-700"><Link href={`/ads/creatives/library/${r.id}`} className="font-medium text-neutral-900 hover:underline">{r.name}</Link></td>
                <td className="px-4 py-3 text-sm text-neutral-700">{r.type}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{r.size}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{r.status}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{r.updated}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{r.tags}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
