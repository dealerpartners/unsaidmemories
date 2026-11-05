"use client";

import Link from "next/link";
import { PageHeader, CardGrid } from "@/components/ads/ui";

export default function CreativeStudioPage() {
  return (
    <div>
      <PageHeader
        title="Creative Studio"
        description="Build reusable ad creative. Upload, compose, preview, and generate with AI."
        actions={<Link href="/ads/creatives/create" className="inline-flex h-9 items-center rounded-lg bg-[#f2eafe] px-4 text-sm font-medium text-[#6942c2] transition-colors hover:bg-[#e7dbfc]">Upload Asset</Link>}
      />
      <CardGrid cards={[
        { label: "Audio Upload", description: "Upload and manage audio ad files (MP3, WAV, M4A)", href: "/ads/creatives/audio" },
        { label: "Companion Images", description: "Upload companion visuals for audio and video ads (1200×628)", href: "/ads/creatives/companion" },
        { label: "Logo Manager", description: "Upload and manage brand logos (200×200, PNG/SVG)", href: "/ads/creatives/logo" },
        { label: "CTA Builder", description: "Configure call-to-action buttons and deep links", href: "/ads/creatives/cta" },
        { label: "Destination URLs", description: "Set, validate, and preview landing page URLs", href: "/ads/creatives/destination" },
        { label: "Ad Preview", description: "Preview your ad across all placements in real time", href: "/ads/creatives/preview" },
        { label: "AI Generator", description: "Generate creative with AI — video, voiceover, music, scripts", href: "/ads/creatives/ai" },
        { label: "Overlay Manager", description: "Manage ad overlays, stickers, and branded frames", href: "/ads/creatives/overlay" },
      ]} />
    </div>
  );
}
