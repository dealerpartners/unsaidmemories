"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Page() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [website, setWebsite] = useState("");
  const [kind, setKind] = useState("business");
  const [notes, setNotes] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = () => {
    setNote("");
    setBusy(true);
    fetch("/api/ads/verification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ business_name: businessName.trim(), website: website.trim(), kind, notes: notes.trim() }) })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "submit_failed"); router.push("/ads/account/verification/status"); })
      .catch((e) => { setNote("Couldn't submit: " + String(e?.message || "unknown error")); setBusy(false); });
  };
  const inputCls = "w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none";
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Start Verification</h1>
        <p className="mt-1 text-sm text-neutral-500">File a business verification application for this ad account.</p>
      </div>
      {note && <div className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">{note}</div>}
      <div className="space-y-5 rounded-xl border border-neutral-100 bg-white p-6">
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Business name <span className="text-red-500">*</span></label>
          <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Website</label>
          <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Verification type</label>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputCls}>
            <option value="business">Business</option>
            <option value="organization">Organization</option>
            <option value="individual">Individual</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Notes for the reviewer</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inputCls} />
        </div>
        <div className="flex justify-end">
          <button onClick={submit} disabled={busy || !businessName.trim()} className="rounded-lg bg-[#f2eafe] px-5 py-2 text-sm font-medium text-[#6942c2] disabled:opacity-50">Submit application</button>
        </div>
      </div>
    </div>
  );
}
