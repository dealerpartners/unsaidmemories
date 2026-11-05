'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Banknote, Lock } from 'lucide-react';

type Payout = {
  id: string;
  seller_id: string;
  seller_name: string;
  seller_status: string;
  amount: number | null;
  status: string;
  payout_method_id: string | null;
  scheduled_at: string | null;
  paid_at: string | null;
  created_at: string;
  execution_error?: string | null;
  stripe_transfer_id?: string | null;
};

type Counts = Record<string, { n: number; total: number }>;

const FILTERS = ['', 'pending', 'approved', 'on_hold', 'failed', 'paid', 'cancelled'] as const;

const STATUS_STYLES: Record<string, string> = {
  pending: 'adm-badge adm-badge-amber',
  approved: 'adm-badge adm-badge-green',
  on_hold: 'bg-orange-100 text-orange-800',
  failed: 'adm-badge adm-badge-red',
  paid: 'bg-neutral-200 text-neutral-700',
  cancelled: 'bg-neutral-200 text-neutral-500',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  on_hold: 'On hold',
  failed: 'Failed',
  paid: 'Paid',
  cancelled: 'Cancelled',
};

function fmtMoney(v: number | null): string {
  return v === null || v === undefined ? '—' : `$${Number(v).toFixed(2)}`;
}

function fmtDate(v: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[status] || 'bg-neutral-100 text-neutral-600'}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

