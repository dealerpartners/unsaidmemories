'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { PlugZap } from 'lucide-react';

// /admin/accounting/inventory/shipping — Shipping Rates & Carriers
// (owner's shipping_rates_carriers.html): which carrier integrations
// are really connected, the carrier/service registry, and recent
// shipments. Rates are quoted live by the carrier at label time —
// no stored rate matrix exists, and none is invented here.

type Integration = { id: string; name: string; connected: boolean; detail: string };
type Carrier = { id: string; code: string; name: string; api_provider: string | null; is_active: boolean; methods: number };
type Method = { id: string; code: string; name: string; service_level: string | null; is_active: boolean; carrier_name: string | null };
type Shipment = { id: string; shipment_number: string | null; status: string | null; tracking_number: string | null; tracking_url: string | null; shipped_at: string | null; created_at: string };

export default function InventoryShippingPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [methods, setMethods] = useState<Method[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/accounting/inventory-shipping', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => { setIntegrations(d.integrations || []); setCarriers(d.carriers || []); setMethods(d.methods || []); setShipments(d.shipments || []); })
      .catch(() => setError('Shipping could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const testCarrier = async (id: string, name: string) => {
    setBusy(id); setError(null); setNotice(null);
    try {
      const r = await fetch('/api/admin/integrations/test-connection', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serviceId: id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) throw new Error(j?.error || 'Test failed');
      if (j.status === 'connected' || j.proofLine) {
        setNotice(`${name}: ${j.proofLine || j.detail || 'Connection verified.'}`);
      } else {
        setError(`${name}: ${j.detail || j.fix || 'The test did not pass.'}`);
      }
    } catch (e: any) { setError(e?.message || 'Test failed'); } finally { setBusy(null); }
  };

  const thCls = 'p-3 border-r border-border';
  const headRow = 'bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground';

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Shipping Rates &amp; Carriers</h1>
      </div>

      <div className="mt-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mb-4">{error}</div>}
        {notice && <div className="rounded-lg border border-emerald-600/30 bg-emerald-50 px-4 py-2 text-sm text-emerald-900 mb-4">{notice}</div>}

        <h2 className="font-display text-lg font-semibold mb-3">Active Carrier Integrations</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {integrations.map((i) => (
            <div key={i.id} className="border border-border rounded-xl bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-[15px]">{i.name}</div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${i.connected ? 'bg-emerald-100 text-emerald-900' : 'bg-muted text-foreground'}`}>
                  {i.connected ? 'Connected' : 'Not connected'}
                </span>
              </div>
              <p className="text-[13px] text-muted-foreground mt-2">{i.detail}</p>
              <button type="button" disabled={busy === i.id} onClick={() => testCarrier(i.id, i.name)} data-tip="Runs the real connection test against the carrier's API with the saved key"
                className="mt-3 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-card text-[13px] font-medium disabled:opacity-50">
                <PlugZap className="size-4" /> {busy === i.id ? 'Testing…' : 'Carrier API Test'}
              </button>
            </div>
          ))}
          {carriers.map((c) => (
            <div key={c.id} className="border border-border rounded-xl bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-[15px]">{c.name}</div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.is_active ? 'bg-emerald-100 text-emerald-900' : 'bg-muted text-foreground'}`}>{c.is_active ? 'Active' : 'Inactive'}</span>
              </div>
              <p className="text-[13px] text-muted-foreground mt-2">
                Registry carrier ({c.code}){c.api_provider ? ` via ${c.api_provider}` : ''} · {c.methods} service method(s) defined.
              </p>
            </div>
          ))}
          {!loading && carriers.length === 0 && (
            <div className="border border-border rounded-xl bg-card p-4">
              <div className="font-semibold text-[15px]">Direct carrier accounts</div>
              <p className="text-[13px] text-muted-foreground mt-2">
                No direct FedEx / UPS / DHL accounts are registered. Carrier accounts connect through Shippo above, which aggregates them; a direct account would appear here when one is registered.
              </p>
            </div>
          )}
        </div>

        <h2 className="font-display text-lg font-semibold mt-8 mb-3">Shipping Rate Calculation Rules</h2>
        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr className={headRow}>
              <th className={thCls}>Rule ID</th>
              <th className={thCls}>Service Name</th>
              <th className={thCls}>Carrier</th>
              <th className={thCls}>Service Level</th>
              <th className={thCls}>Customer Rate Calculation</th>
              <th className="p-3">Status</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={6} className="text-center text-muted-foreground">Loading rate rules…</td></tr>
              ) : methods.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-muted-foreground">
                  No shipping methods or rate rules are configured. Until a carrier is connected, checkout shipping runs on the store&apos;s saved shipping estimates, and labels quote the carrier&apos;s live rate at purchase time.
                </td></tr>
              ) : methods.map((m) => (
                <tr key={m.id} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border tabular-nums">{m.code}</td>
                  <td className="p-3 border-r border-border font-medium">{m.name}</td>
                  <td className="p-3 border-r border-border">{m.carrier_name || '—'}</td>
                  <td className="p-3 border-r border-border">{m.service_level || '—'}</td>
                  <td className="p-3 border-r border-border text-muted-foreground">Live carrier quote at label time</td>
                  <td className="p-3">{m.is_active ? 'Active' : 'Inactive'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>

        <h2 className="font-display text-lg font-semibold mt-8 mb-3">Recent Shipments</h2>
        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr className={headRow}>
              <th className={thCls}>Shipment</th>
              <th className={thCls}>Status</th>
              <th className={thCls}>Tracking</th>
              <th className="p-3">Shipped</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={4} className="text-center text-muted-foreground">Loading shipments…</td></tr>
              ) : shipments.length === 0 ? (
                <tr><td colSpan={4} className="text-center text-muted-foreground">No shipments have been recorded yet.</td></tr>
              ) : shipments.map((s) => (
                <tr key={s.id} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border font-medium">{s.shipment_number || 'Shipment'}</td>
                  <td className="p-3 border-r border-border capitalize">{(s.status || '—').replace(/_/g, ' ')}</td>
                  <td className="p-3 border-r border-border tabular-nums">
                    {s.tracking_url ? <a href={s.tracking_url} target="_blank" rel="noreferrer" className="underline">{s.tracking_number || 'Track'}</a> : (s.tracking_number || '—')}
                  </td>
                  <td className="p-3">{s.shipped_at ? new Date(s.shipped_at).toLocaleDateString() : new Date(s.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
}
