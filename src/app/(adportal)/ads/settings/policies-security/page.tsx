"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader, TabBar } from "@/components/ads/ui";

export default function Page() {
  const [tab, setTab] = useState(0);
  const [verif, setVerif] = useState<any>(null);
  const [brand, setBrand] = useState<any>(null);
  useEffect(() => {
    if (tab === 3) fetch("/api/ads/verification").then((r) => (r.ok ? r.json() : null)).then(setVerif).catch(() => {});
    if (tab === 4) fetch("/api/ads/settings?kind=brand_safety").then((r) => (r.ok ? r.json() : null)).then((d) => setBrand(d?.settings ?? {})).catch(() => {});
  }, [tab]);

  return (
    <div>
      <PageHeader title="Policies & Security" description="Advertising policies, content guidelines, privacy, and security settings." />
      <TabBar tabs={["Advertising Policy", "Audio Content Guidelines", "Privacy Practices", "Security", "Brand Safety"]} active={tab} onChange={setTab} />
      {tab === 0 && (
        <div className="max-w-3xl space-y-3 rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
          <p>Every creative enters review as <span className="font-medium text-neutral-900">pending review</span> when it's created, and a campaign can only run after its creatives are approved. Review checks the creative against the destination it links to — the landing page has to match what the ad promises.</p>
          <p>Campaigns about <span className="font-medium text-neutral-900">credit, employment, housing, or social issues</span> must declare that special category when the campaign is created (it's a field on the campaign) — those categories carry narrower targeting.</p>
          <p>Misleading claims are the most common rejection reason: prices, discounts and results in the ad have to be true of the offer on the destination page. Rejected creatives show their real status on the <Link href="/ads/settings/customer-review" className="font-medium text-neutral-900 underline">review page</Link>.</p>
        </div>
      )}
      {tab === 1 && (
        <div className="max-w-3xl space-y-3 rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
          <p>Audio creatives are reviewed as submitted — the spoken content, music and any claims in the spot are part of the review, not just the title. A companion image, when one serves with the spot, is reviewed as part of the same creative.</p>
          <p>Scripts generated with the AI tools are drafts: generating a script doesn't approve it, and the creative still goes through the same review when it's created.</p>
        </div>
      )}
      {tab === 2 && (
        <div className="max-w-3xl space-y-3 rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
          <p>Targeting in this system is built from the facets you set — locations, languages, devices, age range and gender — plus the audiences you save. Delivery reporting is per campaign and per placement; the system does not record per-listener conversion events, and audience breakdowns by age or gender are not collected (the analytics pages say so wherever they apply).</p>
          <p>Exclusion lists you save under <Link href="/ads/account/audience-controls" className="font-medium text-neutral-900 underline">Audience Controls</Link> are stored on your account and applied account-wide.</p>
        </div>
      )}
      {tab === 3 && (
        <div className="max-w-2xl space-y-4">
          <div className="space-y-3 rounded-xl border border-neutral-100 bg-white p-5">
            <h3 className="text-sm font-semibold text-neutral-900">Security overview — from your real records</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-neutral-500">Business verification</span><span className="font-medium text-neutral-700">{verif ? (verif.verified ? "Verified" : verif.latest ? `Application ${verif.latest.status}` : "Not started") : "…"}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">Two-factor authentication</span><span className="text-neutral-700">Managed by your identity provider, not this portal</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">Session & password controls</span><span className="text-neutral-700">Managed by your identity provider</span></div>
            </div>
          </div>
        </div>
      )}
      {tab === 4 && (
        <div className="max-w-2xl rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
          {brand ? (
            <div className="space-y-2">
              <div className="flex justify-between"><span className="text-neutral-500">Sensitivity level</span><span className="font-medium text-neutral-900">{brand.sensitivity ?? "Standard"}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">Block sensitive categories</span><span className="font-medium text-neutral-900">{brand.block_sensitive_categories ? "On" : "Off"}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">Blocked topics</span><span className="font-medium text-neutral-900">{brand.blocked_topics ? String(brand.blocked_topics).split(/\n+/).filter(Boolean).length : 0} listed</span></div>
              <p className="pt-2"><Link href="/ads/settings/brand-safety" className="font-medium text-neutral-900 underline">Change brand safety settings</Link></p>
            </div>
          ) : (
            <p>Loading…</p>
          )}
        </div>
      )}
    </div>
  );
}
