"use client";

import Link from "next/link";

export default function Page() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">AI Creative Tools</h1>
        <p className="mt-1 text-sm text-neutral-500">Generate creative with AI.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/ads/creatives/ai/video"
            className="rounded-xl border border-neutral-100 bg-white p-5 transition-colors hover:border-neutral-200 hover:bg-neutral-50"
          >
            <h3 className="text-sm font-semibold text-neutral-900">Video Generator</h3>
            <p className="mt-1 text-xs text-neutral-500">AI-powered video ad creation</p>
          </Link>
          <Link
            href="/ads/creatives/ai/voiceover"
            className="rounded-xl border border-neutral-100 bg-white p-5 transition-colors hover:border-neutral-200 hover:bg-neutral-50"
          >
            <h3 className="text-sm font-semibold text-neutral-900">Voiceover</h3>
            <p className="mt-1 text-xs text-neutral-500">AI voiceover generation</p>
          </Link>
          <Link
            href="/ads/creatives/ai/music"
            className="rounded-xl border border-neutral-100 bg-white p-5 transition-colors hover:border-neutral-200 hover:bg-neutral-50"
          >
            <h3 className="text-sm font-semibold text-neutral-900">Music</h3>
            <p className="mt-1 text-xs text-neutral-500">AI music and audio generation</p>
          </Link>
          <Link
            href="/ads/creatives/ai/script"
            className="rounded-xl border border-neutral-100 bg-white p-5 transition-colors hover:border-neutral-200 hover:bg-neutral-50"
          >
            <h3 className="text-sm font-semibold text-neutral-900">Script Writer</h3>
            <p className="mt-1 text-xs text-neutral-500">AI ad script generation</p>
          </Link>
          <Link
            href="/ads/creatives/ai/templates"
            className="rounded-xl border border-neutral-100 bg-white p-5 transition-colors hover:border-neutral-200 hover:bg-neutral-50"
          >
            <h3 className="text-sm font-semibold text-neutral-900">Templates</h3>
            <p className="mt-1 text-xs text-neutral-500">AI template recommendations</p>
          </Link>

      </div>
    </div>
  );
}
