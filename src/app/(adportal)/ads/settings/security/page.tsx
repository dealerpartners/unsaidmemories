"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {
  const [verif, setVerif] = useState<any>(null);
  const [team, setTeam] = useState<any[]>([]);
  const [acct, setAcct] = useState<any>(null);
  useEffect(() => {
    fetch("/api/ads/verification").then((r) => (r.ok ? r.json() : null)).then(setVerif).catch(() => {});
    fetch("/api/ads/team").then((r) => (r.ok ? r.json() : { members: [] })).then((d) => setTeam((d.members ?? []).filter((m: any) => m.status !== "removed"))).catch(() => {});
    fetch("/api/ads/account").then((r) => (r.ok ? r.json() : null)).then(setAcct).catch(() => {});
  }, []);
  const cards = [
    { title: "Business verification", desc: verif ? (verif.verified ? "Verified" : verif.latest ? `Application ${verif.latest.status}` : "Not started") : "…", href: "/ads/settings/verification" },
    { title: "Team access", desc: `${team.length} member${team.length === 1 ? "" : "s"} with account access`, href: "/ads/settings/team" },
    { title: "Role permissions", desc: "What each role can read and write", href: "/ads/account/team/permissions" },
    { title: "Account status", desc: acct?.advertiser ? acct.advertiser.status : "…", href: "/ads/settings/account" },
  ];
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Security & Documents</h1>
        <p className="mt-1 text-sm text-neutral-500">The security state of this ad account, from its real records.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.title} href={c.href} className="rounded-xl border border-neutral-100 bg-white p-5 transition-colors hover:border-neutral-200 hover:bg-neutral-50">
            <h3 className="text-sm font-semibold text-neutral-900">{c.title}</h3>
            <p className="mt-1 text-xs text-neutral-500">{c.desc}</p>
          </Link>
        ))}
      </div>
      <div className="mt-6 max-w-2xl rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>Sign-in security — passwords, two-factor authentication and active sessions — is managed by the identity provider for your whole account, not from the ads portal, so there's nothing to configure here for it. (This page previously showed dead cards and an "Enabled" two-factor state that wasn't read from anywhere.)</p>
      </div>
    </div>
  );
}
