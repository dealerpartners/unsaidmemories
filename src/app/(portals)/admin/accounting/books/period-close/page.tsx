'use client';

import React, { useEffect, useMemo, useState } from 'react';

// /admin/accounting/books/period-close — Period Close & Locks,
// rebuilt to the owner's spec (period_close_locksHtml.html): the
// fiscal period cadence & security console, the month-end close
// checklist workbench, and the hard-close action — gated so a
// period cannot close while required checklist tasks are open.
// Data: GET/POST /api/admin/accounting/periods over acct_periods,
// acct_fiscal_years and acct_close_checklists.

type Period = {
  id: string; name: string; period_no: number; start_date: string; end_date: string;
  status: string; closed_at: string | null; fiscal_year: number | null;
};
type Task = {
  id: string; period_id: string; task_code: string; task_name: string;
  sequence_no: number; required: boolean; status: string; completed_at: string | null; notes: string | null;
};

export default function PeriodClosePage() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newTask, setNewTask] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch('/api/admin/accounting/periods', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => {
        const ps: Period[] = Array.isArray(d.periods) ? d.periods : [];
        setPeriods(ps);
        setTasks(Array.isArray(d.tasks) ? d.tasks : []);
        setSelectedId((cur) => cur && ps.some((p) => p.id === cur) ? cur : (ps.find((p) => p.status === 'open') || ps[0])?.id || null);
      })
      .catch(() => setError('Periods could not be loaded.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await fetch('/api/admin/accounting/periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Action failed');
      load();
      return true;
    } catch (err: any) {
      setError(err?.message || 'The action could not be completed.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const selected = periods.find((p) => p.id === selectedId) || null;
  const selectedTasks = useMemo(
    () => tasks.filter((t) => t.period_id === selectedId).sort((a, b) => a.sequence_no - b.sequence_no),
    [tasks, selectedId],
  );
  const progress = (pid: string) => {
    const ts = tasks.filter((t) => t.period_id === pid);
    const req = ts.filter((t) => t.required);
    const done = req.filter((t) => t.status === 'completed').length;
    return { total: ts.length, required: req.length, done, open: req.length - done };
  };

  const inputCls = 'bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full';
  const thCls = 'bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground';

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Period Close &amp; Locks</h1>
      </div>

      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mt-4">{error}</div>}
      {notice && <div className="rounded-lg border border-border bg-card px-4 py-2 text-sm mt-4">{notice}</div>}

      <h2 className="font-display text-base font-semibold mt-4 mb-2">Fiscal Period Cadence &amp; Security Console</h2>
      <div className="border border-border rounded-xl overflow-x-auto bg-card">
        <div className="adm-table-wrap"><table className="adm-table">
          <thead>
            <tr className={thCls}>
              <th className="p-3 border-r border-border">Period</th>
              <th className="p-3 border-r border-border">Fiscal Year</th>
              <th className="p-3 border-r border-border">Dates</th>
              <th className="p-3 border-r border-border text-center">Checklist</th>
              <th className="p-3 border-r border-border text-center">Status</th>
              <th className="p-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={6} className="text-center text-muted-foreground">Loading periods…</td></tr>
            ) : periods.length === 0 ? (
              <tr><td colSpan={6} className="text-center text-muted-foreground">No fiscal periods exist yet. Periods are created automatically the first time a journal entry posts, one per month.</td></tr>
            ) : periods.map((p) => {
              const pr = progress(p.id);
              const isSel = p.id === selectedId;
              return (
                <tr key={p.id} className={`hover:bg-accent/50 ${isSel ? 'bg-accent/40' : ''}`}>
                  <td className="p-3 border-r border-border font-semibold">{p.name} <span className="text-muted-foreground font-normal">(#{p.period_no})</span></td>
                  <td className="p-3 border-r border-border text-muted-foreground">{p.fiscal_year ? `Fiscal Year ${p.fiscal_year}` : '—'}</td>
                  <td className="p-3 border-r border-border text-muted-foreground">{p.start_date} → {p.end_date}</td>
                  <td className="p-3 border-r border-border text-center tabular-nums">{pr.required === 0 ? 'No required tasks' : `${pr.done}/${pr.required} required done`}</td>
                  <td className="p-3 border-r border-border text-center">
                    {p.status === 'closed' ? `Closed${p.closed_at ? ` · ${p.closed_at.slice(0, 10)}` : ''}` : 'Open'}
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => setSelectedId(p.id)} className="text-[12px] underline" data-tip="Open this period's close checklist below">Checklist</button>
                      {p.status !== 'closed' ? (
                        <button
                          disabled={busy}
                          onClick={async () => { if (await act({ action: 'close_period', periodId: p.id })) setNotice(`Period ${p.name} is hard-closed. Nothing can post into it now.`); }}
                          className="rounded-lg px-3 h-8 text-[12px] font-medium text-white disabled:opacity-60"
                          style={{ backgroundColor: '#7258e8' }}
                          data-tip="Hard-close this period — only works when every required checklist task is complete"
                        >
                          Lock Fiscal Period
                        </button>
                      ) : (
                        <button
                          disabled={busy}
                          onClick={async () => { if (await act({ action: 'reopen_period', periodId: p.id })) setNotice(`Period ${p.name} was reopened.`); }}
                          className="text-[12px] underline disabled:opacity-60"
                          data-tip="Reopen this period so entries can post into it again"
                        >
                          Reopen
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div>

      {selected && (
        <div className="border border-border rounded-xl bg-card mt-4">
          <div className="p-4 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold">Month-End Close Checklist Workbench — {selected.name}</h2>
              <p className="text-[13px] text-muted-foreground mt-1">
                {selected.status === 'closed'
                  ? 'This period is closed. Its checklist is kept as the record of how it closed.'
                  : 'Work through the list, then use Lock Fiscal Period above. Required tasks block the close until they are complete.'}
              </p>
            </div>
            {selected.status !== 'closed' && (
              <button
                disabled={busy}
                onClick={async () => { if (await act({ action: 'close_period', periodId: selected.id })) setNotice(`Period ${selected.name} is hard-closed. Nothing can post into it now.`); }}
                className="rounded-lg px-4 h-9 text-[13px] font-medium text-white disabled:opacity-60"
                style={{ backgroundColor: '#7258e8' }}
                data-tip={`Execute the hard close for ${selected.name}`}
              >
                Execute Hard Close for {selected.name}
              </button>
            )}
          </div>
          <div className="adm-table-wrap"><table className="adm-table">
            <thead>
              <tr className={thCls}>
                <th className="p-3 border-r border-border">Seq</th>
                <th className="p-3 border-r border-border">Task &amp; Reconciliation Scope</th>
                <th className="p-3 border-r border-border text-center">Required</th>
                <th className="p-3 border-r border-border text-center">Status &amp; Verification</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {selectedTasks.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-muted-foreground">No checklist tasks for this period yet. Add the tasks your month-end routine needs below — reconciliations, accrual checks, reviews — and mark each one complete as you finish it.</td></tr>
              ) : selectedTasks.map((t) => (
                <tr key={t.id} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border text-muted-foreground tabular-nums">{t.sequence_no}</td>
                  <td className="p-3 border-r border-border">
                    <div className="font-medium">{t.task_name}</div>
                    <div className="text-[11px] text-muted-foreground">{t.task_code}</div>
                  </td>
                  <td className="p-3 border-r border-border text-center">{t.required ? 'Required' : 'Optional'}</td>
                  <td className="p-3 border-r border-border text-center">{t.status === 'completed' ? `Complete${t.completed_at ? ` · ${t.completed_at.slice(0, 10)}` : ''}` : 'Open'}</td>
                  <td className="p-3 text-center">
                    {selected.status !== 'closed' && (t.status === 'completed' ? (
                      <button disabled={busy} onClick={() => act({ action: 'reopen_task', taskId: t.id })} className="text-[12px] underline disabled:opacity-60" data-tip="Send this task back to open">Reopen task</button>
                    ) : (
                      <button disabled={busy} onClick={() => act({ action: 'complete_task', taskId: t.id })} className="text-[12px] underline disabled:opacity-60" data-tip="Mark this task complete — it counts toward the close">Mark complete</button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
          {selected.status !== 'closed' && (
            <form
              className="p-4 border-t border-border flex flex-col md:flex-row gap-3 md:items-end"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newTask.trim()) return;
                if (await act({ action: 'add_task', periodId: selected.id, taskName: newTask.trim(), required: true })) setNewTask('');
              }}
            >
              <div className="flex-1">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">New checklist task</label>
                <input value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="e.g. Reconcile the bank account" className={inputCls} />
              </div>
              <button type="submit" disabled={busy} className="rounded-lg px-4 h-9 text-[13px] border bg-card border-border text-foreground disabled:opacity-60" data-tip="Add this task to the period's close checklist as a required task">
                + Add Task
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
