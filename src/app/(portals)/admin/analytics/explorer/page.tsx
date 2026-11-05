'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bookmark, Play, Save, Download, Trash2 } from 'lucide-react';
import { ViewHeader, money } from '@/components/admin/ViewHeader';

// /admin/analytics/explorer — Analytics Explorer (owner's
// DASHBOARD_VIEW.html, View 4). This view IS the page (owner's verdict,
// 2026-11-02: his file replaces the presentation — the legacy
// AnalyticsExplorerView machinery is no longer mounted on this route;
// its file stays on disk). The Dimension Builder composes a governed
// SELECT over the order ledger (erp_orders) and runs it through the
// explorer API (POST action 'run' — read-only transaction, 5s timeout,
// 500-row cap, governance-trailed). Like the shipped tool's own
// default query, builder SQL runs under the explorer's operator gate
// without a tenant filter. The mock's breakdown options (supplier /
// category / segment) are not offered: erp_orders carries no such
// attribution — see gap list #5. Saved Queries live in the panel at
// the foot of this view, fed by the same explorer API (list /
// run_saved / delete). Export CSV is generated from the returned
// rows, client-side.

type SavedQuery = { id: string; name: string; sql: string; schedule: string | null; createdAt: string };

type Any = Record<string, any>;

const METRICS: Record<string, { label: string; expr: string; money: boolean }> = {
  revenue: { label: 'Net Revenue', expr: 'COALESCE(SUM(total), 0)', money: true },
  volume: { label: 'Order Volume', expr: 'COUNT(*)', money: false },
  aov: { label: 'Average Order Value', expr: 'COALESCE(AVG(total), 0)', money: true },
  refunds: { label: 'Refunded Amount', expr: 'COALESCE(SUM(amount_refunded), 0)', money: true },
};
const BREAKDOWNS: Record<string, { label: string; select: string | null; group: string | null }> = {
  none: { label: 'No breakdown (total)', select: null, group: null },
  status: { label: 'Order Status', select: 'status', group: 'status' },
  fulfillment: { label: 'Fulfillment Method', select: 'fulfillment_method', group: 'fulfillment_method' },
  day: { label: 'Day', select: "to_char(order_date, 'YYYY-MM-DD')", group: "to_char(order_date, 'YYYY-MM-DD')" },
  month: { label: 'Month', select: "to_char(order_date, 'YYYY-MM')", group: "to_char(order_date, 'YYYY-MM')" },
};
const RANGES: Record<string, { label: string; where: string }> = {
  d90: { label: 'Trailing 90 Days', where: "order_date >= now() - interval '90 days'" },
  mtd: { label: 'Month to Date', where: "order_date >= date_trunc('month', now())" },
  d30: { label: 'Trailing 30 Days', where: "order_date >= now() - interval '30 days'" },
  d365: { label: 'Trailing 365 Days', where: "order_date >= now() - interval '365 days'" },
};

function buildSql(metric: string, breakdown: string, range: string): string {
  const m = METRICS[metric];
  const b = BREAKDOWNS[breakdown];
  const w = RANGES[range].where;
  if (!b.select) return `SELECT ${m.expr} AS value FROM erp_orders WHERE ${w}`;
  return `SELECT ${b.select} AS bucket, ${m.expr} AS value FROM erp_orders WHERE ${w} GROUP BY ${b.group} ORDER BY ${b.group}`;
}

