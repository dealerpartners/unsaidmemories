'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { Scale, Search, ArrowLeft } from 'lucide-react';
import TrustSafetyNav from '@/components/admin/TrustSafetyNav';
import { APPEAL_TYPES, APPEAL_TYPE_LABELS, type AppealType } from '@/lib/trust-safety';

type AppealStatus = 'pending' | 'approved' | 'denied';

type Appeal = {
  id: string;
  sellerName: string | null;
  appealType: AppealType | null;
  ticketRef: string | null;
  violationId: string;
  violationType: string | null;
  appealText: string | null;
  submittedAt: string;
  decidedAt: string | null;
  status: AppealStatus;
};

const STATUS_STYLES: Record<AppealStatus, string> = {
  pending: 'adm-badge adm-badge-amber',
  approved: 'bg-green-100 text-green-700',
  denied: 'adm-badge adm-badge-red',
};

const STATUS_LABELS: Record<AppealStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  denied: 'Denied',
};

function AppealsInner() {
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [type, setType] = useState<string>('all');

  // The per-type queues are nav-carried views: the active type rides
  // the ?type= query param (F2's leaves in the §F navigation).
  useEffect(() => {
    setType(new URLSearchParams(window.location.search).get('type') || 'all');
  }, []);

  useEffect(() => {
    setLoading(true);
    const qs = type !== 'all' ? `?type=${type}` : '';
    fetch(`/api/admin/trust-safety/appeals${qs}`)
      .then((r) => (r.ok ? r.json() : { appeals: [] }))
      .then((j) => {
        const rows = (j.appeals || []) as any[];
        setAppeals(
          rows.map((r) => ({
            id: r.id,
            sellerName: r.seller_name ?? null,
            appealType: (r.appeal_type ?? null) as AppealType | null,
            ticketRef: Array.isArray(r.evidence_urls) ? (r.evidence_urls[0]?.ticket_ref ?? null) : null,
            violationId: r.violation_id || '—',
            violationType: r.violation_type ?? null,
            appealText: r.appeal_text ?? null,
            submittedAt: r.created_at ? new Date(r.created_at).toLocaleDateString() : '—',
            decidedAt: r.decided_at ? new Date(r.decided_at).toLocaleDateString() : null,
            status: (r.status || 'pending') as AppealStatus,
          }))
        );
      })
      .catch(() => setAppeals([]))
      .finally(() => setLoading(false));
  }, [type]);

  const decide = async (id: string, status: AppealStatus) => {
    // Apply the decision locally only after the server confirms it recorded.
    try {
      const res = await fetch('/api/admin/trust-safety/appeals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.updated) return;
      setAppeals((as) =>
        as.map((a) =>
          a.id === id
            ? { ...a, status, decidedAt: j.appeal?.decided_at ? new Date(j.appeal.decided_at).toLocaleDateString() : a.decidedAt }
            : a
        )
      );
    } catch {
      /* leave the row unchanged — the decision was not recorded */
    }
  };

  const switchType = (t: string) => {
    setType(t);
    window.history.replaceState(null, '', t === 'all' ? '/admin/trust-safety/appeals' : `/admin/trust-safety/appeals?type=${t}`);
  };

  const filtered = appeals.filter((a) => {
    if (search && !(a.id.toLowerCase().includes(search.toLowerCase()) || (a.sellerName || '').toLowerCase().includes(search.toLowerCase()))) return false;
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    return true;
  });

  const tabCls = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-[13px] font-semibold border transition-colors cursor-pointer ${
      active ? 'bg-brand-teal/10 text-brand-teal border-brand-teal/40' : 'border-border text-muted-foreground hover:text-foreground bg-card'
    }`;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/trust-safety" className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground mb-2">
          <ArrowLeft className="size-3.5" /> Trust & Safety
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
          <Scale className="size-6" /> Appeals
        </h1>
      </div>

      <TrustSafetyNav />

      {/* F2 per-type queues */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => switchType('all')} className={tabCls(type === 'all')}>
          All appeals
        </button>
        {APPEAL_TYPES.map((t) => (
          <button key={t} onClick={() => switchType(t)} className={tabCls(type === t)}>
            {APPEAL_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search ID or seller…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-border rounded-lg pl-9 pr-3 py-2 text-[13px] w-56 bg-card"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-border rounded-lg px-3 py-2 text-[13px] bg-card cursor-pointer"
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="denied">Denied</option>
        </select>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-[13px]">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <Scale className="size-10 mx-auto text-muted-foreground/40" />
          <p className="text-[14px] font-medium text-foreground mt-3">
            {type === 'all' ? 'No appeals' : `No ${APPEAL_TYPE_LABELS[type as AppealType] || 'appeals'}`}
          </p>
          <p className="text-[13px] text-muted-foreground mt-1">Appeals filed against enforcement actions will appear in their type queue here.</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead>
              <tr>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Appeal ID</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Type</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Filed by</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Related Violation</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Appeal</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Submitted</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="p-3 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-t border-border hover:bg-muted/50">
                  <td className="p-3 font-medium" title={a.id}>{a.id.slice(0, 8)}…</td>
                  <td className="p-3 text-muted-foreground">
                    {a.appealType ? APPEAL_TYPE_LABELS[a.appealType] : 'Untyped'}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {a.sellerName ?? (a.appealType === 'privacy' ? 'Customer (privacy)' : 'Unknown seller')}
                    {a.ticketRef ? <span className="block text-[11px]">Request {a.ticketRef}</span> : null}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    <span title={a.violationId}>{a.violationId === '—' ? '—' : `${a.violationId.slice(0, 8)}…`}</span>
                    {a.violationType ? <span className="block text-[11px] capitalize">{a.violationType.replace(/_/g, ' ')}</span> : null}
                  </td>
                  <td className="p-3 text-muted-foreground max-w-[320px]">
                    {a.appealText ? (
                      <span className="block whitespace-pre-wrap break-words text-[12px]" title={a.appealText}>{a.appealText}</span>
                    ) : (
                      <span className="text-[12px]">No statement submitted.</span>
                    )}
                  </td>
                  <td className="p-3 text-muted-foreground">{a.submittedAt}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${STATUS_STYLES[a.status]}`}>{STATUS_LABELS[a.status]}</span>
                    {a.decidedAt ? <span className="block text-[11px] text-muted-foreground mt-1">Decided {a.decidedAt}</span> : null}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => decide(a.id, 'approved')}
                        disabled={a.status !== 'pending'}
                        className="text-[11px] font-semibold text-green-700 hover:underline disabled:opacity-40 disabled:no-underline cursor-pointer"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => decide(a.id, 'denied')}
                        disabled={a.status !== 'pending'}
                        className="text-[11px] font-semibold text-red-700 hover:underline disabled:opacity-40 disabled:no-underline cursor-pointer"
                      >
                        Deny
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}

export default function AppealsPage() {
  return (
    <Suspense fallback={null}>
      <AppealsInner />
    </Suspense>
  );
}
