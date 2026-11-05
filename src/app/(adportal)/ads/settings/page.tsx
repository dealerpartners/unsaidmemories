"use client";

import Link from "next/link";

export default function Page() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Settings</h1>
        <p className="mt-1 text-sm text-neutral-500">Ad Center settings.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/ads/settings/account"
            className="rounded-xl border border-neutral-100 bg-white p-5 transition-colors hover:border-neutral-200 hover:bg-neutral-50"
          >
            <h3 className="text-sm font-semibold text-neutral-900">Account & Business</h3>
            <p className="mt-1 text-xs text-neutral-500">Business info, account settings</p>
          </Link>
          <Link
            href="/ads/settings/team"
            className="rounded-xl border border-neutral-100 bg-white p-5 transition-colors hover:border-neutral-200 hover:bg-neutral-50"
          >
            <h3 className="text-sm font-semibold text-neutral-900">Team & Permissions</h3>
            <p className="mt-1 text-xs text-neutral-500">Invite members, manage roles</p>
          </Link>
          <Link
            href="/ads/settings/verification"
            className="rounded-xl border border-neutral-100 bg-white p-5 transition-colors hover:border-neutral-200 hover:bg-neutral-50"
          >
            <h3 className="text-sm font-semibold text-neutral-900">Verification</h3>
            <p className="mt-1 text-xs text-neutral-500">Business verification</p>
          </Link>
          <Link
            href="/ads/settings/security"
            className="rounded-xl border border-neutral-100 bg-white p-5 transition-colors hover:border-neutral-200 hover:bg-neutral-50"
          >
            <h3 className="text-sm font-semibold text-neutral-900">Security & Documents</h3>
            <p className="mt-1 text-xs text-neutral-500">2FA, sessions, documents</p>
          </Link>
          <Link
            href="/ads/settings/notifications"
            className="rounded-xl border border-neutral-100 bg-white p-5 transition-colors hover:border-neutral-200 hover:bg-neutral-50"
          >
            <h3 className="text-sm font-semibold text-neutral-900">Notification Preferences</h3>
            <p className="mt-1 text-xs text-neutral-500">Choose what notifications you receive</p>
          </Link>
          <Link
            href="/ads/settings/targeting-defaults"
            className="rounded-xl border border-neutral-100 bg-white p-5 transition-colors hover:border-neutral-200 hover:bg-neutral-50"
          >
            <h3 className="text-sm font-semibold text-neutral-900">Targeting Defaults</h3>
            <p className="mt-1 text-xs text-neutral-500">Pre-fill targeting in campaign builder</p>
          </Link>
          <Link
            href="/ads/settings/api"
            className="rounded-xl border border-neutral-100 bg-white p-5 transition-colors hover:border-neutral-200 hover:bg-neutral-50"
          >
            <h3 className="text-sm font-semibold text-neutral-900">API Access</h3>
            <p className="mt-1 text-xs text-neutral-500">API keys, webhooks, developer access</p>
          </Link>

      </div>
    </div>
  );
}
