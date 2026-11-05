'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { escapeHtmlClient, openPrintDocument } from '@/lib/printing/client';
import {
  Download,
  Lock,
  Printer,
  RefreshCw,
  Search,
} from 'lucide-react';

interface ScreenProps {
  onNavigateScreen?: (screenId: string) => void;
  selectedLocation?: string;
  onSelectLocation?: (loc: string) => void;
  systemSettings?: any;
  saveSettingsToDb?: (updates: any) => Promise<boolean>;
}

// ---------------------------------------------------------------------------
// ONE aging computation, three outputs (screen matrix, print rollup, CSV
// export) — they can never drift because they all read this assembly.
// Source: GET /api/admin/invoices (live public.acct_ar_invoices). An invoice counts
// when its open balance is > 0 AND it is past its due date (dueDate, falling
// back to createdAt), bucketed by days past due: 1–30 / 31–60 / 61–90 / 90+.
// ---------------------------------------------------------------------------

type SegmentKey = 'all' | 'current' | '31-60' | '61-90' | 'over90';

interface AgingRow {
  id: string;
  number: string;
  customer: string;
  email: string | null;
  pet: string | null;
  status: string;
  issuedAt: string | null;
  dueBasis: string | null;
  days: number;
  balance: number;
  segment: Exclude<SegmentKey, 'all'>;
}

interface AgingBucket {
  segment: Exclude<SegmentKey, 'all'>;
  label: string;
  count: number;
  total: number;
}

interface AgingResult {
  rows: AgingRow[];
  buckets: AgingBucket[];
  total: number;
  totalCount: number;
  customerCount: number;
}

const BUCKET_DEFS: { segment: Exclude<SegmentKey, 'all'>; label: string; test: (days: number) => boolean }[] = [
  { segment: 'current', label: '1–30 days past due', test: (d) => d <= 30 },
  { segment: '31-60', label: '31–60 days past due', test: (d) => d >= 31 && d <= 60 },
  { segment: '61-90', label: '61–90 days past due', test: (d) => d >= 61 && d <= 90 },
  { segment: 'over90', label: 'Over 90 days past due', test: (d) => d > 90 },
];

function computeAging(invoices: any[], now: number = Date.now()): AgingResult {
  const open = (Array.isArray(invoices) ? invoices : []).filter((i: any) => Number(i.balanceDue) > 0);
  const rows: AgingRow[] = open
    .map((i: any) => {
      const basis = i.dueDate || i.createdAt;
      const days = basis ? Math.floor((now - new Date(basis).getTime()) / 86400000) : 0;
      const bucket = BUCKET_DEFS.find((b) => b.test(days)) || BUCKET_DEFS[0];
      return {
        id: String(i.id),
        number: i.number || i.id,
        customer: i.customerName || i.customerEmail || '—',
        email: i.customerEmail ?? null,
        pet: i.petName ?? null,
        status: String(i.status || 'OPEN').toUpperCase(),
        issuedAt: i.createdAt ?? null,
        dueBasis: basis ?? null,
        days,
        balance: Number(i.balanceDue) || 0,
        segment: bucket.segment,
      };
    })
    .filter((r: AgingRow) => r.days > 0)
    .sort((a: AgingRow, b: AgingRow) => b.days - a.days);
  const buckets: AgingBucket[] = BUCKET_DEFS.map((b) => {
    const inBucket = rows.filter((r) => r.segment === b.segment);
    return {
      segment: b.segment,
      label: b.label,
      count: inBucket.length,
      total: inBucket.reduce((s, r) => s + r.balance, 0),
    };
  });
  return {
    rows,
    buckets,
    total: rows.reduce((s, r) => s + r.balance, 0),
    totalCount: rows.length,
    customerCount: new Set(rows.map((r) => r.customer)).size,
  };
}

async function fetchAging(): Promise<AgingResult> {
  const res = await fetch('/api/admin/invoices');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return computeAging(d.invoices);
}

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase() : '—';

