'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Scale } from 'lucide-react';

// ============================================================================
// C3 · Stripe reconciliation — compares commerce_payments (local ledger)
// against Stripe charges and commerce_webhook_events for a period, from
// /api/admin/payments/reconciliation. Every row is classified
// matched / amount_mismatch / local_only / no_reference / stripe_only
// from real records; when Stripe is not configured the report says so
// and classifies from the local ledger alone — nothing is labeled
// matched without a Stripe counterpart.
// ============================================================================

type Any = Record<string, any>;

const CLS_LABEL: Record<string, string> = {
  matched: 'Matched',
  amount_mismatch: 'Amount mismatch',
  local_only: 'Local only',
  no_reference: 'No processor reference',
  stripe_only: 'Stripe only',
};
const CLS_CLS: Record<string, string> = {
  matched: 'adm-badge adm-badge-green',
  amount_mismatch: 'adm-badge adm-badge-red',
  local_only: 'adm-badge adm-badge-amber',
  no_reference: 'adm-badge',
  stripe_only: 'bg-brand-teal/10 text-brand-teal dark:bg-brand-teal/20 dark:text-brand-teal',
};

export default function ReconciliationPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/payments/reconciliation?days=${days}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load reconciliation');
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Scale className="size-6" /> Stripe Reconciliation
        </h1>
        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2">
          <Link href="/admin/payments" className="text-[13px] font-medium underline underline-offset-2">Payments</Link>
          <Link href="/admin/refunds" className="text-[13px] font-medium underline underline-offset-2">Refunds &amp; Disputes</Link>
          <Link href="/admin/reports" className="text-[13px] font-medium underline underline-offset-2">Financial Reports (disputes)</Link>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {[7, 30, 90].map((d) => (
          <button key={d} onClick={() => setDays(d)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium cursor-pointer ${days === d ? 'bg-brand-teal/10 text-brand-teal' : 'border border-border text-muted-foreground'}`}>
            Last {d} days
          </button>
        ))}
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {loading ? (
        <p className="text-[13px] text-muted-foreground">Running the comparison…</p>
      ) : !data ? null : (
        <>
          <div className={`rounded-lg border px-3 py-2 text-sm ${data.stripeConfigured ? 'border-border bg-muted/40' : 'border-amber-200 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200'}`}>
            {data.stripeConfigured
              ? <>Stripe connected — {data.stripeChargesFetched} charge(s) fetched for the period{data.stripeChargesCappedAt500 ? ' (capped at 500; narrow the period for a complete comparison)' : ''} · {data.webhookEventsInPeriod} webhook event(s) recorded in the period.</>
              : <>Stripe is not configured for this comparison{data.stripeError ? ` (${data.stripeError})` : ''} — local rows are classified from commerce_payments alone; nothing is labeled matched.</>}
          </div>
          {data.note && <p className="text-[13px] text-muted-foreground">{data.note}</p>}

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              ['Local payments', data.summary.localPayments],
              ['Matched', data.summary.matched],
              ['Amount mismatch', data.summary.amountMismatch],
              ['Local only', data.summary.localOnly],
              ['No reference', data.summary.noReference],
              ['Stripe only', data.summary.stripeOnly],
            ].map(([label, v]) => (
              <div key={label as string} className="bg-card border border-border rounded-xl px-4 py-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
                <div className="text-xl font-bold">{v as number}</div>
              </div>
            ))}
          </div>
          <p className="text-[12px] text-muted-foreground">
            {data.summary.localWithoutWebhook} local payment(s) in the period have no referencing webhook event in commerce_webhook_events.
          </p>

          {data.rows.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center">
              <p className="text-[14px] font-medium">Nothing to reconcile in this period</p>
              <p className="text-[13px] text-muted-foreground mt-1">No local payments and no Stripe charges were found.</p>
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden bg-card overflow-x-auto">
              <div className="adm-table-wrap"><table className="adm-table">
                <thead>
                  <tr>
                    <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Classification</th>
                    <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Local payment</th>
                    <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Reference</th>
                    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Local $</th>
                    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Stripe $</th>
                    <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Webhook</th>
                    <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r: Any, i: number) => (
                    <tr key={i} className="border-t border-border">
                      <td className="p-3"><span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${CLS_CLS[r.classification] || ''}`}>{CLS_LABEL[r.classification] || r.classification}</span></td>
                      <td className="p-3">{r.paymentNumber || r.localPaymentId || '—'}{r.localStatus ? <span className="text-muted-foreground"> · {r.localStatus}</span> : null}</td>
                      <td className="p-3 text-[12px] text-muted-foreground break-all">{r.reference || r.stripeChargeId || '—'}</td>
                      <td className="p-3 text-right">{r.localAmount != null ? Number(r.localAmount).toFixed(2) : '—'}</td>
                      <td className="p-3 text-right">{r.stripeAmount != null ? Number(r.stripeAmount).toFixed(2) : '—'}</td>
                      <td className="p-3">{r.webhookReceived == null ? '—' : r.webhookReceived ? 'Received' : 'Missing'}</td>
                      <td className="p-3 text-[12px] text-muted-foreground">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
