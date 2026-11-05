'use client';

import React, { useEffect, useState } from 'react';

// /admin/accounting/books/transfers — Transfers & Adjustments,
// rebuilt to the owner's spec (transfers_adjustments.html): the
// inter-facility transfer register with its status flow, and the
// automated in-transit GL clearing preview — stock that has left
// one warehouse and not yet arrived at the other.
// Data: GET/POST /api/admin/accounting/transfers over
// erp_inventory_transfers / erp_inventory_transfer_lines /
// erp_warehouses / erp_inventory_cost_layers.

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);

type Transfer = {
  id: string; transfer_number: string; status: string;
  from_name: string | null; to_name: string | null;
  requested_at: string | null; shipped_at: string | null; received_at: string | null;
  notes: string | null; line_items: number; qty: number; qtyShipped: number; qtyReceived: number;
};
type Clearing = { openTransfers: number; unitsInTransit: number; valuedUnits: number; value: number };

const NEXT: Record<string, { status: string; label: string }[]> = {
  draft: [{ status: 'requested', label: 'Request' }, { status: 'cancelled', label: 'Cancel' }],
  requested: [{ status: 'approved', label: 'Approve' }, { status: 'cancelled', label: 'Cancel' }],
  approved: [{ status: 'in_transit', label: 'Mark Shipped' }, { status: 'cancelled', label: 'Cancel' }],
  in_transit: [{ status: 'received', label: 'Receive at Dock' }, { status: 'partially_received', label: 'Partial Receive' }],
  partially_received: [{ status: 'received', label: 'Receive Rest' }],
  received: [],
  cancelled: [],
};

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [clearing, setClearing] = useState<Clearing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    fetch('/api/admin/accounting/transfers', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => {
        setTransfers(Array.isArray(d.transfers) ? d.transfers : []);
        setClearing(d.clearing || null);
      })
      .catch(() => setError('Transfers could not be loaded.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const setStatus = async (t: Transfer, status: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/admin/accounting/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_status', id: t.id, status }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Status update failed');
      load();
    } catch (err: any) {
      setError(err?.message || 'The transfer status could not be updated.');
    } finally {
      setBusy(false);
    }
  };

  const shown = transfers.filter((t) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [t.transfer_number, t.from_name || '', t.to_name || '', t.status].join(' ').toLowerCase().includes(q);
  });
  const inTransit = transfers.filter((t) => t.status === 'in_transit' || t.status === 'partially_received').length;
  const completed = transfers.filter((t) => t.status === 'received').length;

  const thCls = 'bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground';

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Transfers &amp; Adjustments</h1>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search transfer #, warehouse, status…"
          className="bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full md:w-72"
          type="text"
        />
      </div>

      <div className="border border-border rounded-xl bg-card mt-4">
        <div className="p-4 border-b border-border">
          <h2 className="font-display text-base font-semibold">Automated In-Transit GL Clearing Preview</h2>
          <p className="text-[13px] text-muted-foreground mt-1">While stock is on the road it sits in the in-transit clearing account — out of the origin warehouse, not yet into the destination. This is that balance, computed live from open transfers.</p>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Open transfers</div>
            <div className="text-2xl font-semibold tabular-nums mt-1">{clearing ? clearing.openTransfers : '—'}</div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Units in transit</div>
            <div className="text-2xl font-semibold tabular-nums mt-1">{clearing ? clearing.unitsInTransit : '—'}</div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Clearing value</div>
            <div className="text-2xl font-semibold tabular-nums mt-1">{clearing ? fmt(clearing.value) : '—'}</div>
            <div className="text-[11px] text-muted-foreground mt-1">
              {clearing && clearing.unitsInTransit > clearing.valuedUnits
                ? `Valued from cost layers for ${clearing.valuedUnits} of ${clearing.unitsInTransit} units — the rest have no cost on record, so no value is invented for them.`
                : 'Valued at the origin warehouse’s recorded inventory costs.'}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mb-4">{error}</div>}
        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead>
              <tr className={thCls}>
                <th className="p-3 border-r border-border">Transfer Ref #</th>
                <th className="p-3 border-r border-border">Origin Node</th>
                <th className="p-3 border-r border-border">Destination Node</th>
                <th className="p-3 border-r border-border">Items &amp; Units</th>
                <th className="p-3 border-r border-border">Departure Date</th>
                <th className="p-3 border-r border-border">Received</th>
                <th className="p-3 border-r border-border text-center">Transfer Status</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={8} className="text-center text-muted-foreground">Loading transfers…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-muted-foreground">No stock transfers yet. Transfers are created from the inventory side when stock moves between warehouses; each one appears here with its status and feeds the clearing preview above.</td></tr>
              ) : shown.map((t) => (
                <tr key={t.id} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border font-semibold">{t.transfer_number}</td>
                  <td className="p-3 border-r border-border">{t.from_name || '—'}</td>
                  <td className="p-3 border-r border-border">{t.to_name || '—'}</td>
                  <td className="p-3 border-r border-border text-muted-foreground">{t.line_items} item(s) · {t.qty} unit(s)</td>
                  <td className="p-3 border-r border-border text-muted-foreground">{t.shipped_at ? t.shipped_at.slice(0, 10) : '—'}</td>
                  <td className="p-3 border-r border-border text-muted-foreground">{t.received_at ? t.received_at.slice(0, 10) : t.qtyReceived > 0 ? `${t.qtyReceived} unit(s) so far` : '—'}</td>
                  <td className="p-3 border-r border-border text-center">{t.status.replace(/_/g, ' ')}</td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      {(NEXT[t.status] || []).map((n) => (
                        <button
                          key={n.status}
                          disabled={busy}
                          onClick={() => setStatus(t, n.status)}
                          className="text-[12px] underline disabled:opacity-60"
                          data-tip={`Move transfer ${t.transfer_number} to ${n.status.replace(/_/g, ' ')}`}
                        >
                          {n.label}
                        </button>
                      ))}
                      {(NEXT[t.status] || []).length === 0 && <span className="text-muted-foreground">—</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
}
