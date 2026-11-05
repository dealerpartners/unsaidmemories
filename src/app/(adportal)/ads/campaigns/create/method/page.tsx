"use client";

import Link from "next/link";
import { CreateStepShell } from "@/components/ads/create-step";

const METHODS = [
  { title: "Full wizard", desc: "All steps in one flow — objective, budget, placements, ad creation, review.", href: "/ads/campaigns/create" },
  { title: "Guided campaign builder", desc: "The alternate builder with its own plan and commitment steps.", href: "/ads/campaign/create" },
  { title: "Ads Manager wizard", desc: "The Ads Manager flow — the same campaigns, managed in the manager's layout.", href: "/ads/ads-manager/campaigns/create" },
  { title: "Start from a template", desc: "Begin from a saved campaign template.", href: "/ads/campaigns/templates" },
  { title: "Duplicate an existing campaign", desc: "Copy a campaign you already run and adjust it.", href: "/ads/campaigns" },
];

export default function Page() {
  return (
    <CreateStepShell title="Creation Method" description="Three builders and two shortcuts create campaigns in this system — they all write the same campaign record.">
      <div className="space-y-3">
        {METHODS.map((m) => (
          <Link key={m.title} href={m.href} className="block rounded-xl border border-neutral-100 bg-white p-5 transition-colors hover:border-neutral-200 hover:bg-neutral-50">
            <h3 className="text-sm font-semibold text-neutral-900">{m.title}</h3>
            <p className="mt-1 text-sm text-neutral-600">{m.desc}</p>
          </Link>
        ))}
      </div>
    </CreateStepShell>
  );
}
