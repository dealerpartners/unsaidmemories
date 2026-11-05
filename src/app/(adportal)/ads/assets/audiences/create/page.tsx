"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Page() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [locations, setLocations] = useState("");
  const [languages, setLanguages] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [error, setError] = useState("");
  const lines = (v: string) => v.split(/\n|,/).map((x) => x.trim()).filter(Boolean);
  const submit = () => {
    if (!name.trim()) { setError("Name is required."); return; }
    fetch("/api/ads/audiences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), targeting: { locations: lines(locations), languages: lines(languages), ...(age.trim() ? { age_range: age.trim() } : {}), ...(gender ? { gender } : {}) } }) })
      .then(async (r) => { const d = await r.json().catch(() => null); if (!r.ok) throw new Error(d?.error ?? "create_failed"); router.push(`/ads/assets/audiences/${d.audience?.id ?? d.id ?? ""}`); })
      .catch(() => setError("Couldn't create the audience."));
  };
  const inputCls = "h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none";
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Create Audience</h1>
        <p className="mt-1 text-sm text-neutral-500">A saved targeting set — the same audience record the Audiences section creates.</p>
      </div>
      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <div className="space-y-4 rounded-xl border border-neutral-100 bg-white p-6">
        <div><label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-neutral-400">Name</label><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></div>
        <div><label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-neutral-400">Locations</label><input value={locations} onChange={(e) => setLocations(e.target.value)} placeholder="Memphis, Nashville" className={inputCls} /></div>
        <div><label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-neutral-400">Languages</label><input value={languages} onChange={(e) => setLanguages(e.target.value)} placeholder="en, es" className={inputCls} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-neutral-400">Age range</label><input value={age} onChange={(e) => setAge(e.target.value)} placeholder="25-44" className={inputCls} /></div>
          <div><label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-neutral-400">Gender</label><select value={gender} onChange={(e) => setGender(e.target.value)} className={inputCls}><option value="">Any</option><option value="female">Female</option><option value="male">Male</option><option value="all">All</option></select></div>
        </div>
        <div className="flex justify-end"><button onClick={submit} className="rounded-lg bg-[#f2eafe] px-5 py-2 text-sm font-medium text-[#6942c2]">Create audience</button></div>
      </div>
    </div>
  );
}
