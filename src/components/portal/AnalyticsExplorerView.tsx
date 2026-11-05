'use client';

// ============================================================================
// AnalyticsExplorerView — Admin tree I4 · NL→SQL EXPLORER, mounted at
// /admin/analytics/explorer. The governed surface over
// /api/admin/analytics/explorer:
//   · Query builder — pick a governed table, columns and equality
//     filters; it composes the SELECT (shown, editable before running).
//   · SQL editor — any single read-only SELECT, run inside a read-only
//     transaction with a 5s timeout and a 500-row cap (server-enforced).
//   · Saved queries — stored in the designed report-definitions store
//     (platform-level rows); a daily/weekly SCHEDULE is executed
//     unattended by the analytics-exports cron (runs + CSV downloads
//     listed below), Run-now executes on demand.
//   · Data governance — the enforcement list + the activity_log trail of
//     every run/save/delete, read back from the API.
//   · The NL half: Translate sends the question to the explorer API,
//     which drafts a SELECT through the platform AI provider (the J
//     section's machinery, lib/ai — the call is logged as an AI
//     invocation, feature analytics_nl_sql) and funnels it through the
//     same read-only validator. The draft lands in the editor; only Run
//     executes, through the same walls as hand-written SQL.
// ============================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Compass, Play, Save, Trash2, ShieldCheck } from 'lucide-react';

type Any = Record<string, any>;

