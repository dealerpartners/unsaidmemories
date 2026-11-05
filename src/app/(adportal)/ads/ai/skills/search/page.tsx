"use client";

import Link from "next/link";
import { useState } from "react";

const SKILLS = [
  { id: "script", label: "Script Generator", href: "/ads/creatives/ai/script", desc: "Draft ad copy — headline, body and call to action — from a brief." },
  { id: "video", label: "Video Brief", href: "/ads/creatives/ai/video", desc: "Brief a video ad: concept, script beats and copy variants." },
  { id: "voiceover", label: "Voiceover Brief", href: "/ads/creatives/ai/voiceover", desc: "Brief a voiceover: script variants for the read." },
  { id: "music", label: "Music Brief", href: "/ads/creatives/ai/music", desc: "Brief the music direction for a spot." },
];

export default function Page() {
  const [q, setQ] = useState("");
  const shown = SKILLS.filter((s) => `${s.label} ${s.desc}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Search Skills</h1>
        <p className="mt-1 text-sm text-neutral-500">Find an AI skill by what it does.</p>
      </div>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search skills…" className="mb-4 h-11 w-full rounded-lg border border-neutral-200 bg-white px-4 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none" />
      <div className="space-y-2">
        {shown.length === 0 && <p className="text-sm text-neutral-500">No skill matches.</p>}
        {shown.map((s) => (
          <Link key={s.id} href={s.href} className="flex items-center justify-between rounded-xl border border-neutral-100 bg-white p-4 hover:bg-neutral-50">
            <span className="text-sm font-medium text-neutral-900">{s.label}</span>
            <span className="text-xs text-neutral-500">{s.desc}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
