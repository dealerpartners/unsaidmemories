'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, ScrollText } from 'lucide-react';
import { api } from '@/components/admin/docs-admin';

// ---------------------------------------------------------------------------
// S3 · Marketplace Policy mode of the Document Center (bridge, don't
// merge). Marketplace seller policies are an ENFORCEMENT store
// (seller_policies + versions + acceptances), not documents — so this
// mode does not author doc_articles. It drafts through the existing
// marketplace governance API (/api/admin/policies/marketplace:
// create_policy / update_policy / submit_review), keeping review,
// sign-off, precedence, publish gating, and acceptances in their store
// with their semantics. Sign-off and publish happen on the governance
// desk (/admin/policies/marketplace), which links back here for text.
// The text is authored in exactly one place: here.
// ---------------------------------------------------------------------------

type Policy = {
  id: string; title: string; slug: string | null; layer: string | null;
  category: string | null; body: string | null; status: string;
  current_version: number; review_state: string | null;
  review_notes: string | null; signoff_at: string | null;
  severity: string | null; acceptance_count?: number;
  body_differs_from_published?: boolean;
};
type Version = {
  id: string; version: number; change_notes: string | null;
  published_by: string | null; published_at: string | null; created_at: string;
};

const inputCls = 'w-full rounded-lg border px-2 py-1.5 text-[13px]';
const labelCls = 'block text-[12px] text-muted-foreground mb-1';

