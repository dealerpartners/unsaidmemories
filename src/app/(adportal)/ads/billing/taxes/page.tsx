"use client";

export default function Page() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Taxes</h1>
        <p className="mt-1 text-sm text-neutral-500">Manage tax profile and view tax documents.</p>
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>No tax profile or tax documents are stored for ad accounts in this system — charges are recorded at their full amount in <a className="font-medium text-neutral-900 underline" href="/ads/billing/transactions">Transactions</a>, with no tax line items. The tax forms listed here before were sample data.</p>
      </div>
    </div>
  );
}
