"use client";

import { PageHeader } from "@/components/ads/ui";

export default function Page() {
  return (
    <div>
      <PageHeader title="Documents" description="Legal and compliance document library." />
      <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>There's no document library for ad accounts in this system — no legal or compliance documents are stored here, and the document list that used to appear on this page was sample data. Verification documents are filed from the <a className="font-medium text-neutral-900 underline" href="/ads/settings/verification">verification flow</a>.</p>
      </div>
    </div>
  );
}
