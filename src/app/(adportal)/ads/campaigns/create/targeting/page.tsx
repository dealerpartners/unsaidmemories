"use client";

import { CreateStepShell, useDraftCreate, NameField, CreateButton, stepInputCls } from "@/components/ads/create-step";
import { useState } from "react";

const lines = (v: string) => v.split(/\n|,/).map((x) => x.trim()).filter(Boolean);

export default function Page() {
  const d = useDraftCreate();
  const [locations, setLocations] = useState("");
  const [languages, setLanguages] = useState("");
  const [devices, setDevices] = useState<Set<string>>(new Set());
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const toggleDev = (k: string) => setDevices((prev) => { const n = new Set(prev); if (n.has(k)) { n.delete(k); } else { n.add(k); } return n; });
  return (
    <CreateStepShell title="Targeting" description="Who the campaign is for — the same facet model audiences use.">
      <div className="rounded-xl border border-neutral-100 bg-white p-6">
        <NameField name={d.name} setName={d.setName} />
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div><label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-neutral-400">Locations (comma separated)</label><input value={locations} onChange={(e) => setLocations(e.target.value)} placeholder="Memphis, Nashville" className={stepInputCls} /></div>
          <div><label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-neutral-400">Languages</label><input value={languages} onChange={(e) => setLanguages(e.target.value)} placeholder="en, es" className={stepInputCls} /></div>
          <div><label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-neutral-400">Age range</label><input value={age} onChange={(e) => setAge(e.target.value)} placeholder="25-44" className={stepInputCls} /></div>
          <div><label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-neutral-400">Gender</label>
            <select value={gender} onChange={(e) => setGender(e.target.value)} className={stepInputCls}><option value="">Any</option><option value="female">Female</option><option value="male">Male</option><option value="all">All</option></select>
          </div>
        </div>
        <div className="mb-4 flex flex-wrap gap-4">
          {["mobile", "tablet", "desktop"].map((dev) => (
            <label key={dev} className="flex items-center gap-2 text-sm capitalize text-neutral-700">
              <input type="checkbox" checked={devices.has(dev)} onChange={() => toggleDev(dev)} className="h-4 w-4 rounded border-neutral-300" />{dev}
            </label>
          ))}
        </div>
        <CreateButton busy={d.busy} error={d.error} onClick={() => d.create({ targeting: { locations: lines(locations), languages: lines(languages), devices: [...devices], ...(age.trim() ? { age_range: age.trim() } : {}), ...(gender ? { gender } : {}) } })} />
      </div>
    </CreateStepShell>
  );
}
