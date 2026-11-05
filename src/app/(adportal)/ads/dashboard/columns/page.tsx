"use client";

import { useEffect, useState } from "react";

const ALL = [
  { key: "name", label: "Campaign" },
  { key: "status", label: "Status" },
  { key: "objective", label: "Objective" },
  { key: "budget", label: "Budget" },
  { key: "spend", label: "Spend" },
  { key: "results", label: "Results" },
  { key: "ctr", label: "CTR" },
  { key: "clickers", label: "Clickers" },
  { key: "roas", label: "ROAS" },
];

export default function Page() {
  const [visible, setVisible] = useState<string[]>(ALL.map((c) => c.key));
  const [note, setNote] = useState("");
  useEffect(() => {
    fetch("/api/ads/settings?kind=general").then((r) => (r.ok ? r.json() : null))
      .then((d) => { const cols = d?.settings?.dashboard_columns; if (Array.isArray(cols) && cols.length) setVisible(cols); })
      .catch(() => {});
  }, []);
  const toggle = (k: string) => setVisible((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  const save = () => {
    setNote("");
    fetch("/api/ads/settings?kind=general").then((r) => (r.ok ? r.json() : null))
      .then((d) => fetch("/api/ads/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "general", settings: { ...(d?.settings ?? {}), dashboard_columns: visible } }) }))
      .then(async (r) => { if (!r.ok) throw new Error("save_failed"); setNote("Saved — the Dashboard table uses these columns."); })
      .catch(() => setNote("Couldn't save."));
  };
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Columns</h1>
        <p className="mt-1 text-sm text-neutral-500">Which columns the Dashboard campaign table shows. Stored on your account; the Dashboard reads it.</p>
      </div>
      {note && <div className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">{note}</div>}
      <div className="space-y-2 rounded-xl border border-neutral-100 bg-white p-6">
        {ALL.map((c) => (
          <div key={c.key} className="flex items-center justify-between py-1.5">
            <span className="text-sm font-medium text-neutral-700">{c.label}</span>
            <button onClick={() => toggle(c.key)} className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${visible.includes(c.key) ? "bg-emerald-500" : "bg-neutral-200"}`}>
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${visible.includes(c.key) ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>
        ))}
        <div className="flex justify-end pt-3">
          <button onClick={save} className="rounded-lg bg-[#f2eafe] px-5 py-2 text-sm font-medium text-[#6942c2]">Save columns</button>
        </div>
      </div>
    </div>
  );
}
