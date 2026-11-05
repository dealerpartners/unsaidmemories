"use client";

import Link from "next/link";
import { use } from "react";

const SKILLS = [
  { id: "script", label: "Script Generator", href: "/ads/creatives/ai/script", desc: "Draft ad copy — headline, body and call to action — from a brief." },
  { id: "video", label: "Video Brief", href: "/ads/creatives/ai/video", desc: "Brief a video ad: concept, script beats and copy variants." },
  { id: "voiceover", label: "Voiceover Brief", href: "/ads/creatives/ai/voiceover", desc: "Brief a voiceover: script variants for the read." },
  { id: "music", label: "Music Brief", href: "/ads/creatives/ai/music", desc: "Brief the music direction for a spot." },
];

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const skill = SKILLS.find((s) => s.id === id);
  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-400"><Link href="/ads/ai/skills" className="hover:underline">AI Skills</Link></p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-900">{skill ? skill.label : "Skill not found"}</h1>
        <p className="mt-1 text-sm text-neutral-500">{skill ? skill.desc : "That skill doesn't exist on this account — the four real skills are listed under AI Skills."}</p>
      </div>
      {skill && <Link href={skill.href} className="rounded-lg bg-[#f2eafe] px-5 py-2 text-sm font-medium text-[#6942c2]">Open the {skill.label}</Link>}
    </div>
  );
}
