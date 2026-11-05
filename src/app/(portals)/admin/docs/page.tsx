'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BookOpen, Search, ChevronDown, ChevronRight, FolderPlus, ScrollText } from 'lucide-react';
import { api, StatusPill, TypeBadge } from '@/components/admin/docs-admin';
import type { DocArticle, DocSection, DocDomain, DocAudience } from '@/components/admin/docs-admin';

// Admin → Document Center index: domain list + recursive section tree.
// Article management lives at /admin/docs/article/[id]; versions at
// /admin/docs/article/[id]/versions; new sections at /admin/docs/sections/new.

interface AdminNode { section: DocSection; children: AdminNode[]; articles: DocArticle[] }

function countArticles(node: AdminNode): number {
  return node.articles.length + node.children.reduce((n, c) => n + countArticles(c), 0);
}

export default function AdminDocsIndex() {
  const [articles, setArticles] = useState<DocArticle[]>([]);
  const [sections, setSections] = useState<DocSection[]>([]);
  const [domains, setDomains] = useState<DocDomain[]>([]);
  const [audiences, setAudiences] = useState<DocAudience[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true); setError(''); setMissing('');
    try {
      const [a, s, m] = await Promise.all([
        api('/api/admin/docs/articles'),
        api('/api/admin/docs/sections'),
        api('/api/admin/docs/meta'),
      ]);
      setArticles(a.articles || []);
      setSections(s.sections || []);
      setDomains(m.domains || []);
      setAudiences(m.audiences || []);
      if ((m.domains || []).length) {
        setExpanded((prev) => prev.size ? prev : new Set((m.domains || []).map((d: DocDomain) => `d:${d.id}`)));
      }
    } catch (e: any) {
      const msg = e.message || 'Failed to load.';
      if (/missing/i.test(msg)) setMissing(msg);
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = (key: string) =>
    setExpanded((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  const q = query.trim().toLowerCase();
  // S4 scopes: the tree holds this tenant's OWN articles; master rows
  // (read-only) and the sign-off queue render in their own panels below.
  const ownArticles = useMemo(() => articles.filter((a) => !a.scope || a.scope === 'own'), [articles]);
  const masterArticles = useMemo(() => articles.filter((a) => a.scope === 'master'), [articles]);
  const signoffQueue = useMemo(() => articles.filter((a) => a.scope === 'signoff'), [articles]);
  const ownPolicies = useMemo(
    () => ownArticles.filter((a) => a.content_type === 'policy'),
    [ownArticles],
  );
  const filteredArticles = useMemo(
    () => q ? ownArticles.filter((a) => `${a.title} ${a.number || ''} ${a.keywords || ''} ${a.slug}`.toLowerCase().includes(q)) : ownArticles,
    [ownArticles, q],
  );

  const [signoffBusy, setSignoffBusy] = useState<string | null>(null);
  const decideSignoff = async (articleId: string, decision: 'approved' | 'rejected') => {
    setSignoffBusy(articleId);
    try {
      await api('/api/admin/docs/signoff', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ article_id: articleId, decision }),
      });
      await load();
    } catch (e: any) {
      setError(e.message || 'Sign-off failed.');
    } finally {
      setSignoffBusy(null);
    }
  };

  const tree = useMemo(() => {
    const byId = new Map<string, AdminNode>();
    for (const s of sections) {
      byId.set(s.id, {
        section: s,
        children: [],
        articles: filteredArticles
          .filter((a) => a.section_id === s.id)
          .sort((x, y) => (x.number || '').localeCompare(y.number || '', undefined, { numeric: true }) || x.sort - y.sort),
      });
    }
    const sortNodes = (ns: AdminNode[]) => {
      ns.sort((a, b) => a.section.sort - b.section.sort || a.section.number.localeCompare(b.section.number, undefined, { numeric: true }));
      ns.forEach((n) => sortNodes(n.children));
    };
    const rootsByDomain = new Map<string, AdminNode[]>();
    for (const d of domains) rootsByDomain.set(d.id, []);
    for (const node of byId.values()) {
      const parent = node.section.parent_id ? byId.get(node.section.parent_id) : undefined;
      if (parent) parent.children.push(node);
      else {
        const list = rootsByDomain.get(node.section.domain_id || '');
        if (list) list.push(node);
        else rootsByDomain.set(node.section.domain_id || '', [node]);
      }
    }
    for (const list of rootsByDomain.values()) sortNodes(list);
    return domains.map((domain) => ({ domain, roots: rootsByDomain.get(domain.id) || [] }));
  }, [domains, sections, filteredArticles]);

  const audienceLabel = (slug: string) => audiences.find((x) => x.slug === slug)?.label || slug;

  if (loading) return <div className="text-[13px] text-muted-foreground">Loading Document Center…</div>;

  if (missing) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><BookOpen className="size-6" /> Document Center</h1>
        <div className="bg-card border border-border rounded-xl p-10 text-center max-w-xl">
          <BookOpen className="size-10 mx-auto text-muted-foreground/40" />
          <p className="text-[15px] font-semibold mt-3">Schema not run yet</p>
          <p className="text-[13px] text-muted-foreground mt-1">{missing}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <BookOpen className="size-6" /> Document Center
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/docs/guides"
            className="px-4 py-2 border border-border bg-card rounded-lg text-[13px] font-semibold hover:bg-muted flex items-center gap-1.5">
            <BookOpen className="size-4" /> Admin Guides
          </Link>
          <Link href="/admin/docs/marketplace"
            className="px-4 py-2 border border-border bg-card rounded-lg text-[13px] font-semibold hover:bg-muted flex items-center gap-1.5">
            <ScrollText className="size-4" /> Marketplace Policy Mode
          </Link>
          <Link href="/admin/docs/sections/new"
            className="px-4 py-2 bg-orange-600 text-white rounded-lg text-[13px] font-semibold hover:bg-orange-700 flex items-center gap-1.5">
            <FolderPlus className="size-4" /> New Section
          </Link>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl text-[13px] text-red-800">{error}</div>}

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search articles…"
          className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-200" />
      </div>

      <div className="space-y-4">
        {tree.map(({ domain, roots }) => (
          <div key={domain.id} className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex w-full items-center gap-2 px-5 py-3.5">
              <button onClick={() => toggle(`d:${domain.id}`)} className="flex items-center gap-2 cursor-pointer" aria-label="Toggle domain">
                {expanded.has(`d:${domain.id}`) ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
              </button>
              <span className="text-[11px] font-bold text-orange-600">{domain.number}</span>
              <Link href={`/admin/docs/${domain.slug}`} className="text-[15px] font-bold hover:text-orange-700">{domain.title}</Link>
              <span className="ml-auto text-[12px] text-muted-foreground">
                {roots.reduce((n, r) => n + countArticles(r), 0)} articles
              </span>
            </div>
            {expanded.has(`d:${domain.id}`) && (
              <div className="border-t border-border divide-y divide-border">
                {roots.length === 0 && <p className="px-5 py-4 text-[13px] text-muted-foreground">No sections yet.</p>}
                {roots.map((r) => (
                  <TreeNode key={r.section.id} node={r} depth={0} expanded={expanded} toggle={toggle}
                    domainSlug={domain.slug} audienceLabel={audienceLabel} />
                ))}
              </div>
            )}
          </div>
        ))}
        {tree.length === 0 && (
          <div className="bg-card border border-border rounded-xl p-10 text-center">
            <p className="text-[14px] font-medium">No domains found</p>
            <p className="text-[13px] text-muted-foreground mt-1">Run the Document Center schema to seed the domains and sections.</p>
          </div>
        )}
      </div>

      {signoffQueue.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border">
            <h2 className="text-[15px] font-bold">Tenant policy sign-off queue</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Policy-class articles from franchise tenants awaiting master sign-off. Approval does not
              publish them — the tenant publishes afterwards; the publish gate refuses until approval exists.
            </p>
          </div>
          <div className="divide-y divide-border">
            {signoffQueue.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium truncate">{a.title}</p>
                  <p className="text-[11.5px] text-muted-foreground truncate">
                    /{a.slug} · {audienceLabel(a.audience_slug)} · from {a.owner_tenant_name || 'a tenant'} · updated {new Date(a.updated_at).toLocaleString()}
                  </p>
                </div>
                <button disabled={signoffBusy === a.id} onClick={() => decideSignoff(a.id, 'approved')}
                  className="rounded-lg border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 disabled:opacity-50">Approve</button>
                <button disabled={signoffBusy === a.id} onClick={() => decideSignoff(a.id, 'rejected')}
                  className="rounded-lg border px-3 py-1.5 text-[12px] font-medium hover:bg-muted disabled:opacity-50">Reject</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {ownPolicies.some((a) => a.signoff_status && a.signoff_status !== 'not_required') && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border">
            <h2 className="text-[15px] font-bold">Your policy articles — master sign-off</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Tenant policy content publishes only after the master tenant signs off. Editing an approved
              policy&rsquo;s title or body sends it back for a fresh sign-off.
            </p>
          </div>
          <div className="divide-y divide-border">
            {ownPolicies.filter((a) => a.signoff_status && a.signoff_status !== 'not_required').map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/docs/article/${a.id}`} className="text-[13px] font-medium hover:text-orange-700 truncate block">{a.title}</Link>
                  <p className="text-[11.5px] text-muted-foreground truncate">/{a.slug} · {a.status}</p>
                </div>
                <span className="text-[12px] font-medium capitalize">{a.signoff_status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {masterArticles.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border">
            <h2 className="text-[15px] font-bold">Master documents (read-only)</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Published by the master tenant for every tenant&rsquo;s readers. You can&rsquo;t edit these —
              author your own article with the same slug and it shadows the master copy for your
              tenant&rsquo;s readers only.
            </p>
          </div>
          <div className="divide-y divide-border">
            {masterArticles.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium truncate">{a.title}</p>
                  <p className="text-[11.5px] text-muted-foreground truncate">/{a.slug} · {audienceLabel(a.audience_slug)} · {a.content_type}</p>
                </div>
                <StatusPill status={a.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TreeNode({ node, depth, expanded, toggle, domainSlug, audienceLabel }: {
  node: AdminNode; depth: number; expanded: Set<string>; toggle: (k: string) => void;
  domainSlug: string; audienceLabel: (s: string) => string;
}) {
  const { section, children, articles } = node;
  const open = expanded.has(`s:${section.id}`);
  const pad = 36 + depth * 18;
  return (
    <div>
      <div className="flex w-full items-center gap-2 px-5 py-2.5 hover:bg-muted/50" style={{ paddingLeft: pad }}>
        <button onClick={() => toggle(`s:${section.id}`)} className="flex items-center gap-2 cursor-pointer" aria-label="Toggle section">
          {open ? <ChevronDown className="size-3.5 text-muted-foreground" /> : <ChevronRight className="size-3.5 text-muted-foreground" />}
        </button>
        <span className="text-[12px] text-muted-foreground">{section.number}</span>
        <Link href={`/admin/docs/${domainSlug}/${section.slug}`} className="text-[13.5px] font-semibold hover:text-orange-700">
          {section.title}
        </Link>
        
        {articles.length === 0 && children.length === 0 && <StatusPill status={null} />}
        <span className="ml-auto text-[12px] text-muted-foreground">{countArticles(node)}</span>
      </div>
      {open && (
        <div className="bg-muted/30">
          {children.map((c) => (
            <TreeNode key={c.section.id} node={c} depth={depth + 1} expanded={expanded} toggle={toggle}
              domainSlug={domainSlug} audienceLabel={audienceLabel} />
          ))}
          {articles.map((a) => (
            <div key={a.id} className="flex items-center gap-2 px-5 py-2 border-t border-border/60 hover:bg-muted/50" style={{ paddingLeft: pad + 24 }}>
              <div className="min-w-0 flex-1">
                <Link href={`/admin/docs/article/${a.id}`} className="text-[13px] font-medium hover:text-orange-700 truncate block">
                  {a.number && <span className="text-muted-foreground mr-1.5">{a.number}</span>}{a.title}
                </Link>
                <p className="text-[11.5px] text-muted-foreground truncate">/{a.slug} · {audienceLabel(a.audience_slug)}</p>
              </div>
              <StatusPill status={a.status} />
              <TypeBadge t={a.content_type} />
              <Link href={`/admin/docs/article/${a.id}/versions`}
                className="text-[12px] font-semibold text-orange-600 hover:text-orange-700 ml-1">Versions</Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
