'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, ScrollText, RefreshCw, Info } from 'lucide-react';

type Entry = {
  ts: string | null;
  actor: string | null;
  action: string | null;
  entity: string | null;
  details: string | null;
};

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', second: '2-digit',
      })
    : '—';

type Lens = 'accounting' | 'seller' | 'customer' | 'employee';

type StoreOpt = { key: string; label: string; group: string; source: string };

export default function AuditPage() {
  const [lens, setLens] = useState<Lens>('accounting');
  const [stores, setStores] = useState<StoreOpt[]>([]);
  const [storeKey, setStoreKey] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [source, setSource] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async (silent: boolean) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const qs = storeKey
        ? `q=${encodeURIComponent(debounced)}&store=${encodeURIComponent(storeKey)}`
        : `q=${encodeURIComponent(debounced)}&source=${lens}`;
      const r = await fetch(`/api/admin/audit?${qs}`);
      const d = await r.json();
      setEntries(Array.isArray(d.rows) ? d.rows : []);
      setSource(typeof d.source === 'string' ? d.source : null);
      setNote(typeof d.note === 'string' ? d.note : null);
      if (Array.isArray(d.stores)) setStores(d.stores);
    } catch {
      setEntries([]);
      setNote('Could not reach the audit service.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [debounced, lens, storeKey]);

  useEffect(() => {
    load(false);
  }, [load]);

  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (autoRefresh) {
      timer.current = setInterval(() => load(true), 30000);
    }
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [autoRefresh, load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <ScrollText className="size-6" /> Audit Log
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center border border-border rounded-lg overflow-hidden" role="tablist" aria-label="Audit source">
            {(
              [
                ['accounting', 'Accounting'],
                ['seller', 'Seller governance'],
                ['customer', 'Customer lens'],
                ['employee', 'Employee lens'],
              ] as [Lens, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                role="tab"
                aria-selected={!storeKey && lens === value}
                onClick={() => {
                  setLens(value);
                  setStoreKey('');
                  setExpanded(null);
                }}
                className={`px-3 py-2 text-[13px] cursor-pointer ${ !storeKey && lens === value ? 'bg-muted font-semibold text-foreground' : 'bg-card text-muted-foreground hover:bg-muted/50' }`}
              >
                {label}
              </button>
            ))}
          </div>
          <select
            aria-label="Audit store"
            value={storeKey}
            onChange={e => {
              setStoreKey(e.target.value);
              setExpanded(null);
            }}
            className="bg-card border border-border rounded-lg px-3 py-2 text-[13px] cursor-pointer max-w-64"
          >
            <option value="">Lens view (above)</option>
            {['Audit logs', 'Event stores', 'Platform audit'].map(group => (
              <optgroup key={group} label={group}>
                {stores
                  .filter(s => s.group === group)
                  .map(s => (
                    <option key={s.key} value={s.key}>
                      {s.label} — {s.source}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
            <Search className="size-4 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search actor, action, entity…"
              className="bg-transparent outline-none text-[13px] w-52"
            />
          </div>
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              className="accent-current"
            />
            Auto-refresh (30s)
          </label>
          <button
            onClick={() => load(false)}
            className="px-3 py-2 border border-border rounded-lg text-[13px] font-semibold hover:bg-muted cursor-pointer inline-flex items-center gap-2"
          >
            <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {note && (
        <div className="bg-brand-teal/5 dark:bg-brand-teal/10 border border-brand-teal/20 dark:border-brand-teal/30 rounded-xl px-4 py-3 text-[13px] text-brand-teal dark:text-brand-teal flex items-start gap-2">
          <Info className="size-4 mt-0.5 shrink-0" />
          <span>{note}</span>
        </div>
      )}

      {loading ? (
        <div className="text-muted-foreground text-[13px]">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <ScrollText className="size-10 mx-auto text-muted-foreground/40" />
          <p className="text-[14px] font-medium text-foreground mt-3">No audit entries found</p>
          <p className="text-[13px] text-muted-foreground mt-1">
            {debounced
              ? 'Try a different search term.'
              : storeKey
                ? 'Nothing has been recorded in this store yet — when the platform writes here, the entries will appear.'
                : lens === 'seller'
                  ? 'No seller governance actions recorded yet — seller approvals, violations, appeals, investigations, listing reviews and fee changes will appear here.'
                  : lens === 'customer' || lens === 'employee'
                    ? `Person lens: type the ${lens}'s email or id in search to see every recorded event for them across the audit stores.`
                    : 'Actions recorded by the platform will appear here.'}
          </p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead>
              <tr>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Timestamp</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Actor</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Action</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Entity</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, idx) => {
                const long = e.details !== null && e.details.length >= 240;
                const isOpen = expanded === idx;
                return (
                  <tr key={idx} className="border-t border-border hover:bg-muted/50 align-top">
                    <td className="p-3 text-muted-foreground whitespace-nowrap text-[12px]">{when(e.ts)}</td>
                    <td className="p-3 text-[12px] font-mono">{e.actor || '—'}</td>
                    <td className="p-3 text-[12px] font-mono font-medium">{e.action || '—'}</td>
                    <td className="p-3 text-[12px] font-mono text-muted-foreground">{e.entity || '—'}</td>
                    <td className="p-3 text-[12px] text-muted-foreground max-w-md">
                      {e.details ? (
                        <>
                          <span className="font-mono break-all">
                            {isOpen || !long ? e.details : e.details.slice(0, 120) + '…'}
                          </span>
                          {long && (
                            <button
                              onClick={() => setExpanded(isOpen ? null : idx)}
                              className="ml-2 text-primary hover:underline text-[11px] cursor-pointer whitespace-nowrap"
                            >
                              {isOpen ? 'Show less' : 'Show more'}
                            </button>
                          )}
                        </>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}
