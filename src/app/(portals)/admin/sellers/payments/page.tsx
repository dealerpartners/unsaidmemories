'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Wallet } from 'lucide-react';

type StandingRow = {
  id: string;
  display_name: string;
  legal_name: string;
  seller_type: string;
  status: string;
  commission_rate: number | null;
  tax_id_on_file: boolean;
  available_balance: number;
  held_balance: number;
  currency: string;
  payouts_outstanding: number;
  payouts_failed: number;
  fee_schedules_own: number;
  fee_schedules_default: number;
  payout_methods_active: number;
};

type StandingDetail = {
  seller: {
    id: string;
    display_name: string;
    legal_name: string;
    seller_type: string;
    status: string;
    email: string | null;
    commission_rate: number | null;
    tax_id_last4: string | null;
  };
  reserve_percent?: number | null;
  wallet: { id: string; balance: number; pending_balance: number; currency: string; updated_at: string } | null;
  wallet_transactions: Array<{ id: string; transaction_type: string; amount: number; balance_after: number | null; notes: string | null; created_at: string }>;
  payouts: Array<{ id: string; amount: number; status: string; scheduled_at: string | null; paid_at: string | null; created_at: string }>;
  fee_schedules: Array<{ id: string; seller_id: string | null; fee_type: string; rate: number | null; flat_amount: number | null; effective_from: string | null; effective_to: string | null }>;
  statements: Array<{ id: string; period_start: string | null; period_end: string | null; gross: number; fees: number; net: number; status: string }>;
  tax_documents: Array<{ id: string; doc_type: string; tax_year: number | null; status: string; created_at: string }>;
  payment_methods: Array<{ id: string; method_type: string; last4: string | null; brand: string | null; is_default: boolean | null; status: string }>;
};

const TYPE_LABELS: Record<string, string> = {
  first_party: 'First party (house)',
  manufacturer_brand: 'Manufacturer brand',
  supplier: 'Supplier',
  reseller: 'Reseller',
  drop_shipper: 'Drop shipper',
};

function fmtMoney(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : `$${Number(v).toFixed(2)}`;
}

