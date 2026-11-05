'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileEdit, Save } from 'lucide-react';

// /admin/policies/editor — H1 · Policy Authoring + F4 · Policy editor.
// The editor route named in the owner's tree. Authoring previously lived
// only inside the marketplace governance console and the Document Center;
// this surface is the policies editor proper: it drafts and edits
// marketplace seller policies through the same governed API
// (/api/admin/policies/marketplace — create_policy / update_policy), and
// drives the H1 workflow in place (submit_review → sign_off →
// publish_policy, request_changes with notes). Every save writes the
// seller_policies row and the seller_audit_log trail through that API;
// nothing here keeps local-only state.

type Policy = {
  id: string;
  title: string;
  slug: string | null;
  layer: string | null;
  category: string | null;
  body: string | null;
  status: string | null;
  severity: string | null;
  current_version: number | null;
  review_state: string | null;
  enforcement_rules: unknown;
};

const inputCls =
  'w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none';
const labelCls = 'mb-1 block text-xs font-semibold tracking-wide text-neutral-500 uppercase';

const EMPTY = {
  title: '',
  slug: '',
  layer: '',
  category: '',
  severity: 'medium',
  body: '',
  enforcement_rules: '[]',
};

export default function PolicyEditorPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [selectedId, setSelectedId] = useState<string>('new');
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/policies/marketplace');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load policies');
      setPolicies(data.policies || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load policies');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const select = (id: string) => {
    setSelectedId(id);
    setNotice(null);
    setError(null);
    if (id === 'new') {
      setForm(EMPTY);
      return;
    }
    const p = policies.find((x) => x.id === id);
    if (!p) return;
    setForm({
      title: p.title || '',
      slug: p.slug || '',
      layer: p.layer || '',
      category: p.category || '',
      severity: p.severity || 'medium',
      body: p.body || '',
      enforcement_rules: JSON.stringify(p.enforcement_rules ?? [], null, 2),
    });
  };

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
      let rules: unknown;
      try {
        rules = JSON.parse(form.enforcement_rules || '[]');
      } catch {
        throw new Error('Enforcement rules must be valid JSON');
      }
      if (selectedId === 'new') {
        const data = await post({
          action: 'create_policy',
          title: form.title,
          slug: form.slug || undefined,
          layer: form.layer,
          category: form.category,
          severity: form.severity,
          body: form.body,
          enforcement_rules: rules,
        });
        setNotice('Draft policy created.');
        await load();
        if (data.policy?.id) setSelectedId(String(data.policy.id));
      } else {
        await post({
          action: 'update_policy',
          id: selectedId,
          title: form.title,
          layer: form.layer,
          category: form.category,
          severity: form.severity,
          body: form.body,
          enforcement_rules: rules,
        });
        setNotice('Policy saved. A body edit restarts the review workflow.');
        await load();
      }
    } catch (e: any) {
      setError(e.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const workflow = async (action: string) => {
    if (selectedId === 'new') return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const payload: Record<string, unknown> = { action, id: selectedId };
      if (action === 'request_changes') {
        const notes = window.prompt('Notes for the requested changes (required):');
        if (!notes) {
          setBusy(false);
          return;
        }
        payload.notes = notes;
      }
      await post(payload);
      setNotice(`Workflow action recorded: ${action.replace(/_/g, ' ')}.`);
      await load();
    } catch (e: any) {
      setError(e.message || 'Workflow action failed');
    } finally {
      setBusy(false);
    }
  };

  const selected = policies.find((p) => p.id === selectedId) || null;

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/admin/policies" className="mb-4 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900">
        <ArrowLeft className="h-4 w-4" /> Policies
      </Link>
      <div className="mb-6 flex items-center gap-3">
        <FileEdit className="h-6 w-6 text-neutral-700" />
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Policy editor</h1>
        </div>
      </div>

      {error ? <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}
      {notice ? <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</div> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <div className="rounded-xl border border-neutral-200 bg-white p-3">
          <button
            onClick={() => select('new')}
            className={`mb-2 w-full rounded-lg px-3 py-2 text-left text-sm font-medium ${ selectedId === 'new' ? 'bg-brand-teal/10 text-brand-teal' : 'bg-neutral-100 text-neutral-800 hover:bg-neutral-200' }`}
          >
            + New draft policy
          </button>
          {loading ? (
            <p className="px-2 py-3 text-sm text-neutral-400">Loading policies…</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {policies.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => select(p.id)}
                    className={`w-full rounded-lg px-3 py-2 text-left ${ selectedId === p.id ? 'bg-neutral-100' : 'hover:bg-neutral-50' }`}
                  >
                    <span className="block text-sm font-medium text-neutral-900">{p.title}</span>
                    <span className="block text-xs text-neutral-500">
                      {p.status || 'draft'} · {p.review_state || 'draft'} · v{p.current_version ?? 0}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className={labelCls}>Title</label>
              <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Slug</label>
              <input className={inputCls} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="Derived from title when blank" disabled={selectedId !== 'new'} />
            </div>
            <div>
              <label className={labelCls}>Layer</label>
              <input className={inputCls} value={form.layer} onChange={(e) => setForm({ ...form, layer: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Category</label>
              <input className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Severity</label>
              <select className={inputCls} value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                {['low', 'medium', 'high', 'critical'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4">
            <label className={labelCls}>Policy body</label>
            <textarea className={`${inputCls} min-h-[220px] font-mono`} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </div>
          <div className="mt-4">
            <label className={labelCls}>Enforcement rules (JSON)</label>
            <textarea className={`${inputCls} min-h-[110px] font-mono text-xs`} value={form.enforcement_rules} onChange={(e) => setForm({ ...form, enforcement_rules: e.target.value })} />
            <p className="mt-1 text-xs text-neutral-400">Validated server-side by the policy enforcement rule validator; an invalid rule set is refused, never stored.</p>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button onClick={save} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 disabled:opacity-50">
              <Save className="h-4 w-4" /> {selectedId === 'new' ? 'Create draft' : 'Save changes'}
            </button>
            {selected ? (
              <>
                <button onClick={() => workflow('submit_review')} disabled={busy} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50">Submit for review</button>
                <button onClick={() => workflow('request_changes')} disabled={busy} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50">Request changes</button>
                <button onClick={() => workflow('sign_off')} disabled={busy} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50">Legal sign-off</button>
                <button onClick={() => workflow('publish_policy')} disabled={busy} className="rounded-lg border border-neutral-900 px-3 py-2 text-sm font-medium disabled:opacity-50">Publish</button>
                <button onClick={() => workflow('unpublish_policy')} disabled={busy} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50">Unpublish</button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
