"use client";

import Link from "next/link";

const SKILLS = [
  { id: "script", label: "Script Generator", href: "/ads/creatives/ai/script", desc: "Draft ad copy — headline, body and call to action — from a brief." },
  { id: "video", label: "Video Brief", href: "/ads/creatives/ai/video", desc: "Brief a video ad: concept, script beats and copy variants." },
  { id: "voiceover", label: "Voiceover Brief", href: "/ads/creatives/ai/voiceover", desc: "Brief a voiceover: script variants for the read." },
  { id: "music", label: "Music Brief", href: "/ads/creatives/ai/music", desc: "Brief the music direction for a spot." },
];

export default function Page() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">AI Skills</h1>
        <p className="mt-1 text-sm text-neutral-500">The AI tools on this account — the creative generators. Each takes a brief and returns copy variants you can use in a creative.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SKILLS.map((s) => (
          <Link key={s.id} href={s.href} className="rounded-xl border border-neutral-100 bg-white p-5 transition-colors hover:border-neutral-200 hover:bg-neutral-50">
            <h3 className="text-sm font-semibold text-neutral-900">{s.label}</h3>
            <p className="mt-1 text-xs text-neutral-500">{s.desc}</p>
          </Link>
        ))}
      </div>
      <p className="mt-4 text-xs text-neutral-400">What these return is copy — headlines, scripts and briefs. They don't render finished audio or video.</p>
    </div>
  );
}
