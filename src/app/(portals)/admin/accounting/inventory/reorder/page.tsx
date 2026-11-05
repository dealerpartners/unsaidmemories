'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';

// /admin/accounting/inventory/reorder — Commitments & Reorder
// (owner's commitments_reorder.html): the MRP allocation matrix.
// Every recommendation is computed on the spot from stock, rules and
// open purchase orders, and labeled as computed. Generate PO writes
// a real purchase order through the existing purchasing endpoint.

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);

type Row = {
  skuId: string; sku: string | null; productName: string | null; category: string | null;
  stock: number; committed: number; atp: number; onOrder: number;
  safetyFloor: number | null; leadTimeDays: number | null; recQty: number;
  unitCost: number | null; estCost: number | null;
  vendorName: string | null; vendorId: string | null; priority: string; hasRule: boolean;
};
type Opt = { id: string; name?: string; legal_name?: string };

const priorityChip = (p: string) => {
  if (p === 'Urgent') return <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-900">Urgent</span>;
  if (p === 'Reorder') return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">Reorder</span>;
  return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">OK</span>;
};

export default function InventoryReorderPage() {
  const [matrix, setMatrix] = useState<Row[]>([]);
  const [vendors, setVendors] = useState<Opt[]>([]);
  const [warehouses, setWarehouses] = useState<Opt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [ruleFor, setRuleFor] = useState<Row | null>(null);
  const [form, setForm] = useState({ warehouse_id: '', reorder_point: '', safety_stock: '', maximum_stock: '', lead_time_days: '', preferred_vendor_id: '' });

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/accounting/inventory-reorder', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => { setMatrix(d.matrix || []); setVendors(d.vendors || []); setWarehouses(d.warehouses || []); })
      .catch(() => setError('Reorder matrix could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const queue = useMemo(() => matrix.filter((r) => r.recQty > 0), [matrix]);

  const generatePo = async (row: Row) => {
    if (!row.vendorId) { setError(`No preferred vendor is set on the rule for ${row.sku || row.productName} — set one before generating a PO.`); return; }
    if (row.unitCost == null) { setError(`No unit cost is known for ${row.sku || row.productName} — a PO needs a cost. Receive stock at a cost first.`); return; }
    setBusy(row.skuId); setError(null); setNotice(null);
    try {
      const r = await fetch('/api/admin/erp/purchasing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_po', vendorId: row.vendorId,
          lines: [{ description: `${row.productName || 'Item'}${row.sku ? ` (${row.sku})` : ''}`, quantity: row.recQty, unitCost: row.unitCost, skuId: row.skuId }],
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) throw new Error(j?.error || 'PO creation failed');
      setNotice(`Purchase order ${j.bill?.bill_number || ''} created for ${row.recQty} × ${row.sku || row.productName} with ${row.vendorName}. It now counts as on-order in this matrix.`);
      load();
    } catch (e: any) { setError(e?.message || 'PO creation failed'); } finally { setBusy(null); }
  };

  const saveRule = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!ruleFor) return;
    if (!form.warehouse_id) { setError('Choose the warehouse this rule applies to.'); return; }
    setBusy('rule'); setError(null); setNotice(null);
    try {
      const r = await fetch('/api/admin/accounting/inventory-reorder', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku_id: ruleFor.skuId, ...form, preferred_vendor_id: form.preferred_vendor_id || null }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) throw new Error(j?.error || 'Rule save failed');
      setNotice(`Reorder rule saved for ${ruleFor.sku || ruleFor.productName}.`);
      setRuleFor(null); setShowForm(false);
      setForm({ warehouse_id: '', reorder_point: '', safety_stock: '', maximum_stock: '', lead_time_days: '', preferred_vendor_id: '' });
      load();
    } catch (e: any) { setError(e?.message || 'Rule save failed'); } finally { setBusy(null); }
  };

  const inputCls = 'bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full';
  const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1';
  const thCls = 'p-3 border-r border-border';
  const headRow = 'bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground';

  const renderRow = (r: Row) => (
    <tr key={r.skuId} className="hover:bg-accent/50">
      <td className="p-3 border-r border-border"><div className="font-medium">{r.productName || 'Item'}</div><div className="text-[11px] text-muted-foreground">{r.sku || ''}</div></td>
      <td className="p-3 border-r border-border text-muted-foreground">{r.category || '—'}</td>
      <td className="p-3 border-r border-border text-right tabular-nums">{r.stock}</td>
      <td className="p-3 border-r border-border text-right tabular-nums">{r.committed}</td>
      <td className="p-3 border-r border-border text-right tabular-nums font-semibold">{r.atp}</td>
      <td className="p-3 border-r border-border text-right tabular-nums">{r.safetyFloor ?? '—'}</td>
      <td className="p-3 border-r border-border text-right tabular-nums">{r.leadTimeDays != null ? `${r.leadTimeDays}d` : '—'}</td>
      <td className="p-3 border-r border-border text-right tabular-nums">{r.recQty > 0 ? r.recQty : '—'}</td>
      <td className="p-3 border-r border-border text-right tabular-nums">{r.estCost != null ? fmt(r.estCost) : '—'}</td>
      <td className="p-3 border-r border-border">{r.vendorName || <span className="text-muted-foreground">Not set</span>}</td>
      <td className="p-3 border-r border-border">{priorityChip(r.priority)}</td>
      <td className="p-3 text-center whitespace-nowrap">
        <button type="button" onClick={() => { setRuleFor(r); setShowForm(true); }} data-tip="Sets or replaces the reorder point, safety floor and preferred vendor for this SKU"
          className="text-[12px] underline mr-3">{r.hasRule ? 'Edit Rule' : 'New Rule'}</button>
        <button type="button" disabled={busy === r.skuId || r.recQty <= 0} onClick={() => generatePo(r)} data-tip="Creates a real purchase order for the recommended quantity with the preferred vendor"
          className="text-[12px] underline disabled:opacity-50">Generate PO</button>
      </td>
    </tr>
  );

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Commitments &amp; Reorder</h1>
        </div>
        <span className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-card text-[13px]">
          <Plus className="size-4" /> Rules live on each SKU row — use New Rule / Edit Rule there.
        </span>
      </div>

      {showForm && ruleFor && (
        <form onSubmit={saveRule} className="border border-border rounded-xl bg-card p-4 mt-4">
          <div className="font-semibold text-[14px] mb-3">Reorder Rule — {ruleFor.productName} {ruleFor.sku ? `(${ruleFor.sku})` : ''}</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><label className={labelCls}>Warehouse</label>
              <select value={form.warehouse_id} onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })} className={inputCls} required>
                <option value="">— Choose a warehouse —</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select></div>
            <div><label className={labelCls}>Reorder point (units)</label>
              <input type="number" min="0" value={form.reorder_point} onChange={(e) => setForm({ ...form, reorder_point: e.target.value })} className={inputCls} /></div>
            <div><label className={labelCls}>Safety floor (units)</label>
              <input type="number" min="0" value={form.safety_stock} onChange={(e) => setForm({ ...form, safety_stock: e.target.value })} className={inputCls} /></div>
            <div><label className={labelCls}>Maximum stock (units)</label>
              <input type="number" min="0" value={form.maximum_stock} onChange={(e) => setForm({ ...form, maximum_stock: e.target.value })} className={inputCls} /></div>
            <div><label className={labelCls}>Lead time (days)</label>
              <input type="number" min="0" value={form.lead_time_days} onChange={(e) => setForm({ ...form, lead_time_days: e.target.value })} className={inputCls} /></div>
            <div><label className={labelCls}>Preferred vendor</label>
              <select value={form.preferred_vendor_id} onChange={(e) => setForm({ ...form, preferred_vendor_id: e.target.value })} className={inputCls}>
                <option value="">— None —</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.legal_name}</option>)}
              </select></div>
          </div>
          <button type="submit" disabled={busy === 'rule'} data-tip="Saves this reorder rule; the matrix recomputes from it immediately"
            className="mt-4 h-9 px-4 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium disabled:opacity-50">
            {busy === 'rule' ? 'Saving…' : 'Save Rule'}
          </button>
        </form>
      )}

      <div className="mt-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mb-4">{error}</div>}
        {notice && <div className="rounded-lg border border-emerald-600/30 bg-emerald-50 px-4 py-2 text-sm text-emerald-900 mb-4">{notice}</div>}
        <p className="text-[12.5px] text-muted-foreground mb-3">
          Recommendations are <span className="font-medium text-foreground">computed</span>, not forecast: when available-to-promise plus what is already
          on order falls below the reorder point, the matrix recommends topping back up to the rule&apos;s maximum (or point + safety floor).
        </p>
        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr className={headRow}>
              <th className={thCls}>SKU &amp; Product Name</th>
              <th className={thCls}>Category</th>
              <th className={`${thCls} text-right`}>Current Stock</th>
              <th className={`${thCls} text-right`}>Committed</th>
              <th className={`${thCls} text-right`}>Available (ATP)</th>
              <th className={`${thCls} text-right`}>Safety Floor</th>
              <th className={`${thCls} text-right`}>Lead Time</th>
              <th className={`${thCls} text-right`}>Rec. Reorder Qty</th>
              <th className={`${thCls} text-right`}>Est. Cost</th>
              <th className={thCls}>Preferred Vendor</th>
              <th className={thCls}>Priority</th>
              <th className="p-3 text-center">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={12} className="text-center text-muted-foreground">Computing the matrix…</td></tr>
              ) : matrix.length === 0 ? (
                <tr><td colSpan={12} className="text-center text-muted-foreground">
                  Nothing to compute yet: no SKU has stock, a reorder rule, or a reorder level. Add a rule to a stocked SKU and it will be watched here.
                </td></tr>
              ) : (
                <>
                  {queue.length > 0 && <tr><td colSpan={12} className="bg-amber-50 font-semibold text-[12.5px]">Automated Reorder Queue — {queue.length} SKU(s) below their trigger</td></tr>}
                  {queue.map(renderRow)}
                  {matrix.filter((r) => r.recQty <= 0).length > 0 && <tr><td colSpan={12} className="bg-muted/40 font-semibold text-[12.5px]">All SKU Demand — no action needed</td></tr>}
                  {matrix.filter((r) => r.recQty <= 0).map(renderRow)}
                </>
              )}
            </tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
}
