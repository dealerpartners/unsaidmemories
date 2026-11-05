"use client";

import { CreateStepShell } from "@/components/ads/create-step";

export default function Page() {
  return (
    <CreateStepShell title="Sub-Objective" description="A finer level under the objective.">
      <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>Campaigns in this system have one objective level — the tier they run on. There is no sub-objective in the campaign record, so there is nothing to pick here; choose the tier on the Objective step.</p>
      </div>
    </CreateStepShell>
  );
}
