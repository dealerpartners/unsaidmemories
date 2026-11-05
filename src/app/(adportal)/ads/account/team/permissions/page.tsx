"use client";

import { useEffect, useState } from "react";

const AREAS = ["campaigns", "creatives", "audiences", "billing", "analytics", "leads", "account", "team"] as const;

type RoleDef = { role: string; permissions: string[]; stored: boolean };

export default function Page() {
  const [roles, setRoles] = useState<RoleDef[]>([]);
  const [note, setNote] = useState("");
  useEffect(() => {
    fetch("/api/ads/team/roles").then((r) => (r.ok ? r.json() : { roles: [] }))
      .then((d) => setRoles(d.roles ?? [])).catch(() => {});
  }, []);

  const toggle = (roleIdx: number, key: string) => {
    setRoles((prev) => prev.map((r, i) => {
      if (i !== roleIdx) return r;
      const has = r.permissions.includes(key);
      return { ...r, permissions: has ? r.permissions.filter((p) => p !== key) : [...r.permissions, key] };
    }));
  };
  const save = (r: RoleDef) => {
    setNote("");
    fetch("/api/ads/team/roles", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: r.role, permissions: r.permissions }) })
      .then(async (res) => { if (!res.ok) throw new Error(((await res.json().catch(() => ({}))).error) || "save_failed"); setNote(`Saved the ${r.role} role.`); })
      .catch((e) => setNote("Couldn't save: " + String(e?.message || "unknown error")));
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Permissions</h1>
        <p className="mt-1 text-sm text-neutral-500">What each role can do on this ad account. Accounts start on the platform defaults; saving a role stores your own definition, which then wins.</p>
      </div>
      {note && <div className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">{note}</div>}
      <div className="space-y-4">
        {roles.map((r, ri) => (
          <div key={r.role} className="rounded-xl border border-neutral-100 bg-white p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold capitalize text-neutral-900">{r.role}</p>
              <span className="text-xs text-neutral-400">{r.stored ? "your stored definition" : "platform default"}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {AREAS.map((a) => {
                const canWrite = r.permissions.includes(`${a}:write`);
                const canRead = canWrite || r.permissions.includes(`${a}:read`);
                return (
                  <div key={a} className="rounded-lg border border-neutral-100 px-3 py-2">
                    <p className="text-xs font-medium capitalize text-neutral-700">{a}</p>
                    <div className="mt-1.5 flex gap-1">
                      <button onClick={() => { if (canWrite) { toggle(ri, `${a}:write`); } else if (canRead) { toggle(ri, `${a}:read`); } else { toggle(ri, `${a}:read`); } }} className={`rounded px-2 py-0.5 text-[11px] font-medium ${canRead ? "bg-[#f2eafe] text-[#6942c2]" : "bg-neutral-100 text-neutral-500"}`}>read</button>
                      <button onClick={() => toggle(ri, `${a}:write`)} className={`rounded px-2 py-0.5 text-[11px] font-medium ${canWrite ? "bg-[#f2eafe] text-[#6942c2]" : "bg-neutral-100 text-neutral-500"}`}>write</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex justify-end">
              <button onClick={() => save(r)} className="rounded-lg bg-[#f2eafe] px-4 py-1.5 text-xs font-medium text-[#6942c2]">Save {r.role} role</button>
            </div>
          </div>
        ))}
        {roles.length === 0 && <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-500">Loading roles…</div>}
      </div>
    </div>
  );
}
