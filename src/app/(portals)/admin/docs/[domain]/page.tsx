'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronDown, ChevronRight, FolderPlus } from 'lucide-react';
import { api, StatusPill, TypeBadge } from '@/components/admin/docs-admin';
import type { DocArticle, DocSection, DocDomain, DocAudience } from '@/components/admin/docs-admin';

// Admin → /admin/docs/[domain]: one domain's recursive section tree.
interface AdminNode { section: DocSection; children: AdminNode[]; articles: DocArticle[] }

function countArticles(node: AdminNode): number {
  return node.articles.length + node.children.reduce((n, c) => n + countArticles(c), 0);
}

export default function AdminDocsDomain({ params }: { params: Promise<{ domain: string }> }) {
  const [domainSlug, setDomainSlug] = useState('');
  const [articles, setArticles] = useState<DocArticle[]>([]);
  const [sections, setSections] = useState<DocSection[]>([]);
  const [domain, setDomain] = useState<DocDomain | null>(null);
  const [audiences, setAudiences] = useState<DocAudience[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const { domain: d } = await params;
      setDomainSlug(d);
      try {
        const [a, s, m] = await Promise.all([
          api('/api/admin/docs/articles'),
          api('/api/admin/docs/sections'),
          api('/api/admin/docs/meta'),
        ]);
        const dom = (m.domains || []).find((x: DocDomain) => x.slug === d);
        setDomain(dom || null);
        setArticles((a.articles || []).filter((x: DocArticle) => x.domain_slug === d));
        setSections((s.sections || []).filter((x: DocSection) => x.domain_slug === d));
        setAudiences(m.audiences || []);
        setExpanded(new Set((s.sections || []).filter((x: DocSection) => x.domain_slug === d && !x.parent_id).map((x: DocSection) => `s:${x.id}`)));
      } catch (e: any) {
        setError(e.message || 'Failed to load.');
      } finally {
        setLoading(false);
      }
    })();
  }, [params]);

  const toggle = (key: string) =>
    setExpanded((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  const roots = useMemo(() => {
    const byId = new Map<string, AdminNode>();
    for (const s of sections) {
      byId.set(s.id, {
        section: s, children: [],
        articles: articles.filter((a) => a.section_id === s.id)
          .sort((x, y) => (x.number || '').localeCompare(y.number || '', undefined, { numeric: true }) || x.sort - y.sort),
      });
    }
    const out: AdminNode[] = [];
    for (const node of byId.values()) {
      const parent = node.section.parent_id ? byId.get(node.section.parent_id) : undefined;
      if (parent) parent.children.push(node); else out.push(node);
    }
    const sort = (ns: AdminNode[]) => {
      ns.sort((a, b) => a.section.sort - b.section.sort || a.section.number.localeCompare(b.section.number, undefined, { numeric: true }));
      ns.forEach((n) => sort(n.children));
    };
    sort(out);
    return out;
  }, [sections, articles]);

  const audienceLabel = (slug: string) => audiences.find((x) => x.slug === slug)?.label || slug;

  if (loading) return <div className="text-[13px] text-muted-foreground">Loading…</div>;
  if (error) throw new Error(error);
  if (!domain) return <div className=""><p className="text-[13px] text-muted-foreground">Domain not found.</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin/docs" className="inline-flex items-center gap-1 text-[12px] font-semibold text-orange-600 hover:text-orange-700">
            <ChevronLeft className="size-3.5" /> Document Center
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">
            <span className="text-orange-600 text-lg mr-2">{domain.number}</span>{domain.title}
          </h1>
        </div>
        <Link href="/admin/docs/sections/new"
          className="px-4 py-2 bg-orange-600 text-white rounded-lg text-[13px] font-semibold hover:bg-orange-700 flex items-center gap-1.5">
          <FolderPlus className="size-4" /> New Section
        </Link>
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
        {roots.map((r) => (
          <TreeNode key={r.section.id} node={r} depth={0} expanded={expanded} toggle={toggle}
            domainSlug={domainSlug} audienceLabel={audienceLabel} />
        ))}
        {roots.length === 0 && <p className="px-5 py-6 text-[13px] text-muted-foreground">No sections in this domain yet.</p>}
      </div>
    </div>
  );
}

function TreeNode({ node, depth, expanded, toggle, domainSlug, audienceLabel }: {
  node: AdminNode; depth: number; expanded: Set<string>; toggle: (k: string) => void;
  domainSlug: string; audienceLabel: (s: string) => string;
}) {
  const { section, children, articles } = node;
  const open = expanded.has(`s:${section.id}`);
  const pad = 20 + depth * 18;
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
              <Link href={`/admin/docs/article/${a.id}`} className="text-[13px] font-medium hover:text-orange-700 truncate flex-1 min-w-0">
                {a.number && <span className="text-muted-foreground mr-1.5">{a.number}</span>}{a.title}
                <span className="text-[11.5px] text-muted-foreground"> · {audienceLabel(a.audience_slug)}</span>
              </Link>
              <StatusPill status={a.status} />
              <TypeBadge t={a.content_type} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