export default function AnalyticsExplorerPage() {
  const [metric, setMetric] = useState('revenue');
  const [breakdown, setBreakdown] = useState('status');
  const [range, setRange] = useState('d90');
  const [chart, setChart] = useState<'table' | 'bar' | 'area'>('table');
  const [result, setResult] = useState<Any | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<SavedQuery[]>([]);
  const [saveName, setSaveName] = useState('');
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const sql = useMemo(() => buildSql(metric, breakdown, range), [metric, breakdown, range]);

  const loadSaved = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/analytics/explorer', { cache: 'no-store' });
      const j = await r.json();
      if (Array.isArray(j.savedQueries)) setSaved(j.savedQueries);
    } catch { /* the panel renders its empty state */ }
  }, []);

  useEffect(() => { loadSaved(); }, [loadSaved]);

  const run = useCallback(async () => {
    setBusy(true); setRunError(null); setResult(null); setSaveMsg(null);
    try {
      const res = await fetch('/api/admin/analytics/explorer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run', sql }),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setResult(res);
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'Query failed');
    } finally { setBusy(false); }
  }, [sql]);

  const saveView = async () => {
    if (!saveName.trim()) { setSaveMsg('Name the view first.'); return; }
    setSaveMsg(null);
    try {
      const res = await fetch('/api/admin/analytics/explorer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', name: saveName.trim(), sql, schedule: null }),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setSaveMsg('Saved — it now appears in the saved queries below.');
      setSaveName('');
      await loadSaved();
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : 'Save failed');
    }
  };

  const runSaved = async (q: SavedQuery) => {
    setBusy(true); setRunError(null); setResult(null); setSavedMsg(null);
    try {
      const res = await fetch('/api/admin/analytics/explorer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run_saved', id: q.id }),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setResult(res);
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'Query failed');
    } finally { setBusy(false); }
  };

  const deleteSaved = async (q: SavedQuery) => {
    setSavedMsg(null);
    try {
      const res = await fetch('/api/admin/analytics/explorer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id: q.id }),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setSavedMsg(`Deleted “${q.name}”.`);
      await loadSaved();
    } catch (e) {
      setSavedMsg(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const exportCsv = () => {
    if (!result?.rows?.length) return;
    const cols: string[] = result.columns ?? Object.keys(result.rows[0]);
    const csv = [cols.join(','), ...result.rows.map((r: Any) => cols.map((c) => JSON.stringify(r[c] ?? '')).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'analytics-explorer-result.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const fmtVal = (v: unknown) => (METRICS[metric].money ? money(v) : Number(v ?? 0).toLocaleString());
  const rows: Any[] = result?.rows ?? [];
  const maxVal = Math.max(1, ...rows.map((r) => Number(r.value ?? 0)));
  const isTime = breakdown === 'day' || breakdown === 'month';

  const selectCls = 'w-full h-9 px-3 bg-muted/40 border border-border rounded text-sm text-foreground focus:outline-none';

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1400px] mx-auto p-8">
      <ViewHeader title="Analytics Explorer">
        <a href="#saved-queries" className="px-3 py-1.5 bg-card border border-border rounded-md text-sm font-semibold hover:bg-muted/50 inline-flex items-center gap-1">
          <Bookmark size={16} /> Saved Queries ({saved.length})
        </a>
        <button type="button" onClick={run} disabled={busy} className="px-4 py-1.5 rounded-md text-sm font-semibold text-white shadow-sm inline-flex items-center gap-1 disabled:opacity-60" style={{ backgroundColor: '#171420' }}>
          <Play size={16} /> {busy ? 'Running…' : 'Run Query'}
        </button>
      </ViewHeader>

      {/* Dimension Builder */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col gap-4">
        <span className="text-xs font-bold uppercase tracking-wider">Dimension Builder &amp; Filters</span>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1" htmlFor="ex-metric">Primary Metric</label>
            <select id="ex-metric" className={selectCls} value={metric} onChange={(e) => setMetric(e.target.value)}>
              {Object.entries(METRICS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1" htmlFor="ex-breakdown">Breakdown By (Group)</label>
            <select id="ex-breakdown" className={selectCls} value={breakdown} onChange={(e) => setBreakdown(e.target.value)}>
              {Object.entries(BREAKDOWNS).map(([k, b]) => <option key={k} value={k}>{b.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1" htmlFor="ex-range">Date Range</label>
            <select id="ex-range" className={selectCls} value={range} onChange={(e) => setRange(e.target.value)}>
              {Object.entries(RANGES).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1" htmlFor="ex-chart">Output Chart Type</label>
            <select id="ex-chart" className={selectCls} value={chart} onChange={(e) => setChart(e.target.value as typeof chart)}>
              <option value="table">Tabular Matrix</option>
              <option value="bar">Stacked Bar Chart</option>
              <option value="area">Time-Series Area</option>
            </select>
          </div>
        </div>
        <pre className="text-[11px] bg-muted/40 rounded p-2 overflow-auto">{sql}</pre>
      </div>

      {/* Result */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border bg-muted/30 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">Query Result: {METRICS[metric].label} by {BREAKDOWNS[breakdown].label}</span>
            {result ? (
              <span className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground font-mono">
                {rows.length} rows returned ({result.ms}ms){result.truncated ? ' — truncated at cap' : ''}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Save as…" className="h-8 px-2 border border-border rounded text-xs bg-card" />
            <button type="button" onClick={saveView} className="text-xs font-semibold hover:underline inline-flex items-center gap-1" style={{ color: '#0077c5' }}>
              <Save size={14} /> Save this view
            </button>
            <button type="button" onClick={exportCsv} disabled={rows.length === 0} className="text-xs font-semibold hover:underline inline-flex items-center gap-1 disabled:opacity-50" style={{ color: '#0077c5' }}>
              <Download size={14} /> Export CSV
            </button>
          </div>
        </div>
        {saveMsg ? <p className="px-5 py-2 text-xs border-b border-border">{saveMsg}</p> : null}
        {runError ? (
          <p className="px-5 py-4 text-[13px]" style={{ color: '#b3261e' }}>{runError}</p>
        ) : !result ? (
          <p className="px-5 py-4 text-[13px] text-muted-foreground">Pick a metric and breakdown, then Run Query — results land here, executed through the governed read-only gate.</p>
        ) : (
          <>
            {chart !== 'table' && isTime && rows.length > 1 ? (
              <div className="px-5 pt-4">
                {chart === 'bar' ? (
                  <div className="flex items-end gap-1 h-32 border-b border-border">
                    {rows.map((r, i) => (
                      <div key={i} title={`${r.bucket}: ${fmtVal(r.value)}`} className="flex-1 rounded-t" style={{ height: `${Math.max(2, (Number(r.value ?? 0) / maxVal) * 100)}%`, backgroundColor: '#0a6400' }} />
                    ))}
                  </div>
                ) : (
                  <svg viewBox={`0 0 ${rows.length * 10} 100`} preserveAspectRatio="none" className="w-full h-32 border-b border-border">
                    <polygon
                      fill="#0a6400" opacity="0.25"
                      points={`0,100 ${rows.map((r, i) => `${i * 10 + 5},${100 - (Number(r.value ?? 0) / maxVal) * 96}`).join(' ')} ${(rows.length - 1) * 10 + 5},100`}
                    />
                    <polyline
                      fill="none" stroke="#0a6400" strokeWidth="1.5"
                      points={rows.map((r, i) => `${i * 10 + 5},${100 - (Number(r.value ?? 0) / maxVal) * 96}`).join(' ')}
                    />
                  </svg>
                )}
              </div>
            ) : null}
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 font-semibold text-muted-foreground uppercase text-xs">
                <tr>
                  <th className="px-5 py-3">{breakdown === 'none' ? 'Scope' : BREAKDOWNS[breakdown].label}</th>
                  <th className="px-5 py-3 text-right">{METRICS[metric].label}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-sm">
                {rows.length === 0 ? (
                  <tr><td colSpan={2} className="px-5 py-4 text-[13px] text-muted-foreground">The query returned no rows for this range.</td></tr>
                ) : (
                  rows.map((r, i) => (
                    <tr key={i} className="hover:bg-muted/40">
                      <td className="px-5 py-3 font-semibold">{r.bucket != null ? String(r.bucket) : 'All orders'}</td>
                      <td className="px-5 py-3 text-right font-mono text-xs font-bold">{fmtVal(r.value)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* Saved Queries — the explorer API's own definitions list, inside
          this view (the legacy explorer machinery that used to render
          below the fold is unmounted). While the definitions store
          (seller_report_definitions) does not exist, the API fail-softs
          to an empty list and saving cannot land — gap list #4. */}
      <div id="saved-queries" className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border bg-muted/30 flex items-center justify-between">
          <span className="font-semibold text-sm">Saved Queries</span>
          <span className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground font-mono">{saved.length} saved</span>
        </div>
        {savedMsg ? <p className="px-5 py-2 text-xs border-b border-border">{savedMsg}</p> : null}
        <div className="divide-y divide-border text-sm">
          {saved.length === 0 ? (
            <p className="px-5 py-4 text-[13px] text-muted-foreground">
              No saved queries yet. Compose a query above, name it, and choose “Save this view” — saved
              queries appear here with run and delete. (Saving needs the definitions store, which does
              not exist in this database yet — gap list #4.)
            </p>
          ) : (
            saved.map((q) => (
              <div key={q.id} className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-muted/40">
                <div className="min-w-0">
                  <span className="font-semibold block truncate">{q.name}</span>
                  <p className="text-xs text-muted-foreground font-mono truncate">{q.sql}</p>
                  <p className="text-xs text-muted-foreground">
                    Saved {new Date(q.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {q.schedule ? ` · Scheduled: ${q.schedule}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => runSaved(q)}
                    disabled={busy}
                    className="px-3 py-1 bg-card border border-border rounded text-xs font-semibold hover:bg-[#171420] hover:text-white inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    <Play size={12} /> Run now
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteSaved(q)}
                    className="px-3 py-1 bg-card border border-border rounded text-xs font-semibold hover:bg-muted/50 inline-flex items-center gap-1"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
