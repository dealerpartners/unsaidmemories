"use client";

import { useEffect, useState } from "react";

export default function Page() {
  const [lib, setLib] = useState<any[]>([]);
  const [picked, setPicked] = useState("");
  useEffect(() => {
    fetch("/api/ads/creatives").then((r) => (r.ok ? r.json() : { creatives: [] }))
      .then((d) => { const list = d.creatives ?? []; setLib(list); if (list[0]) setPicked(String(list[0].id)); })
      .catch(() => {});
  }, []);
  const c = lib.find((x) => String(x.id) === picked);
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Preview</h1>
        <p className="mt-1 text-sm text-neutral-500">See a creative as its real asset, call-to-action and destination.</p>
      </div>
      <div className="mb-5">
        <select value={picked} onChange={(e) => setPicked(e.target.value)} className="h-11 w-full rounded-lg border border-neutral-200 bg-white px-4 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none">
          {lib.length === 0 && <option value="">No creatives yet</option>}
          {lib.map((x) => (<option key={x.id} value={String(x.id)}>{x.name}</option>))}
        </select>
      </div>
      {c && (
        <div className="rounded-xl border border-neutral-100 bg-white p-6">
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
            {c.type === "audio" ? (
              <audio controls src={c.asset_url} className="w-full" />
            ) : c.type === "video" ? (
              <video controls src={c.asset_url} className="w-full rounded" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.asset_url} alt={c.name} className="mx-auto max-h-80 rounded" />
            )}
          </div>
          <p className="mt-4 text-sm font-medium text-neutral-900">{c.headline || c.name}</p>
          {c.body && <p className="mt-1 text-sm text-neutral-600">{c.body}</p>}
          <p className="mt-3 text-sm">
            <span className="rounded-lg bg-[#f2eafe] px-3 py-1.5 text-xs font-medium text-[#6942c2]">{c.cta || "Learn More"}</span>
            <a href={c.click_url} target="_blank" rel="noreferrer" className="ml-3 text-xs text-neutral-500 underline">{c.click_url}</a>
          </p>
          <p className="mt-3 text-xs text-neutral-400">Status: {c.status} · Campaign: {c.campaign_name ?? "—"}</p>
        </div>
      )}
    </div>
  );
}