export const InvoicesAgingLedgerScreen: React.FC<ScreenProps> = ({
  onNavigateScreen,
  selectedLocation,
  onSelectLocation,
  systemSettings,
  saveSettingsToDb,
}) => {
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSegment, setActiveSegment] = useState<SegmentKey>('all');
  const [aging, setAging] = useState<AgingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmSettleId, setConfirmSettleId] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await fetchAging();
      setAging(result);
      setLoadedAt(new Date());
    } catch (e: any) {
      setLoadError(e?.message || 'LOAD FAILED');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // PRINT DELINQUENT ROLLUP — the same computeAging assembly the screen
  // renders, printed as a letter document on this device's printer.
  const printDelinquentRollup = async () => {
    try {
      const result = await fetchAging();
      setAging(result);
      setLoadedAt(new Date());
      const { rows, buckets, total } = result;
      if (rows.length === 0) { showToast('NO DELINQUENT INVOICES — NOTHING TO PRINT'); return; }
      const body = `
        <h1>Delinquent Invoice Rollup</h1>
        <p class="muted">Open invoices past due as of ${new Date().toLocaleString()} · ${rows.length} invoice(s) · ${money(total)} delinquent</p>
        <h2>By age</h2>
        <table><thead><tr><th>Bucket</th><th class="r">Invoices</th><th class="r">Balance</th></tr></thead>
        <tbody>${buckets.map((s) => `<tr><td>${s.label}</td><td class="r">${s.count}</td><td class="r">${money(s.total)}</td></tr>`).join('')}</tbody></table>
        <h2>Delinquent invoices</h2>
        <table><thead><tr><th>Invoice</th><th>Customer</th><th>Due</th><th class="r">Days past due</th><th class="r">Balance due</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td>${escapeHtmlClient(String(r.number))}</td><td>${escapeHtmlClient(String(r.customer))}</td><td>${r.dueBasis ? new Date(r.dueBasis).toLocaleDateString() : '—'}</td><td class="r">${r.days}</td><td class="r">${money(r.balance)}</td></tr>`).join('')}</tbody></table>`;
      await openPrintDocument({ title: 'Delinquent Invoice Rollup', docType: 'document', bodyHtml: body });
    } catch {
      showToast('DELINQUENT ROLLUP FAILED TO LOAD — NOTHING PRINTED');
    }
  };

  // EXPORT AGING MATRIX — a real CSV of the same computed rows + buckets.
  const exportAgingCsv = () => {
    if (!aging) { showToast('AGING DATA NOT LOADED — NOTHING TO EXPORT'); return; }
    const esc = (v: string | number) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines: string[] = [
      `Aging Matrix — generated ${new Date().toLocaleString()}`,
      '',
      'Bucket,Invoices,Balance Due',
      ...aging.buckets.map((b) => [b.label, b.count, b.total.toFixed(2)].map(esc).join(',')),
      ['TOTAL PAST DUE', aging.totalCount, aging.total.toFixed(2)].map(esc).join(','),
      '',
      'Invoice,Customer,Email,Pet,Status,Issued,Due,Days Past Due,Balance Due',
      ...aging.rows.map((r) => [
        r.number,
        r.customer,
        r.email || '',
        r.pet || '',
        r.status,
        r.issuedAt ? new Date(r.issuedAt).toLocaleDateString() : '',
        r.dueBasis ? new Date(r.dueBasis).toLocaleDateString() : '',
        r.days,
        r.balance.toFixed(2),
      ].map(esc).join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aging-matrix-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`AGING MATRIX EXPORTED — ${aging.totalCount} INVOICES, ${money(aging.total)}`);
  };

  // DUN DEMAND — real reminder send: POST /api/admin/invoices/send with
  // is_reminder, which renders the invoice email and sends it via Resend.
  // The toast reports the server's actual outcome, never an assumed one.
  const dunDemand = async (row: AgingRow) => {
    setBusyId(row.id);
    try {
      const res = await fetch('/api/admin/invoices/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: row.id, is_reminder: true }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.ok !== false) {
        showToast(`DUNNING REMINDER SENT TO ${row.customer.toUpperCase()}`);
      } else {
        showToast(`REMINDER NOT SENT — ${String(j.error || `HTTP ${res.status}`).toUpperCase()}`);
      }
    } catch {
      showToast('REMINDER NOT SENT — NETWORK ERROR');
    } finally {
      setBusyId(null);
    }
  };

  // SETTLE — records a real full-balance cash payment via
  // POST /api/admin/invoices/[id]/payments (transactional; posts the
  // journal entry and audit row server-side). Two-step: first click arms
  // the button with the exact amount, second click posts it.
  const settle = async (row: AgingRow) => {
    if (confirmSettleId !== row.id) {
      setConfirmSettleId(row.id);
      return;
    }
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/admin/invoices/${encodeURIComponent(row.id)}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: row.balance, method: 'cash', reference: 'Settled from Aging Ledger' }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(`SETTLED ${row.number} — ${money(row.balance)} RECORDED`);
        setConfirmSettleId(null);
        await load();
      } else {
        showToast(`SETTLE FAILED — ${String(j.error || `HTTP ${res.status}`).toUpperCase()}`);
      }
    } catch {
      showToast('SETTLE FAILED — NETWORK ERROR');
    } finally {
      setBusyId(null);
    }
  };

  const filteredInvoices = (aging?.rows || []).filter((row) => {
    if (activeSegment !== 'all' && row.segment !== activeSegment) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        row.customer.toLowerCase().includes(q) ||
        row.number.toLowerCase().includes(q) ||
        (row.pet || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const bucketFor = (segment: Exclude<SegmentKey, 'all'>) =>
    aging?.buckets.find((b) => b.segment === segment);

  const bucketCard = (
    segment: Exclude<SegmentKey, 'all'>,
    ordinal: string,
    cardLabel: string,
    danger?: boolean,
  ) => {
    const b = bucketFor(segment);
    return (
      <button
        onClick={() => { setActiveSegment(segment); setConfirmSettleId(null); showToast(`FILTER: ${b?.label.toUpperCase() || '…'}`); }}
        className={`p-3 border-r border-b lg: border-border text-left flex flex-col justify-between transition-colors ${
          activeSegment === segment ? 'bg-muted/40 font-semibold' : 'hover:bg-muted/30'
        }`}
      >
        <span className="text-[10px] text-muted-foreground uppercase font-semibold">{ordinal} {cardLabel}</span>
        <div className="my-2">
          <div className="text-lg md:text-xl font-semibold tracking-tight text-foreground">
            {loading && !aging ? '…' : money(b?.total || 0)}
          </div>
        </div>
        <span className={`text-[9px] ${danger && (b?.count || 0) > 0 ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
          {b ? (b.count === 0 ? 'NONE PAST DUE' : `${b.count} INVOICE${b.count === 1 ? '' : 'S'} PAST DUE`) : 'LOADING'}
        </span>
      </button>
    );
  };

  return (
    <div className="w-full bg-card text-foreground font-sans antialiased text-[13px]">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-4 right-4 bg-primary text-primary-foreground px-4 py-3 border border-white z-50 flex items-center gap-3 tabular-nums text-[13px] shadow-2xl">
          <span className="w-2 h-2 bg-card animate-pulse"></span>
          <span className="uppercase font-semibold tracking-wider">{toastMsg}</span>
          <button onClick={() => setToastMsg(null)} className="ml-2 text-white hover:opacity-70 cursor-pointer">✕</button>
        </div>
      )}

      {/* SECURITY CLEARANCE BAR */}
      <div className="w-full bg-primary text-primary-foreground px-4 py-2 flex flex-wrap items-center justify-between border-b border-border text-[10px] tabular-nums tracking-wider uppercase">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 bg-destructive"></span>
          <span className="text-destructive font-semibold tracking-tight">RESTRICTED FINANCIAL ACCESS</span>
          <span className="text-muted-foreground">{"//"}</span>
          <span className="text-white">AUTH_SCOPE: SUPER_ADMIN_LEVEL_0</span>
        </div>
        <div className="flex items-center gap-4 text-[10px] tabular-nums text-muted-foreground/70">
          <span>LEDGER ENGINE: LIVE INVOICES</span>
          <span>CURRENCY: USD</span>
        </div>
      </div>

      {/* BREADCRUMB & EXECUTIVE TOOLBAR */}
      <div className="w-full bg-card border-b border-border p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 tabular-nums text-[10px] text-muted-foreground">
            <span>ADMIN SETTINGS</span>
            <span className="text-foreground font-semibold">&gt;&gt;</span>
            <span className="text-foreground font-semibold">SALON INVOICES &amp; AGING LEDGER</span>
            <span className="text-foreground font-semibold">&gt;&gt;</span>
            <span className="bg-primary text-primary-foreground px-1 text-[9px] font-semibold">AGING BUCKETS</span>
          </div>
          <div className="flex items-baseline gap-2">
            <h1 className="font-semibold text-lg md:text-xl tracking-tight uppercase text-foreground">SALON INVOICES &amp; AGING LEDGER</h1>
            <span className="tabular-nums text-[11px] text-muted-foreground">{"// DEBTOR AGING STATUS MATRIX"}</span>
          </div>
        </div>

        {/* ACTION BUTTONS */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={exportAgingCsv}
            className="h-8 px-3 bg-card border border-border text-foreground tabular-nums text-[10px] uppercase hover:border-brand-teal/60 hover:bg-brand-teal/5 hover:text-brand-teal transition-none flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            EXPORT AGING MATRIX (CSV)
          </button>
          <button
            onClick={printDelinquentRollup}
            className="h-8 px-3 bg-primary text-primary-foreground border border-border tabular-nums text-[10px] uppercase hover:bg-muted transition-none flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            PRINT DELINQUENT ROLLUP
          </button>
        </div>
      </div>

      {/* RESTRICTED SETTINGS SUB-NAV TAB MATRIX */}
      <div className="w-full bg-muted/40 border-b border-border overflow-x-auto">
        <div className="flex items-stretch min-w-max text-[11px] tabular-nums">
          <button onClick={() => onNavigateScreen?.('org-multiloc')} className="px-4 py-2 border-r border-border/20 hover:bg-card text-muted-foreground cursor-pointer">
            01 LOCATIONS &amp; SALONS
          </button>
          <button onClick={() => onNavigateScreen?.('users-staff')} className="px-4 py-2 border-r border-border/20 hover:bg-card text-muted-foreground cursor-pointer">
            02 USERS, STAFF &amp; ROLES
          </button>
          <button onClick={() => onNavigateScreen?.('booking-rules')} className="px-4 py-2 border-r border-border/20 hover:bg-card text-muted-foreground cursor-pointer">
            03 BOOKING RULES &amp; POLICIES
          </button>
          <button onClick={() => onNavigateScreen?.('revenue-stripe')} className="px-4 py-2 border-r border-border/20 hover:bg-card text-muted-foreground cursor-pointer">
            04 REVENUE &amp; STRIPE GATEWAY
          </button>
          <button onClick={() => onNavigateScreen?.('system-telemetry')} className="px-4 py-2 border-r border-border/20 hover:bg-card text-muted-foreground cursor-pointer">
            05 SYSTEM HEALTH &amp; TELEMETRY
          </button>
          <button onClick={() => onNavigateScreen?.('services-pricing')} className="px-4 py-2 border-r border-border/20 hover:bg-card text-muted-foreground cursor-pointer">
            06 SERVICES &amp; PRICING MATRIX
          </button>
          <button onClick={() => onNavigateScreen?.('analytics-reporting')} className="px-4 py-2 border-r border-border/20 hover:bg-card text-muted-foreground cursor-pointer">
            07 ANALYTICS &amp; REPORTING
          </button>
          <button onClick={() => onNavigateScreen?.('cms-wizard')} className="px-4 py-2 text-muted-foreground hover:bg-card cursor-pointer">
            08 CMS &amp; BOOKING WIZARD
          </button>
        </div>
      </div>

      {/* QUICK KPI BUCKET CARDS — live totals from the same computation */}
      <div className="w-full grid grid-cols-2 lg:grid-cols-5 border-b border-border bg-card tabular-nums text-[13px]">
        {bucketCard('current', '01', 'AGING [1–30 DAYS]')}
        {bucketCard('31-60', '02', 'AR_AGING [31–60 DAYS]', true)}
        {bucketCard('61-90', '03', 'AR_AGING [61–90 DAYS]', true)}
        {bucketCard('over90', '04', 'CRITICAL [90+ DAYS]', true)}

        {/* TOTAL PAST-DUE ROLLUP */}
        <div className="p-3 bg-muted/30 flex flex-col justify-between text-left">
          <span className="text-[10px] text-muted-foreground uppercase font-semibold">05 TOTAL AR DEBT ROLLUP</span>
          <div className="my-2">
            <div className="text-lg md:text-xl font-semibold tracking-tight text-destructive">
              {loading && !aging ? '…' : money(aging?.total || 0)}
            </div>
          </div>
          <span className="text-[9px] text-muted-foreground tabular-nums">
            {aging ? `${aging.totalCount} INVOICE${aging.totalCount === 1 ? '' : 'S'} · ${aging.customerCount} CUSTOMER${aging.customerCount === 1 ? '' : 'S'}` : 'LOADING'}
          </span>
        </div>
      </div>

      {/* FILTER & INVOICES MATRIX LIST */}
      <div className="w-full flex flex-col tabular-nums text-[13px]">
        {/* Search Toolbar */}
        <div className="px-4 py-2 border-b border-border bg-muted/40 flex flex-col md:flex-row items-center justify-between gap-2.5">
          <div className="flex items-center gap-1 w-full md:w-1/3">
            <Search className="w-4 h-4 text-muted-foreground/70" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search client name, invoice # or pet name..."
              className="w-full border-b border-border focus:outline-none bg-transparent py-0.5 text-[13px] text-foreground"
            />
          </div>
          <div className="flex items-center gap-2 tabular-nums text-[11px]">
            <button
              onClick={() => { setActiveSegment('all'); setConfirmSettleId(null); showToast('SHOWING ALL'); }}
              className={`px-3 py-1 border border-border ${activeSegment === 'all' ? 'bg-primary text-primary-foreground font-semibold' : 'bg-card text-foreground hover:bg-muted/40'}`}
            >
              ALL ACCOUNTS
            </button>
            <button
              onClick={load}
              disabled={loading}
              title="Reload live invoices"
              className="px-2 py-1 border border-border bg-card text-foreground hover:bg-muted/40 disabled:opacity-50 flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              REFRESH
            </button>
            <span className="text-muted-foreground/50">|</span>
            <span className="text-muted-foreground font-semibold uppercase">SEGMENTED MATCHES: {filteredInvoices.length} INVOICES</span>
          </div>
        </div>

        {/* Table Structure */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[13px] tabular-nums">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-foreground text-[10px] uppercase font-semibold">
                <th className="p-3 border-r border-border">INVOICE FILE ID</th>
                <th className="p-3 border-r border-border">ISSUED DATE</th>
                <th className="p-3 border-r border-border">CLIENT NAME / PET</th>
                <th className="p-3 border-r border-border text-right">BALANCE DUE</th>
                <th className="p-3 border-r border-border">DUE DATE</th>
                <th className="p-3 border-r border-border text-right">AGING DAYS</th>
                <th className="p-3 border-r border-border">STATUS</th>
                <th className="p-3 text-center">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {loading && !aging && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground uppercase">LOADING LIVE INVOICES…</td>
                </tr>
              )}
              {!loading && loadError && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-destructive uppercase font-semibold">
                    INVOICE LEDGER FAILED TO LOAD — {loadError}. USE REFRESH TO RETRY.
                  </td>
                </tr>
              )}
              {!loading && !loadError && aging && aging.rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground uppercase">
                    NO PAST-DUE INVOICES — NOTHING IS DELINQUENT
                  </td>
                </tr>
              )}
              {!loading && !loadError && aging && aging.rows.length > 0 && filteredInvoices.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground uppercase">
                    NO INVOICES MATCH THIS SEGMENT
                  </td>
                </tr>
              )}
              {filteredInvoices.map((row) => (
                <tr key={row.id} className="hover:bg-muted/30 transition-none">
                  <td className="p-3 border-r border-border font-semibold text-foreground">{row.number}</td>
                  <td className="p-3 border-r border-border">{fmtDate(row.issuedAt)}</td>
                  <td className="p-3 border-r border-border font-semibold">
                    <div className="flex flex-col">
                      <span className="uppercase text-foreground">{row.customer}</span>
                      {row.pet && (
                        <span className="text-[10px] text-muted-foreground font-normal">{row.pet}</span>
                      )}
                    </div>
                  </td>
                  <td className="p-3 border-r border-border text-right font-semibold text-foreground">{money(row.balance)}</td>
                  <td className="p-3 border-r border-border">{fmtDate(row.dueBasis)}</td>
                  <td className="p-3 border-r border-border text-right font-semibold">
                    <span className={row.days > 60 ? 'text-destructive' : 'text-foreground'}>
                      {row.days} DAYS LATE
                    </span>
                  </td>
                  <td className="p-3 border-r border-border uppercase">{row.status}</td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => dunDemand(row)}
                        disabled={busyId === row.id}
                        title="Send a dunning reminder email for this invoice"
                        className="bg-primary text-primary-foreground px-2 py-1 text-[10px] uppercase font-semibold hover:bg-muted cursor-pointer disabled:opacity-50"
                      >
                        {busyId === row.id ? 'SENDING…' : 'DUN DEMAND'}
                      </button>
                      <button
                        onClick={() => settle(row)}
                        disabled={busyId === row.id}
                        title="Record a full-balance cash payment against this invoice"
                        className={`border px-2 py-1 text-[10px] uppercase font-semibold cursor-pointer disabled:opacity-50 ${
                          confirmSettleId === row.id
                            ? 'border-destructive bg-destructive text-white hover:opacity-90'
                            : 'border-border bg-card text-foreground hover:bg-muted/40'
                        }`}
                      >
                        {confirmSettleId === row.id ? `CONFIRM ${money(row.balance)}` : 'SETTLE'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SUPER ADMIN SECURITY LOCK FOOTER */}
      <div className="w-full bg-muted/30 border-b border-border p-4 flex flex-col md:flex-row items-center justify-between gap-4 select-none tabular-nums text-[13px]">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 bg-primary text-primary-foreground flex items-center justify-center border border-border font-semibold">
            <Lock className="w-3.5 h-3.5" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2 text-[10px] font-semibold text-foreground uppercase">
              <span>SUPER_ADMIN LEVEL 0 // ACCOUNTS RECEIVABLE LEDGER MODULE</span>
              <span className="border border-border px-1.5 bg-card text-[9px] font-semibold">[AUDIT LOGGED]</span>
            </div>
            <span className="text-[11px] text-muted-foreground">
              Settling an invoice here records the payment, posts its journal entry, and writes a platform audit entry in the same transaction.
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-[10px] uppercase">AUDIT TRAIL:</span>
          <span className="border border-border bg-card px-2 py-0.5 text-foreground font-semibold tabular-nums">PLATFORM_AUDIT_LOG</span>
          <button
            disabled
            title="Sign out from the admin session menu"
            className="h-6 px-3 bg-primary text-primary-foreground text-[10px] uppercase font-semibold opacity-50 cursor-not-allowed"
          >
            SIGN OUT SECURE
          </button>
        </div>
      </div>

      {/* STATUS LINE — reflects the real load state of this screen */}
      <div className="w-full bg-primary text-primary-foreground px-4 py-1.5 flex items-center justify-between tabular-nums text-[11px]">
        <div className="flex items-center gap-2">
          <span>&gt; AGING LEDGER: {loading ? 'LOADING…' : loadError ? 'LOAD FAILED' : 'LIVE'}</span>
          <span className="inline-block w-[7px] h-[14px] bg-card animate-pulse"></span>
        </div>
        <div className="flex items-center gap-4 text-muted-foreground/70">
          <span>SOURCE: PUBLIC.INVOICES</span>
          <span>CURRENCY: USD</span>
          <span>UPDATED: {loadedAt ? loadedAt.toLocaleTimeString() : '—'}</span>
        </div>
      </div>
    </div>
  );
};
