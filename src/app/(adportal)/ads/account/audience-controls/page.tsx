"use client";

import { useEffect, useState } from "react";
import { PageHeader, MetricCard, Button, FormField } from "@/components/ads/ui";

export default function AudienceControlsPage() {
  const [excl, setExcl] = useState<Record<string, unknown>>({});
  const [list, setList] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => {
    fetch("/api/ads/settings?kind=audience_controls").then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.settings) { setExcl(d.settings); setList(String(d.settings.exclusion_list ?? "")); } })
      .catch(() => {});
  }, []);
  const save = () => {
    setNote("");
    fetch("/api/ads/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "audience_controls", settings: { ...excl, exclusion_list: list } }) })
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "save_failed"); setNote("Saved."); })
      .catch((e) => setNote("Couldn’t save: " + String(e?.message || "unknown error")));
  };
  const toggles = [
    { key: "exclude_customers", label: "Exclude existing customers", desc: "Don’t show ads to users who have already purchased" },
    { key: "exclude_app_users", label: "Exclude app users", desc: "Don’t retarget users who already have your app installed" },
    { key: "age_18_plus", label: "Age restriction: 18+", desc: "All campaigns restricted to users 18 and older" },
  ];
  const listCount = list.split(/\n+/).map((x) => x.trim()).filter(Boolean).length;

  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader
        title="Audience Controls"
        description="Manage account-level audience restrictions, exclusions, and privacy controls."
        breadcrumbs={[{ label: "Account", href: "/ads/account" }, { label: "Audience Controls" }]}
      />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard label="Excluded Segments" value={String(toggles.filter((t) => excl[t.key]).length)} delta="active exclusions" deltaType="neutral" />
        <MetricCard label="Restricted Categories" value={excl.age_18_plus ? "1" : "0"} delta="age-restricted" deltaType="neutral" />
        <MetricCard label="Custom Exclusions" value={String(listCount)} delta="entries on your exclusion list" deltaType="neutral" />
      </div>
      <div className="space-y-6">
        <div className="rounded-xl border border-neutral-100 bg-white p-6">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">Account-Level Exclusions</h3>
          <div className="space-y-3">
            {toggles.map((item) => (
              <div key={item.label} className="flex items-center justify-between rounded-lg border border-neutral-50 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-neutral-900">{item.label}</p>
                  <p className="text-xs text-neutral-500">{item.desc}</p>
                </div>
                <button onClick={() => setExcl({ ...excl, [item.key]: !excl[item.key] })} className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${excl[item.key] ? "bg-emerald-500" : "bg-neutral-200"}`}>
                  <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${excl[item.key] ? "translate-x-4" : "translate-x-0"}`} />
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-neutral-100 bg-white p-6">
          <h3 className="text-sm font-semibold text-neutral-900 mb-3">Upload Exclusion List</h3>
          <FormField label="Upload a list of user IDs or emails to exclude from all campaigns">
            <textarea value={list} onChange={(e) => setList(e.target.value)} rows={5} placeholder="Paste user IDs or emails, one per line" className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none" />
            <p className="mt-1 text-xs text-neutral-400">File upload isn’t connected to a storage endpoint — paste the list and save; it’s stored on your account.</p>
          </FormField>
          <Button className="mt-3" onClick={save}>Save Controls</Button>
          {note && <p className="mt-3 text-sm text-neutral-600">{note}</p>}
        </div>
      </div>
    </div>
  );
}
