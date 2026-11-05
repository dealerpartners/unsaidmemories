"use client";

// Create-step pages (/ads/campaigns/create/<step>) — each step of
// the create flow as its own route. A step page collects its own
// slice plus a campaign name and creates a real draft campaign with
// it; the campaign can then be finished from its record page or the
// full wizard. Steps whose concept doesn't exist in the campaign
// model (sub-objectives, bidding auctions, split tests) are honest
// faces instead — see those page files.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const inputCls = "h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none";

export function CreateStepShell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-400"><Link href="/ads/campaigns/create" className="hover:underline">Create campaign</Link> · step</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-900">{title}</h1>
        <p className="mt-1 text-sm text-neutral-500">{description}</p>
      </div>
      {children}
    </div>
  );
}

export function useDraftCreate() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const create = (extra: Record<string, unknown>) => {
    if (!name.trim()) { setError("Give the campaign a name first."); return; }
    setBusy(true);
    setError("");
    fetch("/api/ads/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), ...extra }),
    })
      .then(async (r) => { const d = await r.json().catch(() => null); if (!r.ok || !d?.id) throw new Error(d?.error ?? "create_failed"); router.push(`/ads/campaigns/${d.id}`); })
      .catch(() => { setError("Couldn't create the campaign."); setBusy(false); });
  };
  return { name, setName, error, busy, create };
}

export function NameField({ name, setName }: { name: string; setName: (v: string) => void }) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-neutral-400">Campaign name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Spring Sale" className={inputCls} />
    </div>
  );
}

export function CreateButton({ busy, error, onClick, label = "Create draft campaign" }: { busy: boolean; error: string; onClick: () => void; label?: string }) {
  return (
    <>
      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <div className="flex items-center gap-3">
        <button onClick={onClick} disabled={busy} className="rounded-lg bg-[#f2eafe] px-5 py-2 text-sm font-medium text-[#6942c2] disabled:opacity-40">{busy ? "Creating…" : label}</button>
        <Link href="/ads/campaigns/create" className="text-sm font-medium text-neutral-600 underline">or use the full wizard</Link>
      </div>
    </>
  );
}

export const stepInputCls = inputCls;

