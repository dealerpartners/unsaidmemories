'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

// /admin/accounting/inventory/valuation — Inventory Valuation & COGS
// (owner's inventory_valuation_cogs.html): FIFO cost layers, the
// perpetual inventory value, and the GL 1300 reconciliation readout.
// The difference between the ledger and the perpetual value is shown
// plainly — reconciling it is the work this page exists to expose.

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);

type Layer = { id: string; sku: string | null; productName: string | null; warehouseName: string | null; costingMethod: string | null; quantityRemaining: number; unitCost: number; createdAt: string; ingestRef: string | null; ingestType: string | null; extended: number };
type Perp = { warehouseName: string | null; units: number; value: number };
type Movement = { id: string; movementType: string; sku: string | null; productName: string | null; quantity: number; unitCost: number | null; totalCost: number | null; occurredAt: string };

export default function InventoryValuationPage() {
  const [layers, setLayers] = useState<Layer[]>([]);
  const [perpetual, setPerpetual] = useState<Perp[]>([]);
  const [perpetualTotal, setPerpetualTotal] = useState(0);
  const [gl, setGl] = useState<{ code: string; name: string; balance: number } | null>(null);
  const [difference, setDifference] = useState(0);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [simSku, setSimSku] = useState('');
  const [freightPct, setFreightPct] = useState('8');
  const [dutyPct, setDutyPct] = useState('0');

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/accounting/inventory-valuation', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => {
        setLayers(d.layers || []); setPerpetual(d.perpetual || []);
        setPerpetualTotal(d.perpetualTotal || 0); setGl(d.gl || null);
        setDifference(d.difference || 0); setMovements(d.movements || []);
      })
      .catch(() => setError('Valuation could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const simLayer = useMemo(() => layers.find((l) => l.id === simSku) || null, [layers, simSku]);
  const simLanded = simLayer ? simLayer.unitCost * (1 + (Number(freightPct) || 0) / 100) * (1 + (Number(dutyPct) || 0) / 100) : null;
  const reconciled = Math.abs(difference) < 0.005;

  const thCls = 'p-3 border-r border-border';
  const headRow = 'bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground';
  const inputCls = 'bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full';
  const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1';

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Inventory Valuation &amp; COGS</h1>
      </div>

      <div className="mt-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mb-4">{error}</div>}

        <h2 className="font-display text-lg font-semibold mb-3">Balance Sheet GL 1300 Perpetual Reconciliation</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border border-border rounded-xl bg-card p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Perpetual inventory value</div>
            <div className="text-2xl font-semibold tabular-nums mt-1">{loading ? '…' : fmt(perpetualTotal)}</div>
            <div className="text-[12.5px] text-muted-foreground mt-1">
              {perpetual.map((p) => `${p.warehouseName || 'Warehouse'}: ${p.units} units · ${fmt(p.value)}`).join(' · ') || 'No stock balances yet.'}
            </div>
          </div>
          <div className="border border-border rounded-xl bg-card p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">GL {gl ? `${gl.code} · ${gl.name}` : '1300 · Inventory'} (posted)</div>
            <div className="text-2xl font-semibold tabular-nums mt-1">{loading ? '…' : gl ? fmt(gl.balance) : '—'}</div>
            <div className="text-[12.5px] text-muted-foreground mt-1">Posted journal balance of the inventory account.</div>
          </div>
          <div className={`border rounded-xl p-4 ${reconciled ? 'border-emerald-600/30 bg-emerald-50' : 'border-red-300 bg-red-50'}`}>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Difference (GL − perpetual)</div>
            <div className="text-2xl font-semibold tabular-nums mt-1">{loading ? '…' : fmt(difference)}</div>
            <div className="text-[12.5px] mt-1">
              {reconciled
                ? 'The ledger and the stock records agree.'
                : 'The ledger and the stock records do NOT agree. Every stock movement should post a matching journal entry; the gap above is the amount still to run down — it is shown, never adjusted away silently.'}
            </div>
          </div>
        </div>

        <h2 className="font-display text-lg font-semibold mt-8 mb-3">FIFO Layer Audit</h2>
        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr className={headRow}>
              <th className={thCls}>Item / SKU</th>
              <th className={thCls}>Batch / PO Ingest</th>
              <th className={thCls}>FIFO Layer Date</th>
              <th className={`${thCls} text-right`}>Remaining Qty</th>
              <th className={`${thCls} text-right`}>Unit Landed Cost</th>
              <th className="p-3 text-right">Extended Valuation</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={6} className="text-center text-muted-foreground">Loading cost layers…</td></tr>
              ) : layers.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-muted-foreground">
                  No FIFO cost layers are recorded yet. A layer is created each time stock is received at a cost; until receiving runs through the ERP, valuation rests on the balance unit costs above.
                </td></tr>
              ) : layers.map((l) => (
                <tr key={l.id} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border"><div className="font-medium">{l.productName || 'Item'}</div><div className="text-[11px] text-muted-foreground">{l.sku || ''} · {l.warehouseName || ''} · {l.costingMethod || 'FIFO'}</div></td>
                  <td className="p-3 border-r border-border">{l.ingestRef || l.ingestType || '—'}</td>
                  <td className="p-3 border-r border-border">{new Date(l.createdAt).toLocaleDateString()}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{l.quantityRemaining}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{fmt(l.unitCost)}</td>
                  <td className="p-3 text-right tabular-nums font-semibold">{fmt(l.extended)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
        <p className="text-[12.5px] text-muted-foreground mt-3">
          Cost layers carry one landed unit cost. Freight and duty are not split out in the layer data, so no
          freight column is shown — the simulator below shows what a freight/duty load would do to a layer&apos;s cost.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
          <div className="border border-border rounded-xl bg-card p-4">
            <h2 className="font-display text-lg font-semibold mb-3">Landed Cost Multiplier Simulator</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div><label className={labelCls}>Cost layer</label>
                <select value={simSku} onChange={(e) => setSimSku(e.target.value)} className={inputCls}>
                  <option value="">— Choose a layer —</option>
                  {layers.map((l) => <option key={l.id} value={l.id}>{l.productName || l.sku} · {fmt(l.unitCost)}</option>)}
                </select></div>
              <div><label className={labelCls}>Freight / landed adj (%)</label>
                <input type="number" min="0" value={freightPct} onChange={(e) => setFreightPct(e.target.value)} className={inputCls} /></div>
              <div><label className={labelCls}>Duties / customs (%)</label>
                <input type="number" min="0" value={dutyPct} onChange={(e) => setDutyPct(e.target.value)} className={inputCls} /></div>
            </div>
            <p className="text-[13px] mt-3">
              {layers.length === 0
                ? 'No cost layers exist yet to simulate against.'
                : simLayer && simLanded != null
                  ? <>Base PO cost {fmt(simLayer.unitCost)} → landed unit cost <span className="font-semibold">{fmt(simLanded)}</span> ({fmt(simLanded * simLayer.quantityRemaining)} across the layer&apos;s remaining {simLayer.quantityRemaining} units).</>
                  : 'Pick a layer to see its landed cost under a freight and duty load.'}
            </p>
          </div>
          <div className="border border-border rounded-xl bg-card p-4">
            <h2 className="font-display text-lg font-semibold mb-3">COGS Recognition Log</h2>
            {movements.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No stock movements have been recorded yet. Movements (receipts, shipments, counts, damage) will appear here as they happen.</p>
            ) : (
              <ul className="space-y-1.5 text-[13px]">
                {movements.slice(0, 10).map((m) => (
                  <li key={m.id} className="flex justify-between gap-3">
                    <span><span className="capitalize font-medium">{m.movementType.replace(/_/g, ' ')}</span> · {m.productName || m.sku || 'Item'} · {m.quantity} units</span>
                    <span className="text-muted-foreground tabular-nums">{m.totalCost != null ? fmt(m.totalCost) : ''} {new Date(m.occurredAt).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
