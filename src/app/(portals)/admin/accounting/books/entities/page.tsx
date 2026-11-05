'use client';

import React, { useEffect, useMemo, useState } from 'react';

// /admin/accounting/books/entities — Entities & Consolidation,
// rebuilt to the owner's spec (entities_consolidation.html):
// corporate entity structure & rollup matrix, the intercompany
// balance & elimination ledger, and consolidation runs with the
// consolidated rollup.
// Data: GET/POST /api/admin/accounting/entities over acct_entities,
// acct_consolidation_groups/members/runs, acct_intercompany_*,
// with per-entity posted totals from acct_journal_entries.

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);

type Entity = {
  id: string; code: string; legal_name: string; display_name: string | null; entity_type: string;
  parent_entity_id: string | null; parent_name: string | null; country_code: string | null;
  tax_identifier: string | null; functional_currency: string; reporting_currency: string | null; is_active: boolean;
};
type Group = { id: string; code: string; name: string; reportingCurrency: string; method: string; members: { entityId: string; name: string; ownershipPercent: number; consolidationPercent: number }[] };
type IcTxn = { id: string; transaction_date: string; from_name: string | null; to_name: string | null; currency: string; amount: number; description: string | null; status: string; elimination_required: boolean };
type Run = { id: string; group_name: string | null; period_name: string | null; status: string; reporting_currency: string; fxAdjustment: number; eliminationAmount: number; created_at: string };
type EntityTotal = { entityId: string; entries: number; totalDebit: number; totalCredit: number };