function MarketplaceMode() {
  const searchParams = useSearchParams();
  const preselect = searchParams.get('policy');
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [editing, setEditing] = useState<Policy | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [form, setForm] = useState({ title: '', slug: '', layer: '', category: '', body: '', severity: 'medium' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const j = await api('/api/admin/policies/marketplace');
      setPolicies(j.policies || []);
      return (j.policies || []) as Policy[];
    } catch (e: any) { setError(e.message); return []; }
    finally { setLoading(false); }
  }, []);

  const select = useCallback(async (p: Policy) => {
    setEditing(p);
    setForm({
      title: p.title || '', slug: p.slug || '', layer: p.layer || '',
      category: p.category || '', body: p.body || '', severity: p.severity || 'medium',
    });
    setNotice(null); setError(null);
    try {
      const j = await api(`/api/admin/policies/marketplace?id=${p.id}`);
      setVersions(j.versions || []);
    } catch { setVersions([]); }
  }, []);

  useEffect(() => {
    load().then((ps) => {
      if (preselect) {
        const p = ps.find((x) => x.id === preselect);
        if (p) void select(p);
      }
    });
  }, [load, preselect, select]);

  const post = async (payload: Record<string, unknown>, ok: string) => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const j = await api('/api/admin/policies/marketplace', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setNotice(ok);
      const ps = await load();
      const id = (j.policy?.id as string) || editing?.id;
      if (id) {
        const p = ps.find((x) => x.id === id);
        if (p) await select(p);
      }
      return j;
    } catch (e: any) { setError(e.message); return null; }
    finally { setBusy(false); }
  };

  const newDraft = () => {
    setEditing(null);
    setVersions([]);
    setForm({ title: '', slug: '', layer: '', category: '', body: '', severity: 'medium' });
    setNotice(null); setError(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/docs" className="inline-flex items-center gap-1.5 text-[13px] font-medium underline underline-offset-2">
          <ArrowLeft className="size-4" /> Document Center
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2 mt-3">
          <ScrollText className="size-6" /> Marketplace Policy Mode
        </h1>
      </div>

      {error && <div className="text-[13px] text-red-600">{error}</div>}
      {notice && <div className="text-[13px] text-muted-foreground">{notice}</div>}

      <div className="grid gap-4 lg:grid-cols-5">
        <section className="bg-card border border-border rounded-xl overflow-hidden lg:col-span-2">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-[14px] font-semibold">Marketplace policies</h2>
            <button onClick={newDraft} className="rounded-lg border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5">New draft</button>
          </div>
          {loading ? <p className="px-5 py-6 text-[13px] text-muted-foreground">Loading…</p>
            : policies.length === 0 ? <p className="px-5 py-6 text-[13px] text-muted-foreground">No marketplace policies authored yet. Draft the first one — sellers have nothing to accept until a policy is signed off and published from the desk.</p>
            : (
              <div className="divide-y divide-border">
                {policies.map((p) => (
                  <button key={p.id} onClick={() => select(p)}
                    className={`block w-full text-left px-5 py-3 hover:bg-muted/50 ${editing?.id === p.id ? 'bg-muted/40' : ''}`}>
                    <span className="block text-[13px] font-medium">{p.title}</span>
                    <span className="block text-[11.5px] text-muted-foreground">
                      {p.slug || 'no slug'}{p.category ? ` · ${p.category}` : ''}{p.layer ? ` · ${p.layer}` : ''}
                      {` · ${p.status} · v${p.current_version} · review: ${p.review_state || 'draft'}`}
                      {` · ${p.acceptance_count ?? 0} acceptance${(p.acceptance_count ?? 0) === 1 ? '' : 's'}`}
                      {p.body_differs_from_published ? ' · unpublished edits' : ''}
                    </span>
                  </button>
                ))}
              </div>
            )}
        </section>

        <section className="bg-card border border-border rounded-xl lg:col-span-3">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-[14px] font-semibold">{editing ? `Draft — ${editing.title}` : 'New marketplace policy draft'}</h2>
            {editing && (
              <p className="text-[12px] text-muted-foreground mt-0.5">
                Review state: <span className="font-medium">{editing.review_state || 'draft'}</span>
                {editing.review_state === 'changes_requested' && editing.review_notes ? ` — reviewer asked: ${editing.review_notes}` : ''}
                {editing.review_state === 'signed_off' && editing.signoff_at ? ` — signed off ${new Date(editing.signoff_at).toLocaleString()}; publish from the desk.` : ''}
                {' '}Saving a body edit restarts the review workflow.
              </p>
            )}
          </div>
          <div className="px-5 py-4 space-y-3">
            <div>
              <label className={labelCls}>Title</label>
              <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Marketplace Seller Agreement" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Slug</label>
                <input className={inputCls} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="Auto-generated from the title" disabled={Boolean(editing)} />
              </div>
              <div>
                <label className={labelCls}>Severity</label>
                <select className={inputCls} value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                  <option value="low">low</option><option value="medium">medium</option>
                  <option value="high">high</option><option value="critical">critical</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Category</label>
                <input className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Account, Listings, Payments…" />
              </div>
              <div>
                <label className={labelCls}>Layer</label>
                <input className={inputCls} value={form.layer} onChange={(e) => setForm({ ...form, layer: e.target.value })} placeholder="Layer 0, Layer 1…" />
              </div>
            </div>
            <div>
              <label className={labelCls}>Body — the full policy text sellers read before accepting</label>
              <textarea className={inputCls} rows={16} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            </div>
            <div className="flex flex-wrap gap-2">
              {editing ? (
                <button disabled={busy} onClick={() => post({
                  action: 'update_policy', id: editing.id, title: form.title,
                  layer: form.layer || null, category: form.category || null,
                  body: form.body, severity: form.severity,
                }, 'Policy saved — the desk now holds this text for review and sign-off.')}
                  className="rounded-lg border border-border bg-card px-4 py-2 text-[13px] font-medium text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 disabled:opacity-50">Save draft</button>
              ) : (
                <button disabled={busy || !form.title.trim() || !form.body.trim()} onClick={() => post({
                  action: 'create_policy', title: form.title, slug: form.slug || undefined,
                  layer: form.layer || undefined, category: form.category || undefined,
                  body: form.body, severity: form.severity,
                }, 'Draft policy created — submit it for review when the text is ready.')}
                  className="rounded-lg border border-border bg-card px-4 py-2 text-[13px] font-medium text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 disabled:opacity-50">Create draft</button>
              )}
              {editing && ((editing.review_state || 'draft') === 'draft' || editing.review_state === 'changes_requested') && (
                <button disabled={busy} onClick={() => post({ action: 'submit_review', id: editing.id }, 'Submitted — the policy is in the desk\'s sign-off queue.')}
                  className="rounded-lg border px-4 py-2 text-[13px] font-medium hover:bg-muted disabled:opacity-50">Submit for review</button>
              )}
              <Link href="/admin/policies/marketplace" className="rounded-lg border px-4 py-2 text-[13px] font-medium hover:bg-muted">
                Sign-off &amp; publish — the governance desk
              </Link>
            </div>

            {editing && (
              <div className="border-t border-border pt-4">
                <h3 className="text-[13px] font-semibold mb-2">Version history</h3>
                {versions.length === 0 ? <p className="text-[12px] text-muted-foreground">Never published — no version snapshots yet.</p>
                : (
                  <div className="space-y-2">
                    {versions.map((v) => (
                      <div key={v.id} className="rounded-lg border border-border px-3 py-2 text-[13px]">
                        <span className="font-semibold">Version {v.version}</span>
                        <span className="text-muted-foreground"> · {v.published_at ? `published ${new Date(v.published_at).toLocaleString()}` : 'not published'}{v.published_by ? ` by ${v.published_by}` : ''}</span>
                        {v.change_notes && <p className="text-muted-foreground mt-0.5">{v.change_notes}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export default function MarketplacePolicyModePage() {
  return (
    <Suspense fallback={<div className="text-[13px] text-muted-foreground">Loading…</div>}>
      <MarketplaceMode />
    </Suspense>
  );
}
