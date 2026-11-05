"use client";

import { useEffect, useState } from "react";

export default function Page() {
  const [adv, setAdv] = useState<any>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => {
    fetch("/api/ads/account").then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.advertiser) { setAdv(d.advertiser); setName(d.advertiser.display_name ?? ""); } })
      .catch(() => {});
  }, []);
  const save = () => {
    setNote("");
    fetch("/api/ads/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ display_name: name }) })
      .then(async (r) => { if (!r.ok) throw new Error(((await r.json().catch(() => ({}))).error) || "save_failed"); setNote("Saved."); })
      .catch((e) => setNote("Couldn't save: " + String(e?.message || "unknown error")));
  };
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Profile</h1>
        <p className="mt-1 text-sm text-neutral-500">Your advertiser identity on this account.</p>
      </div>
      {note && <div className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">{note}</div>}
      <div className="space-y-5 rounded-xl border border-neutral-100 bg-white p-6">
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Display name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none" />
        </div>
        {adv && (
          <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div><p className="text-xs font-medium uppercase tracking-wider text-neutral-400">Status</p><p className="mt-1 text-neutral-700">{adv.status}</p></div>
            <div><p className="text-xs font-medium uppercase tracking-wider text-neutral-400">Account ID</p><p className="mt-1 text-neutral-700">{adv.id}</p></div>
            <div><p className="text-xs font-medium uppercase tracking-wider text-neutral-400">Account type</p><p className="mt-1 text-neutral-700">{adv.is_system ? "System" : "Standard"}</p></div>
          </div>
        )}
        <div className="flex justify-end">
          <button onClick={save} className="rounded-lg bg-[#f2eafe] px-5 py-2 text-sm font-medium text-[#6942c2]">Save changes</button>
        </div>
      </div>
    </div>
  );
}
