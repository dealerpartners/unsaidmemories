'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Flag, Search, Eye, ArrowLeft } from 'lucide-react';
import TrustSafetyNav from '@/components/admin/TrustSafetyNav';

type ViolationType = 'counterfeit' | 'prohibited' | 'listing-policy' | 'ip' | 'shipping';
type ViolationSeverity = 'critical' | 'high' | 'medium' | 'low';
type ViolationStatus = 'open' | 'under-review' | 'resolved' | 'dismissed';

type Violation = {
  id: string;
  sellerId: string;
  sellerName: string;
  type: string;
  severity: ViolationSeverity;
  status: ViolationStatus;
  reportedAt: string;
  description: string | null;
};

const TYPE_LABELS: Record<ViolationType, string> = {
  counterfeit: 'Counterfeit',
  prohibited: 'Prohibited item',
  'listing-policy': 'Listing policy',
  ip: 'Intellectual property',
  shipping: 'Shipping',
};

const SEVERITY_STYLES: Record<ViolationSeverity, string> = {
  critical: 'adm-badge adm-badge-red',
  high: 'bg-orange-100 text-orange-700',
  medium: 'adm-badge adm-badge-amber',
  low: 'bg-green-100 text-green-700',
};

const STATUS_STYLES: Record<ViolationStatus, string> = {
  open: 'adm-badge adm-badge-red',
  'under-review': 'adm-badge adm-badge-amber',
  resolved: 'bg-green-100 text-green-700',
  dismissed: 'bg-muted text-muted-foreground',
};

const STATUS_LABELS: Record<ViolationStatus, string> = {
  open: 'Open',
  'under-review': 'Under review',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

export default function ViolationsPage() {
  const [violations, setViolations] = useState<Violation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  useEffect(() => {
    // Real data from seller_violations via the trust-safety API.
    fetch('/api/admin/trust-safety/violations')
      .then((r) => (r.ok ? r.json() : { violations: [] }))
      .then((j) => {
        const rows = (j.violations || []) as any[];
        setViolations(
          rows.map((r) => ({
            id: r.id,
            sellerId: r.seller_id,
            sellerName: r.seller_name || 'Unknown seller',
            type: r.violation_type || 'listing-policy',
            severity: (r.severity || 'medium') as ViolationSeverity,
            status: (r.status || 'open') as ViolationStatus,
            reportedAt: r.created_at ? new Date(r.created_at).toLocaleDateString() : '—',
            description: r.description || null,
          }))
        );
      })
      .catch(() => setViolations([]))
      .finally(() => setLoading(false));
  }, []);

  const updateStatus = (id: string, status: ViolationStatus) => {
    fetch('/api/admin/trust-safety/violations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
      .then(() => setViolations((vs) => vs.map((v) => (v.id === id ? { ...v, status } : v))))
      .catch(() => {});
  };

  const filtered = violations.filter((v) => {
    if (search && !(v.id.toLowerCase().includes(search.toLowerCase()) || v.sellerName.toLowerCase().includes(search.toLowerCase()))) return false;
    if (statusFilter !== 'all' && v.status !== statusFilter) return false;
    if (severityFilter !== 'all' && v.severity !== severityFilter) return false;
    if (typeFilter !== 'all' && v.type !== typeFilter) return false;
    return true;
  });

  const selectCls = 'border border-border rounded-lg px-3 py-2 text-[13px] bg-card cursor-pointer';

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/trust-safety" className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground mb-2">
          <ArrowLeft className="size-3.5" /> Trust & Safety
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
          <Flag className="size-6" /> Violations
        </h1>
      </div>

      <TrustSafetyNav />

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
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls}>
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="under-review">Under review</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
        </select>
        <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} className={selectCls}>
          <option value="all">All severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={selectCls}>
          <option value="all">All types</option>
          <option value="counterfeit">Counterfeit</option>
          <option value="prohibited">Prohibited item</option>
          <option value="listing-policy">Listing policy</option>
          <option value="ip">Intellectual property</option>
          <option value="shipping">Shipping</option>
        </select>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-[13px]">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <Flag className="size-10 mx-auto text-muted-foreground/40" />
          <p className="text-[14px] font-medium text-foreground mt-3">No violations reported</p>
          <p className="text-[13px] text-muted-foreground mt-1">Violation reports from buyers and automated checks will appear here.</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead>
              <tr>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Violation ID</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Seller</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Type</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Severity</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Reported</th>
                <th className="p-3 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => (
                <tr key={v.id} className="border-t border-border hover:bg-muted/50">
                  <td className="p-3 font-medium">{v.id}</td>
                  <td className="p-3 text-muted-foreground">{v.sellerName}</td>
                  <td className="p-3 text-muted-foreground">{TYPE_LABELS[v.type as ViolationType] || v.type}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded text-xs font-semibold capitalize ${SEVERITY_STYLES[v.severity]}`}>{v.severity}</span>
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${STATUS_STYLES[v.status]}`}>{STATUS_LABELS[v.status]}</span>
                  </td>
                  <td className="p-3 text-muted-foreground">{v.reportedAt}</td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/admin/trust-safety/investigations?seller=${v.sellerId}&violation=${v.id}`}
                        className="text-[11px] font-semibold text-primary hover:underline"
                      >
                        Investigate
                      </Link>
                      <select
                        value={v.status}
                        onChange={(e) => updateStatus(v.id, e.target.value as ViolationStatus)}
                        className="text-[11px] border border-border rounded px-2 py-1 bg-card cursor-pointer"
                      >
                        <option value="open">Open</option>
                        <option value="under-review">Under review</option>
                        <option value="resolved">Resolved</option>
                        <option value="dismissed">Dismissed</option>
                      </select>
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
