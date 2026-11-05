"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {
  const [links, setLinks] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [cid, setCid] = useState("");
  const [title, setTitle] = useState("");
  const [dest, setDest] = useState("");
  const [note, setNote] = useState("");
  const load = () => { fetch("/api/ads/smart-links").then((r) => (r.ok ? r.json() : { links: [] })).then((d) => setLinks(d.links ?? [])).catch(() => {}); };
  useEffect(() => { load(); fetch("/api/ads/campaigns").then((r) => (r.ok ? r.json() : { campaigns: [] })).then((d) => setCampaigns(d.campaigns ?? [])).catch(() => {}); }, []);
  const create = () => {
    setNote("");
    fetch("/api/ads/smart-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaign_v2_id: cid, title: title.trim(), destination_url: dest.trim() }) })
      .then(async (r) => { if (!r.ok) { const d = await r.json().catch(() => null); throw new Error(d?.error ?? "create_failed"); } setTitle(""); setDest(""); setNote("Smart link created."); load(); })
      .catch((e) => setNote(`Couldn't create the link (${e.message}).`));
  };
  const inputCls = "h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none";
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Smart Links</h1>
        <p className="mt-1 text-sm text-neutral-500">Trackable short links for campaigns — clicks are counted on the link record.</p>
      </div>
      <div className="mb-6 max-w-2xl rounded-xl border border-neutral-100 bg-white p-6">
        <div className="grid grid-cols-1 gap-3">
          <select value={cid} onChange={(e) => setCid(e.target.value)} className={inputCls}><option value="">Choose a campaign…</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Link title" className={inputCls} />
          <input value={dest} onChange={(e) => setDest(e.target.value)} placeholder="Destination URL (https://…)" className={inputCls} />
        </div>
        {note && <p className="mt-3 text-sm text-neutral-600">{note}</p>}
        <div className="mt-4"><button onClick={create} disabled={!cid || !title.trim() || !dest.trim()} className="rounded-lg bg-[#f2eafe] px-5 py-2 text-sm font-medium text-[#6942c2] disabled:opacity-40">Create smart link</button></div>
      </div>
      <div className="space-y-2">
        {links.length === 0 && <p className="text-sm text-neutral-500">No smart links yet.</p>}
        {links.map((l) => (
          <div key={l.id} className="flex items-center justify-between rounded-xl border border-neutral-100 bg-white p-4">
            <div><p className="text-sm font-medium text-neutral-900">{l.title ?? l.slug}</p><p className="text-xs text-neutral-500">{l.campaign_name} · /{l.slug} → {l.destination_url}</p></div>
            <span className="text-sm text-neutral-600">{Number(l.clicks ?? 0).toLocaleString("en-US")} clicks</span>
          </div>
        ))}
      </div>
    </div>
  );
}
