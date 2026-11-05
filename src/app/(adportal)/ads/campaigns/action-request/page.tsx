"use client";

import Link from "next/link";

export default function Page() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Action Requests</h1>
        <p className="mt-1 text-sm text-neutral-500">Request an action on a campaign for someone else to carry out.</p>
      </div>
      <div className="max-w-2xl rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>There's no action-request queue for campaigns in this system — the people on your team who have campaign access act on campaigns directly, and role permissions (under <Link href="/ads/account/team/permissions" className="font-medium text-neutral-900 underline">Team → Permissions</Link>) decide who can do what. The review queue that does exist is for <Link href="/ads/creatives" className="font-medium text-neutral-900 underline">creative review</Link>, not campaign actions.</p>
      </div>
    </div>
  );
}
