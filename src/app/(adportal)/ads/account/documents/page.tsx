"use client";

export default function Page() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Documents</h1>
        <p className="mt-1 text-sm text-neutral-500">Account documents and agreements.</p>
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>There's no document store for advertiser accounts in this system — no agreements, tax forms or uploads are kept here, and the document list that used to appear on this page was sample data. Verification documents are filed from the <a className="font-medium text-neutral-900 underline" href="/ads/account/verification/start">verification flow</a> instead.</p>
      </div>
    </div>
  );
}
