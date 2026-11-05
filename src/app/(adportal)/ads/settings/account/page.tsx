"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader, FormField, Button } from "@/components/ads/ui";

export default function Page() {
  const [adv, setAdv] = useState<any>(null);
  const [name, setName] = useState("");
  const [gen, setGen] = useState<Record<string, unknown>>({});
  const [verif, setVerif] = useState<any>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    fetch("/api/ads/account").then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.advertiser) { setAdv(d.advertiser); setName(d.advertiser.display_name ?? ""); } }).catch(() => {});
    fetch("/api/ads/settings?kind=general").then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.settings) setGen(d.settings); }).catch(() => {});
    fetch("/api/ads/verification").then((r) => (r.ok ? r.json() : null)).then(setVerif).catch(() => {});
  }, []);

  const save = () => {
    setNote("");
    Promise.all([
      fetch("/api/ads/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ display_name: name }) }),
      fetch("/api/ads/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "general", settings: gen }) }),
    ]).then(async ([a, b]) => { if (!a.ok || !b.ok) throw new Error("save_failed"); setNote("Saved."); })
      .catch(() => setNote("Couldn't save settings."));
  };

  const inputCls = "w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none";
  const latest = verif?.latest;
  return (
    <div>
      <PageHeader title="Account & Business" description="Manage your advertiser account and business information." />
      <div className="space-y-6">
        <div className="rounded-xl border border-neutral-100 bg-white p-6">
          <h3 className="mb-4 text-sm font-semibold text-neutral-900">Advertiser account</h3>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <FormField label="Account name"><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></FormField>
            <FormField label="Account ID"><input value={adv?.id ?? ""} readOnly className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-400" /></FormField>
            <FormField label="Time zone">
              <select value={String(gen.timezone ?? "America/Chicago (CDT)")} onChange={(e) => setGen({ ...gen, timezone: e.target.value })} className={inputCls}>
                <option>America/Chicago (CDT)</option><option>America/New_York (EDT)</option><option>America/Los_Angeles (PDT)</option><option>UTC</option>
              </select>
            </FormField>
            <FormField label="Currency">
              <select value={String(gen.currency ?? "USD")} onChange={(e) => setGen({ ...gen, currency: e.target.value })} className={inputCls}>
                <option>USD</option><option>EUR</option><option>GBP</option><option>CAD</option>
              </select>
            </FormField>
            <FormField label="Account status"><input value={adv?.status ?? ""} readOnly className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-400" /></FormField>
          </div>
          <div className="mt-5 flex items-center gap-3">
            <Button onClick={save}>Save</Button>
            {note && <span className="text-sm text-neutral-600">{note}</span>}
          </div>
        </div>
        <div className="rounded-xl border border-neutral-100 bg-white p-6">
          <h3 className="mb-2 text-sm font-semibold text-neutral-900">Business identity</h3>
          <p className="text-sm text-neutral-600">
            {verif?.verified
              ? "Your business is verified — the identity below is what's on record."
              : latest
                ? <>Your business identity is established through verification. Latest application: <span className="font-medium text-neutral-900">{latest.status}</span>.</>
                : "Your business identity is established through verification — no application is on file yet."}
          </p>
          {latest && (
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-neutral-500">Application type</span><span className="font-medium text-neutral-900">{latest.kind}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">Filed</span><span className="font-medium text-neutral-900">{new Date(latest.created_at).toLocaleDateString("en-US")}</span></div>
            </div>
          )}
          <p className="mt-3 text-sm"><Link href="/ads/settings/verification" className="font-medium text-neutral-900 underline">Manage verification</Link></p>
          <p className="mt-2 text-xs text-neutral-400">Industry, tax ID and street address aren't stored on the advertiser record in this system — the business form that used to sit here (with a sample company filled in) has been replaced by the real records above.</p>
        </div>
      </div>
    </div>
  );
}
