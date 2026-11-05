"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function AutomationsUI({ title, description }: { title: string; description: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("");
  const [action, setAction] = useState("");
  const [note, setNote] = useState("");
  const load = () => { fetch("/api/ads/automations").then((r) => (r.ok ? r.json() : { automations: [] })).then((d) => setRows(d.automations ?? [])).catch(() => {}); };
  useEffect(load, []);
  const parse = (v: string) => { try { return JSON.parse(v); } catch { return { note: v }; } };
  const create = () => {
    if (!name.trim()) { setNote("Name the rule first."); return; }
    setNote("");
    fetch("/api/ads/automations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), trigger_config: trigger.trim() ? parse(trigger.trim()) : {}, action_config: action.trim() ? parse(action.trim()) : {}, active: true }) })
      .then(async (r) => { if (!r.ok) throw new Error("create_failed"); setName(""); setTrigger(""); setAction(""); setNote("Rule created."); load(); })
      .catch(() => setNote("Couldn't create the rule."));
  };
  const toggle = (row: any) => {
    fetch("/api/ads/automations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, active: !row.active }) }).then(() => load()).catch(() => {});
  };
  const remove = (row: any) => {
    fetch(`/api/ads/automations?id=${row.id}`, { method: "DELETE" }).then(() => load()).catch(() => {});
  };
  const inputCls = "h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none";
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">{title}</h1>
        <p className="mt-1 text-sm text-neutral-500">{description}</p>
      </div>
      <div className="mb-6 max-w-2xl rounded-xl border border-neutral-100 bg-white p-6">
        <div className="grid grid-cols-1 gap-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Rule name" className={inputCls} />
          <input value={trigger} onChange={(e) => setTrigger(e.target.value)} placeholder='Trigger — plain words or JSON, e.g. {"metric":"spend","op":">","value":500}' className={inputCls} />
          <input value={action} onChange={(e) => setAction(e.target.value)} placeholder='Action — plain words or JSON, e.g. {"action":"pause"}' className={inputCls} />
        </div>
        {note && <p className="mt-3 text-sm text-neutral-600">{note}</p>}
        <div className="mt-4"><button onClick={create} className="rounded-lg bg-[#f2eafe] px-5 py-2 text-sm font-medium text-[#6942c2]">Create rule</button></div>
        <p className="mt-3 text-xs text-neutral-400">Rules are stored with their trigger and action configuration, exactly as entered.</p>
      </div>
      <div className="space-y-2">
        {rows.length === 0 && <p className="text-sm text-neutral-500">No rules yet.</p>}
        {rows.map((row) => (
          <div key={row.id} className="flex items-center justify-between rounded-xl border border-neutral-100 bg-white p-4">
            <div>
              <p className="text-sm font-medium text-neutral-900">{row.name}</p>
              <p className="text-xs text-neutral-500">{row.active ? "Active" : "Paused"} · created {row.created_at ? new Date(row.created_at).toLocaleDateString("en-US") : ""}</p>
            </div>
            <div className="flex gap-2 text-xs">
              <button onClick={() => toggle(row)} className="rounded-full bg-neutral-100 px-3 py-1.5 font-medium text-neutral-700 hover:bg-neutral-200">{row.active ? "Pause" : "Activate"}</button>
              <button onClick={() => remove(row)} className="rounded-full bg-red-50 px-3 py-1.5 font-medium text-red-600 hover:bg-red-100">Delete</button>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm"><Link href="/ads/campaigns" className="font-medium text-neutral-900 underline">Campaigns the rules would act on</Link></p>
    </div>
  );
}
