"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function Page() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [name, setName] = useState("");
  const [locations, setLocations] = useState("");
  const [languages, setLanguages] = useState("");
  const [ageRange, setAgeRange] = useState("");
  const [gender, setGender] = useState("");
  const [devices, setDevices] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!params?.id) return;
    fetch(`/api/ads/audiences/${params.id}`).then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const a = d?.audience ?? d;
        if (!a) return;
        const t = a.targeting ?? {};
        setName(a.name ?? "");
        setLocations((t.locations ?? []).join(", "));
        setLanguages((t.languages ?? []).join(", "));
        setAgeRange(t.age_range ?? "");
        setGender(t.gender ?? "");
        setDevices(t.devices ?? []);
        setLoaded(true);
      }).catch(() => {});
  }, [params?.id]);
  const save = () => {
    setNote("");
    const targeting: Record<string, unknown> = {};
    const locs = locations.split(",").map((x) => x.trim()).filter(Boolean);
    if (locs.length) targeting.locations = locs;
    const langs = languages.split(",").map((x) => x.trim()).filter(Boolean);
    if (langs.length) targeting.languages = langs;
    if (ageRange.trim()) targeting.age_range = ageRange.trim();
    if (gender) targeting.gender = gender;
    if (devices.length) targeting.devices = devices;
    fetch(`/api/ads/audiences/${params.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), targeting }) })
      .then(async (r) => { if (!r.ok) throw new Error(((await r.json().catch(() => ({}))).error) || "save_failed"); router.push(`/ads/audiences/${params.id}`); })
      .catch((e) => setNote("Couldn't save: " + String(e?.message || "unknown error")));
  };
  const inputCls = "w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none";
  if (!loaded) return <div><h1 className="text-2xl font-bold tracking-tight text-neutral-900">Edit Audience</h1><p className="mt-1 text-sm text-neutral-500">Loading…</p></div>;
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Edit Audience</h1>
        <p className="mt-1 text-sm text-neutral-500">Update the audience's name and targeting facets.</p>
      </div>
      {note && <div className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">{note}</div>}
      <div className="space-y-5 rounded-xl border border-neutral-100 bg-white p-6">
        <div><label className="mb-1 block text-sm font-medium text-neutral-700">Name</label><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></div>
        <div><label className="mb-1 block text-sm font-medium text-neutral-700">Locations (comma-separated)</label><input value={locations} onChange={(e) => setLocations(e.target.value)} className={inputCls} /></div>
        <div><label className="mb-1 block text-sm font-medium text-neutral-700">Languages (comma-separated codes)</label><input value={languages} onChange={(e) => setLanguages(e.target.value)} className={inputCls} /></div>
        <div className="flex gap-4">
          <div className="flex-1"><label className="mb-1 block text-sm font-medium text-neutral-700">Age range</label><input value={ageRange} onChange={(e) => setAgeRange(e.target.value)} className={inputCls} /></div>
          <div className="flex-1"><label className="mb-1 block text-sm font-medium text-neutral-700">Gender</label><input value={gender} onChange={(e) => setGender(e.target.value)} className={inputCls} /></div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Devices</label>
          <div className="flex gap-2">
            {["mobile", "tablet", "desktop"].map((d) => (
              <button key={d} onClick={() => setDevices((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))} className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize ${devices.includes(d) ? "bg-[#f2eafe] text-[#6942c2]" : "bg-neutral-100 text-neutral-600"}`}>{d}</button>
            ))}
          </div>
        </div>
        <div className="flex justify-end">
          <button onClick={save} className="rounded-lg bg-[#f2eafe] px-5 py-2 text-sm font-medium text-[#6942c2]">Save changes</button>
        </div>
      </div>
    </div>
  );
}
