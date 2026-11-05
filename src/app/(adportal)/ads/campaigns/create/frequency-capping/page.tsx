"use client";

import { CreateStepShell } from "@/components/ads/create-step";

export default function Page() {
  return (
    <CreateStepShell title="Frequency Capping" description="Limit how often the same person hears the ad.">
      <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>Frequency caps aren't stored on campaigns in this system — delivery doesn't record per-person exposure, so a cap couldn't be enforced or reported. No setting is offered here rather than a control that does nothing.</p>
      </div>
    </CreateStepShell>
  );
}
