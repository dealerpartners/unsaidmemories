"use client";

import { useEffect, useState } from "react";
import { PageHeader, FormField, Button } from "@/components/ads/ui";

export default function AccountSettingsPage() {
  const [name, setName] = useState("");
  const [gen, setGen] = useState<Record<string, unknown>>({});
  const [note, setNote] = useState("");
  useEffect(() => {
    fetch("/api/ads/account").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.advertiser) setName(d.advertiser.display_name ?? ""); }).catch(() => {});
    fetch("/api/ads/settings?kind=general").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.settings) setGen(d.settings); }).catch(() => {});
  }, []);
  const save = () => {
    setNote("");
    Promise.all([
      fetch("/api/ads/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ display_name: name }) }),
      fetch("/api/ads/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "general", settings: gen }) }),
    ]).then(async ([a, b]) => { if (!a.ok || !b.ok) throw new Error("save_failed"); setNote("Saved."); })
      .catch(() => setNote("Couldn’t save settings."));
  };

  return (
    <div className="mx-auto max-w-4xl p-6">
      <PageHeader
        title="Account Settings"
        description="Configure your advertising account preferences and defaults."
        breadcrumbs={[{ label: "Account", href: "/ads/account" }, { label: "Settings" }]}
      />
      <div className="space-y-6">
        <div className="rounded-xl border border-neutral-100 bg-white p-6">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">General Settings</h3>
          <div className="space-y-4">
            <FormField label="Account Name">
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none" />
            </FormField>
            <FormField label="Time Zone">
              <select value={String(gen.timezone ?? "US/Central (CT)")} onChange={(e) => setGen({ ...gen, timezone: e.target.value })} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:border-neutral-400 focus:outline-none">
                <option>US/Eastern (ET)</option><option>US/Central (CT)</option><option>US/Mountain (MT)</option><option>US/Pacific (PT)</option><option>UTC</option>
              </select>
            </FormField>
            <FormField label="Currency">
              <select className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:border-neutral-400 focus:outline-none">
                <option>USD — US Dollar</option><option>EUR — Euro</option><option>GBP — British Pound</option><option>CAD — Canadian Dollar</option>
              </select>
            </FormField>
          </div>
        </div>
        <div className="rounded-xl border border-neutral-100 bg-white p-6">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">Ad Defaults</h3>
          <div className="space-y-4">
            <FormField label="Default Bid Strategy">
              <select value={String(gen.bid_strategy ?? "Automatic — Maximize results")} onChange={(e) => setGen({ ...gen, bid_strategy: e.target.value })} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:border-neutral-400 focus:outline-none">
                <option>Automatic — Maximize results</option><option>Manual CPM</option><option>Target CPA</option>
              </select>
            </FormField>
            <FormField label="Default Placement">
              <select value={String(gen.default_placement ?? "Automatic placements")} onChange={(e) => setGen({ ...gen, default_placement: e.target.value })} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:border-neutral-400 focus:outline-none">
                <option>Automatic placements</option><option>Audio only</option><option>Video only</option><option>Editorial</option>
              </select>
            </FormField>
          </div>
        </div>
        <Button onClick={save}>Save Settings</Button>
        {note && <p className="text-sm text-neutral-600">{note}</p>}
      </div>
    </div>
  );
}
