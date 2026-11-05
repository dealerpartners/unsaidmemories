'use client';

/* Admin → Settings → Backups: per-tenant data backups (a paid add-on).
 * Entitled tenants get nightly backups plus Run Backup Now and 1-hour
 * signed downloads from /api/admin/settings/backups. Non-entitled tenants
 * see the upsell state — the API refuses runs server-side regardless. */

import { useCallback, useEffect, useState } from 'react';

type Backup = {
  id: string;
  status: string;
  backupType: string;
  sizeBytes: number | null;
  totalRows: number;
  tableCount: number;
  storagePath: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  errorMessage: string | null;
};

type State = {
  entitled: boolean;
  upsellMessage: string | null;
  tenant: { id: string; name: string | null };
  lastBackup: Backup | null;
  backups: Backup[];
};

function fmtBytes(n: number | null): string {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'completed'
      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      : status === 'failed'
        ? 'adm-badge adm-badge-red dark:bg-red-900 dark:text-red-200'
        : 'adm-badge adm-badge-amber dark:bg-amber-900 dark:text-amber-200';
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{status}</span>;
}

export default function BackupsSettingsPage() {
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/settings/backups');
      const j = await res.json();
      if (j?.ok) setState(j as State);
      else setMsg(j?.error || 'Failed to load backups.');
    } catch { setMsg('Failed to load backups.'); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const runNow = async () => {
    setRunning(true); setMsg('');
    try {
      const res = await fetch('/api/admin/settings/backups', { method: 'POST' });
      const j = await res.json();
      setMsg(j?.ok ? (j.message || 'Backup completed.') : (j?.error || 'Backup failed.'));
      if (j?.ok) await load();
    } catch { setMsg('Backup failed.'); }
    setRunning(false);
  };

  const download = async (b: Backup) => {
    setDownloadingId(b.id); setMsg('');
    try {
      const res = await fetch(`/api/admin/settings/backups/${b.id}/download`);
      const j = await res.json();
      if (j?.ok && j.url) window.open(j.url, '_blank', 'noopener');
      else setMsg(j?.error || 'Could not create the download link.');
    } catch { setMsg('Could not create the download link.'); }
    setDownloadingId(null);
  };

  if (loading) return <div className="text-sm text-muted-foreground">Loading backups…</div>;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-1">Backups</h1>

      {msg && <p className="text-sm mb-4 p-2 border border-border rounded bg-muted">{msg}</p>}

      {state && !state.entitled && (
        <section className="mb-8 border border-amber-300 rounded bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <h2 className="text-lg font-semibold mb-2">Backup &amp; storage is a paid add-on</h2>
          <p className="text-sm mb-2">
            This shop does not have the backup add-on yet. With it, your data is backed up
            automatically every night and every archive can be downloaded from this page —
            your records, in your hands, whenever you need them.
          </p>
          <p className="text-sm">
            Contact UnSaid Memories to add backups to your plan. Backups cannot be run until
            the add-on is enabled for this shop.
          </p>
        </section>
      )}

      {state?.entitled && (
        <>
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-3 text-xs">
              <span className="px-2 py-1 rounded bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                Backup add-on · active
              </span>
              <span className="px-2 py-1 rounded bg-muted text-muted-foreground">Nightly · automatic</span>
            </div>
            {state.lastBackup ? (
              <p className="text-sm text-muted-foreground mb-4">
                Last backup: <span className="text-foreground font-medium">{fmtDate(state.lastBackup.completedAt)}</span>
                {' · '}{fmtBytes(state.lastBackup.sizeBytes)}
                {' · '}{state.lastBackup.totalRows.toLocaleString()} rows across {state.lastBackup.tableCount} tables
              </p>
            ) : (
              <p className="text-sm text-muted-foreground mb-4">No completed backup yet — run one now or wait for tonight's automatic backup.</p>
            )}
            <button
              onClick={runNow} disabled={running}
              className="px-6 py-2 bg-primary text-primary-foreground rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {running ? 'Backing up…' : 'Run Backup Now'}
            </button>
            {running && <p className="text-xs text-muted-foreground mt-2">Exporting this shop's tables and uploading the archive — this can take a moment.</p>}
          </section>

          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-3">Backup history</h2>
            {state.backups.length === 0 ? (
              <p className="text-sm text-muted-foreground">No backups recorded yet.</p>
            ) : (
              <div className="border border-border rounded overflow-x-auto">
                <div className="adm-table-wrap"><table className="adm-table">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2 font-semibold">Started</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                      <th className="px-3 py-2 font-semibold">Size</th>
                      <th className="px-3 py-2 font-semibold">Rows</th>
                      <th className="px-3 py-2 font-semibold">Tables</th>
                      <th className="px-3 py-2 font-semibold"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.backups.map((b) => (
                      <tr key={b.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 whitespace-nowrap">{fmtDate(b.startedAt || b.createdAt)}</td>
                        <td className="px-3 py-2">
                          <StatusBadge status={b.status} />
                          {b.status === 'failed' && b.errorMessage && (
                            <div className="text-xs text-red-700 dark:text-red-300 mt-1 max-w-xs truncate" title={b.errorMessage}>{b.errorMessage}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{fmtBytes(b.sizeBytes)}</td>
                        <td className="px-3 py-2">{b.totalRows.toLocaleString()}</td>
                        <td className="px-3 py-2">{b.tableCount}</td>
                        <td className="px-3 py-2 text-right">
                          {b.status === 'completed' && (
                            <button
                              onClick={() => download(b)} disabled={downloadingId === b.id}
                              className="px-3 py-1 border border-border rounded text-xs font-medium hover:bg-muted disabled:opacity-50"
                            >
                              {downloadingId === b.id ? 'Preparing…' : 'Download'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
