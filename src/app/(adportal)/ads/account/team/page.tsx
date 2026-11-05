"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MetricCard } from "@/components/ads/ui";

type Member = { id: string; invited_email: string | null; user_id: string | null; role: string; status: string; created_at: string };

export default function Page() {
  const [members, setMembers] = useState<Member[]>([]);
  useEffect(() => {
    fetch("/api/ads/team").then((r) => (r.ok ? r.json() : { members: [] }))
      .then((d) => setMembers((d.members ?? []).filter((m: Member) => m.status !== "removed"))).catch(() => {});
  }, []);
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Team</h1>
          <p className="mt-1 text-sm text-neutral-500">People with access to this ad account.</p>
        </div>
        <Link href="/ads/account/team/invite" className="rounded-lg bg-[#f2eafe] px-4 py-2 text-sm font-medium text-[#6942c2]">Invite member</Link>
      </div>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard label="Members" value={String(members.length)} delta="on this account" deltaType="neutral" />
        <MetricCard label="Active" value={String(members.filter((m) => m.status === "active").length)} delta="can work today" deltaType="neutral" />
        <MetricCard label="Invited" value={String(members.filter((m) => m.status === "invited" || m.status === "pending").length)} delta="haven't joined yet" deltaType="neutral" />
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-100 text-left text-xs font-medium uppercase tracking-wider text-neutral-400">
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Since</th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-sm text-neutral-500">No team members yet — invite the first one.</td></tr>
            )}
            {members.map((m) => (
              <tr key={m.id} className="border-b border-neutral-50">
                <td className="px-4 py-3 text-sm text-neutral-700"><Link href={`/ads/account/team/${m.id}`} className="font-medium text-neutral-900 hover:underline">{m.invited_email ?? m.user_id ?? m.id}</Link></td>
                <td className="px-4 py-3 text-sm text-neutral-700">{m.role}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{m.status}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{new Date(m.created_at).toLocaleDateString("en-US")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
