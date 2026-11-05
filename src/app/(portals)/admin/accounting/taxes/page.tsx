'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, ShieldCheck } from 'lucide-react';

// /admin/accounting/taxes — Sales Tax & Nexus (owner's
// sales_tax_nexus.html rebuilt as a real route): the Economic
// Nexus & Multi-State Register computed live from storefront
// orders (trailing-12-month volume + transaction count by
// shipping state) against the standard statutory benchmarks —
// labeled reference values, the same ones his design carries.
// Registrations come from acct_tax_jurisdictions. Below the
// register: the tax rates and filings the existing taxes API
// already maintains (upsert / toggle / create / file).

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan',
  MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
  WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
};

type NexusRow = {
  state: string; volume: number; txns: number; benchmarkDollars: number; benchmarkTxns: number | null;
  utilization: number; nexusType: string; registered: boolean; registrationNumber: string | null;
  agency: string | null; status: string;
};
type Rate = { id: string; name: string; jurisdiction: string | null; rate_percent: number; is_active: boolean };
type Filing = { id: string; period_label: string | null; period_start: string | null; period_end: string | null; taxable_sales: number; tax_collected: number; tax_remitted: number; status: string; confirmation_ref: string | null };
type Rule = { id: string; jurisdiction: string; tax_type: string; state_code: string; rate: number; classification: string; auto_calc: boolean; is_active: boolean };

