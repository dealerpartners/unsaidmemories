'use client';

import React, { useEffect, useState } from 'react';
import { StatementNav, fmt, thCls } from '../_shared';

// /admin/accounting/reports/settlement-clearing — Settlement &
// Clearing Reconciler (owner's settlement_clearing_reconciler
// .html): every gateway charge's path from gross authorized to
// net in-clearing (acct_gateway_clearing_entries), reconciled
// against the payout ledger (acct_payouts). Both ledgers are
// shown exactly as they stand — when they are empty, the page
// says so and explains what writes them.

type Entry = {
  id: string; orderRef: string; gateway: string; gross: number; fees: number; reserve: number; net: number;
  currency: string; state: string; payoutId: string | null; payoutLinked: boolean;
  windowStart: string | null; windowEnd: string | null; releasedAt: string | null; createdAt: string;
};
type Payout = {
  id: string; payoutNumber: string; provider: string; providerPayoutId: string | null;
  gross: number; fees: number; refunds: number; chargebacks: number; net: number; status: string;
  scheduledFor: string | null; arrivedAt: string | null; postedToGl: boolean;
};
type Data = {
  entries: Entry[]; payouts: Payout[];
  summary: { grossAuthorized: number; processorFees: number; escrowReserve: number; reserveHeld: number; netInClearing: number; payoutsGross: number; payoutsFees: number; payoutsNet: number };
  reserveByGateway: { gateway: string; amount: number }[];
  reconciliation: { entriesTotal: number; entriesWithPayout: number; entriesOrphaned: number; payoutsTotal: number; payoutsWithoutEntries: number; payoutsPostedToGl: number };
};

