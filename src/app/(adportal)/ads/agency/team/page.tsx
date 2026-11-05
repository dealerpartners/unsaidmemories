"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {
  const [members, setMembers] = useState<any[]>([]);
  useEffect(() => { fetch("/api/ads/team").then((r) => (r.ok ? r.json() : { members: [] })).then((d) => setMembers((d.members ?? []).filter((m: any) => m.status !== "removed"))).catch(() => {}); }, []);
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Agency Team</h1>
        <p className="mt-1 text-sm text-neutral-500">The people with access to this account — the same team as under Account.</p>
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white">
        <table className="w-full">
          <thead><tr className="border-b border-neutral-100 text-left text-xs font-medium uppercase tracking-wider text-neutral-400"><th className="px-4 py-3">Member</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th></tr></thead>
          <tbody>
            {members.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-sm text-neutral-500">No team members yet.</td></tr>}
            {members.map((m) => (
              <tr key={m.id} className="border-b border-neutral-50">
                <td className="px-4 py-3 text-sm text-neutral-700">{m.invited_email ?? m.user_id ?? m.id}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{m.role}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{m.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-sm"><Link href="/ads/account/team/invite" className="font-medium text-neutral-900 underline">Invite a member</Link></p>
    </div>
  );
}
