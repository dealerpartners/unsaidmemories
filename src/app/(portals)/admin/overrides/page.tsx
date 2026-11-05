'use client';

import { useCallback, useEffect, useState } from 'react';
import { SlidersHorizontal, RefreshCw, Info } from 'lucide-react';

type OverrideRow = {
  id: string;
  type: string;
  targetType: string;
  targetId: string;
  targetLabel: string | null;
  field: string;
  before: any;
  after: any;
  reason: string;
  actorEmail: string | null;
  appliedAt: string;
};
type Seller = { id: string; name: string; status: string; commissionRate: number | null };
type Listing = { id: string; title: string; price: number | null; sellerName: string };
type Payout = { id: string; status: string; amount: number; sellerName: string };
type Target = { id: string; label: string; detail: string | null };

const TYPES = ['price', 'commission', 'kpi', 'status', 'hold'] as const;
const SELLER_STATUS = ['applied', 'approved', 'suspended', 'closed'];
const VET_STATUS = ['pending', 'active', 'suspended', 'inactive'];
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmt = (v: any) => (v === null || v === undefined ? '—' : JSON.stringify(v));

export default function OverridesPage() {
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [metricKeys, setMetricKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [type, setType] = useState<string>('commission');
  const [sellerId, setSellerId] = useState('');
  const [listingId, setListingId] = useState('');
  const [payoutId, setPayoutId] = useState('');
  const [metricKey, setMetricKey] = useState('');
  const [numValue, setNumValue] = useState('');
  const [statusTargetType, setStatusTargetType] = useState('seller');
  const [statusTarget, setStatusTarget] = useState<Target | null>(null);
  const [statusTargets, setStatusTargets] = useState<Target[]>([]);
  const [statusValue, setStatusValue] = useState('');
  const [holdAction, setHoldAction] = useState('hold');
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/overrides');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Load failed');
      setOverrides(d.overrides || []);
      setSellers(d.sellers || []);
      setListings(d.listings || []);
      setPayouts(d.payouts || []);
      setMetricKeys(d.metricKeys || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Status targets come from the K1 picker (same tenant-scoped resolution).
  useEffect(() => {
    if (type !== 'status') return;
    (async () => {
      try {
        const r = await fetch(`/api/admin/impersonation?type=${statusTargetType}&q=`);
        const d = await r.json();
        setStatusTargets(r.ok ? d.targets || [] : []);
      } catch {
        setStatusTargets([]);
      }
    })();
  }, [type, statusTargetType]);

  const apply = async () => {
    let payload: Record<string, unknown> | null = null;
    if (type === 'price') {
      payload = { overrideType: 'price', targetType: 'seller_listing', targetId: listingId, newValue: Number(numValue), reason };
    } else if (type === 'commission') {
      payload = { overrideType: 'commission', targetType: 'seller', targetId: sellerId, newValue: Number(numValue), reason };
    } else if (type === 'kpi') {
      payload = { overrideType: 'kpi', targetType: 'seller', targetId: sellerId, metricKey, newValue: Number(numValue), reason };
    } else if (type === 'status') {
      if (!statusTarget) return;
      const value =
        statusTargetType === 'employee' || statusTargetType === 'groomer'
          ? statusValue === 'true'
          : statusValue;
      payload = { overrideType: 'status', targetType: statusTargetType, targetId: statusTarget.id, newValue: value, reason };
    } else if (type === 'hold') {
      payload = { overrideType: 'hold', targetType: 'seller_payout', targetId: payoutId, newValue: { action: holdAction }, reason };
    }
    if (!payload) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await fetch('/api/admin/overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Override failed');
      setNotice(
        `Override applied to ${d.targetLabel || payload.targetId}: ${d.field} ${fmt(d.before)} → ${fmt(d.after)}.`,
      );
      setReason('');
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const seller = sellers.find((s) => s.id === sellerId);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <SlidersHorizontal className="w-5 h-5" /> Manual Overrides
        </h1>
        <button onClick={load} className="inline-flex items-center gap-1.5 text-sm border rounded px-2.5 py-1.5 hover:bg-muted">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>
      <div className="flex items-start gap-2 text-sm border rounded p-3 mb-5 bg-muted/40">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          Price writes the listing&apos;s own price field · commission writes the seller&apos;s rate (the store holds
          it to [0, 1]) · a KPI override writes a manual fact the analytics reader serves over the computed value —
          recompute never deletes it · status writes the actor&apos;s own status field · hold/release moves a payout
          through the payout desk&apos;s own transitions. Processor outcomes (paid / failed) are never written here.
        </span>
      </div>

      {error && <div className="border border-red-300 adm-badge adm-badge-red rounded p-3 mb-4 text-sm">{error}</div>}
      {notice && <div className="border rounded p-3 mb-4 text-sm bg-muted/40">{notice}</div>}

      <div className="border rounded mb-6">
        <div className="flex gap-1.5 mb-4 flex-wrap">
          {TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`px-3 py-1.5 rounded border text-sm capitalize ${type === t ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
            >
              Override {t}
            </button>
          ))}
        </div>

        {type === 'price' && (
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs uppercase text-muted-foreground">Listing</span>
              <select value={listingId} onChange={(e) => setListingId(e.target.value)} className="w-full border rounded px-2 py-1.5">
                <option value="">Select a listing…</option>
                {listings.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title} — {l.sellerName} (current {l.price ?? '—'})
                  </option>
                ))}
              </select>
              {listings.length === 0 && (
                <span className="text-xs text-muted-foreground">No seller listings exist in this tenant yet.</span>
              )}
            </label>
            <label className="block">
              <span className="text-xs uppercase text-muted-foreground">New price</span>
              <input type="number" step="0.01" min="0" value={numValue} onChange={(e) => setNumValue(e.target.value)} className="w-full border rounded px-2 py-1.5" />
            </label>
          </div>
        )}

        {(type === 'commission' || type === 'kpi') && (
          <div className="grid sm:grid-cols-3 gap-3">
            <label className="block">
              <span className="text-xs uppercase text-muted-foreground">Seller</span>
              <select value={sellerId} onChange={(e) => setSellerId(e.target.value)} className="w-full border rounded px-2 py-1.5">
                <option value="">Select a seller…</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.status})
                  </option>
                ))}
              </select>
            </label>
            {type === 'commission' ? (
              <label className="block">
                <span className="text-xs uppercase text-muted-foreground">
                  New rate (0–1){seller ? ` · current ${seller.commissionRate ?? '—'}` : ''}
                </span>
                <input type="number" step="0.01" min="0" max="1" value={numValue} onChange={(e) => setNumValue(e.target.value)} className="w-full border rounded px-2 py-1.5" />
              </label>
            ) : (
              <>
                <label className="block">
                  <span className="text-xs uppercase text-muted-foreground">Metric key</span>
                  <select value={metricKey} onChange={(e) => setMetricKey(e.target.value)} className="w-full border rounded px-2 py-1.5">
                    <option value="">Select a defined key…</option>
                    {metricKeys.map((k) => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs uppercase text-muted-foreground">Override value</span>
                  <input type="number" step="any" value={numValue} onChange={(e) => setNumValue(e.target.value)} className="w-full border rounded px-2 py-1.5" />
                </label>
              </>
            )}
          </div>
        )}

        {type === 'status' && (
          <div className="grid sm:grid-cols-3 gap-3">
            <label className="block">
              <span className="text-xs uppercase text-muted-foreground">Target kind</span>
              <select
                value={statusTargetType}
                onChange={(e) => {
                  setStatusTargetType(e.target.value);
                  setStatusTarget(null);
                  setStatusValue('');
                }}
                className="w-full border rounded px-2 py-1.5"
              >
                {['seller', 'customer', 'employee', 'groomer', 'vet'].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs uppercase text-muted-foreground">Target</span>
              <select
                value={statusTarget?.id || ''}
                onChange={(e) => setStatusTarget(statusTargets.find((t) => t.id === e.target.value) || null)}
                className="w-full border rounded px-2 py-1.5"
              >
                <option value="">Select…</option>
                {statusTargets.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
              {statusTargets.length === 0 && (
                <span className="text-xs text-muted-foreground">No {statusTargetType} records in this tenant.</span>
              )}
            </label>
            <label className="block">
              <span className="text-xs uppercase text-muted-foreground">New status</span>
              {statusTargetType === 'seller' ? (
                <select value={statusValue} onChange={(e) => setStatusValue(e.target.value)} className="w-full border rounded px-2 py-1.5">
                  <option value="">Select…</option>
                  {SELLER_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : statusTargetType === 'vet' ? (
                <select value={statusValue} onChange={(e) => setStatusValue(e.target.value)} className="w-full border rounded px-2 py-1.5">
                  <option value="">Select…</option>
                  {VET_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : statusTargetType === 'customer' ? (
                <input value={statusValue} onChange={(e) => setStatusValue(e.target.value)} placeholder="e.g. ACTIVE" className="w-full border rounded px-2 py-1.5" />
              ) : (
                <select value={statusValue} onChange={(e) => setStatusValue(e.target.value)} className="w-full border rounded px-2 py-1.5">
                  <option value="">Select…</option>
                  <option value="true">active</option>
                  <option value="false">inactive</option>
                </select>
              )}
              {statusTargetType === 'customer' && (
                <span className="text-xs text-muted-foreground">
                  The shop customer status field carries no database vocabulary — this record is the governance on the act.
                </span>
              )}
              {(statusTargetType === 'employee' || statusTargetType === 'groomer') && (
                <span className="text-xs text-muted-foreground">Writes crm_staff.is_active — the switch every module gate reads.</span>
              )}
            </label>
          </div>
        )}

        {type === 'hold' && (
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs uppercase text-muted-foreground">Payout</span>
              <select value={payoutId} onChange={(e) => setPayoutId(e.target.value)} className="w-full border rounded px-2 py-1.5">
                <option value="">Select a payout…</option>
                {payouts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sellerName} — ${p.amount} ({p.status})
                  </option>
                ))}
              </select>
              {payouts.length === 0 && (
                <span className="text-xs text-muted-foreground">No seller payouts are recorded in this tenant yet.</span>
              )}
            </label>
            <label className="block">
              <span className="text-xs uppercase text-muted-foreground">Action</span>
              <select value={holdAction} onChange={(e) => setHoldAction(e.target.value)} className="w-full border rounded px-2 py-1.5">
                <option value="hold">Hold (pending / approved → on_hold)</option>
                <option value="release">Release hold (on_hold → pending)</option>
              </select>
            </label>
          </div>
        )}

        <label className="block mt-4">
          <span className="text-xs uppercase text-muted-foreground">Reason (required, recorded)</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="w-full border rounded px-2 py-1.5" placeholder="Why is this override being applied?" />
        </label>
        <button
          disabled={busy || !reason.trim()}
          onClick={apply}
          className="mt-3 px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm disabled:opacity-50"
        >
          Apply override
        </button>
      </div>

      <h2 className="font-semibold mb-2">Recent overrides</h2>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : overrides.length === 0 ? (
        <p className="text-sm text-muted-foreground border rounded">No manual overrides have been recorded for this tenant.</p>
      ) : (
        <div className="adm-table-wrap"><table className="adm-table">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th className="p-2.5">When</th>
              <th className="p-2.5">Type</th>
              <th className="p-2.5">Target</th>
              <th className="p-2.5">Change</th>
              <th className="p-2.5">Reason</th>
              <th className="p-2.5">Actor</th>
            </tr>
          </thead>
          <tbody>
            {overrides.map((o) => (
              <tr key={o.id} className="border-b last:border-0">
                <td className="p-2.5">{when(o.appliedAt)}</td>
                <td className="p-2.5 capitalize">{o.type}</td>
                <td className="p-2.5">
                  {o.targetLabel || o.targetId}
                  <span className="text-muted-foreground"> · {o.field}</span>
                </td>
                <td className="p-2.5 font-mono text-xs">
                  {fmt(o.before)} → {fmt(o.after)}
                </td>
                <td className="p-2.5 text-muted-foreground">{o.reason}</td>
                <td className="p-2.5">{o.actorEmail || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  );
}
