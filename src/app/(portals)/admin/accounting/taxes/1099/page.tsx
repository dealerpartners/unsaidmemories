'use client';

import React, { useCallback, useEffect, useState } from 'react';

// /admin/accounting/taxes/1099 — Tax & Compliance → 1099 &
// Contractor Tax (owner spec: 1099_contractor_tax.html). The
// contractor register over acct_vendors where is_1099_vendor:
// masked tax ID, W-9 status and the date it was received,
// year-to-date spend computed live from acct_ap_payments (what
// was actually PAID in the tax year), the IRS $600 threshold
// meter, the 1099 box from tax_form_type, and filing status from
// acct_payroll_tax_forms. Recording a W-9 date and staging a
// 1099-NEC write real rows — staging freezes Box 1 at the live
// paid total for the year.

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const maskTaxId = (t: string | null) => {
  if (!t) return 'Not on file';
  const digits = t.replace(/\D/g, '');
  const last4 = digits.slice(-4) || t.slice(-4);
  return `••-•••${last4}`;
};

type Contractor = {
  id: string; vendorNumber: string; name: string; email: string | null;
  taxNumber: string | null; taxFormType: string | null; w9ReceivedAt: string | null;
  ytdPaid: number; ytdBilled: number; glAccounts: string | null;
  filingStatus: string | null; filingForm: string | null; filedAt: string | null; confirmationNumber: string | null;
};

const THRESHOLD = 600;
const thisYear = new Date().getFullYear();

