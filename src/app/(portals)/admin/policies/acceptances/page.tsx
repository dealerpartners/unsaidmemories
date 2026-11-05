'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ClipboardCheck } from 'lucide-react';

type CmsRecord = {
  id: string; page_id: string; page_version: number | null; accepted_at: string;
  audience: string; actor_name: string | null; page_title: string | null;
};
type SellerPolicyRow = {
  policy_id: string; title: string; status: string; current_version: number | null;
  acceptance_count: number; stale_count: number; last_accepted_at: string | null;
};
type Payload = {
  cms: { counts: Record<string, number>; total: number; records: CmsRecord[] };
  seller: { total: number; policies: SellerPolicyRow[] };
};

function fmtDate(v: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v).slice(0, 10) : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// H3 · Acceptance Tracking — admin view over the two real acceptance
// stores: marketplace seller acceptances (per policy, with staleness
// against the current version) and the CMS acceptance registry grouped
// by audience (buyer / employee / vet / groomer). Honest empty states:
// both stores are empty until someone actually accepts a policy.
export default function AdminAcceptancesPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/policies/acceptances', { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || `Request failed (${r.status})`);
        }
        return r.json();
      })
      .then((j) => setData(j))
      .catch((e) => setError(e.message || 'Failed to load acceptances'))
      .finally(() => setLoading(false));
  }, []);

  const audiences = ['buyer', 'employee', 'vet', 'groomer', 'unknown'] as const;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/policies" className="inline-flex items-center gap-1.5 text-[13px] font-medium underline underline-offset-2">
          <ArrowLeft className="size-4" /> Policies
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2 mt-3">
          <ClipboardCheck className="size-6" /> Acceptance Tracking
        </h1>
      </div>

      {error && <div className="text-[13px] text-red-600">{error}</div>}
      {loading ? (
        <p className="text-[13px] text-muted-foreground">Loading acceptances…</p>
      ) : data ? (
        <>
          <section className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-[14px] font-semibold">Marketplace seller acceptances</h2>
              <p className="text-[12px] text-muted-foreground">{data.seller.total} acceptance records in total.</p>
            </div>
            {data.seller.policies.length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-muted-foreground">No marketplace policies exist yet — acceptances will appear per policy once policies are published and sellers accept them.</p>
            ) : (
              <div className="adm-table-wrap"><table className="adm-table">
                <thead className="border-b border-border bg-muted/40"><tr>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Policy</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Current version</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Acceptances</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Stale (older version)</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Last accepted</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {data.seller.policies.map((p) => (
                    <tr key={p.policy_id}>
                      <td className="px-5 py-3 font-medium">{p.title}</td>
                      <td className="px-5 py-3 capitalize">{p.status}</td>
                      <td className="px-5 py-3">{p.current_version ?? '—'}</td>
                      <td className="px-5 py-3">{p.acceptance_count}</td>
                      <td className="px-5 py-3">{p.stale_count}</td>
                      <td className="px-5 py-3">{fmtDate(p.last_accepted_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </section>

          <section className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-[14px] font-semibold">CMS acceptance registry — by audience</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {audiences.map((a) => (
                  <span key={a} className="rounded-full border border-border px-3 py-1 text-[12px]">
                    <span className="capitalize">{a}</span>: <strong>{data.cms.counts[a] ?? 0}</strong>
                  </span>
                ))}
              </div>
            </div>
            {data.cms.records.length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-muted-foreground">No CMS-registry acceptances recorded yet. When a buyer, employee, vet, or groomer accepts a published policy, the record lands here.</p>
            ) : (
              <div className="adm-table-wrap"><table className="adm-table">
                <thead className="border-b border-border bg-muted/40"><tr>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Accepted by</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Audience</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Policy / page</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Version</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Accepted</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {data.cms.records.map((r) => (
                    <tr key={r.id}>
                      <td className="px-5 py-3 font-medium">{r.actor_name || '—'}</td>
                      <td className="px-5 py-3 capitalize">{r.audience}</td>
                      <td className="px-5 py-3">{r.page_title || r.page_id}</td>
                      <td className="px-5 py-3">{r.page_version ?? '—'}</td>
                      <td className="px-5 py-3">{fmtDate(r.accepted_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
