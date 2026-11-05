'use client';

import { useCallback, useEffect, useState } from 'react';
import { Flag, RefreshCw, Info, Plus, Trash2 } from 'lucide-react';

type FlagRow = {
  id: string;
  audience: string;
  key: string;
  description: string | null;
  enabled: boolean;
  updatedBy: string | null;
  updatedAt: string;
};

const AUDIENCES = ['seller', 'customer', 'employee', 'vet', 'global'] as const;

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function FeatureFlagsPage() {
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [audience, setAudience] = useState<string>('seller');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newKey, setNewKey] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newEnabled, setNewEnabled] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/admin/feature-flags');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Load failed');
      setFlags(Array.isArray(d.flags) ? d.flags : []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const post = async (payload: Record<string, unknown>, okMsg: string) => {
    setBusy(String(payload.key || ''));
    setError(null);
    setNotice(null);
    try {
      const r = await fetch('/api/admin/feature-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Write failed');
      setNotice(okMsg);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const shown = flags.filter((f) => f.audience === audience);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Flag className="w-5 h-5" /> Feature Flags
        </h1>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 text-sm border rounded px-2.5 py-1.5 hover:bg-muted"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>
      <div className="flex items-start gap-2 text-sm border rounded p-3 mb-5 bg-muted/40">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          A flag exists for this tenant only when recorded here. Reads resolve the audience&apos;s row first, then this
          tenant&apos;s <strong>global</strong> row for the same key; absence everywhere reads <strong>OFF</strong> — no
          surface invents an &ldquo;on&rdquo; state, and one tenant&apos;s flags never leak into another&apos;s.
        </span>
      </div>

      {error && <div className="border border-red-300 adm-badge adm-badge-red rounded p-3 mb-4 text-sm">{error}</div>}
      {notice && <div className="border rounded p-3 mb-4 text-sm bg-muted/40">{notice}</div>}

      <div className="flex gap-1.5 mb-4 flex-wrap">
        {AUDIENCES.map((a) => (
          <button
            key={a}
            onClick={() => setAudience(a)}
            className={`px-3 py-1.5 rounded border text-sm capitalize ${ audience === a ? 'bg-primary text-primary-foreground' : 'hover:bg-muted' }`}
          >
            {a} features
            <span className="ml-1.5 text-xs opacity-70">
              ({flags.filter((f) => f.audience === a).length})
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading flags…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground border rounded">
          No {audience} flags are recorded for this tenant. Every {audience} feature read for this tenant currently
          resolves OFF unless a global flag covers the key.
        </p>
      ) : (
        <div className="adm-table-wrap"><table className="adm-table">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th className="p-2.5">Key</th>
              <th className="p-2.5">Description</th>
              <th className="p-2.5">State</th>
              <th className="p-2.5">Updated</th>
              <th className="p-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((f) => (
              <tr key={f.id} className="border-b last:border-0">
                <td className="p-2.5 font-mono text-[13px]">{f.key}</td>
                <td className="p-2.5 text-muted-foreground">{f.description || '—'}</td>
                <td className="p-2.5">
                  <button
                    disabled={busy === f.key}
                    onClick={() =>
                      post(
                        { action: 'set_enabled', audience: f.audience, key: f.key, enabled: !f.enabled },
                        `Flag ${f.key} is now ${!f.enabled ? 'ON' : 'OFF'} for the ${f.audience} audience.`,
                      )
                    }
                    className={`px-2 py-0.5 rounded text-xs font-semibold ${ f.enabled ? 'adm-badge adm-badge-green' : 'bg-neutral-200 text-neutral-700' }`}
                  >
                    {f.enabled ? 'ON' : 'OFF'}
                  </button>
                </td>
                <td className="p-2.5 text-muted-foreground">
                  {when(f.updatedAt)}
                  {f.updatedBy ? ` · ${f.updatedBy}` : ''}
                </td>
                <td className="p-2.5 text-right">
                  <button
                    disabled={busy === f.key}
                    onClick={() =>
                      post(
                        { action: 'delete', audience: f.audience, key: f.key },
                        `Flag ${f.key} deleted — reads for it now fall back or resolve OFF.`,
                      )
                    }
                    className="text-red-700 hover:text-red-900"
                    aria-label={`Delete flag ${f.key}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}

      <div className="border rounded mt-6">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4" /> Record a flag ({audience})
        </h2>
        <div className="grid sm:grid-cols-[1fr_2fr_auto] gap-2 items-end">
          <label className="block">
            <span className="text-xs uppercase text-muted-foreground">Key</span>
            <input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="e.g. seller_bulk_import_v2"
              className="w-full border rounded px-2 py-1.5 font-mono text-[13px]"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase text-muted-foreground">Description</span>
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="What this flag turns on"
              className="w-full border rounded px-2 py-1.5"
            />
          </label>
          <label className="flex items-center gap-2 text-sm pb-1.5">
            <input type="checkbox" checked={newEnabled} onChange={(e) => setNewEnabled(e.target.checked)} />
            Enabled
          </label>
        </div>
        <button
          disabled={busy === newKey || !newKey.trim()}
          onClick={() =>
            post(
              { action: 'upsert', audience, key: newKey.trim(), description: newDesc || null, enabled: newEnabled },
              `Flag ${newKey.trim()} recorded for the ${audience} audience.`,
            )
          }
          className="mt-3 px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm disabled:opacity-50"
        >
          Save flag
        </button>
      </div>
    </div>
  );
}
