"use client";

import Link from "next/link";

export default function Page() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Data Sources</h1>
        <p className="mt-1 text-sm text-neutral-500">Configure event data sources.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/ads/events/data-sources/website"
            className="rounded-xl border border-neutral-100 bg-white p-5 transition-colors hover:border-neutral-200 hover:bg-neutral-50"
          >
            <h3 className="text-sm font-semibold text-neutral-900">Website Pixel</h3>
            <p className="mt-1 text-xs text-neutral-500">Track events from your website</p>
          </Link>
          <Link
            href="/ads/events/data-sources/app"
            className="rounded-xl border border-neutral-100 bg-white p-5 transition-colors hover:border-neutral-200 hover:bg-neutral-50"
          >
            <h3 className="text-sm font-semibold text-neutral-900">App SDK</h3>
            <p className="mt-1 text-xs text-neutral-500">Track events from your mobile app</p>
          </Link>
          <Link
            href="/ads/events/data-sources/shop"
            className="rounded-xl border border-neutral-100 bg-white p-5 transition-colors hover:border-neutral-200 hover:bg-neutral-50"
          >
            <h3 className="text-sm font-semibold text-neutral-900">Shop</h3>
            <p className="mt-1 text-xs text-neutral-500">Track your shop events</p>
          </Link>
          <Link
            href="/ads/events/data-sources/crm"
            className="rounded-xl border border-neutral-100 bg-white p-5 transition-colors hover:border-neutral-200 hover:bg-neutral-50"
          >
            <h3 className="text-sm font-semibold text-neutral-900">CRM</h3>
            <p className="mt-1 text-xs text-neutral-500">Import offline conversion data</p>
          </Link>

      </div>
    </div>
  );
}
