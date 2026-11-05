'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Plus, History } from 'lucide-react';
import { api, slugify, StatusPill, TypeBadge, Modal } from '@/components/admin/docs-admin';
import type { DocArticle, DocSection, DocAudience } from '@/components/admin/docs-admin';

// Admin → /admin/docs/[domain]/[section]: articles in a section + new article.
export default function AdminDocsSection({ params }: { params: Promise<{ domain: string; section: string }> }) {
  const router = useRouter();
  const [slugs, setSlugs] = useState({ domain: '', section: '' });
  const [section, setSection] = useState<DocSection | null>(null);
  const [articles, setArticles] = useState<DocArticle[]>([]);
  const [audiences, setAudiences] = useState<DocAudience[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', audience_slug: 'buyer', content_type: 'article' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    (async () => {
      const { domain, section: ss } = await params;
      setSlugs({ domain, section: ss });
      try {
        const [a, s, m] = await Promise.all([
          api('/api/admin/docs/articles'),
          api('/api/admin/docs/sections'),
          api('/api/admin/docs/meta'),
        ]);
        const sec = (s.sections || []).find((x: DocSection) => x.slug === ss && x.domain_slug === domain);
        setSection(sec || null);
        setArticles((a.articles || []).filter((x: DocArticle) => sec && x.section_id === sec.id)
          .sort((x: DocArticle, y: DocArticle) => x.sort - y.sort || (x.audience_slug || '').localeCompare(y.audience_slug || '')));
        setAudiences(m.audiences || []);
      } catch (e: any) {
        setError(e.message || 'Failed to load.');
      } finally {
        setLoading(false);
      }
    })();
  }, [params]);

  const create = async () => {
    if (!section) return;
    setSaving(true); setFormError('');
    try {
      const j = await api('/api/admin/docs/articles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim() || 'Untitled article',
          slug: slugify(form.title) || undefined,
          section_id: section.id,
          audience_slug: form.audience_slug,
          content_type: form.content_type,
        }),
      });
      router.push(`/admin/docs/article/${j.article.id}`);
    } catch (e: any) {
      setFormError(e.message || 'Could not create the article.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-[13px] text-muted-foreground">Loading…</div>;
  if (error) throw new Error(error);
  if (!section) return <div className=""><p className="text-[13px] text-muted-foreground">Section not found.</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/admin/docs/${slugs.domain}`} className="inline-flex items-center gap-1 text-[12px] font-semibold text-orange-600 hover:text-orange-700">
            <ChevronLeft className="size-3.5" /> {section.domain_title || 'Domain'}
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight mt-1 flex items-center gap-2">
            <span className="text-orange-600 text-lg">{section.number}</span>{section.title}
            
          </h1>
        </div>
        <button onClick={() => { setCreating(true); setFormError(''); }}
          className="px-4 py-2 bg-orange-600 text-white rounded-lg text-[13px] font-semibold hover:bg-orange-700 flex items-center gap-1.5 cursor-pointer">
          <Plus className="size-4" /> New Article
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {articles.length === 0 ? (
          <div className="p-10 text-center">
            <StatusPill status={null} />
            <p className="text-[14px] font-medium mt-3">No articles yet</p>
            <p className="text-[13px] text-muted-foreground mt-1">
              Every section gets an overview article. Create the first one for {section.number}.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {articles.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/50">
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/docs/article/${a.id}`} className="text-[14px] font-semibold hover:text-orange-700 truncate block">
                    {a.title}
                  </Link>
                  <p className="text-[12px] text-muted-foreground truncate">
                    {a.number} · /{a.slug} · {audiences.find((x) => x.slug === a.audience_slug)?.label || a.audience_slug}
                  </p>
                </div>
                <StatusPill status={a.status} />
                <TypeBadge t={a.content_type} />
                <Link href={`/admin/docs/article/${a.id}/versions`}
                  className="flex items-center gap-1 text-[12px] font-semibold text-orange-600 hover:text-orange-700">
                  <History className="size-3.5" /> Versions
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {creating && (
        <Modal onClose={() => setCreating(false)}>
          <h2 className="text-lg font-bold">New article in {section.number}</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Number <span className="font-mono font-semibold text-foreground">{section.number}</span> is
            derived from the section (read-only). A draft is created first — publishing is always explicit.
          </p>
          {formError && <p className="mt-2 text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">{formError}</p>}
          <div className="mt-4 grid gap-4">
            <label className="block">
              <span className="text-[12px] font-semibold">Title *</span>
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Setting up your Resend key"
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-[13px]" />
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="text-[12px] font-semibold">Audience</span>
                <select value={form.audience_slug} onChange={(e) => setForm((f) => ({ ...f, audience_slug: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-[13px]">
                  {audiences.map((a) => <option key={a.slug} value={a.slug}>{a.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-[12px] font-semibold">Type</span>
                <select value={form.content_type} onChange={(e) => setForm((f) => ({ ...f, content_type: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-[13px]">
                  {['article', 'tooltip', 'policy', 'faq', 'reference'].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => setCreating(false)} className="px-4 py-2 border border-border rounded-lg text-[13px] font-semibold cursor-pointer">Cancel</button>
            <button onClick={create} disabled={saving} className="px-5 py-2 bg-orange-600 text-white rounded-lg text-[13px] font-semibold hover:bg-orange-700 disabled:opacity-50 cursor-pointer">
              {saving ? 'Creating…' : 'Create Draft & Edit'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