function fmtDate(v: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

// A5 · Seller Payments — per-seller payment standing, read from the real
// money stores (wallet, payout records, fee schedules, statements, tax
// documents, payout methods). Holds and releases move amounts between the
// seller's own available and held (reserve) wallet buckets and write the
// ledger row — records inside the wallet, never a disbursement.
export default function SellerPaymentsPage() {
  const [rows, setRows] = useState<StandingRow[]>([]);
  const [detail, setDetail] = useState<StandingDetail | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [holdAmount, setHoldAmount] = useState('');
  const [holdNote, setHoldNote] = useState('');
  const [reservePct, setReservePct] = useState('');
  const [acting, setActing] = useState(false);

  const loadList = useCallback(() => {
    fetch('/api/admin/sellers/payments')
      .then((r) => (r.ok ? r.json() : { sellers: [] }))
      .then((j) => setRows((j.sellers || []) as StandingRow[]))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  const loadDetail = useCallback((sellerId: string) => {
    fetch(`/api/admin/sellers/payments?seller_id=${encodeURIComponent(sellerId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setDetail(j as StandingDetail | null))
      .catch(() => setDetail(null));
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (selected) loadDetail(selected);
  }, [selected, loadDetail]);

  const holdAction = async (action: 'place_hold' | 'release_hold') => {
    if (!selected) return;
    const amount = Number(holdAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a positive amount.');
      return;
    }
    setError(null);
    setActing(true);
    try {
      const r = await fetch('/api/admin/sellers/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, seller_id: selected, amount, note: holdNote || null }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Action failed');
      setHoldAmount('');
      setHoldNote('');
      loadDetail(selected);
      loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActing(false);
    }
  };

  const reserveAction = async (clear: boolean) => {
    if (!selected) return;
    const pct = Number(reservePct);
    if (!clear && (!Number.isFinite(pct) || pct < 0 || pct > 100)) {
      setError('Enter a reserve percentage between 0 and 100.');
      return;
    }
    const percent = clear ? null : pct;
    setError(null);
    setActing(true);
    try {
      const r = await fetch('/api/admin/sellers/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_reserve_policy', seller_id: selected, percent }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Action failed');
      setReservePct('');
      loadDetail(selected);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/sellers" className="inline-flex items-center gap-1.5 text-[13px] font-medium underline underline-offset-2">
          <ArrowLeft className="size-4" /> Seller Management
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2 mt-3">
          <Wallet className="size-6" /> Seller Payments
        </h1>
      </div>

      {error && <div className="text-[13px] text-red-600">{error}</div>}

      <section className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-[14px] font-semibold">Standing by seller</h2>
        </div>
        {loading ? (
          <div className="px-5 py-6 text-muted-foreground text-[13px]">Loading…</div>
        ) : rows.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-muted-foreground">No sellers in this tenant yet.</p>
        ) : (
          <div className="adm-table-wrap"><table className="adm-table">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className="px-5 py-3 font-medium text-muted-foreground">Seller</th>
                <th className="px-5 py-3 font-medium text-muted-foreground">Status</th>
                <th className="px-5 py-3 font-medium text-muted-foreground">Available</th>
                <th className="px-5 py-3 font-medium text-muted-foreground">Held / reserve</th>
                <th className="px-5 py-3 font-medium text-muted-foreground">Payouts open</th>
                <th className="px-5 py-3 font-medium text-muted-foreground">W-9 / Tax ID</th>
                <th className="px-5 py-3 font-medium text-muted-foreground">Fee schedules</th>
                <th className="px-5 py-3 font-medium text-muted-foreground">Payout methods</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => setSelected(s.id)}
                  className={`cursor-pointer hover:bg-muted/40 ${selected === s.id ? 'bg-muted/60' : ''}`}
                >
                  <td className="px-5 py-3 font-medium">
                    {s.display_name}
                    <span className="block text-[12px] font-normal text-muted-foreground">{TYPE_LABELS[s.seller_type] || s.seller_type}</span>
                  </td>
                  <td className="px-5 py-3 capitalize">{s.status}</td>
                  <td className="px-5 py-3">{fmtMoney(s.available_balance)}</td>
                  <td className="px-5 py-3">{fmtMoney(s.held_balance)}</td>
                  <td className="px-5 py-3">
                    {s.payouts_outstanding}
                    {s.payouts_failed > 0 && <span className="text-red-600"> · {s.payouts_failed} failed</span>}
                  </td>
                  <td className="px-5 py-3">{s.tax_id_on_file ? 'On file' : 'Missing'}</td>
                  <td className="px-5 py-3">{s.fee_schedules_own} own · {s.fee_schedules_default} default</td>
                  <td className="px-5 py-3">{s.payout_methods_active}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>

      {selected && detail && (
        <section className="bg-card border border-border rounded-xl">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-[14px] font-semibold">{detail.seller.display_name} — standing detail</h2>
            <span className="text-[12px] text-muted-foreground">
              Commission rate: {detail.seller.commission_rate === null ? 'not set' : `${Number(detail.seller.commission_rate).toFixed(2)}%`} ·
              Tax ID: {detail.seller.tax_id_last4 ? `on file (···${detail.seller.tax_id_last4})` : 'not on file'}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-6 px-5 py-5 lg:grid-cols-2">
            <div>
              <h3 className="text-[13px] font-semibold">Wallet &amp; reserves</h3>
              <p className="mt-2 text-[13px]">
                Available: <strong>{fmtMoney(detail.wallet?.balance)}</strong> · Held / reserve:{' '}
                <strong>{fmtMoney(detail.wallet?.pending_balance)}</strong>
                {!detail.wallet && ' — no wallet recorded yet; one is created by the first hold.'}
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="text-[12px] text-muted-foreground">
                  Amount
                  <input
                    value={holdAmount}
                    onChange={(e) => setHoldAmount(e.target.value)}
                    type="number"
                    min="0"
                    step="0.01"
                    className="mt-1 block w-32 rounded-lg border px-2 py-1.5 text-[13px]"
                    placeholder="0.00"
                  />
                </label>
                <label className="text-[12px] text-muted-foreground">
                  Note
                  <input
                    value={holdNote}
                    onChange={(e) => setHoldNote(e.target.value)}
                    className="mt-1 block w-56 rounded-lg border px-2 py-1.5 text-[13px]"
                    placeholder="Reason (recorded in the ledger)"
                  />
                </label>
                <button
                  className="rounded-lg border px-3 py-1.5 text-[12px] font-medium hover:bg-muted disabled:opacity-50"
                  disabled={acting}
                  onClick={() => holdAction('place_hold')}
                >
                  Place hold
                </button>
                <button
                  className="rounded-lg border px-3 py-1.5 text-[12px] font-medium hover:bg-muted disabled:opacity-50"
                  disabled={acting}
                  onClick={() => holdAction('release_hold')}
                >
                  Release hold
                </button>
              </div>
              <div className="mt-4 border-t border-border pt-3">
                <p className="text-[13px]">
                  Reserve policy for this seller:{' '}
                  <strong>
                    {detail.reserve_percent === null || detail.reserve_percent === undefined
                      ? 'no reserve configured'
                      : `${detail.reserve_percent}% of each accrual is withheld`}
                  </strong>
                </p>
                <p className="text-[12px] text-muted-foreground">
                  The earnings accrual applies this percentage automatically, moving that share of
                  every credit into the held bucket with a reserve ledger row. Clearing it returns
                  the seller to the tenant default (or no reserve, when no default is set).
                </p>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <label className="text-[12px] text-muted-foreground">
                    Reserve %
                    <input
                      value={reservePct}
                      onChange={(e) => setReservePct(e.target.value)}
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      className="mt-1 block w-28 rounded-lg border px-2 py-1.5 text-[13px]"
                      placeholder="e.g. 10"
                    />
                  </label>
                  <button
                    className="rounded-lg border px-3 py-1.5 text-[12px] font-medium hover:bg-muted disabled:opacity-50"
                    disabled={acting}
                    onClick={() => reserveAction(false)}
                  >
                    Set reserve
                  </button>
                  <button
                    className="rounded-lg border px-3 py-1.5 text-[12px] font-medium hover:bg-muted disabled:opacity-50"
                    disabled={acting}
                    onClick={() => reserveAction(true)}
                  >
                    Clear override
                  </button>
                </div>
              </div>
              {detail.wallet_transactions.length > 0 && (
                <ul className="mt-4 divide-y divide-border text-[13px]">
                  {detail.wallet_transactions.map((t) => (
                    <li key={t.id} className="py-2">
                      <span className="font-medium">{t.transaction_type}</span> · {fmtMoney(t.amount)} · balance after{' '}
                      {fmtMoney(t.balance_after)} · {fmtDate(t.created_at)}
                      {t.notes && <span className="block text-[12px] text-muted-foreground">{t.notes}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="space-y-5">
              <div>
                <h3 className="text-[13px] font-semibold">Recent payouts</h3>
                {detail.payouts.length === 0 ? (
                  <p className="mt-2 text-[13px] text-muted-foreground">No payout records yet.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-border text-[13px]">
                    {detail.payouts.map((p) => (
                      <li key={p.id} className="py-2">
                        {fmtMoney(p.amount)} · {p.status} · scheduled {fmtDate(p.scheduled_at)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="text-[13px] font-semibold">Statements</h3>
                {detail.statements.length === 0 ? (
                  <p className="mt-2 text-[13px] text-muted-foreground">
                    No statements yet. Statements are generated from recorded earnings at Payout Management (Earnings runs) — once this seller has accrued earnings in a period, its statement can be generated there.
                  </p>
                ) : (
                  <ul className="mt-2 divide-y divide-border text-[13px]">
                    {detail.statements.map((s) => (
                      <li key={s.id} className="py-2">
                        {fmtDate(s.period_start)} – {fmtDate(s.period_end)} · gross {fmtMoney(s.gross)} · fees {fmtMoney(s.fees)} · net {fmtMoney(s.net)} · {s.status}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="text-[13px] font-semibold">Fee schedules applying</h3>
                {detail.fee_schedules.length === 0 ? (
                  <p className="mt-2 text-[13px] text-muted-foreground">
                    None. Add one at <Link href="/admin/fees" className="underline underline-offset-2">Fees</Link>.
                  </p>
                ) : (
                  <ul className="mt-2 divide-y divide-border text-[13px]">
                    {detail.fee_schedules.map((f) => (
                      <li key={f.id} className="py-2">
                        {f.fee_type} · {f.seller_id ? 'this seller' : 'tenant default'} ·{' '}
                        {f.rate !== null ? `${Number(f.rate).toFixed(2)}%` : ''} {f.flat_amount !== null ? fmtMoney(f.flat_amount) : ''} · from {fmtDate(f.effective_from)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="text-[13px] font-semibold">Payout methods &amp; tax documents</h3>
                <p className="mt-2 text-[13px]">
                  {detail.payment_methods.length === 0
                    ? 'No payout method on file.'
                    : detail.payment_methods.map((m) => `${m.method_type}${m.last4 ? ` ···${m.last4}` : ''}${m.is_default ? ' (default)' : ''} — ${m.status}`).join('; ')}
                </p>
                <p className="mt-1 text-[13px]">
                  {detail.tax_documents.length === 0
                    ? 'No tax documents recorded.'
                    : detail.tax_documents.map((d) => `${d.doc_type}${d.tax_year ? ` ${d.tax_year}` : ''} — ${d.status}`).join('; ')}
                  {' '}· Manage at <Link href="/admin/sellers/tax" className="underline underline-offset-2">Tax Oversight</Link>.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
