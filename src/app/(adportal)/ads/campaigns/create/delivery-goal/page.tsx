"use client";

import { CreateStepShell } from "@/components/ads/create-step";

export default function Page() {
  return (
    <CreateStepShell title="Delivery Goal" description="What delivery optimizes toward.">
      <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>There is no separate delivery-goal setting on a campaign in this system: delivery spends the campaign budget across its placements, and results are reported as impressions, clicks and captured leads. The goal is set by the campaign's tier and budget.</p>
      </div>
    </CreateStepShell>
  );
}
