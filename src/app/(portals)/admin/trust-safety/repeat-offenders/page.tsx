'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Repeat, Flag } from 'lucide-react';
import TrustSafetyNav from '@/components/admin/TrustSafetyNav';

type Offender = {
  seller_id: string;
  seller_name: string | null;
  total: number;
  open_count: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  latest_at: string;
  is_repeat: boolean;
};

export default function RepeatOffendersPage() {
  const [offenders, setOffenders] = useState<Offender[]>([]);
  const [threshold, setThreshold] = useState(3);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/trust-safety/repeat-offenders')
      .then((r) => (r.ok ? r.json() : { offenders: [], repeatThreshold: 3 }))
      .then((j) => {
        setOffenders(j.offenders || []);
        if (j.repeatThreshold) setThreshold(j.repeatThreshold);
      })
      .catch(() => setOffenders([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/trust-safety" className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground mb-2">
          <ArrowLeft className="size-3.5" /> Trust & Safety
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
          <Repeat className="size-6" /> Repeat Offenders
        </h1>
      </div>

      <TrustSafetyNav />

      {loading ? (
        <div className="text-muted-foreground text-[13px]">Loading…</div>
      ) : offenders.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <Flag className="size-10 mx-auto text-muted-foreground/40" />
          <p className="text-[14px] font-medium text-foreground mt-3">No violations recorded</p>
          <p className="text-[13px] text-muted-foreground mt-1">
            Once violations exist, sellers will be ranked here by total count and severity.
          </p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead>
              <tr>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Seller</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Open</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Critical</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">High</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Medium</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Low</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Latest</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Standing</th>
              </tr>
            </thead>
            <tbody>
              {offenders.map((o) => (
                <tr key={o.seller_id} className="border-t border-border hover:bg-muted/50">
                  <td className="p-3 font-medium">{o.seller_name || o.seller_id}</td>
                  <td className="p-3 tabular-nums">{o.total}</td>
                  <td className="p-3 tabular-nums">{o.open_count}</td>
                  <td className="p-3 tabular-nums">{o.critical_count}</td>
                  <td className="p-3 tabular-nums">{o.high_count}</td>
                  <td className="p-3 tabular-nums">{o.medium_count}</td>
                  <td className="p-3 tabular-nums">{o.low_count}</td>
                  <td className="p-3 text-muted-foreground">
                    {o.latest_at ? new Date(o.latest_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="p-3">
                    {o.is_repeat ? (
                      <span className="px-2 py-1 rounded text-xs font-semibold adm-badge adm-badge-red">
                        Repeat offender
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded text-xs font-semibold bg-muted text-muted-foreground">
                        Watch
                      </span>
                    )}
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
