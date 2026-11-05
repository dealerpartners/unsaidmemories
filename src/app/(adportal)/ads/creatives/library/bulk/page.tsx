"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {
  const [lib, setLib] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const load = () => {
    fetch("/api/ads/creatives").then((r) => (r.ok ? r.json() : { creatives: [] }))
      .then((d) => setLib(d.creatives ?? [])).catch(() => {});
  };
  useEffect(load, []);
  const toggle = (id: string) => { const n = new Set(selected); if (n.has(id)) n.delete(id); else n.add(id); setSelected(n); };
  const deleteSelected = () => {
    setNote("");
    Promise.all([...selected].map((id) => fetch(`/api/ads/creatives/${id}`, { method: "DELETE" }).catch(() => {})))
      .then(() => { setNote(`Deleted ${selected.size} creative${selected.size === 1 ? "" : "s"}.`); setSelected(new Set()); load(); });
  };
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Bulk Actions</h1>
        <p className="mt-1 text-sm text-neutral-500">Work on several creatives at once. Deleting is the bulk operation this system supports — it is permanent.</p>
      </div>
      {note && <div className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">{note}</div>}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-neutral-500">{selected.size} selected</p>
        <button onClick={deleteSelected} disabled={selected.size === 0} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">Delete selected</button>
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-100 text-left text-xs font-medium uppercase tracking-wider text-neutral-400">
              <th className="px-4 py-3"></th>
              <th className="px-4 py-3">Creative</th>
              <th className="px-4 py-3">Campaign</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {lib.map((c) => (
              <tr key={c.id} className="border-b border-neutral-50">
                <td className="px-4 py-3"><input type="checkbox" checked={selected.has(String(c.id))} onChange={() => toggle(String(c.id))} className="h-4 w-4 rounded border-neutral-300" /></td>
                <td className="px-4 py-3 text-sm text-neutral-700"><Link href={`/ads/creatives/library/${c.id}`} className="font-medium text-neutral-900 hover:underline">{c.name}</Link></td>
                <td className="px-4 py-3 text-sm text-neutral-700">{c.campaign_name ?? "—"}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{c.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