export default function SalesTaxNexusPage() {
  const [nexus, setNexus] = useState<NexusRow[]>([]);
  const [rates, setRates] = useState<Rate[]>([]);
  const [filings, setFilings] = useState<Filing[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [totals, setTotals] = useState<{ statesWithSales: number; activeNexus: number; approaching: number; trailing12Volume: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rateForm, setRateForm] = useState({ name: '', jurisdiction: '', rate_percent: '' });
  const [filingForm, setFilingForm] = useState({ period_label: '', period_start: '', period_end: '', taxable_sales: '', tax_collected: '', tax_rate_id: '' });

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/accounting/taxes', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => {
        setNexus((d.nexus || []).map((n: any) => ({ ...n, volume: Number(n.volume || 0) })));
        setRates((d.rates || []).map((x: any) => ({ ...x, rate_percent: Number(x.rate_percent || 0) })));
        setFilings((d.filings || []).map((x: any) => ({ ...x, taxable_sales: Number(x.taxable_sales || 0), tax_collected: Number(x.tax_collected || 0), tax_remitted: Number(x.tax_remitted || 0) })));
        setRules((d.rules || []).map((x: any) => ({ ...x, rate: Number(x.rate || 0) })));
        setTotals(d.totals || null);
      })
      .catch(() => setError('Sales tax data could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const post = async (payload: Record<string, unknown>) => {
    const r = await fetch('/api/admin/accounting/taxes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.ok === false) throw new Error(j?.error || 'Action failed');
    return j;
  };

  const runAudit = () => {
    load();
    const breached = nexus.filter((n) => !n.registered && n.utilization >= 100);
    const approaching = nexus.filter((n) => !n.registered && n.utilization >= 80 && n.utilization < 100);
    setNotice(
      breached.length
        ? `Threshold audit: ${breached.map((n) => n.state).join(', ')} at or over the statutory benchmark with no registration on file. ${approaching.length} more state(s) approaching.`
        : `Threshold audit complete: no unregistered state is over its benchmark${approaching.length ? `; ${approaching.map((n) => n.state).join(', ')} approaching (80%+)` : ''}.`,
    );
  };

  const prepareFiling = (n: NexusRow) => {
    const now = new Date();
    const q = Math.floor(now.getMonth() / 3);
    const start = new Date(now.getFullYear(), q * 3, 1).toISOString().slice(0, 10);
    const end = new Date(now.getFullYear(), q * 3 + 3, 0).toISOString().slice(0, 10);
    setFilingForm((f) => ({ ...f, period_label: `${n.state} Q${q + 1} ${now.getFullYear()}`, period_start: start, period_end: end, taxable_sales: String(n.volume) }));
    setNotice(`Filing form prepared for ${STATE_NAMES[n.state] || n.state} with its trailing-12-month volume (${fmt(n.volume)}) as taxable sales — review the period figures, then Create Filing below.`);
    document.getElementById('filing-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  const saveRate = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!rateForm.name.trim()) { setError('Give the tax rate a name.'); return; }
    setBusy('rate'); setError(null); setNotice(null);
    try {
      await post({ action: 'upsert_rate', name: rateForm.name.trim(), jurisdiction: rateForm.jurisdiction || null, rate_percent: Number(rateForm.rate_percent) || 0 });
      setNotice(`Tax rate "${rateForm.name.trim()}" saved.`);
      setRateForm({ name: '', jurisdiction: '', rate_percent: '' });
      load();
    } catch (e: any) { setError(e?.message || 'Save failed'); }
    finally { setBusy(null); }
  };

  const toggleRate = async (rate: Rate) => {
    setBusy(rate.id); setError(null); setNotice(null);
    try {
      await post({ action: 'toggle_rate', id: rate.id, is_active: !rate.is_active });
      setNotice(`Rate "${rate.name}" ${rate.is_active ? 'deactivated' : 'activated'}.`);
      load();
    } catch (e: any) { setError(e?.message || 'Toggle failed'); }
    finally { setBusy(null); }
  };

  const createFiling = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!filingForm.period_label.trim() || !filingForm.period_start || !filingForm.period_end) { setError('Period label, start and end are required.'); return; }
    setBusy('filing'); setError(null); setNotice(null);
    try {
      const j = await post({ action: 'create_filing', tax_rate_id: filingForm.tax_rate_id || null, period_label: filingForm.period_label.trim(), period_start: filingForm.period_start, period_end: filingForm.period_end, taxable_sales: Number(filingForm.taxable_sales) || 0, tax_collected: Number(filingForm.tax_collected) || 0 });
      setNotice(`Filing "${filingForm.period_label.trim()}" created as a draft${j.id ? '' : ''} — it is in the filings list below.`);
      setFilingForm({ period_label: '', period_start: '', period_end: '', taxable_sales: '', tax_collected: '', tax_rate_id: '' });
      load();
    } catch (e: any) { setError(e?.message || 'Create failed'); }
    finally { setBusy(null); }
  };

  const fileFiling = async (f: Filing) => {
    const ref = window.prompt(`File "${f.period_label}"? Enter the confirmation reference from the agency (optional):`, '');
    if (ref === null) return;
    setBusy(f.id); setError(null); setNotice(null);
    try {
      await post({ action: 'file_filing', id: f.id, confirmation_ref: ref || null });
      setNotice(`Filing "${f.period_label}" marked filed — the collected tax is recorded as remitted.`);
      load();
    } catch (e: any) { setError(e?.message || 'File failed'); }
    finally { setBusy(null); }
  };

  const inputCls = 'bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full';
  const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1';
  const thCls = 'p-3 border-r border-border';
  const headRow = 'bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground';

  const utilChip = (n: NexusRow) => {
    if (n.registered) return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">Active Registered</span>;
    if (n.utilization >= 100) return <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-900">Threshold Breached — Not Registered</span>;
    if (n.utilization >= 80) return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">Threshold Alert</span>;
    return <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground">Safe — Not Registered</span>;
  };

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Sales Tax &amp; Nexus</h1>
        </div>
        <button type="button" onClick={runAudit} data-tip="Recomputes every state's volume against its statutory benchmark right now"
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium">
          <ShieldCheck className="size-4" /> Run Threshold Audit
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        {[
          { label: 'States With Sales', value: String(totals?.statesWithSales ?? 0) },
          { label: 'Active Nexus (registered)', value: String(totals?.activeNexus ?? 0) },
          { label: 'Approaching Threshold', value: String(totals?.approaching ?? 0) },
          { label: 'Trailing 12M Volume', value: fmt(totals?.trailing12Volume ?? 0) },
        ].map((k) => (
          <div key={k.label} className="border border-border rounded-xl bg-card p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{k.label}</div>
            <div className="text-xl font-semibold tabular-nums mt-1">{k.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mb-4">{error}</div>}
        {notice && <div className="rounded-lg border border-emerald-600/30 bg-emerald-50 px-4 py-2 text-sm text-emerald-900 mb-4">{notice}</div>}

        <h2 className="font-display text-lg font-semibold tracking-tight mb-1">Economic Nexus &amp; Multi-State Register</h2>
        <p className="text-[13px] text-muted-foreground mb-3">
          Benchmarks are the standard statutory economic-nexus thresholds (reference values: $500,000 in CA, NY and TX;
          $100,000 in most other states, with transaction prongs where the statute has one). A registration recorded for
          a state moves it to Active Registered.
        </p>
        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr className={headRow}>
              <th className={thCls}>State / Code</th>
              <th className={thCls}>Nexus Type</th>
              <th className={`${thCls} text-right`}>Trailing 12M Volume</th>
              <th className={`${thCls} text-right`}>Transaction Count</th>
              <th className={thCls}>Statutory Benchmark</th>
              <th className={thCls}>Threshold Utilization</th>
              <th className={thCls}>Filing / Agency</th>
              <th className={thCls}>Status</th>
              <th className="p-3 text-center">Action</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={9} className="text-center text-muted-foreground">Computing the register from your orders…</td></tr>
              ) : nexus.length === 0 ? (
                <tr><td colSpan={9} className="text-center text-muted-foreground">
                  No shipped sales in the last 12 months yet. As orders ship to states, each state appears here with its volume measured against its benchmark.
                </td></tr>
              ) : nexus.map((n) => (
                <tr key={n.state} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border font-semibold">{n.state} {STATE_NAMES[n.state] || ''}</td>
                  <td className="p-3 border-r border-border text-muted-foreground">{n.nexusType}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{fmt(n.volume)}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{n.txns} txns</td>
                  <td className="p-3 border-r border-border text-muted-foreground">{fmt(n.benchmarkDollars)} threshold{n.benchmarkTxns ? ` / ${n.benchmarkTxns} txns` : ''}</td>
                  <td className="p-3 border-r border-border">
                    <div className="min-w-[120px]">
                      <div className="h-2 rounded-full bg-muted overflow-hidden"><div className={`h-full ${n.utilization >= 100 ? 'bg-red-500' : n.utilization >= 80 ? 'bg-amber-500' : 'bg-[#7258e8]'}`} style={{ width: `${Math.min(100, n.utilization)}%` }} /></div>
                      <div className="text-[11px] text-muted-foreground mt-1">{n.utilization}%</div>
                    </div>
                  </td>
                  <td className="p-3 border-r border-border text-muted-foreground">{n.agency || '—'}{n.registrationNumber ? <div className="text-[11px]">#{n.registrationNumber}</div> : null}</td>
                  <td className="p-3 border-r border-border">{utilChip(n)}</td>
                  <td className="p-3 text-center whitespace-nowrap">
                    <button type="button" onClick={() => prepareFiling(n)} data-tip="Prepares the filing form below with this state's figures for the current quarter"
                      className="text-[12px] underline">Prepare Filing</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-8">
          <form onSubmit={saveRate} className="border border-border rounded-xl bg-card p-4">
            <div className="font-semibold text-[14px] mb-3">Add / Update Tax Rate</div>
            <div className="grid grid-cols-1 gap-3">
              <div><label className={labelCls}>Name</label>
                <input value={rateForm.name} onChange={(e) => setRateForm({ ...rateForm, name: e.target.value })} className={inputCls} placeholder="Tennessee State Sales Tax" required /></div>
              <div><label className={labelCls}>Jurisdiction</label>
                <input value={rateForm.jurisdiction} onChange={(e) => setRateForm({ ...rateForm, jurisdiction: e.target.value })} className={inputCls} placeholder="TN" /></div>
              <div><label className={labelCls}>Rate %</label>
                <input type="number" step="0.001" min="0" value={rateForm.rate_percent} onChange={(e) => setRateForm({ ...rateForm, rate_percent: e.target.value })} className={inputCls} placeholder="7.000" /></div>
            </div>
            <button type="submit" disabled={busy === 'rate'} data-tip="Saves this rate so checkout and invoices can use it"
              className="mt-4 inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium disabled:opacity-50">
              <Plus className="size-4" /> {busy === 'rate' ? 'Saving…' : 'Save Rate'}
            </button>
            <div className="mt-4 divide-y divide-border">
              {rates.length === 0 ? (
                <div className="text-[13px] text-muted-foreground py-2">No tax rates configured yet.</div>
              ) : rates.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2 text-[13px]">
                  <span><span className="font-medium">{r.name}</span> <span className="text-muted-foreground">{r.jurisdiction || ''} · {r.rate_percent}%</span></span>
                  <button type="button" disabled={busy === r.id} onClick={() => toggleRate(r)} data-tip={r.is_active ? 'Turns this rate off so it stops being used' : 'Turns this rate back on'}
                    className="text-[12px] underline disabled:opacity-50">{r.is_active ? 'Active — turn off' : 'Inactive — turn on'}</button>
                </div>
              ))}
            </div>
          </form>

          <form id="filing-form" onSubmit={createFiling} className="border border-border rounded-xl bg-card p-4">
            <div className="font-semibold text-[14px] mb-3">Create Filing</div>
            <div className="grid grid-cols-1 gap-3">
              <div><label className={labelCls}>Period label</label>
                <input value={filingForm.period_label} onChange={(e) => setFilingForm({ ...filingForm, period_label: e.target.value })} className={inputCls} placeholder="TN Q4 2026" required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>Period start</label>
                  <input type="date" value={filingForm.period_start} onChange={(e) => setFilingForm({ ...filingForm, period_start: e.target.value })} className={inputCls} required /></div>
                <div><label className={labelCls}>Period end</label>
                  <input type="date" value={filingForm.period_end} onChange={(e) => setFilingForm({ ...filingForm, period_end: e.target.value })} className={inputCls} required /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>Taxable sales</label>
                  <input type="number" step="0.01" min="0" value={filingForm.taxable_sales} onChange={(e) => setFilingForm({ ...filingForm, taxable_sales: e.target.value })} className={inputCls} /></div>
                <div><label className={labelCls}>Tax collected</label>
                  <input type="number" step="0.01" min="0" value={filingForm.tax_collected} onChange={(e) => setFilingForm({ ...filingForm, tax_collected: e.target.value })} className={inputCls} /></div>
              </div>
              <div><label className={labelCls}>Tax rate (optional)</label>
                <select value={filingForm.tax_rate_id} onChange={(e) => setFilingForm({ ...filingForm, tax_rate_id: e.target.value })} className={inputCls}>
                  <option value="">— None —</option>
                  {rates.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select></div>
            </div>
            <button type="submit" disabled={busy === 'filing'} data-tip="Creates this filing as a draft in the filings list below"
              className="mt-4 inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium disabled:opacity-50">
              <Plus className="size-4" /> {busy === 'filing' ? 'Creating…' : 'Create Filing'}
            </button>
          </form>
        </div>

        <h2 className="font-display text-lg font-semibold tracking-tight mt-8 mb-3">Filings</h2>
        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr className={headRow}>
              <th className={thCls}>Period</th>
              <th className={thCls}>Dates</th>
              <th className={`${thCls} text-right`}>Taxable Sales</th>
              <th className={`${thCls} text-right`}>Tax Collected</th>
              <th className={`${thCls} text-right`}>Tax Remitted</th>
              <th className={thCls}>Status</th>
              <th className="p-3 text-center">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={7} className="text-center text-muted-foreground">Loading filings…</td></tr>
              ) : filings.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-muted-foreground">No filings yet. Prepare one from the register above or create it with the form.</td></tr>
              ) : filings.map((f) => (
                <tr key={f.id} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border font-semibold">{f.period_label || '—'}{f.confirmation_ref ? <div className="text-[11px] font-normal text-muted-foreground">conf {f.confirmation_ref}</div> : null}</td>
                  <td className="p-3 border-r border-border tabular-nums">{f.period_start || '—'} → {f.period_end || '—'}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{fmt(f.taxable_sales)}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{fmt(f.tax_collected)}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{fmt(f.tax_remitted)}</td>
                  <td className="p-3 border-r border-border">{f.status}</td>
                  <td className="p-3 text-center whitespace-nowrap">
                    {f.status === 'draft' && (
                      <button type="button" disabled={busy === f.id} onClick={() => fileFiling(f)} data-tip="Marks this filing as filed with the agency and records the collected tax as remitted"
                        className="text-[12px] underline disabled:opacity-50">File Return</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>

        {rules.length > 0 && (
          <>
            <h2 className="font-display text-lg font-semibold tracking-tight mt-8 mb-3">Tax Rules</h2>
            <div className="border border-border rounded-xl overflow-x-auto bg-card">
              <div className="adm-table-wrap"><table className="adm-table">
                <thead><tr className={headRow}>
                  <th className={thCls}>Jurisdiction</th>
                  <th className={thCls}>State</th>
                  <th className={thCls}>Type</th>
                  <th className={`${thCls} text-right`}>Rate</th>
                  <th className={thCls}>Classification</th>
                  <th className="p-3">Auto-Calc</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {rules.map((r) => (
                    <tr key={r.id} className="hover:bg-accent/50">
                      <td className="p-3 border-r border-border font-medium">{r.jurisdiction}</td>
                      <td className="p-3 border-r border-border">{r.state_code}</td>
                      <td className="p-3 border-r border-border text-muted-foreground">{r.tax_type}</td>
                      <td className="p-3 border-r border-border text-right tabular-nums">{r.rate}%</td>
                      <td className="p-3 border-r border-border text-muted-foreground">{r.classification}</td>
                      <td className="p-3">{r.auto_calc ? 'On' : 'Off'}{!r.is_active ? ' · inactive' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
