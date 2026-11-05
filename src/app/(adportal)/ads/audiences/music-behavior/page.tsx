"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Music Behavior</h1>
        <p className="mt-1 text-sm text-neutral-500">Audiences built from listening behavior.</p>
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>Listening behavior is not collected by this system, so behavior-based audiences cannot be built — audiences here are targeting sets (locations, languages, devices, age range, gender) saved from the <a className="font-medium text-neutral-900 underline" href="/ads/audiences/create">Create Audience</a> page.</p>
      </div>
    </div>
  );
}
