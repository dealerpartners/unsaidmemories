'use client';

import React, { useCallback, useEffect, useState } from 'react';

// /admin/accounting/purchases — Purchases & Payables → Purchase
// Orders (owner spec: purchase_orders.html). Every
// acct_ap_purchase_orders row with vendor, dates, total, and the
// received % / billed % / 3-way match status computed from its
// lines by /api/admin/accounting/purchase-orders. Create, approve,
// receive and bill actions all write real quantities/status back
// to acct_ap_purchase_orders + acct_ap_purchase_order_lines, and
// the register re-reads itself after each one.

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);
const fmtDate = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

type PoLine = { id: string; lineNo: number; description: string; quantity: number; unitCost: number; receivedQuantity: number; billedQuantity: number };
type Po = {
  id: string; poNumber: string; orderDate: string; expectedDate: string | null; total: number;
  status: string; vendorName: string; lines: PoLine[]; recvPct: number; billedPct: number; matchStatus: string;
};

const inputCls = 'bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full';
const TABS = ['all', 'draft', 'approved', 'partially', 'fulfilled', 'closed'] as const;
type TabKey = (typeof TABS)[number];

export default function PurchaseOrdersPage() {
  const [pos, setPos] = useState<Po[]>([]);
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; code: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<TabKey>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ vendor_id: '', order_date: '', expected_date: '' });
  const [lineRows, setLineRows] = useState([{ description: '', quantity: '1', unit_cost: '', expense_account_id: '' }]);
  const [qtyInputs, setQtyInputs] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/accounting/purchase-orders', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => {
        setPos(Array.isArray(d.purchaseOrders) ? d.purchaseOrders : []);
        setVendors(d.vendors || []);
        setAccounts(d.expenseAccounts || []);
        setError(null);
      })
      .catch(() => setError('Purchase orders could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const post = async (payload: Record<string, unknown>) => {
    const r = await fetch('/api/admin/accounting/purchase-orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) throw new Error(d.error || 'action failed');
    return d;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await post({
        action: 'create_po', ...form,
        lines: lineRows.map((l) => ({ description: l.description, quantity: Number(l.quantity), unit_cost: Number(l.unit_cost), expense_account_id: l.expense_account_id || null })),
      });
      setForm({ vendor_id: '', order_date: '', expected_date: '' });
      setLineRows([{ description: '', quantity: '1', unit_cost: '', expense_account_id: '' }]);
      setShowForm(false);
      load();
    } catch (err: any) { setError(err?.message || 'Purchase order could not be saved.'); } finally { setSaving(false); }
  };

  const act = async (key: string, payload: Record<string, unknown>) => {
    setBusy(key);
    try { await post(payload); load(); }
    catch (err: any) { setError(err?.message || 'Action failed.'); }
    finally { setBusy(null); }
  };

  const active = pos.filter((p) => !['closed', 'cancelled', 'void'].includes(p.status));
  const committed = active.reduce((s, p) => s + p.total, 0);
  const pendingDelivery = active.filter((p) => p.recvPct < 100).reduce((s, p) => s + p.total, 0);
  const matched = pos.filter((p) => p.matchStatus === '3-Way Matched').length;
  const clearance = pos.length ? Math.round((matched / pos.length) * 1000) / 10 : 0;

  const inTab = (p: Po) => {
    switch (tab) {
      case 'all': return true;
      case 'draft': return p.status === 'draft' || p.status === 'pending_approval';
      case 'approved': return p.status === 'approved' || p.status === 'posted';
      case 'partially': return p.matchStatus === 'Partially Received';
      case 'fulfilled': return p.matchStatus === '3-Way Matched';
      case 'closed': return p.status === 'closed';
      default: return true;
    }
  };
  const shown = pos.filter((p) => {
    if (!inTab(p)) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [p.poNumber, p.vendorName, p.matchStatus].join(' ').toLowerCase().includes(q);
  });

  const tabLabel: Record<TabKey, string> = {
    all: `All Orders (${pos.length})`,
    draft: 'Draft',
    approved: 'Open / Approved',
    partially: 'Partially Received',
    fulfilled: 'Fulfilled',
    closed: 'Closed',
  };

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Purchase Orders</h1>
        </div>
        <div className="flex items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search PO #, vendor…" className="bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full md:w-64" type="text" />
          <button onClick={() => setShowForm((s) => !s)} data-tip="Create a new purchase order for a vendor. It starts as a draft you can approve." className="h-9 px-4 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium whitespace-nowrap">
            Create Purchase Order
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 py-4">
        {[
          { label: 'Committed PO Value', value: fmt(committed), foot: `Across ${active.length} active purchase orders` },
          { label: 'Pending Delivery / Receiving', value: fmt(pendingDelivery), foot: 'Orders not yet fully received' },
          { label: '3-Way Match Clearance', value: `${clearance}%`, foot: `${matched} of ${pos.length} orders fully matched` },
          { label: 'Purchase Orders', value: String(pos.length), foot: 'All time, all statuses' },
        ].map((k) => (
          <div key={k.label} className="border border-border rounded-xl bg-card p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{k.label}</div>
            <div className="text-xl font-semibold mt-1 tabular-nums">{k.value}</div>
            <div className="text-[12px] text-muted-foreground mt-1">{k.foot}</div>
          </div>
        ))}
      </div>

      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mb-4">{error}</div>}

      {showForm && (
        <form onSubmit={submit} className="border border-border rounded-xl bg-card p-4 mb-4 flex flex-col gap-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-[12px] font-medium">Vendor *
              <select required value={form.vendor_id} onChange={(e) => setForm({ ...form, vendor_id: e.target.value })} className={inputCls}>
                <option value="">Pick a vendor…</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </label>
            <label className="text-[12px] font-medium">Order date
              <input type="date" value={form.order_date} onChange={(e) => setForm({ ...form, order_date: e.target.value })} className={inputCls} />
            </label>
            <label className="text-[12px] font-medium">Expected date
              <input type="date" value={form.expected_date} onChange={(e) => setForm({ ...form, expected_date: e.target.value })} className={inputCls} />
            </label>
          </div>
          {lineRows.map((l, i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <label className="text-[12px] font-medium md:col-span-5">Line {i + 1} description *
                <input required value={l.description} onChange={(e) => setLineRows(lineRows.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} className={inputCls} />
              </label>
              <label className="text-[12px] font-medium md:col-span-2">Qty
                <input type="number" min="0" step="0.01" value={l.quantity} onChange={(e) => setLineRows(lineRows.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} className={inputCls} />
              </label>
              <label className="text-[12px] font-medium md:col-span-2">Unit cost
                <input type="number" min="0" step="0.01" value={l.unit_cost} onChange={(e) => setLineRows(lineRows.map((x, j) => (j === i ? { ...x, unit_cost: e.target.value } : x)))} className={inputCls} />
              </label>
              <label className="text-[12px] font-medium md:col-span-3">Expense account
                <select value={l.expense_account_id} onChange={(e) => setLineRows(lineRows.map((x, j) => (j === i ? { ...x, expense_account_id: e.target.value } : x)))} className={inputCls}>
                  <option value="">Optional…</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                </select>
              </label>
            </div>
          ))}
          <div className="flex gap-2">
            <button type="button" onClick={() => setLineRows([...lineRows, { description: '', quantity: '1', unit_cost: '', expense_account_id: '' }])} data-tip="Add another line to this purchase order." className="h-9 px-3 rounded-lg border border-border bg-card text-[13px] font-medium">+ Add Line</button>
            <button type="submit" disabled={saving} data-tip="Save this purchase order as a draft. It appears in the register below." className="h-9 px-4 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium disabled:opacity-50">{saving ? 'Saving…' : 'Save Purchase Order'}</button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} data-tip={`Show ${tabLabel[t].toLowerCase()} only.`} className={`h-8 px-3 rounded-lg border text-[12px] font-medium ${tab === t ? 'bg-[#7258e8] text-white border-[#7258e8]' : 'bg-card border-border text-foreground'}`}>
            {tabLabel[t]}
          </button>
        ))}
      </div>

      <div className="border border-border rounded-xl overflow-x-auto bg-card">
        <div className="adm-table-wrap"><table className="adm-table">
          <thead>
            <tr className="bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground">
              <th className="p-3 border-r border-border">PO #</th>
              <th className="p-3 border-r border-border">Vendor / Supplier</th>
              <th className="p-3 border-r border-border">Order Date</th>
              <th className="p-3 border-r border-border">Expected</th>
              <th className="p-3 border-r border-border text-right">Total Amount</th>
              <th className="p-3 border-r border-border">Recv %</th>
              <th className="p-3 border-r border-border">Billed %</th>
              <th className="p-3 border-r border-border">Match Status</th>
              <th className="p-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={9} className="text-center text-muted-foreground">Loading purchase orders…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={9} className="text-center text-muted-foreground">
                {pos.length === 0 ? 'No purchase orders yet. Orders you create appear here, and receiving or billing against their lines updates the match status.' : 'No purchase orders match this search or filter.'}
              </td></tr>
            ) : shown.map((p) => (
              <React.Fragment key={p.id}>
                <tr className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border font-semibold tabular-nums">{p.poNumber}</td>
                  <td className="p-3 border-r border-border font-medium">{p.vendorName}</td>
                  <td className="p-3 border-r border-border text-muted-foreground">{fmtDate(p.orderDate)}</td>
                  <td className="p-3 border-r border-border text-muted-foreground">{fmtDate(p.expectedDate)}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{fmt(p.total)}</td>
                  <td className="p-3 border-r border-border tabular-nums">{p.recvPct}%</td>
                  <td className="p-3 border-r border-border tabular-nums">{p.billedPct}%</td>
                  <td className="p-3 border-r border-border">
                    <div>{p.matchStatus}</div>
                    <div className="text-[11px] text-muted-foreground capitalize">{p.status.replace('_', ' ')}</div>
                  </td>
                  <td className="p-3 text-center whitespace-nowrap">
                    <button onClick={() => setExpanded(expanded === p.id ? null : p.id)} data-tip="Open this order's lines to record what arrived and what the vendor billed." className="text-[12px] underline mr-3">View PO</button>
                    {(p.status === 'draft' || p.status === 'pending_approval') && (
                      <button onClick={() => act(`approve-${p.id}`, { action: 'approve', id: p.id })} disabled={busy === `approve-${p.id}`} data-tip="Approve this purchase order so goods can be received against it." className="text-[12px] underline disabled:opacity-50">Approve</button>
                    )}
                  </td>
                </tr>
                {expanded === p.id && (
                  <tr>
                    <td colSpan={9} className="p-0">
                      <table className="w-full text-[12px]">
                        <thead><tr className="bg-muted/30 text-left"><th className="p-2">Line</th><th className="p-2">Ordered</th><th className="p-2">Received</th><th className="p-2">Billed</th><th className="p-2 text-right">Unit Cost</th><th className="p-2">Record Receipt / Billing</th></tr></thead>
                        <tbody>
                          {p.lines.length === 0 ? <tr><td colSpan={6} className="p-2 text-muted-foreground">No lines stored for this order.</td></tr> : p.lines.map((l) => (
                            <tr key={l.id} className="border-t border-border">
                              <td className="p-2">{l.description}</td>
                              <td className="p-2 tabular-nums">{l.quantity}</td>
                              <td className="p-2 tabular-nums">{l.receivedQuantity}</td>
                              <td className="p-2 tabular-nums">{l.billedQuantity}</td>
                              <td className="p-2 text-right tabular-nums">{fmt(l.unitCost)}</td>
                              <td className="p-2">
                                <span className="inline-flex items-center gap-2">
                                  <input
                                    type="number" min="0" step="0.01" placeholder="Qty"
                                    value={qtyInputs[l.id] || ''}
                                    onChange={(e) => setQtyInputs({ ...qtyInputs, [l.id]: e.target.value })}
                                    className="bg-background border border-input rounded-lg px-2 h-8 text-[12px] w-20"
                                  />
                                  <button onClick={() => act(`recv-${l.id}`, { action: 'receive_line', line_id: l.id, quantity: Number(qtyInputs[l.id]) })} disabled={busy === `recv-${l.id}`} data-tip="Record that this quantity arrived. The received percentage and match status update." className="text-[12px] underline disabled:opacity-50">Receive</button>
                                  <button onClick={() => act(`bill-${l.id}`, { action: 'bill_line', line_id: l.id, quantity: Number(qtyInputs[l.id]) })} disabled={busy === `bill-${l.id}`} data-tip="Record that the vendor billed this quantity. When received and billed both reach 100%, the order is 3-way matched." className="text-[12px] underline disabled:opacity-50">Bill</button>
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
