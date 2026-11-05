"use client";

import Link from "next/link";

export default function Page() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">AI Skills</h1>
        <p className="mt-1 text-sm text-neutral-500">AI tools for this account.</p>
      </div>
      <div className="max-w-2xl rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>The AI tools that exist are the creative generators — script, video brief, voiceover and music briefs — under <Link href="/ads/ai/skills" className="font-medium text-neutral-900 underline">AI Skills</Link> in the AI section. There are no account-level AI settings to manage here.</p>
      </div>
    </div>
  );
}
