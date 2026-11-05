'use client';

import React, { useCallback, useEffect, useState } from 'react';

// /admin/accounting/inventory/locations-pos — Store Locations & POS
// (owner's store_locations_pos.html). Unsaid sells online only: no
// POS/register storage exists in the system, so the register table
// is an honest empty state, and the real locations list comes from
// the warehouse facilities that double as storefront locations.

type Loc = {
  id: string; code: string; name: string; warehouse_type: string | null;
  address_line1: string | null; city: string | null; state: string | null;
  postal_code: string | null; is_active: boolean;
};

export default function InventoryLocationsPosPage() {
  const [locations, setLocations] = useState<Loc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/accounting/inventory-pos', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => setLocations(d.locations || []))
      .catch(() => setError('Locations could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const thCls = 'p-3 border-r border-border';
  const headRow = 'bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground';

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Store Locations &amp; POS</h1>
      </div>

      <div className="mt-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mb-4">{error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {loading ? (
            <p className="text-[13px] text-muted-foreground">Loading locations…</p>
          ) : locations.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No locations exist yet. Facilities added under Warehouses &amp; Locations appear here.</p>
          ) : locations.map((l) => (
            <div key={l.id} className="border border-border rounded-xl bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-[15px]">{l.name}</div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${l.is_active ? 'bg-emerald-100 text-emerald-900' : 'bg-muted text-foreground'}`}>{l.is_active ? 'Active' : 'Inactive'}</span>
              </div>
              <div className="text-[12.5px] text-muted-foreground mt-0.5">{l.code} · {l.warehouse_type || 'facility'}</div>
              <p className="text-[13px] mt-2">
                {[l.address_line1, l.city, l.state, l.postal_code].filter(Boolean).join(', ') || 'No street address on file'}
              </p>
              <p className="text-[12.5px] text-muted-foreground mt-1">Registers at this location: none — online sales only.</p>
            </div>
          ))}
        </div>

        <h2 className="font-display text-lg font-semibold mt-8 mb-3">Point-of-Sale Registers</h2>
        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr className={headRow}>
              <th className={thCls}>Register</th>
              <th className={thCls}>Location</th>
              <th className={thCls}>Register State</th>
              <th className={thCls}>Cash Drawer</th>
              <th className="p-3">Today&apos;s Sales</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              <tr><td colSpan={5} className="text-center text-muted-foreground">
                No registers exist yet. This business has no physical point of sale — every sale runs through the online store, so there is nothing to open, close, or reconcile here. If a physical location opens, its registers will appear on this page.
              </td></tr>
            </tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
}
