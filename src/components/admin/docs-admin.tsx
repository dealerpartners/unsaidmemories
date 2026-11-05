'use client';

import { X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

// Shared UI for /admin/docs/* (Document Center management).

export type DocArticle = {
  id: string; section_id: string | null; number: string | null; title: string; slug: string;
  audience_slug: string; content_type: string; status: string;
  body: string | null; keywords: string | null; portal_link: string | null; sort: number;
  published_at: string | null; updated_at: string;
  section_number?: string | null; section_title?: string | null; section_slug?: string | null;
  domain_slug?: string | null; domain_title?: string | null; domain_number?: string | null;
  // S4 per-tenant authoring: scope marks whose row this is in the editor
  // ('own' | 'master' read-only | 'signoff' queue); sign-off state rides
  // tenant policy-class articles (migration 20261096).
  scope?: string; signoff_status?: string | null; signoff_at?: string | null;
  owner_tenant_name?: string | null;
};
export type DocSection = {
  id: string; domain_id: string | null; parent_id: string | null; number: string; title: string;
  slug: string; description: string | null; sort: number;
  domain_slug?: string | null; domain_title?: string | null; domain_number?: string | null;
  article_count?: number;
};
export type DocDomain = { id: string; number: string; title: string; slug: string; sort: number };
export type DocAudience = { id: string; slug: string; label: string; sort: number };
export type DocVersion = {
  id: string; article_id: string; version_number: number; title: string; body: string | null;
  change_note: string | null; published_by: string | null; published_at: string;
};

export const md: Record<string, any> = {
  h1: ({ node, ...p }: any) => <h1 className="mb-2 mt-4 text-xl font-bold" {...p} />,
  h2: ({ node, ...p }: any) => <h2 className="mb-2 mt-4 text-lg font-bold" {...p} />,
  h3: ({ node, ...p }: any) => <h3 className="mb-1 mt-3 text-base font-semibold" {...p} />,
  p: ({ node, ...p }: any) => <p className="my-2 text-[13.5px] leading-relaxed text-muted-foreground" {...p} />,
  ul: ({ node, ...p }: any) => <ul className="my-2 list-disc space-y-1 pl-5 text-[13.5px] text-muted-foreground" {...p} />,
  ol: ({ node, ...p }: any) => <ol className="my-2 list-decimal space-y-1 pl-5 text-[13.5px] text-muted-foreground" {...p} />,
  a: ({ node, ...p }: any) => <a className="text-orange-600 underline" {...p} />,
  code: ({ node, inline, ...p }: any) =>
    inline ? <code className="rounded bg-muted px-1 py-0.5 font-mono text-[12px]" {...p} /> : <code className="font-mono text-[12px]" {...p} />,
  pre: ({ node, ...p }: any) => <pre className="my-2 overflow-x-auto rounded-lg bg-neutral-900 p-3 text-neutral-100" {...p} />,
};

export async function api(url: string, init?: RequestInit) {
  const r = await fetch(url, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
}

export function slugify(s: string) {
  return s.toLowerCase().trim().replace(/['']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
}

/** [empty] = section has no article row yet (EVERY-NODE pattern). */
export function StatusPill({ status }: { status: string | null }) {
  if (!status)
    return <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">[empty]</span>;
  if (status === 'published')
    return <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800">Published</span>;
  if (status === 'retired')
    return <span className="rounded-full bg-neutral-300 px-2 py-0.5 text-[11px] font-semibold text-neutral-700">Retired</span>;
  return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Draft</span>;
}

export function TypeBadge({ t }: { t: string }) {
  const map: Record<string, string> = {
    article: 'bg-brand-teal/10 text-brand-teal',
    tooltip: 'bg-purple-100 text-purple-800',
    policy: 'bg-red-100 text-red-800',
    faq: 'bg-teal-100 text-teal-800',
    reference: 'bg-brand-teal/10 text-brand-teal',
  };
  const cls = map[t] || 'bg-neutral-200 text-neutral-700';
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{t}</span>;
}

export function Modal({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div
        className={`my-8 w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} rounded-xl bg-card border border-border p-6 shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-end -mt-2 -mr-2">
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground cursor-pointer" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
