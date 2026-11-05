"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MetricCard } from "@/components/ads/ui";

export default function Page() {

  const [verif, setVerif] = useState<any>(null);
  const [creatives, setCreatives] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/ads/verification").then((r) => (r.ok ? r.json() : null)).then(setVerif).catch(() => {});
    fetch("/api/ads/creatives").then((r) => (r.ok ? r.json() : { creatives: [] })).then((d) => setCreatives(d.creatives ?? [])).catch(() => {});
  }, []);
  const rejected = creatives.filter((c) => c.status === "rejected").length;
  const pending = creatives.filter((c) => c.status === "pending_review" || c.status === "in_review").length;
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Security</h1>
        <p className="mt-1 text-sm text-neutral-500">The security state of this ad account, from its real records.</p>
      </div>
      <div className="max-w-2xl space-y-2 rounded-xl border border-neutral-100 bg-white p-6 text-sm">
        <div className="flex justify-between"><span className="text-neutral-500">Business verification</span><span className="font-medium text-neutral-900">{verif ? (verif.verified ? "Verified" : verif.latest ? `Application ${verif.latest.status}` : "Not started") : "…"}</span></div>
        <div className="flex justify-between"><span className="text-neutral-500">Two-factor authentication</span><span className="font-medium text-neutral-900">Managed by your identity provider</span></div>
        <div className="flex justify-between"><span className="text-neutral-500">Advertiser API keys</span><span className="font-medium text-neutral-900">None — no ads key store exists</span></div>
        <p className="pt-3 text-xs text-neutral-400">The "A+ score", "2FA On for all members" and "3 active API keys" that used to be shown here weren't read from anywhere.</p>
        <p className="pt-1"><Link href="/ads/settings/security" className="font-medium text-neutral-900 underline">Security in Settings</Link></p>
      </div>
    </div>
  );
}
