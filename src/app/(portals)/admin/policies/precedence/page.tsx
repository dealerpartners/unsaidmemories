'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ListOrdered, Trash2 } from 'lucide-react';

// /admin/policies/precedence — F4 · Precedence matrix at its named route.
// Precedence previously existed only inside the marketplace governance
// console (seller_policy_precedence read + set_precedence action in
// /api/admin/policies/marketplace); the tree names a precedence surface
// under Policies, and this page is it: the ordered matrix, which policy
// overrides which, with set/delete driving the same governed API actions
// (seller_policy_precedence writes + seller_audit_log trail).

type Policy = { id: string; title: string; status: string | null };
type PrecedenceRow = {
  id: string;
  policy_id: string;
  policy_title: string;
  precedence: number;
  overrides_policy_id: string | null;
  overrides_title: string | null;
};

const inputCls =
  'w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-900 focus:outline-none';
const labelCls = 'mb-1 block text-xs font-semibold tracking-wide text-neutral-500 uppercase';

export default function PolicyPrecedencePage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [rows, setRows] = useState<PrecedenceRow[]>([]);
  const [form, setForm] = useState({ policy_id: '', precedence: '1', overrides_policy_id: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/policies/marketplace');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load precedence');
      setPolicies(data.policies || []);
      setRows(data.precedence || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load precedence');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const post = async (payload: Record<string, unknown>) => {
    const res = await fetch('/api/admin/policies/marketplace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await post({
        action: 'set_precedence',
        policy_id: form.policy_id,
        precedence: Number(form.precedence),
        overrides_policy_id: form.overrides_policy_id || null,
      });
      setNotice('Precedence recorded.');
      await load();
    } catch (e: any) {
      setError(e.message || 'Failed to set precedence');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: PrecedenceRow) => {
    setBusy(true);
    setError(null);
    try {
      await post({ action: 'delete_precedence', policy_id: row.policy_id });
      setNotice('Precedence row removed.');
      await load();
    } catch (e: any) {
      setError(e.message || 'Failed to remove precedence row');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/admin/policies" className="mb-4 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900">
        <ArrowLeft className="h-4 w-4" /> Policies
      </Link>
      <div className="mb-6 flex items-center gap-3">
        <ListOrdered className="h-6 w-6 text-neutral-700" />
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Policy precedence</h1>
        </div>
      </div>

      {error ? <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}
      {notice ? <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</div> : null}

      <div className="mb-6 rounded-xl border border-neutral-200 bg-white p-5">
        {loading ? (
          <p className="text-sm text-neutral-400">Loading precedence…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-neutral-500">No precedence rows recorded yet. Set the first one below.</p>
        ) : (
          <div className="adm-table-wrap"><table className="adm-table">
            <thead>
              <tr className="border-b border-neutral-100 text-xs uppercase tracking-wide text-neutral-400">
                <th className="py-2 pr-3">Order</th>
                <th className="py-2 pr-3">Policy</th>
                <th className="py-2 pr-3">Overrides</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 pr-3 font-medium text-neutral-900">{r.precedence}</td>
                  <td className="py-2 pr-3 text-neutral-800">{r.policy_title}</td>
                  <td className="py-2 pr-3 text-neutral-600">{r.overrides_title || '—'}</td>
                  <td className="py-2 text-right">
                    <button onClick={() => remove(r)} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 px-2 py-1 text-xs disabled:opacity-50">
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-neutral-900">Set precedence</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className={labelCls}>Policy</label>
            <select className={inputCls} value={form.policy_id} onChange={(e) => setForm({ ...form, policy_id: e.target.value })}>
              <option value="">Select a policy…</option>
              {policies.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Precedence (lower governs first)</label>
            <input type="number" min={1} className={inputCls} value={form.precedence} onChange={(e) => setForm({ ...form, precedence: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Overrides (optional)</label>
            <select className={inputCls} value={form.overrides_policy_id} onChange={(e) => setForm({ ...form, overrides_policy_id: e.target.value })}>
              <option value="">None</option>
              {policies.filter((p) => p.id !== form.policy_id).map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>
        </div>
        <button onClick={save} disabled={busy || !form.policy_id} className="mt-4 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 disabled:opacity-50">
          Record precedence
        </button>
      </div>
    </div>
  );
}
