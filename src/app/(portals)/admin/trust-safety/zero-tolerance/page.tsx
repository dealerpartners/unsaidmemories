'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { OctagonAlert, ArrowLeft } from 'lucide-react';
import TrustSafetyNav from '@/components/admin/TrustSafetyNav';

// F1 · Zero tolerance queue — seller_violations in the CRITICAL severity
// band that are still live. Same records and same audited status PATCH
// as the generic violations queue; this face exists because the tree
// names the band as its own queue.
type Violation = {
  id: string;
  sellerId: string;
  sellerName: string;
  type: string;
  status: string;
  reportedAt: string;
  description: string | null;
};

const STATUS_STYLES: Record<string, string> = {
  open: 'adm-badge adm-badge-red',
  'under-review': 'adm-badge adm-badge-amber',
  resolved: 'bg-green-100 text-green-700',
  dismissed: 'bg-muted text-muted-foreground',
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  'under-review': 'Under review',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

export default function ZeroTolerancePage() {
  const [violations, setViolations] = useState<Violation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/trust-safety/zero-tolerance')
      .then((r) => (r.ok ? r.json() : { violations: [] }))
      .then((j) => {
        const rows = (j.violations || []) as any[];
        setViolations(
          rows.map((r) => ({
            id: r.id,
            sellerId: r.seller_id,
            sellerName: r.seller_name || 'Unknown seller',
            type: r.violation_type || '—',
            status: r.status || 'open',
            reportedAt: r.created_at ? new Date(r.created_at).toLocaleDateString() : '—',
            description: r.description || null,
          }))
        );
      })
      .catch(() => setViolations([]))
      .finally(() => setLoading(false));
  }, []);

  const updateStatus = (id: string, status: string) => {
    fetch('/api/admin/trust-safety/violations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
      .then((res) => {
        if (!res.ok) return;
        // Resolved/dismissed leave the live queue; the rest stay visible.
        setViolations((vs) =>
          status === 'resolved' || status === 'dismissed'
            ? vs.filter((v) => v.id !== id)
            : vs.map((v) => (v.id === id ? { ...v, status } : v))
        );
      })
      .catch(() => {});
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/trust-safety" className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground mb-2">
          <ArrowLeft className="size-3.5" /> Trust & Safety
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
          <OctagonAlert className="size-6" /> Zero Tolerance Queue
        </h1>
      </div>

      <TrustSafetyNav />

      {loading ? (
        <div className="text-muted-foreground text-[13px]">Loading…</div>
      ) : violations.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <OctagonAlert className="size-10 mx-auto text-muted-foreground/40" />
          <p className="text-[14px] font-medium text-foreground mt-3">No live critical violations</p>
          <p className="text-[13px] text-muted-foreground mt-1">
            Violations recorded at critical severity will queue here until they are resolved or dismissed.
          </p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead>
              <tr>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Violation ID</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Seller</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Type</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Description</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Reported</th>
                <th className="p-3 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {violations.map((v) => (
                <tr key={v.id} className="border-t border-border hover:bg-muted/50">
                  <td className="p-3 font-medium" title={v.id}>{v.id.slice(0, 8)}…</td>
                  <td className="p-3 text-muted-foreground">{v.sellerName}</td>
                  <td className="p-3 text-muted-foreground capitalize">{v.type.replace(/-/g, ' ')}</td>
                  <td className="p-3 text-muted-foreground max-w-[300px]">
                    {v.description ? <span className="block truncate" title={v.description}>{v.description}</span> : '—'}
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${STATUS_STYLES[v.status] || 'bg-muted text-muted-foreground'}`}>
                      {STATUS_LABELS[v.status] || v.status}
                    </span>
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
                        onChange={(e) => updateStatus(v.id, e.target.value)}
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
