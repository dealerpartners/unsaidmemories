'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, History, Eye, Rocket, Archive, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { api, slugify, md, StatusPill, TypeBadge, Modal } from '@/components/admin/docs-admin';
import type { DocArticle, DocAudience } from '@/components/admin/docs-admin';

// Admin → /admin/docs/article/[id]: the article editor.
// number + section are READ-ONLY (derived from the section at create).
// Autosaves as draft every 30s — publishing is always explicit.
const TYPES = ['article', 'tooltip', 'policy', 'faq', 'reference'];

export default function AdminDocsEditor({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [id, setId] = useState('');
  const [article, setArticle] = useState<DocArticle | null>(null);
  const [audiences, setAudiences] = useState<DocAudience[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ title: '', slug: '', audience_slug: 'buyer', content_type: 'article', keywords: '', portal_link: '', sort: '0', body: '' });
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<'clean' | 'dirty' | 'saving' | 'saved'>('clean');
  const [lastSaved, setLastSaved] = useState('');
  const [formError, setFormError] = useState('');
  const [publishOpen, setPublishOpen] = useState(false);
  const [changeNote, setChangeNote] = useState('');
  const [actionMsg, setActionMsg] = useState('');
  const formRef = useRef(form);
  formRef.current = form;
  const dirtyRef = useRef(false);

  const load = useCallback(async (articleId: string) => {
    try {
      const [j, m] = await Promise.all([
        api(`/api/admin/docs/articles/${articleId}`),
        api('/api/admin/docs/meta'),
      ]);
      const a: DocArticle = j.article;
      setArticle(a);
      setAudiences(m.audiences || []);
      setForm({
        title: a.title, slug: a.slug, audience_slug: a.audience_slug || 'buyer',
        content_type: a.content_type || 'article', keywords: a.keywords || '',
        portal_link: a.portal_link || '', sort: String(a.sort ?? 0), body: a.body || '',
      });
      dirtyRef.current = false;
      setSaveState('clean');
    } catch (e: any) {
      setError(e.message || 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { id: aid } = await params;
      setId(aid);
      await load(aid);
    })();
  }, [params, load]);

  const saveDraft = useCallback(async (silent = false) => {
    if (!id || saving) return;
    if (!silent) setSaving(true);
    setSaveState('saving');
    setFormError('');
    try {
      const f = formRef.current;
      const j = await api(`/api/admin/docs/articles/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, sort: Number(f.sort) || 0 }),
      });
      setArticle(j.article);
      dirtyRef.current = false;
      setSaveState('saved');
      setLastSaved(new Date().toLocaleTimeString());
    } catch (e: any) {
      setFormError(e.message || 'Save failed.');
      setSaveState('dirty');
    } finally {
      if (!silent) setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Autosave every 30s — draft only, never publishes.
  useEffect(() => {
    const t = setInterval(() => {
      if (dirtyRef.current && !saving) saveDraft(true);
    }, 30000);
    return () => clearInterval(t);
  }, [saveDraft, saving]);

  const markDirty = (patch: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...patch }));
    dirtyRef.current = true;
    setSaveState('dirty');
  };

  const doPublish = async () => {
    setSaving(true); setFormError(''); setActionMsg('');
    try {
      await saveDraft(true);
      const j = await api('/api/admin/docs/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_id: id, change_note: changeNote }),
      });
      setArticle(j.article);
      setPublishOpen(false); setChangeNote('');
      setActionMsg(`Published as v${j.version.version_number}.`);
      dirtyRef.current = false; setSaveState('clean');
    } catch (e: any) {
      setFormError(e.message || 'Publish failed.');
    } finally {
      setSaving(false);
    }
  };

  const doRetire = async () => {
    if (!confirm('Retire this article? It leaves the public site immediately. You can restore a version to draft afterwards.')) return;
    setSaving(true); setActionMsg('');
    try {
      const j = await api('/api/admin/docs/retire', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_id: id }),
      });
      setArticle(j.article);
      setActionMsg('Retired.');
    } catch (e: any) {
      setFormError(e.message || 'Retire failed.');
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!confirm('Delete this DRAFT permanently? This cannot be undone.')) return;
    try {
      await api(`/api/admin/docs/articles/${id}`, { method: 'DELETE' });
      router.push(article?.domain_slug && article?.section_slug ? `/admin/docs/${article.domain_slug}/${article.section_slug}` : '/admin/docs');
    } catch (e: any) {
      setFormError(e.message || 'Delete failed.');
    }
  };

  if (loading) return <div className="text-[13px] text-muted-foreground">Loading editor…</div>;
  if (error || !article) return <div className=""><p className="text-[13px] text-red-700">{error || 'Not found.'}</p></div>;

  const liveUrl = article.status === 'published' && article.domain_slug && article.section_slug
    ? `/docs/${article.domain_slug}/${article.section_slug}/${article.slug}` : null;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={article.domain_slug && article.section_slug ? `/admin/docs/${article.domain_slug}/${article.section_slug}` : '/admin/docs'}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-orange-600 hover:text-orange-700">
            <ChevronLeft className="size-3.5" /> {article.section_number} · {article.section_title}
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight mt-1 flex items-center gap-2 flex-wrap">
            Edit Article
            <StatusPill status={article.status} />
            <TypeBadge t={article.content_type} />
          </h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          {liveUrl && (
            <Link href={liveUrl} target="_blank" className="px-4 py-2 border border-border rounded-lg text-[13px] font-semibold hover:bg-muted flex items-center gap-1.5">
              <Eye className="size-4" /> View live
            </Link>
          )}
          <Link href={`/admin/docs/article/${id}/versions`}
            className="px-4 py-2 border border-border rounded-lg text-[13px] font-semibold hover:bg-muted flex items-center gap-1.5">
            <History className="size-4" /> Versions
          </Link>
          {article.status === 'draft' && (
            <button onClick={doDelete} className="px-4 py-2 border border-red-200 text-red-700 rounded-lg text-[13px] font-semibold hover:bg-red-50 flex items-center gap-1.5 cursor-pointer">
              <Trash2 className="size-4" /> Delete draft
            </button>
          )}
          {article.status === 'published' && (
            <button onClick={doRetire} disabled={saving} className="px-4 py-2 border border-border rounded-lg text-[13px] font-semibold hover:bg-muted flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
              <Archive className="size-4" /> Retire
            </button>
          )}
          {article.status !== 'published' && (
            <button onClick={() => { setPublishOpen(true); setFormError(''); }} className="px-4 py-2 bg-green-700 text-white rounded-lg text-[13px] font-semibold hover:bg-green-800 flex items-center gap-1.5 cursor-pointer">
              <Rocket className="size-4" /> Publish
            </button>
          )}
          <button onClick={() => saveDraft()} disabled={saving} className="px-5 py-2 bg-orange-600 text-white rounded-lg text-[13px] font-semibold hover:bg-orange-700 disabled:opacity-50 cursor-pointer">
            {saving ? 'Saving…' : 'Save Draft'}
          </button>
        </div>
      </div>

      {formError && <p className="text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">{formError}</p>}
      {actionMsg && <p className="text-[13px] text-green-800 bg-green-50 border border-green-200 rounded-lg p-2.5">{actionMsg}</p>}

      <div className="grid gap-4 sm:grid-cols-2 bg-card border border-border rounded-xl p-5">
        <label className="sm:col-span-2 block">
          <span className="text-[12px] font-semibold">Title *</span>
          <input value={form.title} onChange={(e) => {
            const t = e.target.value;
            markDirty({ title: t, slug: slugify(t) });
          }} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-[13px]" />
        </label>
        <label className="block">
          <span className="text-[12px] font-semibold">Slug * <span className="font-normal text-muted-foreground">(auto from title, editable)</span></span>
          <input value={form.slug} onChange={(e) => markDirty({ slug: slugify(e.target.value) })} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-[13px] font-mono" />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-[12px] font-semibold">Number <span className="font-normal text-muted-foreground">(read-only)</span></span>
            <p className="mt-1 rounded-lg bg-muted/60 border border-border px-3 py-2 text-[13px] font-mono">{article.number || '—'}</p>
          </div>
          <div>
            <span className="text-[12px] font-semibold">Section <span className="font-normal text-muted-foreground">(read-only)</span></span>
            <p className="mt-1 rounded-lg bg-muted/60 border border-border px-3 py-2 text-[13px] truncate">{article.section_number} · {article.section_title}</p>
          </div>
        </div>
        <label className="block">
          <span className="text-[12px] font-semibold">Audience</span>
          <select value={form.audience_slug} onChange={(e) => markDirty({ audience_slug: e.target.value })} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-[13px]">
            {audiences.map((a) => <option key={a.slug} value={a.slug}>{a.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-[12px] font-semibold">Type</span>
          <select value={form.content_type} onChange={(e) => markDirty({ content_type: e.target.value })} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-[13px]">
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-[12px] font-semibold">Keywords <span className="font-normal text-muted-foreground">(comma-separated)</span></span>
          <input value={form.keywords} onChange={(e) => markDirty({ keywords: e.target.value })} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-[13px]" />
        </label>
        <label className="block">
          <span className="text-[12px] font-semibold">Portal link</span>
          <input value={form.portal_link} onChange={(e) => markDirty({ portal_link: e.target.value.trim() })} placeholder="/admin/…" className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-[13px] font-mono" />
        </label>
        <label className="block">
          <span className="text-[12px] font-semibold">Sort</span>
          <input value={form.sort} onChange={(e) => markDirty({ sort: e.target.value })} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-[13px]" />
        </label>
        <div className="sm:col-span-2">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold">Body (markdown)</span>
            <button onClick={() => setPreview((p) => !p)} className="text-[12px] font-semibold text-orange-600 cursor-pointer">
              {preview ? 'Edit' : 'Preview'}
            </button>
          </div>
          {preview ? (
            <div className="mt-1 min-h-[320px] rounded-lg border border-border bg-white">
              {form.body ? <ReactMarkdown components={md}>{form.body}</ReactMarkdown>
                : <p className="text-[13px] italic text-muted-foreground">Nothing to preview.</p>}
            </div>
          ) : (
            <textarea value={form.body} onChange={(e) => markDirty({ body: e.target.value })} rows={18}
              placeholder="# Heading&#10;&#10;Write the article in markdown…"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-[13px] font-mono leading-relaxed" />
          )}
        </div>
      </div>

      {publishOpen && (
        <Modal onClose={() => { setPublishOpen(false); setChangeNote(''); }}>
          <h2 className="text-lg font-bold flex items-center gap-2"><Rocket className="size-5 text-green-700" /> Publish “{form.title || article.title}”</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Validated, versioned (v = max+1), audited, and the public page revalidated. This makes the article live.
          </p>
          {formError && <p className="mt-2 text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">{formError}</p>}
          <label className="block mt-4">
            <span className="text-[12px] font-semibold">Change note <span className="font-normal text-muted-foreground">(stored with the version)</span></span>
            <textarea value={changeNote} onChange={(e) => setChangeNote(e.target.value)} rows={3}
              placeholder="What changed in this version?"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-[13px]" />
          </label>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => { setPublishOpen(false); setChangeNote(''); }} className="px-4 py-2 border border-border rounded-lg text-[13px] font-semibold cursor-pointer">Cancel</button>
            <button onClick={doPublish} disabled={saving} className="px-5 py-2 bg-green-700 text-white rounded-lg text-[13px] font-semibold hover:bg-green-800 disabled:opacity-50 cursor-pointer">
              {saving ? 'Publishing…' : 'Publish'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
