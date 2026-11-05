'use client';

import React, { useEffect, useState } from 'react';
import { KpiTiles } from '@/components/portal/_shared/PageHeader';

// /admin/accounting — Accounting Dashboard → Overview.
// KPI tiles from /api/admin/accounting/summary only.
// The door cards were removed (owner order 2026-10-31): every
// accounting surface is already in the module's sidebar
// (accounting/layout.tsx). No redundant buttons at the bottom.

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);

type Summary = {
  outstanding: { count: number; total: number };
  overdue30: { count: number; total: number };
  invoicedMtd: number;
  paidThisMonth: number;
  draftInvoices: number;
  avgDaysToPay: number | null;
  giftCards: { liability: number; activeCount: number };
};

export default function AccountingOverviewPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/accounting/summary', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('summary failed'))))
      .then((d) => setSummary(d))
      .catch(() => setError('Accounting summary could not be loaded.'));
  }, []);

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Accounting</h1>
      </div>
      <div className="space-y-6">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive">{error}</div>}
        <KpiTiles
          tiles={[
            { label: 'Outstanding Invoices', value: summary ? fmt(summary.outstanding.total) : '—', caption: summary ? `${summary.outstanding.count} open invoice(s)` : 'Loading…', tone: 'warning' },
            { label: 'Overdue (>30 Days)', value: summary ? fmt(summary.overdue30.total) : '—', caption: summary ? `${summary.overdue30.count} invoice(s)` : 'Loading…', tone: 'destructive' },
            { label: 'Total Invoiced (MTD)', value: summary ? fmt(summary.invoicedMtd) : '—', caption: 'Invoiced since the 1st' },
            { label: 'Paid This Month', value: summary ? fmt(summary.paidThisMonth) : '—', caption: 'Collected in the current month', tone: 'primary' },
            { label: 'Draft Invoices', value: summary ? String(summary.draftInvoices) : '—', caption: 'Not yet posted' },
            { label: 'Gift Cards Balance', value: summary ? fmt(summary.giftCards.liability) : '—', caption: summary ? `${summary.giftCards.activeCount} active card(s)` : 'Loading…' },
          ]}
        />
      </div>
    </div>
  );
}
