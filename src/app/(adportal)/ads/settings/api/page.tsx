"use client";

export default function Page() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">API Access</h1>
        <p className="mt-1 text-sm text-neutral-500">Manage API keys, webhooks, and developer access.</p>
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>Advertiser API keys aren't issued from the ads settings — there's no key store for ad accounts in this system, and no keys exist to list here. Programmatic access to the ad platform runs on the same authenticated session as this portal. If developer keys are introduced, they will be managed from the platform's developer settings, not invented here.</p>
      </div>
    </div>
  );
}
