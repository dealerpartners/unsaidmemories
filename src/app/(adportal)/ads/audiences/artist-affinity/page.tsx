"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Artist Affinity</h1>
        <p className="mt-1 text-sm text-neutral-500">Audiences built from artist affinity.</p>
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>Artist affinity is not a targeting facet in this system — audiences are built from locations, languages, devices, age range and gender, and listener affinity data is not collected. The affinity audiences that used to be listed here were sample data.</p>
      </div>
    </div>
  );
}
