"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function Page() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [m, setM] = useState<any>(null);
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!params?.id) return;
    fetch("/api/ads/team").then((r) => (r.ok ? r.json() : { members: [] }))
      .then((d) => setM((d.members ?? []).find((x: any) => String(x.id) === String(params.id)) ?? null))
      .catch(() => {});
  }, [params?.id]);
  const remove = () => {
    setNote("");
    fetch(`/api/ads/team?id=${encodeURIComponent(String(params.id))}`, { method: "DELETE" })
      .then(async (r) => { if (!r.ok) throw new Error(((await r.json().catch(() => ({}))).error) || "remove_failed"); router.push("/ads/account/team"); })
      .catch((e) => setNote("Couldn't remove: " + String(e?.message || "unknown error")));
  };
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Remove Member</h1>
        <p className="mt-1 text-sm text-neutral-500">{m ? (m.invited_email ?? m.user_id) : "Loading…"}</p>
      </div>
      {note && <div className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">{note}</div>}
      <div className="rounded-xl border border-neutral-100 bg-white p-6">
        <p className="text-sm text-neutral-600">This takes the member off the ad account — they lose access to its campaigns, creatives and billing. The record is kept as "removed" rather than erased.</p>
        <div className="mt-5 flex gap-3">
          <button onClick={remove} className="rounded-lg bg-red-600 px-5 py-2 text-sm font-medium text-white">Remove member</button>
          <button onClick={() => router.back()} className="rounded-lg border border-neutral-200 px-5 py-2 text-sm font-medium text-neutral-700">Cancel</button>
        </div>
      </div>
    </div>
  );
}
