"use client";

import { useEffect, useState } from "react";

import { PageHeader, CardGrid, MetricCard } from "@/components/ads/ui";

export default function PoliciesSecurityPage() {
  const [verif, setVerif] = useState<any>(null);
  const [creatives, setCreatives] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/ads/verification").then((r) => (r.ok ? r.json() : null)).then(setVerif).catch(() => {});
    fetch("/api/ads/creatives").then((r) => (r.ok ? r.json() : { creatives: [] })).then((d) => setCreatives(d.creatives ?? [])).catch(() => {});
  }, []);
  const rejected = creatives.filter((c) => c.status === "rejected").length;
  const pending = creatives.filter((c) => c.status === "pending_review" || c.status === "in_review").length;

  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader title="Advertising Policies & Security" description="Review advertising policies, privacy settings, security configurations, and brand safety controls." />
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard label="Creatives in review" value={String(pending)} delta="waiting on the review team" deltaType="neutral" />
        <MetricCard label="Business verification" value={verif ? (verif.verified ? "Verified" : verif.latest ? "In review" : "Not started") : "—"} delta="the identity on record" deltaType="neutral" />
        <MetricCard label="Rejected creatives" value={String(rejected)} delta="of {creatives.length} total" deltaType="neutral" />
      </div>
      <CardGrid cards={[
        { label: "Advertising Policies", description: "Content policies, prohibited categories, and restricted content guidelines", href: "/ads/policies-security/privacy" },
        { label: "Privacy & Data", description: "Data collection policies, consent management, and user privacy controls", href: "/ads/policies-security/privacy" },
        { label: "Security", description: "Account security, API access controls, and fraud prevention", href: "/ads/policies-security/security" },
        { label: "Brand Safety", description: "Content adjacency controls, blocklists, and suitability settings", href: "/ads/policies-security/brand-safety" },
      ]} />
    </div>
  );
}
