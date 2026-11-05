"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader, Button } from "@/components/ads/ui";

type Member = { id: string; invited_email: string | null; user_id: string | null; role: string; status: string; created_at: string };

export default function Page() {
  const [members, setMembers] = useState<Member[]>([]);
  useEffect(() => {
    fetch("/api/ads/team").then((r) => (r.ok ? r.json() : { members: [] }))
      .then((d) => setMembers((d.members ?? []).filter((m: Member) => m.status !== "removed"))).catch(() => {});
  }, []);
  return (
    <div>
      <PageHeader title="Team" description="People with access to this ad account — the same team as under Account, managed here in Settings." actions={<Link href="/ads/account/team/invite"><Button>Invite member</Button></Link>} />
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
              <tr><td colSpan={4} className="px-4 py-6 text-sm text-neutral-500">No team members yet.</td></tr>
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
      <p className="mt-4 text-sm"><Link href="/ads/account/team/permissions" className="font-medium text-neutral-900 underline">Role permissions</Link></p>
    </div>
  );
}
