"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Page() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const send = () => {
    setNote("");
    setBusy(true);
    fetch("/api/ads/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), role }) })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "invite_failed"); router.push("/ads/account/team"); })
      .catch((e) => { setNote("Couldn't invite: " + String(e?.message || "unknown error")); setBusy(false); });
  };
  const inputCls = "w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none";
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Invite Member</h1>
        <p className="mt-1 text-sm text-neutral-500">Add someone to this ad account by email.</p>
      </div>
      {note && <div className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">{note}</div>}
      <div className="space-y-5 rounded-xl border border-neutral-100 bg-white p-6">
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="person@company.com" className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
            <option value="admin">Admin — everything except ownership</option>
            <option value="editor">Editor — campaigns & creatives, no billing/team</option>
            <option value="viewer">Viewer — read-only</option>
          </select>
        </div>
        <div className="flex justify-end">
          <button onClick={send} disabled={busy || !email.trim()} className="rounded-lg bg-[#f2eafe] px-5 py-2 text-sm font-medium text-[#6942c2] disabled:opacity-50">Send invite</button>
        </div>
      </div>
    </div>
  );
}
