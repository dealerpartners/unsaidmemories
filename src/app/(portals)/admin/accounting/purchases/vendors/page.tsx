'use client';

import React, { useCallback, useEffect, useState } from 'react';

// /admin/accounting/purchases/vendors — Purchases & Payables →
// Vendors & Suppliers (owner spec: vendors_suppliers.html). The
// master supplier directory: every acct_vendors row with its live
// open AP balance and YTD paid volume from
// /api/admin/accounting/vendors, its payment terms, and its 1099 /
// W-9 compliance status. Add Vendor and Activate/Deactivate write
// through the same API and the register re-reads itself as proof.

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);

type Vendor = {
  id: string;
  vendorNumber: string;
  name: string;
  email: string | null;
  phone: string | null;
  currency: string;
  paymentTermsDays: number | null;
  taxNumber: string | null;
  taxFormType: string | null;
  is1099: boolean;
  isActive: boolean;
  w9ReceivedAt: string | null;
  category: string | null;
  openBalance: number;
  openBills: number;
  ytdPaid: number;
};

type Tab = 'all' | 'contractors' | 'open' | 'missing-w9';

const inputCls = 'bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full';

export default function VendorsSuppliersPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [termsFilter, setTermsFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ legal_name: '', email: '', phone: '', payment_terms_days: '30', tax_number: '', tax_form_type: '', is_1099: false });

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/accounting/vendors', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => { setVendors(Array.isArray(d.vendors) ? d.vendors : []); setError(null); })
      .catch(() => setError('Vendors could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await fetch('/api/admin/accounting/vendors', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, payment_terms_days: Number(form.payment_terms_days) || 30 }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) throw new Error(d.error || 'save failed');
      setForm({ legal_name: '', email: '', phone: '', payment_terms_days: '30', tax_number: '', tax_form_type: '', is_1099: false });
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err?.message || 'Vendor could not be saved.');
    } finally { setSaving(false); }
  };

  const toggleActive = async (v: Vendor) => {
    try {
      const r = await fetch('/api/admin/accounting/vendors', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_active', id: v.id, is_active: !v.isActive }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) throw new Error(d.error || 'update failed');
      load();
    } catch (err: any) { setError(err?.message || 'Vendor could not be updated.'); }
  };

  const contractors = vendors.filter((v) => v.is1099);
  const w9OnFile = contractors.filter((v) => v.w9ReceivedAt).length;
  const totalOpen = vendors.reduce((s, v) => s + v.openBalance, 0);
  const totalYtd = vendors.reduce((s, v) => s + v.ytdPaid, 0);

  const shown = vendors.filter((v) => {
    if (tab === 'contractors' && !v.is1099) return false;
    if (tab === 'open' && v.openBalance <= 0) return false;
    if (tab === 'missing-w9' && !(v.is1099 && !v.w9ReceivedAt)) return false;
    if (termsFilter && String(v.paymentTermsDays ?? '') !== termsFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [v.vendorNumber, v.name, v.email || '', v.phone || '', v.category || ''].join(' ').toLowerCase().includes(q);
  });

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'all', label: 'All Vendors', count: vendors.length },
    { key: 'contractors', label: '1099 Contractors', count: contractors.length },
    { key: 'open', label: 'Open Balance', count: vendors.filter((v) => v.openBalance > 0).length },
    { key: 'missing-w9', label: 'Missing W-9', count: contractors.filter((v) => !v.w9ReceivedAt).length },
  ];

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Vendors & Suppliers</h1>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search number, name, email…"
            className="bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full md:w-64"
            type="text"
          />
          <button
            onClick={() => setShowForm((s) => !s)}
            data-tip="Add a new vendor or supplier to the directory. They can then be picked on bills and purchase orders."
            className="h-9 px-4 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium whitespace-nowrap"
          >
            + Add Vendor
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 py-4">
        {[
          { label: 'Active Directory', value: `${vendors.filter((v) => v.isActive).length} Suppliers`, foot: `${vendors.length} total on the books` },
          { label: 'Open AP Commitments', value: fmt(totalOpen), foot: `Across ${vendors.filter((v) => v.openBalance > 0).length} vendors with open bills` },
          { label: '1099 Tax Compliance', value: contractors.length ? `${Math.round((w9OnFile / contractors.length) * 100)}% Complete` : 'No contractors', foot: `${w9OnFile} of ${contractors.length} W-9 on file · ${contractors.length - w9OnFile} missing` },
          { label: 'YTD Spend Volume', value: fmt(totalYtd), foot: 'Payments posted this calendar year' },
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
        <form onSubmit={submit} className="border border-border rounded-xl bg-card p-4 mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-[12px] font-medium">Legal name *
            <input required value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} className={inputCls} placeholder="Printful Inc." />
          </label>
          <label className="text-[12px] font-medium">Email
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} />
          </label>
          <label className="text-[12px] font-medium">Phone
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} />
          </label>
          <label className="text-[12px] font-medium">Terms (days)
            <input type="number" min="0" value={form.payment_terms_days} onChange={(e) => setForm({ ...form, payment_terms_days: e.target.value })} className={inputCls} />
          </label>
          <label className="text-[12px] font-medium">Tax ID (EIN/SSN)
            <input value={form.tax_number} onChange={(e) => setForm({ ...form, tax_number: e.target.value })} className={inputCls} />
          </label>
          <label className="text-[12px] font-medium">Tax form
            <select value={form.tax_form_type} onChange={(e) => setForm({ ...form, tax_form_type: e.target.value })} className={inputCls}>
              <option value="">None</option>
              <option value="W-9">W-9</option>
              <option value="1099-NEC">1099-NEC</option>
              <option value="W-8BEN">W-8BEN</option>
            </select>
          </label>
          <label className="text-[12px] font-medium flex items-center gap-2 pt-5">
            <input type="checkbox" checked={form.is_1099} onChange={(e) => setForm({ ...form, is_1099: e.target.checked })} />
            1099 contractor (report payments at year end)
          </label>
          <div className="flex items-end">
            <button type="submit" disabled={saving} data-tip="Save this vendor. The register reloads so you can see the new vendor in the list." className="h-9 px-4 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium disabled:opacity-50">
              {saving ? 'Saving…' : 'Create Vendor'}
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            data-tip={`Show ${t.label.toLowerCase()} only.`}
            className={`h-8 px-3 rounded-lg border text-[12px] font-medium ${tab === t.key ? 'bg-[#7258e8] text-white border-[#7258e8]' : 'bg-card border-border text-foreground'}`}
          >
            {t.label} ({t.count})
          </button>
        ))}
        <select
          value={termsFilter}
          onChange={(e) => setTermsFilter(e.target.value)}
          data-tip="Filter the directory to one set of payment terms."
          className="bg-background border border-input rounded-lg px-2 h-8 text-[12px]"
        >
          <option value="">Net Terms: Any</option>
          {[0, 15, 30, 45, 60].map((d) => (
            <option key={d} value={String(d)}>{d === 0 ? 'Due on Receipt' : `Net ${d}`}</option>
          ))}
        </select>
      </div>

      <div className="border border-border rounded-xl overflow-x-auto bg-card">
        <div className="adm-table-wrap"><table className="adm-table">
          <thead>
            <tr className="bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground">
              <th className="p-3 border-r border-border">Vendor / Company</th>
              <th className="p-3 border-r border-border">Primary Contact</th>
              <th className="p-3 border-r border-border">Category</th>
              <th className="p-3 border-r border-border text-right">Open Balance</th>
              <th className="p-3 border-r border-border">Terms</th>
              <th className="p-3 border-r border-border">1099 Status</th>
              <th className="p-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={7} className="text-center text-muted-foreground">Loading vendors…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-muted-foreground">
                {vendors.length === 0
                  ? 'No vendors yet. Vendors you add here appear on bills and purchase orders, and their open balances build from the bills you record.'
                  : 'No vendors match this search or filter.'}
              </td></tr>
            ) : shown.map((v) => (
              <tr key={v.id} className="hover:bg-accent/50">
                <td className="p-3 border-r border-border">
                  <div className="font-medium">{v.name}</div>
                  <div className="text-[11px] text-muted-foreground">{v.vendorNumber}{v.isActive ? '' : ' · Inactive'}</div>
                </td>
                <td className="p-3 border-r border-border">
                  <div>{v.email || '—'}</div>
                  <div className="text-[11px] text-muted-foreground">{v.phone || ''}</div>
                </td>
                <td className="p-3 border-r border-border text-muted-foreground">{v.category || '—'}</td>
                <td className="p-3 border-r border-border text-right font-semibold tabular-nums">{fmt(v.openBalance)}</td>
                <td className="p-3 border-r border-border text-muted-foreground">{v.paymentTermsDays ? `Net ${v.paymentTermsDays}` : 'Due on Receipt'}</td>
                <td className="p-3 border-r border-border">
                  {!v.is1099 ? <span className="text-muted-foreground">—</span> : v.w9ReceivedAt ? (
                    <span>1099 · W-9 on file ({new Date(v.w9ReceivedAt).toLocaleDateString('en-US')})</span>
                  ) : (
                    <span className="font-medium">1099 · W-9 missing</span>
                  )}
                  {v.taxFormType ? <div className="text-[11px] text-muted-foreground">{v.taxFormType}</div> : null}
                </td>
                <td className="p-3 text-center">
                  <button
                    onClick={() => toggleActive(v)}
                    data-tip={v.isActive ? 'Deactivate this vendor. They stay on past bills but cannot be picked on new ones.' : 'Reactivate this vendor so they can be picked on new bills and orders.'}
                    className="text-[12px] underline"
                  >
                    {v.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
