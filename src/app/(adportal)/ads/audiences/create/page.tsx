"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Page() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [locations, setLocations] = useState("");
  const [languages, setLanguages] = useState("");
  const [ageRange, setAgeRange] = useState("");
  const [gender, setGender] = useState("");
  const [devices, setDevices] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const create = () => {
    setNote("");
    if (!name.trim()) { setNote("Give the audience a name."); return; }
    setBusy(true);
    const targeting: Record<string, unknown> = {};
    const locs = locations.split(",").map((x) => x.trim()).filter(Boolean);
    if (locs.length) targeting.locations = locs;
    const langs = languages.split(",").map((x) => x.trim()).filter(Boolean);
    if (langs.length) targeting.languages = langs;
    if (ageRange.trim()) targeting.age_range = ageRange.trim();
    if (gender) targeting.gender = gender;
    if (devices.length) targeting.devices = devices;
    fetch("/api/ads/audiences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), targeting }) })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "create_failed"); return d; })
      .then((d) => router.push(d.audience?.id ? `/ads/audiences/${d.audience.id}` : "/ads/audiences"))
      .catch((e) => { setNote("Couldn't create: " + String(e?.message || "unknown error")); setBusy(false); });
  };

  const inputCls = "w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none";
  const toggleDevice = (d: string) => setDevices((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Create Audience</h1>
        <p className="mt-1 text-sm text-neutral-500">A reusable targeting set — the facets below are the ones campaigns can target.</p>
      </div>
      {note && <div className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">{note}</div>}
      <div className="space-y-5 rounded-xl border border-neutral-100 bg-white p-6">
        <div><label className="mb-1 block text-sm font-medium text-neutral-700">Audience name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Past Purchasers" className={inputCls} /></div>
        <div><label className="mb-1 block text-sm font-medium text-neutral-700">Locations (comma-separated)</label><input value={locations} onChange={(e) => setLocations(e.target.value)} placeholder="Memphis, Nashville" className={inputCls} /></div>
        <div><label className="mb-1 block text-sm font-medium text-neutral-700">Languages (comma-separated codes)</label><input value={languages} onChange={(e) => setLanguages(e.target.value)} placeholder="en, es" className={inputCls} /></div>
        <div className="flex gap-4">
          <div className="flex-1"><label className="mb-1 block text-sm font-medium text-neutral-700">Age range</label><input value={ageRange} onChange={(e) => setAgeRange(e.target.value)} placeholder="25-44" className={inputCls} /></div>
          <div className="flex-1"><label className="mb-1 block text-sm font-medium text-neutral-700">Gender</label>
            <select value={gender} onChange={(e) => setGender(e.target.value)} className={inputCls}>
              <option value="">All</option><option value="female">Female</option><option value="male">Male</option><option value="all">All genders</option>
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Devices</label>
          <div className="flex gap-2">
            {["mobile", "tablet", "desktop"].map((d) => (
              <button key={d} onClick={() => toggleDevice(d)} className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize ${devices.includes(d) ? "bg-[#f2eafe] text-[#6942c2]" : "bg-neutral-100 text-neutral-600"}`}>{d}</button>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={() => router.push("/ads/audiences")} className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700">Cancel</button>
          <button onClick={create} disabled={busy} className="rounded-lg bg-[#f2eafe] px-4 py-2 text-sm font-medium text-[#6942c2] disabled:opacity-50">Create</button>
        </div>
      </div>
    </div>
  );
}
