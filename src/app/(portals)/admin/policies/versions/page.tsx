'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { History } from 'lucide-react';

type MarketplaceVersion = {
  id: string;
  policy_id: string;
  version: number;
  change_notes: string | null;
  published_by: string | null;
  published_at: string | null;
  created_at: string;
  policy_title: string;
  policy_slug: string | null;
  policy_current_version: number | null;
};

type MarketplacePolicy = {
  id: string;
  title: string;
  slug: string | null;
  status: string | null;
  current_version: number | null;
  updated_at: string | null;
};

type SitePolicy = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export default function PolicyVersionsPage() {
  const [versions, setVersions] = useState<MarketplaceVersion[]>([]);
  const [marketplacePolicies, setMarketplacePolicies] = useState<MarketplacePolicy[]>([]);
  const [sitePolicies, setSitePolicies] = useState<SitePolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/policies/versions').then((r) => (r.ok ? r.json() : { versions: [], marketplacePolicies: [] })),
      fetch('/api/admin/policies').then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || `Request failed (${r.status})`);
        }
        return r.json();
      }),
    ])
      .then(([v, s]) => {
        setVersions(v.versions || []);
        setMarketplacePolicies(v.marketplacePolicies || []);
        setSitePolicies(s.policies || []);
      })
      .catch((e) => setError(e.message || 'Failed to load policy versions'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <History className="size-6" /> Policy Version History
          </h1>
        </div>
        <Link href="/admin/policies"
          className="px-4 py-2 border border-border rounded-lg text-[13px] font-semibold hover:bg-muted cursor-pointer">
          Back to Policies
        </Link>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-[13px]">Loading…</div>
      ) : error ? (
        <div className="bg-card border border-border rounded-xl text-center">
          <p className="text-[14px] font-medium text-foreground">Couldn't load policy versions</p>
          <p className="text-[13px] text-muted-foreground mt-1">{error}</p>
        </div>
      ) : (
        <>
          {/* Marketplace policy versions — real rows from seller_policy_versions */}
          <div className="space-y-3">
            <h2 className="text-[15px] font-semibold text-foreground">Marketplace policies</h2>
            {marketplacePolicies.length === 0 ? (
              <div className="bg-card border border-border rounded-xl text-center">
                <History className="size-8 mx-auto text-muted-foreground/40" />
                <p className="text-[14px] font-medium text-foreground mt-3">No marketplace policies yet</p>
                <p className="text-[13px] text-muted-foreground mt-1">
                  The marketplace policy registry is empty. When a marketplace policy is published, each published
                  version is recorded here with its change notes.
                </p>
              </div>
            ) : versions.length === 0 ? (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="adm-table-wrap"><table className="adm-table">
                  <thead>
                    <tr>
                      <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Policy</th>
                      <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Current version</th>
                      <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                      <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marketplacePolicies.map((p) => (
                      <tr key={p.id} className="border-t border-border hover:bg-muted/50">
                        <td className="p-3 font-medium">{p.title}</td>
                        <td className="p-3 text-muted-foreground">{p.current_version != null ? `v${p.current_version}` : '—'}</td>
                        <td className="p-3 text-muted-foreground capitalize">{p.status || '—'}</td>
                        <td className="p-3 text-muted-foreground">{fmtDate(p.updated_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </div>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="adm-table-wrap"><table className="adm-table">
                  <thead>
                    <tr>
                      <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Policy</th>
                      <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Version</th>
                      <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Change notes</th>
                      <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Published</th>
                      <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Published by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {versions.map((v) => (
                      <tr key={v.id} className="border-t border-border hover:bg-muted/50">
                        <td className="p-3 font-medium">{v.policy_title}</td>
                        <td className="p-3">
                          <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-foreground">
                            v{v.version}
                            {v.policy_current_version != null && v.version === v.policy_current_version ? ' (current)' : ''}
                          </span>
                        </td>
                        <td className="p-3 text-muted-foreground max-w-[280px]">
                          {v.change_notes ? <span className="block whitespace-pre-wrap break-words text-[12px]">{v.change_notes}</span> : '—'}
                        </td>
                        <td className="p-3 text-muted-foreground">{fmtDate(v.published_at || v.created_at)}</td>
                        <td className="p-3 text-muted-foreground">{v.published_by ? <span title={v.published_by}>{v.published_by.slice(0, 8)}…</span> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </div>
            )}
          </div>

          {/* Site policies — edited in place; no version store backs them, and the page says so */}
          <div className="space-y-3">
            <h2 className="text-[15px] font-semibold text-foreground">Site policies</h2>
            <p className="text-[13px] text-muted-foreground">
              Site policies (the legal pages) live in the Document Center doc store — every published edit mints a
              version there. This list shows each policy's current state; the full per-version history is in the
              Document Center (History link per policy).
            </p>
            {sitePolicies.length === 0 ? (
              <div className="bg-card border border-border rounded-xl text-center">
                <p className="text-[14px] font-medium text-foreground">No site policies</p>
                <p className="text-[13px] text-muted-foreground mt-1">Create a policy first — it will appear here with its last-edited time.</p>
                <Link href="/admin/docs"
                  className="mt-4 inline-block px-4 py-2 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 rounded-lg text-[13px] font-semibold cursor-pointer">
                  Create Your First Policy
                </Link>
              </div>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="adm-table-wrap"><table className="adm-table">
                  <thead>
                    <tr>
                      <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Policy</th>
                      <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Last edited</th>
                      <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">History</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sitePolicies.map((p) => (
                      <tr key={p.id} className="border-t border-border hover:bg-muted/50">
                        <td className="p-3 font-medium">{p.title}</td>
                        <td className="p-3 text-muted-foreground">{fmtDate(p.updatedAt)}</td>
                        <td className="p-3"><Link href={`/admin/docs/article/${p.id}/versions`} className="text-primary hover:underline text-[12px]">Version history</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
