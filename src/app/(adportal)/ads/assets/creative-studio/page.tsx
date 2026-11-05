"use client";

import Link from "next/link";

const DOORS = [
  { label: "Create a creative", href: "/ads/creatives/create", desc: "The full create form — campaign, asset, copy, destination." },
  { label: "Creative studio", href: "/ads/creatives/studio", desc: "The studio surface for working on creatives." },
  { label: "AI script generator", href: "/ads/creatives/ai/script", desc: "Draft ad copy from a brief." },
  { label: "AI voiceover brief", href: "/ads/creatives/ai/voiceover", desc: "Brief a voiceover script." },
];

export default function Page() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Creative Studio</h1>
        <p className="mt-1 text-sm text-neutral-500">Where creatives get made — the studio lives in the Creatives section; these are its doors.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {DOORS.map((d) => (
          <Link key={d.label} href={d.href} className="rounded-xl border border-neutral-100 bg-white p-5 transition-colors hover:border-neutral-200 hover:bg-neutral-50">
            <h3 className="text-sm font-semibold text-neutral-900">{d.label}</h3>
            <p className="mt-1 text-xs text-neutral-500">{d.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
