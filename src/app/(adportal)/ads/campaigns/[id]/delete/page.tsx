"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Campaign = { id: string; name: string; status: string };

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "notfound" | "failed">("loading");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/ads/campaigns/${id}`)
      .then(async (r) => { if (r.status === 404) { setState("notfound"); throw new Error("nf"); } if (!r.ok) throw new Error("x"); return r.json(); })
      .then((d) => { setCampaign(d.campaign); setState("ready"); })
      .catch((e) => { if (String(e?.message) !== "nf") setState("failed"); });
  }, [id]);

  const canAct = campaign ? (campaign.status !== "active") : false;

  const act = () => {
    setBusy(true); setNote("");
    fetch(`/api/ads/campaigns/${id}`, { method: "DELETE" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.detail || d.error || "failed");
        router.push("/ads/campaigns");
      })
      .catch((e) => { setNote(String(e?.message || "Something went wrong.")); setBusy(false); });
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Delete Campaign</h1>
          <p className="mt-1 text-sm text-neutral-500">Permanently delete this campaign.</p>
        </div>
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white p-6">
        {state === "loading" && <p className="text-sm text-neutral-500">Loading campaign…</p>}
        {state === "notfound" && <p className="text-sm text-neutral-500">Campaign not found — it may belong to another advertiser account.</p>}
        {state === "failed" && <p className="text-sm text-neutral-500">This campaign didn't load. Try again shortly.</p>}
        {state === "ready" && campaign && (
          <div>
            <p className="text-sm text-neutral-900"><span className="font-medium">{campaign.name}</span> <span className="text-neutral-400">· status: {campaign.status}</span></p>
            {canAct ? (
              <div className="mt-6 flex items-center gap-3">
                <button onClick={act} disabled={busy} className="rounded-lg bg-[#f2eafe] px-4 py-2 text-sm font-medium text-[#6942c2] disabled:opacity-50">Delete campaign</button>
                <Link href={`/ads/campaigns/${id}`} className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700">Back to campaign</Link>
              </div>
            ) : (
              <p className="mt-4 text-sm text-neutral-500">{note || "This action isn't available while the campaign is " + campaign.status + "."}</p>
            )}
            {canAct && note && <p className="mt-4 text-sm text-red-600">{note}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
