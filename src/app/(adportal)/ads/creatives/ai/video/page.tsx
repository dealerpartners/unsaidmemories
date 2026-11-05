"use client";

import { useState } from "react";

type Variant = { headline: string; body: string; cta: string };

export default function Page() {
  const [brief, setBrief] = useState("");
  const [objective, setObjective] = useState("traffic");
  const [variants, setVariants] = useState<Variant[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const generate = () => {
    setNote("");
    if (!brief.trim()) { setNote("Write a short brief first — what the ad is for, who it's for, the offer."); return; }
    setBusy(true);
    fetch("/api/ads/creatives/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brief: brief.trim(), objective }) })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "generate_failed"); return d; })
      .then((d) => { setVariants(d.variants ?? []); if (!(d.variants ?? []).length) setNote("The generator returned nothing this time — try a more specific brief."); })
      .catch((e) => setNote("Couldn't generate: " + String(e?.message || "unknown error")))
      .finally(() => setBusy(false));
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Video Generator</h1>
        <p className="mt-1 text-sm text-neutral-500">The generator writes the script and copy for a video ad from your brief — it does not render a video file.</p>
      </div>
      {note && <div className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">{note}</div>}
      <div className="space-y-5 rounded-xl border border-neutral-100 bg-white p-6">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-neutral-700">Brief</label>
          <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={4} placeholder="e.g. A 30-second spot for our summer sale — upbeat, aimed at existing customers, 20% off through Sunday." className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-neutral-700">Objective</label>
          <select value={objective} onChange={(e) => setObjective(e.target.value)} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:border-neutral-400 focus:outline-none">
            <option value="traffic">Traffic</option>
            <option value="awareness">Awareness</option>
            <option value="conversions">Conversions</option>
            <option value="leads">Leads</option>
          </select>
        </div>
        <div className="flex justify-end">
          <button onClick={generate} disabled={busy} className="h-10 rounded-lg bg-[#f2eafe] px-6 text-sm font-medium text-[#6942c2] transition-colors hover:bg-[#e7dbfc] disabled:opacity-50">{busy ? "Generating…" : "Generate variants"}</button>
        </div>
      </div>
      {variants.length > 0 && (
        <div className="mt-6 space-y-4">
          {variants.map((v, i) => (
            <div key={i} className="rounded-xl border border-neutral-100 bg-white p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-neutral-400">Variant {i + 1}</p>
              <p className="mt-2 text-base font-semibold text-neutral-900">{v.headline}</p>
              <p className="mt-1 text-sm text-neutral-600">{v.body}</p>
              <p className="mt-3"><span className="rounded-lg bg-[#f2eafe] px-3 py-1.5 text-xs font-medium text-[#6942c2]">{v.cta}</span></p>
            </div>
          ))}
          <p className="text-xs text-neutral-400">Variants are copy only — attach one to a real creative from the campaign page or the Create Ad form.</p>
        </div>
      )}
    </div>
  );
}