// E1 · Payout Management — oversight over seller_payouts: the schedule,
// holds, the final-settlement queue for closed sellers, and failed payouts.
// Approve / hold / release / cancel are RECORDS. Disbursement runs on the
// decided money model (agency + Connect Express destination charges) from
// the Admin Trust Center follow-on module; this page never marks a payout
// paid — the Execute button surfaces the API's refusal.
export default function PayoutsPage() {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [counts, setCounts] = useState<Counts>({});
  const [finalSettlement, setFinalSettlement] = useState<Payout[]>([]);
  const [failedPayouts, setFailedPayouts] = useState<Payout[]>([]);
  const [schedule, setSchedule] = useState<Array<{ day: string | null; n: number; total: number; sellers: number }>>([]);
  const [filter, setFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const [stmtMonth, setStmtMonth] = useState('');

  const load = useCallback(() => {
    const q = filter ? `?status=${encodeURIComponent(filter)}` : '';
    fetch(`/api/admin/payouts${q}`)
      .then((r) => (r.ok ? r.json() : { payouts: [], counts: {}, final_settlement: [] }))
      .then((j) => {
        setPayouts((j.payouts || []) as Payout[]);
        setCounts((j.counts || {}) as Counts);
        setFinalSettlement((j.final_settlement || []) as Payout[]);
        setFailedPayouts((j.failed_payouts || []) as Payout[]);
        setSchedule((j.schedule || []) as Array<{ day: string | null; n: number; total: number; sellers: number }>);
      })
      .catch(() => {
        setPayouts([]);
        setCounts({});
        setFinalSettlement([]);
        setFailedPayouts([]);
        setSchedule([]);
      })
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (id: string, action: string) => {
    setError(null);
    setNotice(null);
    setActing(id);
    try {
      const r = await fetch('/api/admin/payouts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Action failed');
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Action failed';
      // The disbursement refusal is information, not a failure — show it as a notice.
      if (action === 'execute') setNotice(msg);
      else setError(msg);
    } finally {
      setActing(null);
    }
  };

  const runAccrual = async () => {
    setError(null);
    setNotice(null);
    setRunMsg(null);
    setRunning(true);
    try {
      const r = await fetch('/api/admin/payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accrue_earnings' }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Accrual failed');
      const a = d.accrual || {};
      const parts = [
        `${a.orders_accrued ?? 0} order${a.orders_accrued === 1 ? '' : 's'} accrued`,
        `${(a.sellers || []).length} seller${(a.sellers || []).length === 1 ? '' : 's'}`,
        `$${Number(a.total_net || 0).toFixed(2)} net credited`,
      ];
      if (a.delay_unconfigured_sellers) parts.push(`${a.delay_unconfigured_sellers} seller(s) with no payout-delay policy configured — their payouts carry no schedule yet`);
      if (a.unparseable_orders) parts.push(`${a.unparseable_orders} earnable order(s) skipped — recorded amount could not be read`);
      setRunMsg(`Accrual run complete: ${parts.join(' · ')}.`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Accrual failed');
    } finally {
      setRunning(false);
    }
  };

  const generateStatements = async () => {
    if (!stmtMonth) return;
    setError(null);
    setRunMsg(null);
    setRunning(true);
    try {
      const [y, m] = stmtMonth.split('-').map(Number);
      const start = `${stmtMonth}-01`;
      const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
      const r = await fetch('/api/admin/sellers/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate_statements', period_start: start, period_end: end }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Statement generation failed');
      const s = d.statements || {};
      setRunMsg(
        `Statements for ${start} – ${end}: ${s.generated?.length ?? 0} generated` +
          (s.skipped_existing ? ` · ${s.skipped_existing} already on record for that period` : '') +
          '. Sellers see them under Seller Payments.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Statement generation failed');
    } finally {
      setRunning(false);
    }
  };

  const rowActions = (p: Payout) => {
    const btn = 'rounded-lg border px-2 py-1 text-[12px] font-medium hover:bg-muted disabled:opacity-50';
    const busy = acting === p.id;
    return (
      <div className="flex flex-wrap gap-1.5">
        {(p.status === 'pending' || p.status === 'on_hold') && (
          <button className={btn} disabled={busy} onClick={() => act(p.id, 'approve')}>Approve</button>
        )}
        {(p.status === 'pending' || p.status === 'approved') && (
          <button className={btn} disabled={busy} onClick={() => act(p.id, 'hold')}>Hold</button>
        )}
        {p.status === 'on_hold' && (
          <button className={btn} disabled={busy} onClick={() => act(p.id, 'release')}>Release hold</button>
        )}
        {(p.status === 'pending' || p.status === 'approved' || p.status === 'on_hold') && (
          <button className={btn} disabled={busy} onClick={() => act(p.id, 'cancel')}>Cancel</button>
        )}
        {p.status === 'approved' && (
          <button className={`${btn} inline-flex items-center gap-1`} disabled={busy} onClick={() => act(p.id, 'execute')}>
            <Lock className="size-3" /> Execute payout
          </button>
        )}
      </div>
    );
  };

  const table = (rows: Payout[], emptyText: string) =>
    rows.length === 0 ? (
      <p className="px-5 py-6 text-[13px] text-muted-foreground">{emptyText}</p>
    ) : (
      <div className="adm-table-wrap"><table className="adm-table">
        <thead className="border-b border-border bg-muted/40">
          <tr>
            <th className="px-5 py-3 font-medium text-muted-foreground">Seller</th>
            <th className="px-5 py-3 font-medium text-muted-foreground">Amount</th>
            <th className="px-5 py-3 font-medium text-muted-foreground">Status</th>
            <th className="px-5 py-3 font-medium text-muted-foreground">Scheduled</th>
            <th className="px-5 py-3 font-medium text-muted-foreground">Created</th>
            <th className="px-5 py-3 font-medium text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="px-5 py-3 font-medium">{p.seller_name}</td>
              <td className="px-5 py-3">{fmtMoney(p.amount)}</td>
              <td className="px-5 py-3"><StatusBadge status={p.status} /></td>
              <td className="px-5 py-3">{fmtDate(p.scheduled_at)}</td>
              <td className="px-5 py-3">{fmtDate(p.created_at)}</td>
              <td className="px-5 py-3">{rowActions(p)}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/sellers" className="inline-flex items-center gap-1.5 text-[13px] font-medium underline underline-offset-2">
          <ArrowLeft className="size-4" /> Seller Management
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2 mt-3">
          <Banknote className="size-6" /> Payout Management
        </h1>
      </div>

      {error && <div className="text-[13px] text-red-600">{error}</div>}
      {notice && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">{notice}</div>
      )}
      {runMsg && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-900">{runMsg}</div>
      )}

      <section className="bg-card border border-border rounded-xl px-5 py-4">
        <h2 className="text-[14px] font-semibold">Earnings runs</h2>
        <p className="text-[12px] text-muted-foreground mt-1">
          Payouts are born here: the accrual converts every paid + delivered seller order into a
          pending payout (scheduled by the Trust Center delay policy), credits the seller&apos;s
          wallet, and writes the ledger row. It is safe to re-run — an accrued order is never
          credited twice. Statements summarize a month&apos;s accrued earnings per seller.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={runAccrual}
            disabled={running}
            className="rounded-lg border border-border bg-card px-3 py-2 text-[12px] font-medium text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 disabled:opacity-50"
          >
            {running ? 'Running…' : 'Accrue delivered earnings'}
          </button>
          <span className="inline-flex items-center gap-2 text-[12px] text-muted-foreground">
            <input
              type="month"
              value={stmtMonth}
              onChange={(e) => setStmtMonth(e.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-[12px]"
            />
            <button
              onClick={generateStatements}
              disabled={running || !stmtMonth}
              className="rounded-lg border px-3 py-2 text-[12px] font-medium hover:bg-muted disabled:opacity-50"
            >
              Generate statements
            </button>
          </span>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f || 'all'}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-medium ${filter === f ? 'bg-brand-teal/10 text-brand-teal' : 'hover:bg-muted'}`}
          >
            {f === '' ? 'All payouts' : STATUS_LABELS[f] || f}
            {f && counts[f] ? ` · ${counts[f].n}` : ''}
          </button>
        ))}
      </div>

      <section className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-[14px] font-semibold">Payout schedule &amp; queue</h2>
          <span className="text-[12px] text-muted-foreground">
            Failed payouts appear under the Failed filter; held amounts sit in each seller&apos;s wallet reserve (see Seller Payments).
          </span>
        </div>
        {loading ? (
          <div className="px-5 py-6 text-muted-foreground text-[13px]">Loading…</div>
        ) : (
          table(payouts, 'No payouts recorded. Paid + delivered seller orders become payouts here when the earnings accrual runs — until seller orders exist, this queue is honestly empty.')
        )}
      </section>

      <section className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-[14px] font-semibold">Payout schedule</h2>
          <span className="text-[12px] text-muted-foreground">
            What falls due when: outstanding payouts (pending, approved, on hold) grouped by scheduled
            date. The unscheduled row is real — it holds payouts accrued while a seller&apos;s delay
            policy was unconfigured.
          </span>
        </div>
        {loading ? (
          <div className="px-5 py-6 text-muted-foreground text-[13px]">Loading…</div>
        ) : schedule.length === 0 ? (
          <div className="px-5 py-6 text-muted-foreground text-[13px]">No outstanding payouts are scheduled.</div>
        ) : (
          <ul className="divide-y divide-border">
            {schedule.map((s) => (
              <li key={s.day ?? 'unscheduled'} className="flex flex-wrap items-center gap-3 px-5 py-3 text-[13px]">
                <span className="font-medium">{s.day ?? 'Unscheduled'}</span>
                <span className="text-muted-foreground">
                  {s.n} payout{s.n === 1 ? '' : 's'} · {s.sellers} seller{s.sellers === 1 ? '' : 's'}
                </span>
                <span className="ml-auto font-medium">${Number(s.total).toFixed(2)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-[14px] font-semibold">Failed payouts — repair queue</h2>
          <span className="text-[12px] text-muted-foreground">
            Payouts the Connect execution recorded a failure against, with the recorded failure and
            transfer id. A transfer id with an error means the money moved at Stripe and only the
            ledger leg failed — re-execution repairs the record, it never double-pays.
          </span>
        </div>
        {loading ? (
          <div className="px-5 py-6 text-muted-foreground text-[13px]">Loading…</div>
        ) : failedPayouts.length === 0 ? (
          <div className="px-5 py-6 text-muted-foreground text-[13px]">No failed payouts on record.</div>
        ) : (
          <ul className="divide-y divide-border">
            {failedPayouts.map((p) => (
              <li key={p.id} className="px-5 py-3 text-[13px]">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-medium">{p.seller_name || p.seller_id}</span>
                  <span>${Number(p.amount).toFixed(2)}</span>
                  <StatusBadge status={p.status} />
                  {p.stripe_transfer_id ? (
                    <span className="text-muted-foreground">Transfer {p.stripe_transfer_id}</span>
                  ) : null}
                </div>
                {p.execution_error ? (
                  <p className="mt-1 text-red-700">{p.execution_error}</p>
                ) : (
                  <p className="mt-1 text-muted-foreground">Marked failed by the processor; no execution detail recorded.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-[14px] font-semibold">Final settlement</h2>
          <span className="text-[12px] text-muted-foreground">
            Closed sellers with payouts still outstanding. Approving is the settlement record; disbursing runs through the Trust Center&apos;s Connect execution, like every payout.
          </span>
        </div>
        {loading ? (
          <div className="px-5 py-6 text-muted-foreground text-[13px]">Loading…</div>
        ) : (
          table(finalSettlement, 'No closed seller has an outstanding payout.')
        )}
      </section>
    </div>
  );
}