export default function ContractorTax1099Page() {
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [year, setYear] = useState(thisYear);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'eligible' | 'under' | 'missing'>('all');
  const [w9Dates, setW9Dates] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/accounting/tax-1099?year=${year}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => { setContractors(Array.isArray(d.contractors) ? d.contractors : []); setError(null); })
      .catch(() => setError('1099 contractors could not be loaded.'))
      .finally(() => setLoading(false));
  }, [year]);

  useEffect(() => { load(); }, [load]);

  const post = async (payload: Record<string, unknown>) => {
    const r = await fetch('/api/admin/accounting/tax-1099', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) throw new Error(d.error || 'action failed');
    return d;
  };

  const saveW9 = async (c: Contractor) => {
    setBusy(`w9-${c.id}`);
    try {
      await post({ action: 'update_tax', vendor_id: c.id, w9_received_at: w9Dates[c.id] || null });
      setNotice(`W-9 date saved for ${c.name}.`);
      load();
    } catch (err: any) { setError(err?.message || 'W-9 date could not be saved.'); }
    finally { setBusy(null); }
  };

  const stageForm = async (c: Contractor) => {
    setBusy(`stage-${c.id}`);
    try {
      const d = await post({ action: 'stage_form', vendor_id: c.id, tax_year: year });
      setNotice(`1099-NEC staged for ${c.name} — Box 1 set to the ${fmt(Number(d.box_1 || 0))} actually paid in ${year}.`);
      load();
    } catch (err: any) { setError(err?.message || 'Form could not be staged.'); }
    finally { setBusy(null); }
  };

  const exceeding = contractors.filter((c) => c.ytdPaid >= THRESHOLD);
  const missingW9 = contractors.filter((c) => !c.w9ReceivedAt);
  const totalComp = contractors.reduce((s, c) => s + c.ytdPaid, 0);
  const w9Pct = contractors.length ? Math.round(((contractors.length - missingW9.length) / contractors.length) * 1000) / 10 : 0;

  const shown = contractors.filter((c) => {
    if (tab === 'eligible' && c.ytdPaid < THRESHOLD) return false;
    if (tab === 'under' && c.ytdPaid >= THRESHOLD) return false;
    if (tab === 'missing' && c.w9ReceivedAt) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [c.vendorNumber, c.name, c.email || ''].join(' ').toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">1099 & Contractor Tax</h1>
        </div>
        <div className="flex items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search contractor…" className="bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full md:w-56" type="text" />
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} data-tip="Switch the tax year. Spend, the $600 meter and filing status all re-read for that year." className="bg-background border border-input rounded-lg px-2 h-9 text-[13px]">
            {[thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>Tax Year {y}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 py-4">
        {[
          { label: 'Total 1099 Contractors', value: String(contractors.length), foot: `${exceeding.length} at or over the $600 reporting line` },
          { label: `YTD Non-Employee Comp (${year})`, value: fmt(totalComp), foot: 'Payments actually posted in the tax year' },
          { label: 'W-9 Vault Compliance', value: `${w9Pct}%`, foot: `${contractors.length - missingW9.length} of ${contractors.length} W-9 on file · ${missingW9.length} action required` },
          { label: 'Filing Readiness', value: `${contractors.filter((c) => c.filingStatus).length} staged/filed`, foot: `1099-NEC is due Jan 31, ${year + 1}` },
        ].map((k) => (
          <div key={k.label} className="border border-border rounded-xl bg-card p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{k.label}</div>
            <div className="text-xl font-semibold mt-1 tabular-nums">{k.value}</div>
            <div className="text-[12px] text-muted-foreground mt-1">{k.foot}</div>
          </div>
        ))}
      </div>

      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mb-4">{error}</div>}
      {notice && <div className="rounded-lg border border-border bg-card px-4 py-2 text-sm mb-4">{notice}</div>}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {([
          { key: 'all', label: `All Contractors (${contractors.length})` },
          { key: 'eligible', label: `1099-NEC Eligible (${exceeding.length})` },
          { key: 'under', label: `Under $600 (${contractors.length - exceeding.length})` },
          { key: 'missing', label: `Missing W-9 (${missingW9.length})` },
        ] as const).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} data-tip={`Show ${t.label.toLowerCase()} only.`} className={`h-8 px-3 rounded-lg border text-[12px] font-medium ${tab === t.key ? 'bg-[#7258e8] text-white border-[#7258e8]' : 'bg-card border-border text-foreground'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="border border-border rounded-xl overflow-x-auto bg-card">
        <div className="adm-table-wrap"><table className="adm-table">
          <thead>
            <tr className="bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground">
              <th className="p-3 border-r border-border">Contractor / Vendor Name</th>
              <th className="p-3 border-r border-border">EIN / SSN</th>
              <th className="p-3 border-r border-border">W-9 Status & Date</th>
              <th className="p-3 border-r border-border">GL Accounts</th>
              <th className="p-3 border-r border-border text-right">YTD Total Spend</th>
              <th className="p-3 border-r border-border">IRS $600 Threshold Meter</th>
              <th className="p-3 border-r border-border">1099 Box</th>
              <th className="p-3 border-r border-border">Filing Status</th>
              <th className="p-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={9} className="text-center text-muted-foreground">Loading contractors…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={9} className="text-center text-muted-foreground">
                {contractors.length === 0
                  ? 'No 1099 contractors yet. Mark a vendor as a 1099 contractor in Vendors & Suppliers and they appear here with their paid totals.'
                  : 'No contractors match this search or filter.'}
              </td></tr>
            ) : shown.map((c) => {
              const pct = Math.min(100, Math.round((c.ytdPaid / THRESHOLD) * 100));
              return (
                <tr key={c.id} className="hover:bg-accent/50 align-top">
                  <td className="p-3 border-r border-border">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-[11px] text-muted-foreground">{c.vendorNumber}{c.email ? ` · ${c.email}` : ''}</div>
                  </td>
                  <td className="p-3 border-r border-border tabular-nums">{maskTaxId(c.taxNumber)}</td>
                  <td className="p-3 border-r border-border">
                    {c.w9ReceivedAt ? (
                      <div>Verified<div className="text-[11px] text-muted-foreground">({fmtDate(c.w9ReceivedAt)})</div></div>
                    ) : (
                      <div>
                        <div className="font-medium">Missing</div>
                        <span className="inline-flex items-center gap-2 mt-1">
                          <input type="date" value={w9Dates[c.id] || ''} onChange={(e) => setW9Dates({ ...w9Dates, [c.id]: e.target.value })} className="bg-background border border-input rounded-lg px-2 h-8 text-[12px]" />
                          <button onClick={() => saveW9(c)} disabled={busy === `w9-${c.id}` || !w9Dates[c.id]} data-tip="Record the date this contractor's W-9 was received. It is saved on their vendor record." className="text-[12px] underline disabled:opacity-50">Save</button>
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="p-3 border-r border-border text-muted-foreground">{c.glAccounts || '—'}</td>
                  <td className="p-3 border-r border-border text-right font-semibold tabular-nums">{fmt(c.ytdPaid)}<div className="text-[11px] text-muted-foreground font-normal">{fmt(c.ytdBilled)} billed</div></td>
                  <td className="p-3 border-r border-border">
                    <div className="w-32 h-2 rounded bg-muted overflow-hidden"><div className="h-full bg-[#7258e8]" style={{ width: `${pct}%` }} /></div>
                    <div className="text-[11px] text-muted-foreground mt-1">{c.ytdPaid >= THRESHOLD ? `Exceeded (100%)` : `${pct}%`} · {fmt(c.ytdPaid)} / $600</div>
                  </td>
                  <td className="p-3 border-r border-border">{c.taxFormType === '1099-NEC' || !c.taxFormType ? 'Box 1: Nonemployee Comp' : c.taxFormType}</td>
                  <td className="p-3 border-r border-border">
                    {c.filingStatus ? (
                      <div className="capitalize">{c.filingForm} · {c.filingStatus}{c.filedAt ? <div className="text-[11px] text-muted-foreground normal-case">Filed {fmtDate(c.filedAt)}{c.confirmationNumber ? ` · ${c.confirmationNumber}` : ''}</div> : null}</div>
                    ) : 'Not staged'}
                  </td>
                  <td className="p-3 text-center">
                    {!c.filingStatus && (
                      <button onClick={() => stageForm(c)} disabled={busy === `stage-${c.id}`} data-tip="Stage this contractor's 1099-NEC for the tax year. Box 1 is frozen at what they were actually paid." className="text-[12px] underline disabled:opacity-50">
                        {busy === `stage-${c.id}` ? 'Staging…' : 'Stage 1099-NEC'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
