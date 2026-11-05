'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, FolderPlus } from 'lucide-react';
import { api, slugify } from '@/components/admin/docs-admin';
import type { DocDomain, DocSection } from '@/components/admin/docs-admin';

// Admin → /admin/docs/sections/new: create a section under a domain,
// optionally nested under a parent section (parent_id).
export default function AdminDocsSectionNew() {
  const router = useRouter();
  const [domains, setDomains] = useState<DocDomain[]>([]);
  const [sections, setSections] = useState<DocSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ domain_id: '', parent_id: '', number: '', title: '', slug: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const m = await api('/api/admin/docs/meta');
        setDomains(m.domains || []);
        setSections(m.sections || []);
      } catch (e: any) {
        setError(e.message || 'Failed to load.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Indented flat list for the parent dropdown.
  const sectionsFlat = useMemo(() => {
    const out: { section: DocSection; depth: number }[] = [];
    const byId = new Map(sections.map((s) => [s.id, s]));
    const visit = (id: string, depth: number, guard: Set<string>) => {
      if (guard.has(id)) return;
      guard.add(id);
      const s = byId.get(id);
      if (!s) return;
      out.push({ section: s, depth });
      sections
        .filter((x) => x.parent_id === id)
        .sort((a, b) => a.sort - b.sort || a.number.localeCompare(b.number, undefined, { numeric: true }))
        .forEach((c) => visit(c.id, depth + 1, guard));
    };
    sections
      .filter((s) => !s.parent_id)
      .sort((a, b) => a.sort - b.sort || a.number.localeCompare(b.number, undefined, { numeric: true }))
      .forEach((s) => visit(s.id, 0, new Set()));
    for (const s of sections) if (!out.some((o) => o.section.id === s.id)) out.push({ section: s, depth: 0 });
    return out;
  }, [sections]);

  const save = async () => {
    setSaving(true); setError('');
    try {
      const j = await api('/api/admin/docs/sections', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const sec: DocSection = j.section;
      const dslug = domains.find((d) => d.id === form.domain_id)?.slug;
      router.push(dslug ? `/admin/docs/${dslug}/${sec.slug}` : '/admin/docs');
    } catch (e: any) {
      setError(e.message || 'Could not create section.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-[13px] text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href="/admin/docs" className="inline-flex items-center gap-1 text-[12px] font-semibold text-orange-600 hover:text-orange-700">
          <ChevronLeft className="size-3.5" /> Document Center
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-1 flex items-center gap-2">
          <FolderPlus className="size-6" /> New Section
        </h1>
      </div>

      {error && <p className="text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">{error}</p>}

      <div className="grid gap-4 bg-card border border-border rounded-xl p-5">
        <label className="block">
          <span className="text-[12px] font-semibold">Domain *</span>
          <select value={form.domain_id} onChange={(e) => setForm((f) => ({ ...f, domain_id: e.target.value, parent_id: '' }))}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-[13px]">
            <option value="">— Select —</option>
            {domains.map((d) => <option key={d.id} value={d.id}>{d.number} · {d.title}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-[12px] font-semibold">Parent section <span className="font-normal text-muted-foreground">(empty = top-level)</span></span>
          <select value={form.parent_id} onChange={(e) => setForm((f) => ({ ...f, parent_id: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-[13px]">
            <option value="">— Top-level —</option>
            {sectionsFlat
              .filter(({ section }) => !form.domain_id || section.domain_id === form.domain_id)
              .map(({ section, depth }) => (
                <option key={section.id} value={section.id}>
                  {'\u00A0\u00A0'.repeat(depth)}{section.number} · {section.title}
                </option>
              ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-[12px] font-semibold">Number * <span className="font-normal text-muted-foreground">(label only)</span></span>
            <input value={form.number} onChange={(e) => setForm((f) => ({ ...f, number: e.target.value.trim() }))}
              placeholder="3.8.14" className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-[13px] font-mono" />
          </label>
          <label className="block">
            <span className="text-[12px] font-semibold">Slug <span className="font-normal text-muted-foreground">(auto from title)</span></span>
            <input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: slugify(e.target.value) }))}
              placeholder="auto" className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-[13px] font-mono" />
          </label>
        </div>
        <label className="block">
          <span className="text-[12px] font-semibold">Title *</span>
          <input value={form.title} onChange={(e) => {
            const t = e.target.value;
            setForm((f) => ({ ...f, title: t, slug: f.slug || slugify(t) }));
          }} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-[13px]" />
        </label>
        <label className="block">
          <span className="text-[12px] font-semibold">Description</span>
          <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-[13px]" />
        </label>
      </div>

      <div className="flex justify-end gap-2">
        <Link href="/admin/docs" className="px-4 py-2 border border-border rounded-lg text-[13px] font-semibold">Cancel</Link>
        <button onClick={save} disabled={saving} className="px-5 py-2 bg-orange-600 text-white rounded-lg text-[13px] font-semibold hover:bg-orange-700 disabled:opacity-50 cursor-pointer">
          {saving ? 'Creating…' : 'Create Section'}
        </button>
      </div>
    </div>
  );
}
