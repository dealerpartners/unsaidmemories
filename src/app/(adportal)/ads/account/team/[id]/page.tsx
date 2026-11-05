"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function Page() {
  const params = useParams<{ id: string }>();
  const [m, setM] = useState<any>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (!params?.id) return;
    fetch("/api/ads/team").then((r) => (r.ok ? r.json() : { members: [] }))
      .then((d) => {
        const found = (d.members ?? []).find((x: any) => String(x.id) === String(params.id));
        if (!found) setMissing(true); else setM(found);
      }).catch(() => setMissing(true));
  }, [params?.id]);
  if (missing) return <div><h1 className="text-2xl font-bold tracking-tight text-neutral-900">Member not found</h1><p className="mt-1 text-sm text-neutral-500">This person isn't on the account team.</p></div>;
  if (!m) return <div><h1 className="text-2xl font-bold tracking-tight text-neutral-900">Team Member</h1><p className="mt-1 text-sm text-neutral-500">Loading…</p></div>;
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">{m.invited_email ?? m.user_id ?? "Team member"}</h1>
        <p className="mt-1 text-sm text-neutral-500">Team member on this ad account.</p>
      </div>
      <div className="space-y-4 rounded-xl border border-neutral-100 bg-white p-6 text-sm">
        <div className="flex justify-between"><span className="text-neutral-500">Role</span><span className="font-medium text-neutral-900">{m.role}</span></div>
        <div className="flex justify-between"><span className="text-neutral-500">Status</span><span className="font-medium text-neutral-900">{m.status}</span></div>
        <div className="flex justify-between"><span className="text-neutral-500">Member since</span><span className="font-medium text-neutral-900">{new Date(m.created_at).toLocaleString("en-US")}</span></div>
        <div className="flex justify-between"><span className="text-neutral-500">Last updated</span><span className="font-medium text-neutral-900">{new Date(m.updated_at).toLocaleString("en-US")}</span></div>
        <div className="flex gap-3 pt-2">
          <Link href={`/ads/account/team/${m.id}/edit`} className="rounded-lg bg-[#f2eafe] px-4 py-2 text-sm font-medium text-[#6942c2]">Change role</Link>
          <Link href={`/ads/account/team/${m.id}/remove`} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600">Remove</Link>
        </div>
      </div>
    </div>
  );
}
