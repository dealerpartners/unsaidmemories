"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function Page() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [a, setA] = useState<any>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (!params?.id) return;
    fetch(`/api/ads/audiences/${params.id}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error("x"))))
      .then((d) => setA(d.audience ?? d)).catch(() => setMissing(true));
  }, [params?.id]);
  if (missing) return <div><h1 className="text-2xl font-bold tracking-tight text-neutral-900">Audience not found</h1><p className="mt-1 text-sm text-neutral-500">This audience doesn't exist or isn't on your account.</p></div>;
  if (!a) return <div><h1 className="text-2xl font-bold tracking-tight text-neutral-900">Audience</h1><p className="mt-1 text-sm text-neutral-500">Loading…</p></div>;
  const t = a.targeting ?? {};
  const facets: Array<[string, string]> = [
    ["Locations", (t.locations ?? []).join(", ")],
    ["Languages", (t.languages ?? []).join(", ")],
    ["Devices", (t.devices ?? []).join(", ")],
    ["Age range", t.age_range ?? ""],
    ["Gender", t.gender ?? ""],
  ];
  const remove = () => {
    fetch(`/api/ads/audiences/${a.id}`, { method: "DELETE" }).then(() => router.push("/ads/audiences")).catch(() => {});
  };
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">{a.name}</h1>
        <p className="mt-1 text-sm text-neutral-500">Saved audience · updated {new Date(a.updated_at).toLocaleString("en-US")}</p>
      </div>
      <div className="space-y-4 rounded-xl border border-neutral-100 bg-white p-6 text-sm">
        <div className="flex justify-between"><span className="text-neutral-500">Size</span><span className="font-medium text-neutral-900">{a.size != null ? Number(a.size).toLocaleString("en-US") : "—"}</span></div>
        <div className="flex justify-between"><span className="text-neutral-500">Reach</span><span className="font-medium text-neutral-900">{a.reach != null ? Number(a.reach).toLocaleString("en-US") : "—"}</span></div>
        {facets.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-6"><span className="text-neutral-500">{k}</span><span className="text-right font-medium text-neutral-900">{v || "—"}</span></div>
        ))}
        <div className="flex items-center justify-between pt-2">
          <button onClick={remove} className="text-sm font-medium text-red-600">Delete audience</button>
          <Link href={`/ads/audiences/${a.id}/edit`} className="rounded-lg bg-[#f2eafe] px-5 py-2 text-sm font-medium text-[#6942c2]">Edit</Link>
        </div>
      </div>
    </div>
  );
}
