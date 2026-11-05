"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function Page() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [m, setM] = useState<any>(null);
  const [role, setRole] = useState("viewer");
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!params?.id) return;
    fetch("/api/ads/team").then((r) => (r.ok ? r.json() : { members: [] }))
      .then((d) => {
        const found = (d.members ?? []).find((x: any) => String(x.id) === String(params.id));
        if (found) { setM(found); setRole(found.role); }
      }).catch(() => {});
  }, [params?.id]);
  const save = () => {
    setNote("");
    fetch("/api/ads/team", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: params.id, role }) })
      .then(async (r) => { if (!r.ok) throw new Error(((await r.json().catch(() => ({}))).error) || "save_failed"); router.push(`/ads/account/team/${params.id}`); })
      .catch((e) => setNote("Couldn't save: " + String(e?.message || "unknown error")));
  };
  if (!m) return <div><h1 className="text-2xl font-bold tracking-tight text-neutral-900">Edit Member</h1><p className="mt-1 text-sm text-neutral-500">Loading…</p></div>;
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Edit Member</h1>
        <p className="mt-1 text-sm text-neutral-500">{m.invited_email ?? m.user_id}</p>
      </div>
      {note && <div className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">{note}</div>}
      <div className="space-y-5 rounded-xl border border-neutral-100 bg-white p-6">
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none">
            <option value="admin">Admin — everything except ownership</option>
            <option value="editor">Editor — campaigns & creatives, no billing/team</option>
            <option value="viewer">Viewer — read-only</option>
          </select>
        </div>
        <div className="flex justify-end">
          <button onClick={save} className="rounded-lg bg-[#f2eafe] px-5 py-2 text-sm font-medium text-[#6942c2]">Save role</button>
        </div>
      </div>
    </div>
  );
}