export const AnalyticsExplorerView: React.FC = () => {
  const [meta, setMeta] = useState<Any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [nlMsg, setNlMsg] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);

  const translate = async () => {
    if (!question.trim()) { setNlMsg('Type a question first.'); return; }
    setTranslating(true); setNlMsg(null);
    try {
      const res = await fetch('/api/admin/analytics/explorer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'translate', question }),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      if (res.sql) { setSql(res.sql); setNlMsg(res.note || 'Translated — review the SQL in the editor, then Run.'); }
      else setNlMsg(`The draft did not pass the read-only gate: ${res.validationError || 'unknown reason'}. Nothing was placed in the editor.`);
    } catch (e) {
      setNlMsg(e instanceof Error ? e.message : 'Translation failed');
    } finally { setTranslating(false); }
  };
  const [sql, setSql] = useState('SELECT status, count(*) AS orders FROM commerce_orders GROUP BY status ORDER BY status');
  const [result, setResult] = useState<Any | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveSchedule, setSaveSchedule] = useState('');
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // Builder state
  const [bTable, setBTable] = useState('commerce_orders');
  const [bCols, setBCols] = useState<string[]>([]);
  const [bFilterCol, setBFilterCol] = useState('');
  const [bFilterVal, setBFilterVal] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/analytics/explorer').then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setMeta(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load explorer');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const builderSql = useMemo(() => {
    const cols = bCols.length ? bCols.join(', ') : '*';
    let q = `SELECT ${cols} FROM ${bTable}`;
    if (bFilterCol && bFilterVal) q += ` WHERE ${bFilterCol} = '${bFilterVal.replace(/'/g, "''")}'`;
    return q;
  }, [bTable, bCols, bFilterCol, bFilterVal]);

  const run = async (toRun: string, savedId?: string) => {
    setBusy(true); setRunError(null); setResult(null);
    try {
      const res = await fetch('/api/admin/analytics/explorer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(savedId ? { action: 'run_saved', id: savedId } : { action: 'run', sql: toRun }),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setResult(res);
      await load();
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'Query failed');
    } finally { setBusy(false); }
  };

  const save = async () => {
    setSaveMsg(null);
    try {
      const res = await fetch('/api/admin/analytics/explorer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', name: saveName, sql, schedule: saveSchedule || null }),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setSaveMsg('Saved.');
      setSaveName(''); setSaveSchedule('');
      await load();
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : 'Save failed');
    }
  };

  const del = async (id: string) => {
    await fetch('/api/admin/analytics/explorer', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    });
    await load();
  };

  if (error) return <div className="p-4 text-sm text-destructive">{error}</div>;
  if (!meta) return <div className="p-4 text-sm text-muted-foreground">Loading explorer…</div>;

  const tableCols: { name: string; type: string }[] = meta.builderTables[bTable] ?? [];

  return (
    <div className="flex flex-col w-full bg-background text-foreground min-h-full p-4">
      <div className="flex items-center gap-2 mb-4">
        <Compass className="w-5 h-5" />
        <h1 className="text-lg font-bold">I4 · Data Explorer</h1>
      </div>

      {/* NL box — translation wired through the platform AI provider (J) */}
      <div className="border border-border rounded-lg p-4 bg-card mb-4">
        <h2 className="font-semibold text-sm mb-2">Ask in plain language</h2>
        <div className="flex gap-2">
          <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. orders by status this month"
            className="flex-1 border border-border rounded-lg px-3 py-2 text-sm bg-background" />
          <button onClick={translate} disabled={translating} className="px-3 py-2 text-[11px] font-semibold rounded-lg bg-primary text-primary-foreground cursor-pointer disabled:opacity-50">{translating ? 'TRANSLATING…' : 'TRANSLATE'}</button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">{meta.nlGate}</p>
        {nlMsg && <p className="text-[11px] text-foreground mt-1">{nlMsg}</p>}
      </div>

      {/* Query builder */}
      <div className="border border-border rounded-lg p-4 bg-card mb-4">
        <h2 className="font-semibold text-sm mb-2">Query builder (governed tables)</h2>
        <div className="flex flex-wrap gap-2 items-end">
          <label className="text-[11px]">Table
            <select value={bTable} onChange={(e) => { setBTable(e.target.value); setBCols([]); setBFilterCol(''); }}
              className="block border border-border rounded-lg px-2 py-1.5 text-sm bg-background mt-1">
              {Object.keys(meta.builderTables).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="text-[11px]">Filter column
            <select value={bFilterCol} onChange={(e) => setBFilterCol(e.target.value)}
              className="block border border-border rounded-lg px-2 py-1.5 text-sm bg-background mt-1">
              <option value="">(none)</option>
              {tableCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </label>
          <label className="text-[11px]">Equals
            <input value={bFilterVal} onChange={(e) => setBFilterVal(e.target.value)}
              className="block border border-border rounded-lg px-2 py-1.5 text-sm bg-background mt-1" />
          </label>
          <button onClick={() => setSql(builderSql)} className="px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-border bg-background hover:bg-muted/40 cursor-pointer">USE IN EDITOR</button>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {tableCols.map((c) => (
            <button key={c.name} onClick={() => setBCols((prev) => prev.includes(c.name) ? prev.filter((x) => x !== c.name) : [...prev, c.name])}
              className={`text-[11px] border rounded px-2 py-0.5 cursor-pointer ${bCols.includes(c.name) ? 'bg-primary text-primary-foreground' : 'border-border/60 bg-background'}`}>
              {c.name}
            </button>
          ))}
        </div>
        <pre className="text-[11px] bg-muted/40 rounded p-2 mt-2 overflow-auto">{builderSql}</pre>
      </div>

      {/* SQL editor + results */}
      <div className="border border-border rounded-lg p-4 bg-card mb-4">
        <h2 className="font-semibold text-sm mb-2">SQL (read-only)</h2>
        <textarea value={sql} onChange={(e) => setSql(e.target.value)} rows={4}
          className="w-full border border-border rounded-lg px-3 py-2 text-[12px] font-mono bg-background" />
        <div className="flex items-center gap-2 mt-2">
          <button onClick={() => run(sql)} disabled={busy}
            className="bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1.5 text-[11px] font-semibold rounded-lg flex items-center gap-1.5 disabled:opacity-50 cursor-pointer">
            <Play className="w-3 h-3" /> {busy ? 'RUNNING…' : 'RUN QUERY'}
          </button>
          <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Save as…"
            className="border border-border rounded-lg px-2 py-1.5 text-[12px] bg-background" />
          <select value={saveSchedule} onChange={(e) => setSaveSchedule(e.target.value)}
            className="border border-border rounded-lg px-2 py-1.5 text-[12px] bg-background">
            <option value="">No schedule</option>
            <option value="daily">Daily export</option>
            <option value="weekly">Weekly export</option>
          </select>
          <button onClick={save} disabled={!saveName.trim()}
            className="px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-border bg-background hover:bg-muted/40 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer">
            <Save className="w-3 h-3" /> SAVE QUERY
          </button>
          {saveMsg && <span className="text-[11px]">{saveMsg}</span>}
        </div>
        {runError && <p className="text-[12px] text-destructive mt-2">{runError}</p>}
        {result && (
          <div className="mt-3">
            <p className="text-[11px] text-muted-foreground mb-1">
              {result.rows.length} row(s) in {result.ms} ms{result.truncated ? ' — TRUNCATED at the 500-row governance cap' : ''}
            </p>
            <div className="overflow-auto max-h-96 border border-border/60 rounded">
              <table className="w-full text-[11px]">
                <thead><tr className="text-left bg-muted/40">{result.columns.map((c: string) => <th key={c} className="px-2 py-1">{c}</th>)}</tr></thead>
                <tbody>
                  {result.rows.map((r: Any, i: number) => (
                    <tr key={i} className="border-t border-border/40">
                      {result.columns.map((c: string) => <td key={c} className="px-2 py-1">{r[c] === null ? '—' : String(r[c])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Saved queries */}
      <div className="border border-border rounded-lg p-4 bg-card mb-4">
        <h2 className="font-semibold text-sm mb-2">Saved queries & scheduled exports</h2>
        <p className="text-[11px] text-muted-foreground mb-2">{meta.scheduledExports}</p>
        {meta.savedQueries.length === 0 && <p className="text-[12px] text-muted-foreground">No saved queries yet.</p>}
        {meta.savedQueries.map((q: Any) => (
          <div key={q.id} className="border border-border/60 rounded-lg p-3 bg-background mb-2">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-[13px]">{q.name}
                {q.schedule && (q.schedule === 'daily' || q.schedule === 'weekly'
                  ? <span className="text-muted-foreground font-normal"> · scheduled: {q.schedule} — runs unattended via the analytics-exports cron</span>
                  : <span className="text-muted-foreground font-normal"> · schedule recorded: {q.schedule} (unsupported — only daily/weekly run unattended)</span>)}
              </div>
              <div className="flex gap-2">
                <button onClick={() => run(q.sql, q.id)} disabled={busy}
                  className="px-2 py-1 text-[11px] font-semibold rounded-lg border border-border hover:bg-muted/40 flex items-center gap-1 cursor-pointer disabled:opacity-50">
                  <Play className="w-3 h-3" /> RUN NOW
                </button>
                <button onClick={() => del(q.id)}
                  className="px-2 py-1 text-[11px] font-semibold rounded-lg border border-border hover:bg-muted/40 flex items-center gap-1 cursor-pointer">
                  <Trash2 className="w-3 h-3" /> DELETE
                </button>
              </div>
            </div>
            <pre className="text-[11px] bg-muted/40 rounded p-2 mt-2 overflow-auto">{q.sql}</pre>
          </div>
        ))}

        <h3 className="font-semibold text-[12px] mt-4 mb-1">Export runs (latest 50)</h3>
        {!meta.exportRuns || meta.exportRuns.length === 0
          ? <p className="text-[11px] text-muted-foreground">No scheduled export runs recorded yet. Runs appear here after the analytics-exports cron executes a due schedule.</p>
          : meta.exportRuns.map((r: Any) => (
            <div key={r.id} className="flex items-center justify-between border-t border-border/40 py-1.5 text-[11px]">
              <span>
                <span className="font-semibold">{r.definitionName}</span> · {r.schedule ?? '—'} · {String(r.createdAt)}
                {' '}· {r.status}{r.status === 'succeeded' ? ` · ${r.rowCount ?? 0} row(s)${r.truncated ? ' (truncated at cap)' : ''}` : ` · ${r.error ?? 'failed'}`}
              </span>
              {r.status === 'succeeded' && (
                <a href={`/api/admin/analytics/explorer/runs/${r.id}`} className="font-semibold underline underline-offset-2">Download CSV</a>
              )}
            </div>
          ))}
      </div>

      {/* Governance */}
      <div className="border border-border rounded-lg p-4 bg-card">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="w-4 h-4" />
          <h2 className="font-semibold text-sm">Data governance</h2>
        </div>
        <ul className="list-disc ml-5 text-[12px] space-y-1">
          {meta.governance.enforcement.map((line: string, i: number) => <li key={i}>{line}</li>)}
        </ul>
        <h3 className="font-semibold text-[12px] mt-3 mb-1">Governance trail (latest 50)</h3>
        {meta.governance.trail.length === 0
          ? <p className="text-[11px] text-muted-foreground">No explorer activity recorded yet.</p>
          : meta.governance.trail.map((t: Any) => (
            <div key={t.id} className="text-[11px] border-t border-border/40 py-1.5">
              <span className="font-semibold">{t.action}</span> · {String(t.createdAt)} · actor {t.actor}
              <pre className="bg-muted/40 rounded p-1.5 mt-1 overflow-auto whitespace-pre-wrap">{typeof t.summary === 'string' ? t.summary : JSON.stringify(t.summary)}</pre>
            </div>
          ))}
      </div>
    </div>
  );
};
