"use client";

import Link from "next/link";
import { CreateStepShell } from "@/components/ads/create-step";

export default function Page() {
  return (
    <CreateStepShell title="Split Test" description="Run an A/B experiment inside the campaign.">
      <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>Experiments exist in this system as records — variants with weights, measured by real delivery events — but they aren't created from the campaign create flow; there's no split setup step behind this page. Existing experiments for a campaign can be read under <Link href="/ads/measure/experiments" className="font-medium text-neutral-900 underline">Measure → Experiments</Link>.</p>
      </div>
    </CreateStepShell>
  );
}
