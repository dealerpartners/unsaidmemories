"use client";

import Link from "next/link";

export default function Page() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Skills MCP</h1>
        <p className="mt-1 text-sm text-neutral-500">Use the AI skills over MCP.</p>
      </div>
      <div className="max-w-2xl rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>The AI skills aren't exposed over MCP — they run in the portal, on the <Link href="/ads/ai/skills" className="font-medium text-neutral-900 underline">AI Skills</Link> pages, with your normal sign-in. There is no MCP endpoint for them.</p>
      </div>
    </div>
  );
}
