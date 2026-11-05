'use client';

import React, { useEffect, useState } from 'react';
import { DawgNavSection } from '@/lib/types';
import { useViewTaxForms } from '@/hooks/admin/useActions';

interface TaxesViewProps {
  onNavigateSection?: (section: DawgNavSection) => void;
}

type TaxRule = {
  id: string; jurisdiction: string; tax_type: string; state_code: string;
  rate: number; tax_code: string | null; classification: string; auto_calc: boolean;
};

// ============================================================================
// TaxesView — 3.12 Taxes. Rates come from acct_tax_rules via /api/admin/taxes.
// Audit 3.11 fix: was hardcoded Oklahoma jurisdictions; now Tennessee
// (Memphis / Shelby County, 9.25% combined — matches the POS register).
// ============================================================================

export const TaxesView: React.FC<TaxesViewProps> = ({ onNavigateSection }) => {
  const [taxRules, setTaxRules] = useState<TaxRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newRule, setNewRule] = useState({
    jurisdiction: '', type: 'STATE_SALES_TAX', stateCode: 'TN',
    rate: '7.0', code: '', class: 'ALL_SALES',
  });

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/admin/taxes/rules', { cache: 'no-store' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to load');
      setTaxRules(d.rules || []);
      setTableMissing(!!d.tableMissing);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRule.jurisdiction.trim()) { setError('Jurisdiction is required.'); return; }
    try {
      const res = await fetch('/api/admin/taxes/rules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jurisdiction: newRule.jurisdiction.trim(),
          tax_type: newRule.type,
          state_code: newRule.stateCode.trim().toUpperCase() || 'TN',
          rate: parseFloat(newRule.rate) || 0,
          tax_code: newRule.code.trim() || null,
          classification: newRule.class,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to add');
      setTaxRules((prev) => [...prev, d.rule]);
      setNewRule({ jurisdiction: '', type: 'STATE_SALES_TAX', stateCode: 'TN', rate: '7.0', code: '', class: 'ALL_SALES' });
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to add'); }
  };

  const handleDeleteRule = async (id: string) => {
    if (!window.confirm('Deactivate this tax rule?')) return;
    try {
      const res = await fetch(`/api/admin/taxes/rules/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      setTaxRules((prev) => prev.filter((r) => r.id !== id));
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to delete'); }
  };

  const combinedRate = taxRules.reduce((s, r) => s + Number(r.rate || 0), 0);

  return (
    <div className="flex flex-col w-full text-foreground bg-card select-text">
      <div className="w-full bg-muted/40 border-b border-border px-4 py-2 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-black inline-block"></span>
          <span className="font-medium text-[11px] text-muted-foreground">Taxes &amp; Jurisdictions</span>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
          <span>COMBINED RATE: {combinedRate.toFixed(3)}%</span>
        </div>
      </div>

      <div className="p-6 border-b border-border">
        <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">Taxes &amp; Rules</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5 max-w-3xl">
          Tax jurisdictions for Memphis, TN. Rates are stored in the database and applied at checkout —
          change them here, no code deploy needed.
        </p>
      </div>

      {error && <p className="px-6 pt-4 text-[12px] text-destructive">{error}</p>}
      {tableMissing && (
        <p className="mx-6 mt-4 text-[12px] text-warning bg-warning/10 border border-warning/20 rounded-lg px-3 py-2">
          Tax rules table not set up yet — run <code>tax-rules-schema.sql</code> from the docs library, then reload.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-border">
        <div className="lg:col-span-8 p-6 space-y-6">
          <div className="border border-border">
            <div className="bg-muted/40 border-b border-border px-4 py-2 flex items-center justify-between">
              <span className="text-[12px] font-semibold text-foreground uppercase">Active Tax Rules &amp; Jurisdictions</span>
              <span className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 font-semibold uppercase">
                {taxRules.length} active
              </span>
            </div>
            {loading ? (
              <p className="p-8 text-center text-muted-foreground text-[13px]">Loading tax rules…</p>
            ) : taxRules.length === 0 ? (
              <p className="p-12 text-center text-muted-foreground text-[13px]">
                No tax rules configured. Add Tennessee / Shelby County rates using the form.
              </p>
            ) : (
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left text-[13px] text-foreground border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 font-semibold">
                      <th className="p-3 border-r border-border uppercase">Jurisdiction</th>
                      <th className="p-3 border-r border-border uppercase">Tax Type</th>
                      <th className="p-3 border-r border-border uppercase">State</th>
                      <th className="p-3 border-r border-border uppercase text-right">Rate</th>
                      <th className="p-3 border-r border-border uppercase">Tax Code</th>
                      <th className="p-3 border-r border-border uppercase">Classification</th>
                      <th className="p-3 text-center uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-card">
                    {taxRules.map((r) => (
                      <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3 border-r border-border font-semibold">{r.jurisdiction}</td>
                        <td className="p-3 border-r border-border text-muted-foreground">{r.tax_type.replace(/_/g, ' ')}</td>
                        <td className="p-3 border-r border-border font-semibold">{r.state_code}</td>
                        <td className="p-3 border-r border-border text-right font-semibold tabular-nums">{Number(r.rate).toFixed(3)}%</td>
                        <td className="p-3 border-r border-border text-muted-foreground/70">{r.tax_code || '—'}</td>
                        <td className="p-3 border-r border-border text-muted-foreground">{r.classification.replace(/_/g, ' ')}</td>
                        <td className="p-3 text-center">
                          <button onClick={() => handleDeleteRule(r.id)}
                            className="hover:border-brand-teal/60 hover:bg-brand-teal/5 hover:text-brand-teal text-foreground border border-border px-2 py-0.5 text-[11px] font-semibold transition-colors cursor-pointer">
                            DEACTIVATE
                          </button>
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-muted/40 font-semibold">
                      <td colSpan={3} className="p-3 border-r border-border text-right uppercase text-[11px]">Combined</td>
                      <td className="p-3 border-r border-border text-right tabular-nums">{combinedRate.toFixed(3)}%</td>
                      <td colSpan={3} className="p-3 text-[11px] text-muted-foreground">Matches the POS register rate</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-4 p-6 bg-muted/30">
          <form onSubmit={handleAddRule} className="border border-border bg-card p-6 space-y-4">
            <div className="border-b border-border pb-3">
              <span className="text-[10px] text-muted-foreground/70 uppercase">Tax Rule // Config</span>
              <h3 className="text-sm font-semibold mt-0.5 text-foreground">Add Tax Jurisdiction</h3>
            </div>
            <div className="space-y-3 text-[12px]">
              <div>
                <label className="block text-[10px] text-muted-foreground mb-1 uppercase">Jurisdiction *</label>
                <input required value={newRule.jurisdiction}
                  onChange={(e) => setNewRule((p) => ({ ...p, jurisdiction: e.target.value }))}
                  className="w-full bg-card border border-border px-3 py-2 text-[13px] rounded-lg focus:outline-none"
                  placeholder="e.g. Shelby County" type="text" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1 uppercase">State *</label>
                  <input required value={newRule.stateCode}
                    onChange={(e) => setNewRule((p) => ({ ...p, stateCode: e.target.value }))}
                    className="w-full bg-card border border-border px-3 py-2 text-[13px] rounded-lg focus:outline-none"
                    placeholder="TN" type="text" maxLength={4} />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1 uppercase">Rate % *</label>
                  <input required value={newRule.rate}
                    onChange={(e) => setNewRule((p) => ({ ...p, rate: e.target.value }))}
                    className="w-full bg-card border border-border px-3 py-2 text-[13px] rounded-lg focus:outline-none"
                    placeholder="2.25" type="number" step="0.001" min="0" max="100" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1 uppercase">Tax Code</label>
                  <input value={newRule.code}
                    onChange={(e) => setNewRule((p) => ({ ...p, code: e.target.value }))}
                    className="w-full bg-card border border-border px-3 py-2 text-[13px] rounded-lg focus:outline-none"
                    placeholder="SYS_TAX_TN_…" type="text" />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1 uppercase">Classification</label>
                  <select value={newRule.class}
                    onChange={(e) => setNewRule((p) => ({ ...p, class: e.target.value }))}
                    className="w-full bg-card border border-border px-2 py-2 text-[13px] rounded-lg cursor-pointer">
                    <option value="ALL_SALES">ALL SALES</option>
                    <option value="GROOM_SERVICES_ONLY">GROOM SERVICES ONLY</option>
                    <option value="RETAIL_GOODS_ONLY">RETAIL GOODS ONLY</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-muted-foreground mb-1 uppercase">Tax Type</label>
                <select value={newRule.type}
                  onChange={(e) => setNewRule((p) => ({ ...p, type: e.target.value }))}
                  className="w-full bg-card border border-border px-2 py-2 text-[13px] rounded-lg cursor-pointer">
                  <option value="STATE_SALES_TAX">STATE SALES TAX</option>
                  <option value="COUNTY_SALES_TAX">COUNTY SALES TAX</option>
                  <option value="CITY_SALES_TAX">CITY SALES TAX</option>
                </select>
              </div>
            </div>
            <div className="pt-4 border-t border-border">
              <button type="submit"
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2.5 text-[12px] uppercase font-semibold tracking-wider transition-colors cursor-pointer rounded-lg">
                Add Tax Rule
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* STRIPE TAX — the shop checkout's tax engine: status +
          registrations from Stripe, collections from our own paid
          orders' tax records (/api/admin/taxes/stripe). */}
      <StripeTaxPanel />

      {/* TAX FORMS — payroll_tax_forms via fin_view_tax_forms (the forms
          themselves are produced by the payroll engine, BL-3). Sellers'
          1099-Ks are issued by Stripe for Connect payouts. */}
      <TaxFormsPanel />
    </div>
  );
};

type StripeTaxSummary = {
  configured: boolean;
  status: string | null;
  provider: string | null;
  taxBehavior: string | null;
  defaultTaxCode: string | null;
  headOffice: { line1: string; city: string; state: string; postalCode: string; country: string } | null;
  registrations: { id: string; country: string; state: string | null; type: string | null; activeFrom: string | null; expiresAt: string | null }[];
  collectedByState: { state: string; taxCents: number; orders: number }[];
  collectedTotalCents: number;
  ordersWithTaxRecord: number;
  ordersWithTransaction: number;
};

const fmtCents = (c: number) => `$${(c / 100).toFixed(2)}`;

const StripeTaxPanel: React.FC = () => {
  const [summary, setSummary] = useState<StripeTaxSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/taxes/stripe', { cache: 'no-store' });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Failed to load');
        setSummary(d as StripeTaxSummary);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed to load');
      }
    })();
  }, []);

  return (
    <div className="border border-border bg-card p-6 shadow-card-md space-y-4">
      <div className="border-b border-border pb-3">
        <span className="font-medium text-[11px] uppercase tracking-wider text-muted-foreground">Checkout Tax Engine</span>
        <h3 className="font-display text-md font-semibold tracking-tight text-foreground mt-0.5">Stripe Tax — Shop Checkout</h3>
        <p className="text-[11px] text-muted-foreground mt-1 max-w-3xl">
          Sales tax on shop orders is calculated by Stripe Tax at quote time, against the customer&apos;s delivery
          address (pickup orders at the head-office address), and recorded per order for filing. The rules above
          govern the POS register only. Registrations are legal filings — they are created in Stripe as nexus
          accrues in a state, and Stripe Tax collects only where a registration is active.
        </p>
      </div>
      {err && <p className="text-[12px] text-destructive">{err}</p>}
      {summary === null && !err ? (
        <p className="text-[12px] text-muted-foreground">Loading Stripe Tax status…</p>
      ) : summary && !summary.configured ? (
        <p className="text-[12px] text-muted-foreground">Stripe is not configured — checkout tax cannot be calculated until the Stripe keys are set.</p>
      ) : summary ? (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-[12px]">
            <span>Status: <strong className="uppercase">{summary.status || '—'}</strong></span>
            <span>Behavior: <strong className="uppercase">{summary.taxBehavior || '—'}</strong>
              <span className="text-muted-foreground"> (prices {summary.taxBehavior === 'exclusive' ? 'exclude tax; it is added at checkout' : 'include tax'})</span></span>
            <span>Default tax code: <strong>{summary.defaultTaxCode || '—'}</strong></span>
            <span>Head office: <strong>{summary.headOffice ? `${summary.headOffice.city}, ${summary.headOffice.state} ${summary.headOffice.postalCode}` : '—'}</strong></span>
            <span>Collected to date: <strong>{fmtCents(summary.collectedTotalCents)}</strong>
              <span className="text-muted-foreground"> across {summary.ordersWithTaxRecord} taxed order{summary.ordersWithTaxRecord === 1 ? '' : 's'} ({summary.ordersWithTransaction} with a filing transaction)</span></span>
          </div>

          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Registrations</h4>
            {summary.registrations.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">No Stripe Tax registrations yet — tax is collected nowhere until the first registration is created in Stripe.</p>
            ) : (
              <div className="overflow-x-auto border border-border">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-muted/40 text-left">
                      <th className="p-3 border-r border-border">Jurisdiction</th>
                      <th className="p-3 border-r border-border">Type</th>
                      <th className="p-3 border-r border-border">Active From</th>
                      <th className="p-3">Expires</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.registrations.map((r) => (
                      <tr key={r.id} className="border-t border-border">
                        <td className="p-3 border-r border-border font-semibold">{r.state ? `${r.state} · ` : ''}{r.country}</td>
                        <td className="p-3 border-r border-border">{(r.type || '—').replace(/_/g, ' ')}</td>
                        <td className="p-3 border-r border-border tabular-nums">{r.activeFrom ? new Date(r.activeFrom).toLocaleDateString() : '—'}</td>
                        <td className="p-3 tabular-nums">{r.expiresAt ? new Date(r.expiresAt).toLocaleDateString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Collected by State (paid orders)</h4>
            {summary.collectedByState.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">No tax collected yet — per-state totals appear here as taxed orders are paid.</p>
            ) : (
              <div className="overflow-x-auto border border-border">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-muted/40 text-left">
                      <th className="p-3 border-r border-border">State</th>
                      <th className="p-3 border-r border-border text-right">Tax Collected</th>
                      <th className="p-3 text-right">Orders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.collectedByState.map((s) => (
                      <tr key={s.state} className="border-t border-border">
                        <td className="p-3 border-r border-border font-semibold">{s.state}</td>
                        <td className="p-3 border-r border-border text-right tabular-nums">{fmtCents(s.taxCents)}</td>
                        <td className="p-3 text-right tabular-nums">{s.orders}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

type TaxFormRow = { id: string; formType: string; year: string; quarter: string | null; status: string; filedAt: string | null; payload: unknown; createdAt: string };

const TaxFormsPanel: React.FC = () => {
  const viewTaxForms = useViewTaxForms();
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [forms, setForms] = useState<TaxFormRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setErr(null);
    try {
      const d = await viewTaxForms.mutateAsync({ year: year ? Number(year) : undefined });
      setForms(((d as { taxForms?: TaxFormRow[] })?.taxForms) || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load tax forms');
    }
  };

  const download = (f: TaxFormRow) => {
    const blob = new Blob([JSON.stringify(f.payload ?? {}, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${f.formType}-${f.year}${f.quarter ? `-Q${f.quarter}` : ''}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="border border-border bg-card p-6 shadow-card-md space-y-4">
      <div className="border-b border-border pb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="font-medium text-[11px] uppercase tracking-wider text-muted-foreground">Filed Forms</span>
          <h3 className="font-display text-md font-semibold tracking-tight text-foreground mt-0.5">Tax Forms — Payroll Filings</h3>
          <p className="text-[11px] text-muted-foreground mt-1">
            Real filings from payroll_tax_forms. Seller 1099-K forms are issued by Stripe for Connect payouts — see the{' '}
            <a href="/admin/sellers" className="underline">Sellers queue</a> for each seller&apos;s Connect status.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input value={year} onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
            className="w-20 bg-card border border-border px-2 py-1.5 text-[13px] rounded-lg text-center" placeholder="Year" />
          <button onClick={load} disabled={viewTaxForms.isPending}
            className="bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1.5 text-[11px] uppercase font-semibold rounded-lg disabled:opacity-50 cursor-pointer">
            {viewTaxForms.isPending ? 'Loading…' : 'Load Forms'}
          </button>
        </div>
      </div>
      {err && <p className="text-[12px] text-destructive">{err}</p>}
      {forms === null ? (
        <p className="text-[12px] text-muted-foreground">Choose a year and load the filed forms. Nothing is shown until the payroll engine has recorded filings.</p>
      ) : forms.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">No tax forms recorded for {year || 'any year'} yet.</p>
      ) : (
        <div className="overflow-x-auto border border-border">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-muted/40 text-left">
                <th className="p-3 border-r border-border">Form</th>
                <th className="p-3 border-r border-border">Period</th>
                <th className="p-3 border-r border-border">Status</th>
                <th className="p-3 border-r border-border">Filed</th>
                <th className="p-3">Data</th>
              </tr>
            </thead>
            <tbody>
              {forms.map((f) => (
                <tr key={f.id} className="border-t border-border">
                  <td className="p-3 border-r border-border font-semibold">{f.formType}</td>
                  <td className="p-3 border-r border-border tabular-nums">{f.year}{f.quarter ? ` · Q${f.quarter}` : ''}</td>
                  <td className="p-3 border-r border-border uppercase">{f.status}</td>
                  <td className="p-3 border-r border-border tabular-nums">{f.filedAt ? new Date(f.filedAt).toLocaleDateString() : '—'}</td>
                  <td className="p-3">
                    <button onClick={() => download(f)} className="underline text-[11px] cursor-pointer">Download JSON</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
