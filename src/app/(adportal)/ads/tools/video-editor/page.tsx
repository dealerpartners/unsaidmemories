"use client";

import Link from "next/link";

export default function Page() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Video Editor</h1>
        <p className="mt-1 text-sm text-neutral-500">Edit video creatives.</p>
      </div>
      <div className="max-w-2xl rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>There is no video editor in the portal — video creatives are made by uploading the finished asset on the <Link href="/ads/creatives/create" className="font-medium text-neutral-900 underline">creative create form</Link>, and the <Link href="/ads/creatives/ai/video" className="font-medium text-neutral-900 underline">AI video brief</Link> drafts the concept and copy. An in-browser editor isn't part of this system.</p>
      </div>
    </div>
  );
}
