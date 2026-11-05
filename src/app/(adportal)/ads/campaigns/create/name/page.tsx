"use client";

import { CreateStepShell, useDraftCreate, NameField, CreateButton, stepInputCls } from "@/components/ads/create-step";

export default function Page() {
  const d = useDraftCreate();
  return (
    <CreateStepShell title="Campaign Name" description="Start with a name — the draft is created now and finished from its record page.">
      <div className="rounded-xl border border-neutral-100 bg-white p-6">
        <NameField name={d.name} setName={d.setName} />
        <CreateButton busy={d.busy} error={d.error} onClick={() => d.create({})} />
      </div>
    </CreateStepShell>
  );
}
