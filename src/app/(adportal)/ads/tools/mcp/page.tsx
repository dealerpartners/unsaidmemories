"use client";

import Link from "next/link";

export default function Page() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">MCP</h1>
        <p className="mt-1 text-sm text-neutral-500">Model Context Protocol access for ad tools.</p>
      </div>
      <div className="max-w-2xl rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>No MCP server is exposed for the ad platform — programmatic work runs through the portal and its APIs with your normal sign-in. There is no MCP endpoint or token to configure here.</p>
      </div>
    </div>
  );
}
