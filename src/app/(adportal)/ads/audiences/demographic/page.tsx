"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader, MetricCard, Button, FormField } from "@/components/ads/ui";

export default function DemographicTargetingPage() {
  const ageGroups = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
  const genders = ["Male", "Female", "Non-binary", "Prefer not to say"];
  const router = useRouter();
  const [ages, setAges] = useState<string[]>(["18-24", "25-34", "35-44"]);
  const [genderSel, setGenderSel] = useState<string[]>(["Male", "Female", "Non-binary", "Prefer not to say"]);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const toggle = (list: string[], v: string, set: (x: string[]) => void) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const genderValue = genderSel.length === genders.length || genderSel.length === 0 ? "" : genderSel.map((g) => g.toLowerCase()).join(",");
  const save = () => {
    setNote("");
    if (!name.trim()) { setNote("Name the audience before saving — it becomes a saved audience you can reuse."); return; }
    const targeting: Record<string, unknown> = {};
    if (ages.length) targeting.age_range = ages.join(",");
    if (genderValue) targeting.gender = genderValue;
    fetch("/api/ads/audiences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), targeting }) })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "save_failed"); router.push(d.audience?.id ? `/ads/audiences/${d.audience.id}` : "/ads/audiences"); })
      .catch((e) => setNote("Could not save: " + String(e?.message || "unknown error")));
  };

  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader
        title="Demographic Targeting"
        description="Define audience segments based on age, gender, and other demographic attributes."
        breadcrumbs={[{ label: "Audiences", href: "/ads/audiences" }, { label: "Demographics" }]}
      />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard label="Reachable Audience" value="—" delta="saved audiences are not reach-estimated" deltaType="neutral" />
        <MetricCard label="Age Segments" value={String(ages.length)} delta="selected" deltaType="neutral" />
        <MetricCard label="Gender" value={genderValue ? genderSel.join(", ") : "All"} delta="selected" deltaType="neutral" />
      </div>
      <div className="space-y-6">
        <div className="rounded-xl border border-neutral-100 bg-white p-6">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">Age Range</h3>
          <div className="flex flex-wrap gap-3">
            {ageGroups.map((age) => (
              <label key={age} className="flex items-center gap-2 rounded-lg border border-neutral-100 px-4 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50">
                <input type="checkbox" checked={ages.includes(age)} onChange={() => toggle(ages, age, setAges)} className="h-4 w-4 rounded border-neutral-300" />
                {age}
              </label>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-neutral-100 bg-white p-6">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">Gender</h3>
          <div className="flex flex-wrap gap-3">
            {genders.map((g) => (
              <label key={g} className="flex items-center gap-2 rounded-lg border border-neutral-100 px-4 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50">
                <input type="checkbox" checked={genderSel.includes(g)} onChange={() => toggle(genderSel, g, setGenderSel)} className="h-4 w-4 rounded border-neutral-300" />
                {g}
              </label>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-neutral-100 bg-white p-6">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">Household Income</h3>
          <p className="mb-3 text-xs text-neutral-400">Household income is not a targeting facet in this system — selections here are not saved with the audience.</p>
          <div className="flex flex-wrap gap-3">
            {["Top 10%", "10-20%", "20-30%", "30-40%", "40-50%", "50-60%", "60-70%", "70-80%", "80-90%", "Bottom 10%"].map((inc) => (
              <label key={inc} className="flex items-center gap-2 rounded-lg border border-neutral-100 px-4 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50">
                <input type="checkbox" className="h-4 w-4 rounded border-neutral-300" />
                {inc}
              </label>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-neutral-100 bg-white p-6">
          <FormField label="Audience name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Women 25-44" className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none" />
          </FormField>
        </div>
        <Button onClick={save}>Save Demographic Targeting</Button>
        {note && <p className="text-sm text-neutral-600">{note}</p>}
      </div>
    </div>
  );
}
