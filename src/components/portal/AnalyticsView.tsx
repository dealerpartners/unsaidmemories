'use client';

import React, { useState } from 'react';
import { Play, BarChart3 } from 'lucide-react';
import {
  useBookingsFunnel,
  useDailyRevenueSummary,
  useNoShowRate,
  useRebookRate,
  useArAgingReport,
  useDepositLiability,
  useGiftCardLiability,
  useStoreCreditLiability,
  useGroomerPerformance,
  useServiceRevenue,
  useProductSales,
  useMultiLocationRevenue,
  useCustomerAcquisition,
} from '@/hooks/admin/useActions';

interface ReportDef {
  key: string;
  label: string;
  description: string;
  hook: () => { mutateAsync: (payload: Record<string, unknown>) => Promise<unknown> };
}

const REPORTS: ReportDef[] = [
  { key: 'bookings-funnel', label: 'Bookings Funnel', description: 'View the booking conversion funnel', hook: useBookingsFunnel },
  { key: 'daily-revenue', label: 'Daily Revenue Summary', description: 'Revenue breakdown by day', hook: useDailyRevenueSummary },
  { key: 'no-show-rate', label: 'No-Show Rate (30d)', description: 'Appointment no-show percentage', hook: useNoShowRate },
  { key: 'rebook-rate', label: 'Rebook Rate (30d)', description: 'Customer rebooking percentage', hook: useRebookRate },
  { key: 'groomer-performance', label: 'Groomer Commission Report', description: 'Per-groomer revenue and commissions', hook: useGroomerPerformance },
  { key: 'service-revenue', label: 'Service Report', description: 'Revenue by service type', hook: useServiceRevenue },
  { key: 'product-sales', label: 'Product Report', description: 'Product sales breakdown', hook: useProductSales },
  { key: 'multi-location', label: 'Multi-Location Report', description: 'Revenue across locations', hook: useMultiLocationRevenue },
  { key: 'customer-acquisition', label: 'Customer Metrics', description: 'New customers and acquisition', hook: useCustomerAcquisition },
  { key: 'ar-aging', label: 'AR Aging', description: 'Accounts receivable aging', hook: useArAgingReport },
  { key: 'deposit-liability', label: 'Deposit Liability', description: 'Outstanding deposit liability', hook: useDepositLiability },
  { key: 'gift-card-liability', label: 'Gift Card Liability', description: 'Outstanding gift card balances', hook: useGiftCardLiability },
  { key: 'store-credit-liability', label: 'Store Credit Liability', description: 'Outstanding store credit', hook: useStoreCreditLiability },
];

function ReportCard({ def }: { def: ReportDef }) {
  const mutation = def.hook();
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await mutation.mutateAsync({});
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Report failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-border rounded-lg p-4 bg-card">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm">{def.label}</h3>
        <button
          onClick={run}
          disabled={busy}
          data-tip="Run this report — it calculates fresh numbers from your real orders and customers, right now."
          className="bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1 text-[11px] font-semibold rounded-lg flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
        >
          <Play className="w-3 h-3" /> {busy ? 'RUNNING…' : 'RUN REPORT'}
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground mb-2">{def.description}</p>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
      {result !== null && (
        <div className="mt-2">
          <button onClick={() => setResult(null)} className="text-[11px] text-muted-foreground hover:text-foreground mb-1">Clear</button>
          <pre className="text-[10px] bg-muted/40 rounded p-2 overflow-auto max-h-64 whitespace-pre-wrap">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export const AnalyticsView: React.FC = () => {
  return (
    <div className="flex flex-col w-full bg-background text-foreground min-h-full p-4">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-5 h-5" />
        <h1 className="text-lg font-bold">Analytics & Reports</h1>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORTS.map((def) => (
          <ReportCard key={def.key} def={def} />
        ))}
      </div>
    </div>
  );
};