export default function EntitiesPage() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [intercompany, setIntercompany] = useState<IcTxn[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [totals, setTotals] = useState<EntityTotal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', legalName: '', entityType: 'subsidiary', functionalCurrency: 'USD', parentEntityId: '', countryCode: '', taxIdentifier: '' });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch('/api/admin/accounting/entities', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => {
        setEntities(Array.isArray(d.entities) ? d.entities : []);
        setGroups(Array.isArray(d.groups) ? d.groups : []);
        setIntercompany(Array.isArray(d.intercompany) ? d.intercompany : []);
        setRuns(Array.isArray(d.runs) ? d.runs : []);
        setTotals(Array.isArray(d.entityTotals) ? d.entityTotals : []);
      })
      .catch(() => setError('Entities could not be loaded.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const totalByEntity = useMemo(() => new Map(totals.map((t) => [t.entityId, t])), [totals]);
  const consolidatedDebit = totals.reduce((s, t) => s + t.totalDebit, 0);
  const consolidatedCredit = totals.reduce((s, t) => s + t.totalCredit, 0);
  const icOpen = intercompany.filter((t) => t.status !== 'eliminated').reduce((s, t) => s + t.amount, 0);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const r = await fetch('/api/admin/accounting/entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, parentEntityId: form.parentEntityId || null }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Create failed');
      setForm({ code: '', legalName: '', entityType: 'subsidiary', functionalCurrency: 'USD', parentEntityId: '', countryCode: '', taxIdentifier: '' });
      setNotice(`Entity ${form.legalName} was added and now appears in the structure below.`);
      load();
    } catch (err: any) {
      setError(err?.message || 'The entity could not be created.');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full';
  const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1';
  const thCls = 'bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground';

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Entities &amp; Consolidation</h1>
      </div>

      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mt-4">{error}</div>}

      <h2 className="font-display text-base font-semibold mt-4 mb-2">Corporate Entity Structure &amp; Rollup Matrix</h2>
      <div className="border border-border rounded-xl overflow-x-auto bg-card">
        <div className="adm-table-wrap"><table className="adm-table">
          <thead>
            <tr className={thCls}>
              <th className="p-3 border-r border-border">Entity</th>
              <th className="p-3 border-r border-border">Type</th>
              <th className="p-3 border-r border-border">Parent</th>
              <th className="p-3 border-r border-border">Functional Currency</th>
              <th className="p-3 border-r border-border text-center">Posted Entries</th>
              <th className="p-3 border-r border-border text-right">Posted Debits</th>
              <th className="p-3 text-right">Posted Credits</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={7} className="text-center text-muted-foreground">Loading entities…</td></tr>
            ) : entities.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-muted-foreground">No entities yet. Add the first one with the form below — every book, account and journal entry belongs to an entity.</td></tr>
            ) : entities.map((en) => {
              const t = totalByEntity.get(en.id);
              return (
                <tr key={en.id} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border">
                    <div className="font-medium">{en.legal_name}</div>
                    <div className="text-[11px] text-muted-foreground">{en.code}{en.country_code ? ` · ${en.country_code}` : ''}{en.tax_identifier ? ` · Tax ID ${en.tax_identifier}` : ''}</div>
                  </td>
                  <td className="p-3 border-r border-border text-muted-foreground">{en.entity_type.replace(/_/g, ' ')}</td>
                  <td className="p-3 border-r border-border text-muted-foreground">{en.parent_name || '— (top level)'}</td>
                  <td className="p-3 border-r border-border text-muted-foreground">{en.functional_currency}</td>
                  <td className="p-3 border-r border-border text-center tabular-nums">{t ? t.entries : 0}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{fmt(t ? t.totalDebit : 0)}</td>
                  <td className="p-3 text-right tabular-nums">{fmt(t ? t.totalCredit : 0)}</td>
                </tr>
              );
            })}
            {entities.length > 0 && (
              <tr className="font-semibold">
                <td className="p-3 border-r border-border" colSpan={4}>Consolidated Total (all entities, before eliminations)</td>
                <td className="p-3 border-r border-border text-center tabular-nums">{totals.reduce((s, t) => s + t.entries, 0)}</td>
                <td className="p-3 border-r border-border text-right tabular-nums">{fmt(consolidatedDebit)}</td>
                <td className="p-3 text-right tabular-nums">{fmt(consolidatedCredit)}</td>
              </tr>
            )}
          </tbody>
        </table></div>
      </div>

      <div className="border border-border rounded-xl bg-card mt-4">
        <div className="p-4 border-b border-border">
          <h2 className="font-display text-base font-semibold">Add Subsidiary Entity</h2>
          <p className="text-[13px] text-muted-foreground mt-1">A new company under an existing parent (or a new top-level entity). Its books open under the same tenant.</p>
        </div>
        <form onSubmit={create} className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className={labelCls}>Entity Code</label>
            <input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="US-OPS" className={inputCls} />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Legal Name</label>
            <input required value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} placeholder="Unsaid EU B.V." className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Entity Type</label>
            <select value={form.entityType} onChange={(e) => setForm({ ...form, entityType: e.target.value })} className={inputCls}>
              <option value="legal_entity">Legal entity</option>
              <option value="subsidiary">Subsidiary</option>
              <option value="branch">Branch</option>
              <option value="division">Division</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Parent Entity</label>
            <select value={form.parentEntityId} onChange={(e) => setForm({ ...form, parentEntityId: e.target.value })} className={inputCls}>
              <option value="">— Top level —</option>
              {entities.map((en) => <option key={en.id} value={en.id}>{en.legal_name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Functional Currency</label>
            <input required value={form.functionalCurrency} onChange={(e) => setForm({ ...form, functionalCurrency: e.target.value.toUpperCase().slice(0, 3) })} placeholder="USD" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Country Code</label>
            <input value={form.countryCode} onChange={(e) => setForm({ ...form, countryCode: e.target.value.toUpperCase().slice(0, 2) })} placeholder="US" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Tax Identifier</label>
            <input value={form.taxIdentifier} onChange={(e) => setForm({ ...form, taxIdentifier: e.target.value })} placeholder="EIN / VAT #" className={inputCls} />
          </div>
          <div className="md:col-span-4 flex items-center gap-3">
            <button type="submit" disabled={saving} className="rounded-lg px-4 h-9 text-[13px] font-medium text-white disabled:opacity-60" style={{ backgroundColor: '#7258e8' }} data-tip="Add this entity to the corporate structure">
              {saving ? 'Adding…' : 'Add Subsidiary Entity'}
            </button>
            {notice && <span className="text-[13px] text-foreground">{notice}</span>}
          </div>
        </form>
      </div>

      <h2 className="font-display text-base font-semibold mt-6 mb-2">Intercompany Balance &amp; Elimination Ledger</h2>
      <div className="border border-border rounded-xl overflow-x-auto bg-card">
        <div className="adm-table-wrap"><table className="adm-table">
          <thead>
            <tr className={thCls}>
              <th className="p-3 border-r border-border">Date</th>
              <th className="p-3 border-r border-border">From Entity</th>
              <th className="p-3 border-r border-border">To Entity</th>
              <th className="p-3 border-r border-border">Description</th>
              <th className="p-3 border-r border-border text-right">Amount</th>
              <th className="p-3 border-r border-border text-center">Elimination</th>
              <th className="p-3 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={7} className="text-center text-muted-foreground">Loading intercompany activity…</td></tr>
            ) : intercompany.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-muted-foreground">No intercompany transactions yet. When one entity charges or lends to another, the transaction lands here so it can be eliminated in consolidation instead of double-counted.</td></tr>
            ) : intercompany.map((t) => (
              <tr key={t.id} className="hover:bg-accent/50">
                <td className="p-3 border-r border-border text-muted-foreground">{t.transaction_date}</td>
                <td className="p-3 border-r border-border">{t.from_name || '—'}</td>
                <td className="p-3 border-r border-border">{t.to_name || '—'}</td>
                <td className="p-3 border-r border-border text-muted-foreground">{t.description || '—'}</td>
                <td className="p-3 border-r border-border text-right tabular-nums">{t.currency} {fmt(t.amount)}</td>
                <td className="p-3 border-r border-border text-center">{t.elimination_required ? 'Required' : '—'}</td>
                <td className="p-3 text-center">{t.status}</td>
              </tr>
            ))}
            {intercompany.length > 0 && (
              <tr className="font-semibold">
                <td className="p-3 border-r border-border" colSpan={4}>Open intercompany balance (not yet eliminated)</td>
                <td className="p-3 border-r border-border text-right tabular-nums">{fmt(icOpen)}</td>
                <td className="p-3 border-r border-border" colSpan={2} />
              </tr>
            )}
          </tbody>
        </table></div>
      </div>

      <h2 className="font-display text-base font-semibold mt-6 mb-2">Consolidation Groups &amp; Run History</h2>
      <div className="border border-border rounded-xl overflow-x-auto bg-card">
        <div className="adm-table-wrap"><table className="adm-table">
          <thead>
            <tr className={thCls}>
              <th className="p-3 border-r border-border">Group / Run</th>
              <th className="p-3 border-r border-border">Members / Period</th>
              <th className="p-3 border-r border-border text-center">Status</th>
              <th className="p-3 border-r border-border text-right">FX Adjustment</th>
              <th className="p-3 text-right">Eliminations</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={5} className="text-center text-muted-foreground">Loading consolidation data…</td></tr>
            ) : groups.length === 0 && runs.length === 0 ? (
              <tr><td colSpan={5} className="text-center text-muted-foreground">No consolidation groups or runs yet. A group collects the entities that report together; each run freezes one period&apos;s consolidated numbers, with its currency adjustments and eliminations recorded here.</td></tr>
            ) : (
              <>
                {groups.map((g) => (
                  <tr key={g.id} className="hover:bg-accent/50">
                    <td className="p-3 border-r border-border">
                      <div className="font-medium">{g.name}</div>
                      <div className="text-[11px] text-muted-foreground">{g.code} · {g.method} consolidation · reports in {g.reportingCurrency}</div>
                    </td>
                    <td className="p-3 border-r border-border text-muted-foreground">
                      {g.members.length === 0 ? 'No members yet' : g.members.map((m) => `${m.name} (${m.consolidationPercent}%)`).join(', ')}
                    </td>
                    <td className="p-3 border-r border-border text-center">Group</td>
                    <td className="p-3 border-r border-border text-right tabular-nums">—</td>
                    <td className="p-3 text-right tabular-nums">—</td>
                  </tr>
                ))}
                {runs.map((r) => (
                  <tr key={r.id} className="hover:bg-accent/50">
                    <td className="p-3 border-r border-border">
                      <div className="font-medium">Run — {r.group_name || 'Group'}</div>
                      <div className="text-[11px] text-muted-foreground">{r.created_at.slice(0, 10)} · {r.reporting_currency}</div>
                    </td>
                    <td className="p-3 border-r border-border text-muted-foreground">{r.period_name || '—'}</td>
                    <td className="p-3 border-r border-border text-center">{r.status}</td>
                    <td className="p-3 border-r border-border text-right tabular-nums">{fmt(r.fxAdjustment)}</td>
                    <td className="p-3 text-right tabular-nums">{fmt(r.eliminationAmount)}</td>
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
