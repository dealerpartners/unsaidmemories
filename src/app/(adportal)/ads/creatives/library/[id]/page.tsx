"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Creative = {
  id: string; name: string; status: string; asset_url: string; click_url: string;
  headline: string | null; body: string | null; cta: string | null;
  width: number; height: number; campaign_name: string | null; group_name: string | null;
  created_at: string; updated_at: string;
};

const inputCls = "w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none";

export default function Page() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [c, setC] = useState<Creative | null>(null);
  const [missing, setMissing] = useState(false);
  const [form, setForm] = useState({ name: "", headline: "", body: "", cta: "", asset_url: "", click_url: "", width: "", height: "" });
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!params?.id) return;
    fetch("/api/ads/creatives").then((r) => (r.ok ? r.json() : { creatives: [] }))
      .then((d) => {
        const found = (d.creatives ?? []).find((x: Creative) => String(x.id) === String(params.id));
        if (!found) { setMissing(true); return; }
        setC(found);
        setForm({
          name: found.name ?? "", headline: found.headline ?? "", body: found.body ?? "",
          cta: found.cta ?? "", asset_url: found.asset_url ?? "", click_url: found.click_url ?? "",
          width: String(found.width ?? ""), height: String(found.height ?? ""),
        });
      }).catch(() => setMissing(true));
  }, [params?.id]);

  if (missing) return <div><h1 className="text-2xl font-bold tracking-tight text-neutral-900">Creative not found</h1><p className="mt-1 text-sm text-neutral-500">This creative doesn't exist or isn't on your account.</p></div>;
  if (!c) return <div><h1 className="text-2xl font-bold tracking-tight text-neutral-900">Creative</h1><p className="mt-1 text-sm text-neutral-500">Loading…</p></div>;

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  const save = () => {
    setNote("");
    setSaving(true);
    fetch(`/api/ads/creatives/${c.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.name, headline: form.headline, body: form.body, cta: form.cta, asset_url: form.asset_url, click_url: form.click_url, width: Number(form.width) || undefined, height: Number(form.height) || undefined }),
    })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "save_failed"); setNote("Saved."); setSaving(false); })
      .catch((e) => { setNote("Couldn't save: " + String(e?.message || "unknown error")); setSaving(false); });
  };

  const remove = () => {
    setSaving(true);
    fetch(`/api/ads/creatives/${c.id}`, { method: "DELETE" })
      .then(() => router.push("/ads/creatives/library"))
      .catch(() => { setNote("Couldn't delete this creative."); setSaving(false); });
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">{c.name}</h1>
        <p className="mt-1 text-sm text-neutral-500">{c.campaign_name ?? "—"} · {c.group_name ?? "—"} · {c.status} · created {new Date(c.created_at).toLocaleString("en-US")}</p>
      </div>
      {note && <div className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">{note}</div>}
      <div className="space-y-5 rounded-xl border border-neutral-100 bg-white p-6">
        <div><label className="mb-1 block text-sm font-medium text-neutral-700">Name</label><input value={form.name} onChange={set("name")} className={inputCls} /></div>
        <div><label className="mb-1 block text-sm font-medium text-neutral-700">Headline</label><input value={form.headline} onChange={set("headline")} className={inputCls} /></div>
        <div><label className="mb-1 block text-sm font-medium text-neutral-700">Body</label><textarea value={form.body} onChange={set("body")} rows={3} className={inputCls} /></div>
        <div><label className="mb-1 block text-sm font-medium text-neutral-700">Call-to-action</label><input value={form.cta} onChange={set("cta")} className={inputCls} /></div>
        <div><label className="mb-1 block text-sm font-medium text-neutral-700">Asset URL</label><input value={form.asset_url} onChange={set("asset_url")} className={inputCls} /></div>
        <div><label className="mb-1 block text-sm font-medium text-neutral-700">Destination URL</label><input value={form.click_url} onChange={set("click_url")} className={inputCls} /></div>
        <div className="flex gap-4">
          <div className="flex-1"><label className="mb-1 block text-sm font-medium text-neutral-700">Width</label><input value={form.width} onChange={set("width")} type="number" className={inputCls} /></div>
          <div className="flex-1"><label className="mb-1 block text-sm font-medium text-neutral-700">Height</label><input value={form.height} onChange={set("height")} type="number" className={inputCls} /></div>
        </div>
        <div className="flex items-center justify-between pt-2">
          <button onClick={remove} disabled={saving} className="text-sm font-medium text-red-600 disabled:opacity-40">Delete creative</button>
          <button onClick={save} disabled={saving} className="rounded-lg bg-[#f2eafe] px-5 py-2 text-sm font-medium text-[#6942c2] disabled:opacity-50">Save changes</button>
        </div>
      </div>
    </div>
  );
}