const fmtDate = (d: string | null) =>
  d ? new Date(d.length <= 10 ? d + 'T12:00:00' : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export default function SettlementClearingPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/admin/accounting/settlement-clearing', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then(setData)
      .catch(() => setError('The settlement reconciler could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  const shown = (data?.entries || []).filter((e) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [e.orderRef, e.gateway, e.state, e.payoutId || ''].join(' ').toLowerCase().includes(q);
  });

  const kpi = (label: string, value: string, foot: string) => (
    <div className="border border-border rounded-xl bg-card p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold mt-1 tabular-nums">{value}</div>
      <div className="text-[12px] text-muted-foreground">{foot}</div>
    </div>
  );

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Settlement &amp; Clearing Reconciler</h1>
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order ref, gateway, state…"
          className="bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full md:w-64" type="text" />
      </div>
      <StatementNav active="/admin/accounting/reports/settlement-clearing" />

      <div className="mt-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive">{error}</div>}
        {loading && !data ? <div className="text-muted-foreground text-sm">Loading the reconciler…</div> : null}
        {data ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {kpi('Gross Authorized', fmt(data.summary.grossAuthorized), `${data.reconciliation.entriesTotal} clearing entr${data.reconciliation.entriesTotal === 1 ? 'y' : 'ies'}`)}
              {kpi('Processor Fees', fmt(data.summary.processorFees), 'deducted before settlement')}
              {kpi('Escrow Reserve Held', fmt(data.summary.reserveHeld), `of ${fmt(data.summary.escrowReserve)} reserved all-time`)}
              {kpi('Net In-Clearing', fmt(data.summary.netInClearing), 'not yet released to a payout')}
            </div>

            <div className={`rounded-lg border px-4 py-2 text-sm mt-4 ${data.reconciliation.entriesOrphaned === 0 ? 'border-emerald-600/30 bg-emerald-50 text-emerald-900' : 'border-amber-600/40 bg-amber-50 text-amber-900'}`}>
              Reconciliation: {data.reconciliation.entriesWithPayout} of {data.reconciliation.entriesTotal} clearing entries are linked to a payout
              ({data.reconciliation.entriesOrphaned} unlinked) · {data.reconciliation.payoutsTotal} payout(s) in the payout ledger
              ({data.reconciliation.payoutsWithoutEntries} without clearing entries) · {data.reconciliation.payoutsPostedToGl} payout(s) posted to the general ledger.
              Payout ledger totals: gross {fmt(data.summary.payoutsGross)} · fees {fmt(data.summary.payoutsFees)} · net {fmt(data.summary.payoutsNet)}.
            </div>

            <div className="font-semibold text-[15px] mt-5 mb-2">Clearing Ledger</div>
            <div className="border border-border rounded-xl overflow-x-auto bg-card">
              <div className="adm-table-wrap"><table className="adm-table">
                <thead><tr className={thCls}>
                  <th className="p-3 border-r border-border">Order Ref / Source</th>
                  <th className="p-3 border-r border-border">Gateway Route</th>
                  <th className="p-3 border-r border-border text-right">Gross Authorized</th>
                  <th className="p-3 border-r border-border text-right">Processor Fees</th>
                  <th className="p-3 border-r border-border text-right">Escrow Reserve</th>
                  <th className="p-3 border-r border-border text-right">Net In-Clearing</th>
                  <th className="p-3 border-r border-border">Payout Identifier</th>
                  <th className="p-3 border-r border-border">Deposit Window</th>
                  <th className="p-3">Status</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {shown.length === 0 ? (
                    <tr><td colSpan={9} className="p-3 text-center text-muted-foreground">
                      {data.entries.length === 0
                        ? 'No clearing entries yet. A row appears here for every gateway charge the settlement sync records — gross, its processor fee, any escrow reserve held back, and the payout it settles into. Until the sync writes them, this ledger is honestly empty.'
                        : 'No clearing entries match this search.'}
                    </td></tr>
                  ) : shown.map((e) => (
                    <tr key={e.id} className="hover:bg-accent/50">
                      <td className="p-3 border-r border-border font-medium">{e.orderRef}</td>
                      <td className="p-3 border-r border-border capitalize">{e.gateway}</td>
                      <td className="p-3 border-r border-border text-right tabular-nums">{fmt(e.gross)}</td>
                      <td className="p-3 border-r border-border text-right tabular-nums">−{fmt(e.fees)}</td>
                      <td className="p-3 border-r border-border text-right tabular-nums">{e.reserve ? `−${fmt(e.reserve)}` : '—'}</td>
                      <td className="p-3 border-r border-border text-right tabular-nums font-medium">{fmt(e.net)}</td>
                      <td className="p-3 border-r border-border">{e.payoutId || <span className="text-muted-foreground">not yet assigned</span>}</td>
                      <td className="p-3 border-r border-border">{e.windowStart ? `${fmtDate(e.windowStart)} → ${fmtDate(e.windowEnd)}` : '—'}</td>
                      <td className="p-3 capitalize">{e.releasedAt ? `Released ${fmtDate(e.releasedAt)}` : e.state.replace(/_/g, ' ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>

            {data.reserveByGateway.length > 0 && (
              <>
                <div className="font-semibold text-[15px] mt-5 mb-2">Rolling Gateway &amp; Escrow Sub-Ledger</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {data.reserveByGateway.map((r) => (
                    <div key={r.gateway} className="border border-border rounded-xl bg-card p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground capitalize">{r.gateway} Reserve</div>
                      <div className="text-xl font-semibold mt-1 tabular-nums">{fmt(r.amount)}</div>
                      <div className="text-[12px] text-muted-foreground">withheld and not yet released</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="font-semibold text-[15px] mt-5 mb-2">Payout Ledger</div>
            <div className="border border-border rounded-xl overflow-x-auto bg-card">
              <div className="adm-table-wrap"><table className="adm-table">
                <thead><tr className={thCls}>
                  <th className="p-3 border-r border-border">Payout</th>
                  <th className="p-3 border-r border-border">Provider</th>
                  <th className="p-3 border-r border-border text-right">Gross</th>
                  <th className="p-3 border-r border-border text-right">Fees</th>
                  <th className="p-3 border-r border-border text-right">Refunds / Chargebacks</th>
                  <th className="p-3 border-r border-border text-right">Net</th>
                  <th className="p-3 border-r border-border">Status</th>
                  <th className="p-3">GL</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {data.payouts.length === 0 ? (
                    <tr><td colSpan={8} className="p-3 text-center text-muted-foreground">
                      No payouts recorded yet. Payouts land here when the gateway pays out to the bank; each one then reconciles against the clearing entries above.
                    </td></tr>
                  ) : data.payouts.map((p) => (
                    <tr key={p.id} className="hover:bg-accent/50">
                      <td className="p-3 border-r border-border font-medium">{p.payoutNumber}{p.providerPayoutId ? <div className="text-[11px] font-normal text-muted-foreground">{p.providerPayoutId}</div> : null}</td>
                      <td className="p-3 border-r border-border capitalize">{p.provider}</td>
                      <td className="p-3 border-r border-border text-right tabular-nums">{fmt(p.gross)}</td>
                      <td className="p-3 border-r border-border text-right tabular-nums">−{fmt(p.fees)}</td>
                      <td className="p-3 border-r border-border text-right tabular-nums">−{fmt(p.refunds + p.chargebacks)}</td>
                      <td className="p-3 border-r border-border text-right tabular-nums font-medium">{fmt(p.net)}</td>
                      <td className="p-3 border-r border-border capitalize">{p.status}{p.arrivedAt ? <div className="text-[11px] text-muted-foreground">arrived {fmtDate(p.arrivedAt)}</div> : p.scheduledFor ? <div className="text-[11px] text-muted-foreground">due {fmtDate(p.scheduledFor)}</div> : null}</td>
                      <td className="p-3">{p.postedToGl ? 'Posted' : 'Not posted'}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
