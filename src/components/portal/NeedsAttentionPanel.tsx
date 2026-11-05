'use client';

import React, { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';

// B.1.5.3 Needs Attention — Priority / Customer / Issue / Recommendation /
// Due By. Every row is derived server-side from real signals on real
// appointments (unpaid balance computed from total − amount_paid, pending
// unsigned documents, expiring vaccinations, prior no-shows) via
// GET /api/admin/crm/appointments/needs-attention. No fabricated rows:
// when no signal fires, the panel says so.
interface NeedsAttentionRow {
  appointment_id: string;
  appointment_number: string | null;
  starts_at: string;
  status: string;
  customer_id: string;
  customer_name: string | null;
  priority: string;
  issue: string;
  recommendation: string;
  due_by: string;
}

export const NeedsAttentionPanel: React.FC = () => {
  const [rows, setRows] = useState<NeedsAttentionRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetch('/api/admin/crm/appointments/needs-attention')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!mounted) return;
        const data = d?.data || d?.items || [];
        if (Array.isArray(data)) setRows(data);
        setLoaded(true);
      })
      .catch(() => { if (mounted) setLoaded(true); });
    return () => { mounted = false; };
  }, []);

  if (!loaded) return null;

  return (
    <section className="bg-card border border-border">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <AlertCircle className="size-4 text-warning" />
        <h3 className="text-[13px] font-semibold text-foreground">Needs Attention</h3>
        <span className="text-[11px] text-muted-foreground">
          Derived from real appointment signals — unpaid balances, unsigned documents, expiring vaccinations, no-show history.
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px] border-collapse">
          <thead>
            <tr className="border-b border-border bg-background text-[10px] font-semibold uppercase tracking-wider text-foreground">
              <th className="py-2.5 px-4">Priority</th>
              <th className="py-2.5 px-4">Customer</th>
              <th className="py-2.5 px-4">Issue</th>
              <th className="py-2.5 px-4">Recommendation</th>
              <th className="py-2.5 px-4">Due By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/10 text-foreground">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-muted-foreground">
                  <p className="font-semibold uppercase text-sm">Nothing needs attention</p>
                  <p className="text-[13px] mt-1">No unpaid balances, unsigned documents, expiring vaccinations, or no-show risks on current appointments.</p>
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={`${row.appointment_id}-${row.issue}-${i}`}
                  className="hover:bg-accent/50 transition-colors cursor-pointer"
                  onClick={() => { window.location.href = `/admin/customers?customer_id=${row.customer_id}`; }}
                  title="Open customer record"
                >
                  <td className="py-2.5 px-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-1.5 py-0.5 border border-border text-[9px] font-semibold uppercase tracking-wider ${row.priority === 'High' ? 'bg-destructive/5 text-destructive' : 'bg-warning/10 text-warning'}`}>
                      {row.priority}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 whitespace-nowrap font-semibold">{row.customer_name || '—'}</td>
                  <td className="py-2.5 px-4">{row.issue}</td>
                  <td className="py-2.5 px-4 text-muted-foreground">{row.recommendation}</td>
                  <td className="py-2.5 px-4 whitespace-nowrap tabular-nums text-[11px]">
                    {row.due_by ? new Date(row.due_by).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};
