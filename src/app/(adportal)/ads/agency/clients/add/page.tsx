"use client";

import Link from "next/link";

export default function Page() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Add Client</h1>
        <p className="mt-1 text-sm text-neutral-500">Bring a new client account under this login.</p>
      </div>
      <div className="max-w-2xl rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>Client accounts aren't added from here — an ad account is created when its owner signs up, and other people join an existing account by invitation. To give someone access to this account, <Link href="/ads/account/team/invite" className="font-medium text-neutral-900 underline">invite them to the team</Link>.</p>
      </div>
    </div>
  );
}
