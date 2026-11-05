"use client";

import Link from "next/link";

export default function Page() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Message Assistant</h1>
        <p className="mt-1 text-sm text-neutral-500">Help replying to lead messages.</p>
      </div>
      <div className="max-w-2xl rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>There is no message assistant in this system — no automated replies are generated or sent for lead messages, and no assistant settings exist to tune. Replies happen in the channel the lead came through.</p>
      </div>
    </div>
  );
}
