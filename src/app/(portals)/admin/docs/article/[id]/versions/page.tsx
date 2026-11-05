'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, RotateCcw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { api, md, StatusPill } from '@/components/admin/docs-admin';
import type { DocVersion } from '@/components/admin/docs-admin';

// Admin → /admin/docs/article/[id]/versions: version history with a simple
// line diff between consecutive versions. Restoring copies a version into a
// NEW DRAFT — version rows are never rewritten or deleted.

type DiffLine = { kind: 'same' | 'add' | 'del'; text: string };

/** Simple LCS-based line diff (fine for doc-sized texts). */
function diffLines(a: string, b: string): DiffLine[] {
  const A = a.split('\n');
  const B = b.split('\n');
  const n = A.length, m = B.length;
  // Guard against pathological sizes.
  if (n * m > 400000) {
    return [
      ...A.map((text) => ({ kind: 'del' as const, text })),
      ...B.map((text) => ({ kind: 'add' as const, text })),
    ];
  }
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ kind: 'same', text: A[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ kind: 'del', text: A[i] }); i++; }
    else { out.push({ kind: 'add', text: B[j] }); j++; }
  }
  while (i < n) out.push({ kind: 'del', text: A[i++] });
  while (j < m) out.push({ kind: 'add', text: B[j++] });
  return out;
}

export default function AdminDocsVersions({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState('');
  const [versions, setVersions] = useState<DocVersion[]>([]);
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [compare, setCompare] = useState<string | null>(null); // version id to diff vs its predecessor
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      const { id: aid } = await params;
      setId(aid);
      try {
        const j = await api(`/api/admin/docs/versions?article_id=${aid}`);
        const vs: DocVersion[] = j.versions || [];
        setVersions(vs);
      } catch (e: any) {
        setError(e.message || 'Failed to load.');
      } finally {
        setLoading(false);
      }
    })();
  }, [params]);

  // Article title/status for the header.
  useEffect(() => {
    if (!id) return;
    api(`/api/admin/docs/articles/${id}`)
      .then((j) => { setTitle(j.article.title); setStatus(j.article.status); })
      .catch(() => {});
  }, [id]);

  const restore = async (v: DocVersion) => {
    if (!confirm(`Restore v${v.version_number} (“${v.title}”) as a new draft? History is never rewritten.`)) return;
    setMsg('');
    try {
      await api('/api/admin/docs/restore', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_id: id, version_id: v.id }),
      });
      const j = await api(`/api/admin/docs/versions?article_id=${id}`);
      setVersions(j.versions || []);
      setMsg(`v${v.version_number} restored as a new draft. Publish to mint v${(j.versions || []).length ? Math.max(...(j.versions as DocVersion[]).map((x) => x.version_number)) + 1 : 1}.`);
    } catch (e: any) {
      setMsg(e.message || 'Restore failed.');
    }
  };

  if (loading) return <div className="text-[13px] text-muted-foreground">Loading versions…</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <Link href={`/admin/docs/article/${id}`} className="inline-flex items-center gap-1 text-[12px] font-semibold text-orange-600 hover:text-orange-700">
          <ChevronLeft className="size-3.5" /> Back to editor
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-1 flex items-center gap-2 flex-wrap">
          Version history {status && <StatusPill status={status} />}
        </h1>
      </div>

      {error && <p className="text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">{error}</p>}
      {msg && <p className="text-[13px] text-green-800 bg-green-50 border border-green-200 rounded-lg p-2.5">{msg}</p>}

      {versions.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-10 text-center">
          <p className="text-[14px] font-medium">No published versions yet</p>
          <p className="text-[13px] text-muted-foreground mt-1">Publish the article to create v1.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {versions.map((v, idx) => {
            const prev = versions[idx + 1]; // versions are newest-first
            const showing = compare === v.id;
            const diff = showing ? diffLines(prev?.body || '', v.body || '') : [];
            const changed = diff.filter((d) => d.kind !== 'same').length;
            return (
              <div key={v.id} className="border border-border rounded-xl bg-card">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[11px] font-bold">v{v.version_number}</span>
                  <span className="text-[13px] font-semibold">{v.title}</span>
                  <span className="ml-auto text-[12px] text-muted-foreground">
                    {new Date(v.published_at).toLocaleString()}{v.published_by ? ` · ${v.published_by}` : ''}
                  </span>
                  {prev && (
                    <button onClick={() => setCompare(showing ? null : v.id)}
                      className="px-3 py-1.5 border border-border rounded-lg text-[12px] font-semibold hover:bg-muted cursor-pointer">
                      {showing ? 'Hide diff' : `Diff vs v${prev.version_number}`}
                    </button>
                  )}
                  <button onClick={() => restore(v)} title="Restore as new draft"
                    className="flex items-center gap-1 px-3 py-1.5 border border-border rounded-lg text-[12px] font-semibold hover:bg-muted cursor-pointer">
                    <RotateCcw className="size-3.5" /> Restore as draft
                  </button>
                </div>
                {v.change_note && <p className="mt-1.5 text-[12.5px] italic text-muted-foreground">“{v.change_note}”</p>}
                {showing && (
                  <div className="mt-3 rounded-lg border border-border overflow-hidden">
                    <p className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/50">
                      {changed} changed line{changed === 1 ? '' : 's'} vs v{prev.version_number}
                    </p>
                    <div className="max-h-96 overflow-y-auto font-mono text-[12px] leading-relaxed">
                      {diff.map((d, i) => (
                        <div key={i} className={`px-3 py-0.5 whitespace-pre-wrap break-words ${ d.kind === 'add' ? 'bg-green-50 text-green-900' : d.kind === 'del' ? 'adm-badge adm-badge-red' : 'text-muted-foreground' }`}>
                          <span className="mr-2 select-none opacity-60">{d.kind === 'add' ? '+' : d.kind === 'del' ? '−' : ' '}</span>
                          {d.text || ' '}
                        </div>
                      ))}
                      {diff.length === 0 && <p className="px-3 py-2 text-muted-foreground font-sans">No differences.</p>}
                    </div>
                  </div>
                )}
                {!showing && v.body && (
                  <details className="mt-2">
                    <summary className="text-[12px] font-semibold text-orange-600 cursor-pointer">View body</summary>
                    <div className="mt-1 rounded-lg bg-muted/40 p-3 max-h-64 overflow-y-auto">
                      <ReactMarkdown components={md}>{v.body}</ReactMarkdown>
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
