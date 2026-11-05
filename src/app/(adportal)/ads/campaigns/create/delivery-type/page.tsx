"use client";

import { CreateStepShell } from "@/components/ads/create-step";

export default function Page() {
  return (
    <CreateStepShell title="Delivery Type" description="How delivery is paced and placed.">
      <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>Delivery type isn't a campaign field here — a campaign delivers across the placements picked on the Placements step, at the pace its budget allows. There are no standard/accelerated modes to choose between.</p>
      </div>
    </CreateStepShell>
  );
}
