"use client";

import { CreateStepShell } from "@/components/ads/create-step";

export default function Page() {
  return (
    <CreateStepShell title="Bidding" description="How the campaign bids for delivery.">
      <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>Delivery here is priced from the rate card, not an auction — campaigns don't carry bid strategies or bid caps. What a budget buys is shown on the Estimates step, and the price basis is the tier you pick on the Objective step.</p>
      </div>
    </CreateStepShell>
  );
}
