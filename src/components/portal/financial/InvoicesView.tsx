'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { DawgNavSection } from '@/lib/types';
import { PageHeader, PageTabs, KpiTiles, FilterSelect } from '../_shared/PageHeader';
import { cn } from '@/lib/utils';
import { openPrintDocument } from '@/lib/printing/client';
import {
  FileText, Plus, RefreshCw, Search, CreditCard, CheckCircle2,
  AlertTriangle, Clock, X, Loader2, DollarSign, Send, Download,
  MoreHorizontal, Bell, Ban, Copy, Trash2,
} from 'lucide-react';
import {
  useSendInvoiceReminder,
  useSendInvoiceEmail,
  useMarkInvoicePaidAction,
  useVoidInvoice,
  useDuplicateInvoice,
  useDeleteInvoice,
  useEditInvoice,
} from '@/hooks/admin/useActions';

// ============================================================================
// InvoicesView — REAL billing surface for UnSaid Memories Admin OS.
//
// Replaces the 1130-line mock with the genuine order-to-cash write path:
//   • GET /api/admin/invoices            → list (with line items + customer)
//   • POST /api/admin/invoices           → create invoice (standalone or
//                                          from a booking)
//   • POST /api/admin/invoices/[id]/payments → record walk-in payment
//
// Backed by the live Supabase `acct_ar_invoices` + `acct_ar_invoice_lines` +
// `commerce_payments` tables (all tenant-scoped). The payment is written to
// the same ledger the Stripe webhook writes to; the invoice's amount_paid /
// derived balance / status are updated in the same transaction.
// ============================================================================

// Shape returned by GET /api/admin/invoices (existing backend, hybrid route).
interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}
interface Invoice {
  id: string;            // UUID — used for the payments endpoint URL
  number: string;        // display number ("INV-0001")
  status: string;
  currency: string;
  subtotal: number;
  total: number;
  depositPaid: number;
  balanceDue: number;
  amountPaid: number;
  customerId: string | null;
  bookingId: string | null;
  customerEmail: string | null;
  customerName: string;
  petName: string | null;
  bookingService: string | null;
  bookingDate: string | null;
  bookingTime: string | null;
  sentAt: string | null;
  paidAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  dueDate: string | null;
  notes: string | null;
  items: InvoiceItem[];
}

interface BookingOption {
  id: string;
  ownerName: string;
  dogName: string;
  service: string;
  servicePrice: string;
  depositAmount: string;
  date: string;
  time: string;
  email: string;
  status: string;
}

interface InvoicesViewProps {
  onNavigateSection?: (section: DawgNavSection) => void;
}

const fmt = (n: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number.isFinite(n) ? n : 0);

const dateStr = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const timeAgo = (iso: string | null) => {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return '—';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return dateStr(iso);
};

const STATUS_TONE: Record<string, string> = {
  OPEN: 'bg-amber-100 text-amber-800 border-amber-200',
  PENDING: 'bg-amber-100 text-amber-800 border-amber-200',
  DRAFT: 'bg-neutral-100 text-neutral-700 border-neutral-200',
  PAID: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  OVERDUE: 'bg-rose-100 text-rose-800 border-rose-200',
  VOID: 'bg-neutral-100 text-neutral-500 border-neutral-200',
  CANCELLED: 'bg-neutral-100 text-neutral-500 border-neutral-200',
};

/** Row-level quick actions wired to the real finance action API. */
const InvoiceRowActions: React.FC<{ inv: Invoice; onDone: () => void; onEdit: (inv: Invoice) => void }> = ({ inv, onDone, onEdit }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const sendReminder = useSendInvoiceReminder();
  const sendEmail = useSendInvoiceEmail();
  const markPaid = useMarkInvoicePaidAction();
  const voidInv = useVoidInvoice();
  const dupInv = useDuplicateInvoice();
  const delInv = useDeleteInvoice();

  const run = async (label: string, fn: () => Promise<unknown>, confirmMsg?: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(label);
    try {
      await fn();
      onDone();
    } catch (e) {
      alert(e instanceof Error ? e.message : `${label} failed`);
    } finally {
      setBusy(null);
      setOpen(false);
    }
  };

  const itemCls = 'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent disabled:opacity-50';
  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center rounded-lg border border-input bg-background px-2 py-1.5 text-xs font-medium hover:bg-accent"
        title="Invoice actions"
        aria-label={`Actions for invoice ${inv.number}`}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 w-44 rounded-lg border border-border bg-card py-1 shadow-lg">
            {inv.status !== 'PAID' && inv.status !== 'VOID' && (
              <button className={itemCls} disabled={!!busy}
                onClick={() => { setOpen(false); onEdit(inv); }}>
                <FileText className="h-3.5 w-3.5" /> Edit
              </button>
            )}
            <button className={itemCls} disabled={!!busy}
              onClick={() => run('Send', () => sendEmail.mutateAsync({ invoice_id: inv.id }))}>
              <Send className="h-3.5 w-3.5" /> {busy === 'Send' ? 'Sending…' : 'Send / Resend'}
            </button>
            {inv.balanceDue > 0 && (
              <button className={itemCls} disabled={!!busy}
                onClick={() => run('Mark paid', () => markPaid.mutateAsync({ invoice_id: inv.id }))}>
                <CheckCircle2 className="h-3.5 w-3.5" /> {busy === 'Mark paid' ? 'Marking…' : 'Mark as Paid'}
              </button>
            )}
            <button className={itemCls} disabled={!!busy}
              onClick={() => run('Remind', () => sendEmail.mutateAsync({ invoice_id: inv.id, is_reminder: true }))}>
              <Bell className="h-3.5 w-3.5" /> {busy === 'Remind' ? 'Sending…' : 'Send Reminder'}
            </button>
            <button className={itemCls} disabled={!!busy}
              onClick={() => run('Void', () => voidInv.mutateAsync({ invoice_id: inv.id }), `Void invoice ${inv.number}?`)}>
              <Ban className="h-3.5 w-3.5" /> {busy === 'Void' ? 'Voiding…' : 'Void / Cancel'}
            </button>
            <button className={itemCls} disabled={!!busy}
              onClick={() => run('Duplicate', () => dupInv.mutateAsync({ invoice_id: inv.id }))}>
              <Copy className="h-3.5 w-3.5" /> {busy === 'Duplicate' ? 'Duplicating…' : 'Duplicate'}
            </button>
            <button className={cn(itemCls, 'text-destructive')} disabled={!!busy}
              onClick={() => run('Delete', () => delInv.mutateAsync({ invoice_id: inv.id }), `Delete invoice ${inv.number}? This cannot be undone.`)}>
              <Trash2 className="h-3.5 w-3.5" /> {busy === 'Delete' ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export const InvoicesView: React.FC<InvoicesViewProps> = ({ onNavigateSection }) => {
  const [activeTab, setActiveTab] = useState<'all' | 'open' | 'paid' | 'overdue' | 'inbox' | 'spam'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [locationFilter, setLocationFilter] = useState('ALL');
  const [dueDateFilter, setDueDateFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('RECENT');

  // Real locations for the location filter. Invoices are not location-tagged
  // in the schema, so selecting the single live location shows all invoices
  // (everything happens at the main location); this becomes a real filter
  // once invoices carry location_id.
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    fetch('/api/locations', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { locations: [] }))
      .then((d) => setLocations(Array.isArray(d.locations) ? d.locations : []))
      .catch(() => setLocations([]));
  }, []);

  const [invoices, setInvoices] = useState<Invoice[]>([]);  // shape matches GET /api/admin/invoices
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    setLoading(true);
    fetch('/api/admin/invoices')
      .then(async (r) => {
        if (!r.ok) {
          const t = await r.text();
          throw new Error(`${r.status}: ${t.slice(0, 200)}`);
        }
        return r.json();
      })
      .then((d) => {
        // Backend returns the shape directly; just stash it.
        setInvoices(Array.isArray(d.invoices) ? (d.invoices as Invoice[]) : []);
        setError(null);
      })
      .catch((e) => setError(e.message || 'Failed to load invoices'))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  // ---- KPI aggregates over the live rows ----
  const totalOutstanding = invoices
    .filter((i) => i.balanceDue > 0)
    .reduce((s, i) => s + i.balanceDue, 0);
  const totalPaid = invoices.reduce((s, i) => s + i.amountPaid, 0);
  const openCount = invoices.filter((i) => i.balanceDue > 0).length;
  const paidCount = invoices.filter((i) => i.status === 'PAID').length;

  // Overdue (§3.4 spec threshold): balanceDue > 0 AND past due by more
  // than 30 days — measured from the DUE date (falling back to the
  // issue/created date when no due date was set), or the backend's own
  // OVERDUE label.
  const overdue = invoices.filter((i) => {
    if (i.balanceDue <= 0) return false;
    if (i.status === 'OVERDUE') return true;
    const basis = i.dueDate ? new Date(i.dueDate + 'T12:00:00').getTime() : i.createdAt ? new Date(i.createdAt).getTime() : NaN;
    if (isNaN(basis)) return false;
    return (Date.now() - basis) / 86400_000 > 30;
  });

  // §3.4 summary figures that need the whole ledger (MTD invoiced, paid
  // this month, average days to pay) come from the Accounting summary
  // API — the same source the Accounting overview renders.
  const [acctSummary, setAcctSummary] = useState<{ invoicedMtd: number; paidThisMonth: number; avgDaysToPay: number | null } | null>(null);
  useEffect(() => {
    fetch('/api/admin/accounting/summary', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !d.error) setAcctSummary(d); })
      .catch(() => {});
  }, [refreshKey]);
  const draftCount = invoices.filter((i) => i.status === 'DRAFT').length;

  const filtered = invoices.filter((inv) => {
    if (activeTab === 'open' && inv.balanceDue <= 0) return false;
    if (activeTab === 'paid' && inv.status !== 'PAID') return false;
    if (activeTab === 'overdue' && !overdue.includes(inv)) return false;
    // Views (§3.4): Inbox = live receivables that have left draft and
    // still carry a balance (what the AR inbox works); Spam = discarded
    // invoices (void / cancelled) kept out of the working views.
    if (activeTab === 'inbox' && !(inv.balanceDue > 0 && inv.status !== 'DRAFT' && inv.status !== 'VOID' && inv.status !== 'CANCELLED')) return false;
    if (activeTab === 'spam' && !(inv.status === 'VOID' || inv.status === 'CANCELLED')) return false;
    if (statusFilter !== 'ALL' && inv.status !== statusFilter) return false;
    // Location: invoices carry no location_id yet; the single live location
    // is the main shop, so a specific location selection keeps all rows.
    // (Filter becomes selective once invoices are location-tagged.)
    if (dueDateFilter !== 'ALL') {
      if (dueDateFilter === 'OVERDUE' && !overdue.includes(inv)) return false;
      if (dueDateFilter === 'THIS_WEEK') {
        if (!inv.dueDate) return false;
        const d = new Date(inv.dueDate + 'T12:00:00');
        const now = new Date();
        const weekOut = new Date(now);
        weekOut.setDate(now.getDate() + 7);
        if (isNaN(d.getTime()) || d < now || d > weekOut) return false;
      }
      if (dueDateFilter === 'THIS_MONTH') {
        if (!inv.dueDate) return false;
        const d = new Date(inv.dueDate + 'T12:00:00');
        const now = new Date();
        if (isNaN(d.getTime()) || d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) return false;
      }
      if (dueDateFilter === 'NONE' && inv.dueDate) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const hay = [inv.number, inv.customerName, inv.customerEmail, inv.petName, inv.bookingService, inv.items.map((i) => i.description).join(' ')].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'DUE_SOON') {
      const da = a.dueDate ? new Date(a.dueDate + 'T12:00:00').getTime() : Infinity;
      const db = b.dueDate ? new Date(b.dueDate + 'T12:00:00').getTime() : Infinity;
      return da - db;
    }
    if (sortBy === 'HIGHEST') return b.total - a.total;
    if (sortBy === 'LOWEST') return a.total - b.total;
    if (sortBy === 'OLDEST') {
      const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return da - db;
    }
    // RECENT (default): newest first
    const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return db - da;
  });

  // ---- Modal state ----
  const [createOpen, setCreateOpen] = useState(false);
  const [payFor, setPayFor] = useState<Invoice | null>(null);  // takes dbId
  const [editFor, setEditFor] = useState<Invoice | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        contextLabel="Accounting / Invoices"
        title="Invoices"
        description="Bill grooming appointments and record walk-in payments — every row here is live in Supabase."
        badge={<span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{invoices.length} total</span>}
        statusItems={[
          { label: 'Outstanding', value: fmt(totalOutstanding), tone: totalOutstanding > 0 ? 'warning' : 'success' },
          { label: 'Collected', value: fmt(totalPaid), tone: 'success' },
          { label: 'Open', value: openCount, tone: openCount > 0 ? 'info' : 'default' },
          { label: 'Overdue', value: overdue.length, tone: overdue.length > 0 ? 'destructive' : 'default' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              Refresh
            </button>
            <button
              onClick={() => setCreateOpen(true)}
              data-tip="Write a bill for a customer — it starts as a draft; sending it records the sale and what's owed."
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              New Invoice
            </button>
          </div>
        }
      />

      <KpiTiles
        tiles={[
          { label: 'Total Invoiced (MTD)', value: acctSummary ? fmt(acctSummary.invoicedMtd) : '—', icon: <FileText className="h-4 w-4" />, tone: 'info' },
          { label: 'Outstanding Balance', value: fmt(totalOutstanding), icon: <AlertTriangle className="h-4 w-4" />, tone: totalOutstanding > 0 ? 'warning' : 'success' },
          { label: 'Overdue (>30 Days)', value: String(overdue.length), icon: <AlertTriangle className="h-4 w-4" />, tone: overdue.length > 0 ? 'destructive' : 'default' },
          { label: 'Paid This Month', value: acctSummary ? fmt(acctSummary.paidThisMonth) : '—', icon: <CheckCircle2 className="h-4 w-4" />, tone: 'success' },
          { label: 'Draft Invoices', value: String(draftCount), icon: <Clock className="h-4 w-4" />, tone: 'default' },
          { label: 'Average Days to Pay', value: acctSummary?.avgDaysToPay !== null && acctSummary?.avgDaysToPay !== undefined ? `${acctSummary.avgDaysToPay} days` : '—', icon: <Clock className="h-4 w-4" />, tone: 'default' },
        ]}
      />

      <PageTabs
        tabs={[
          { id: 'all', label: 'All' },
          { id: 'inbox', label: 'Inbox' },
          { id: 'open', label: 'Open' },
          { id: 'paid', label: 'Paid' },
          { id: 'overdue', label: 'Overdue' },
          { id: 'spam', label: 'Spam' },
        ]}
        activeId={activeTab}
        onSelect={(id) => setActiveTab(id as any)}
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by number, customer, pet, service…"
            className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <FilterSelect
          aria-label="Filter by invoice status"
          value={statusFilter}
          onChange={setStatusFilter}
        >
          <option value="ALL">All Statuses</option>
          <option value="OPEN">Open</option>
          <option value="PAID">Paid</option>
          <option value="OVERDUE">Overdue</option>
          <option value="VOID">Void</option>
        </FilterSelect>
        <FilterSelect
          aria-label="Filter by location"
          value={locationFilter}
          onChange={setLocationFilter}
        >
          <option value="ALL">Location: All</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>Location: {l.name}</option>
          ))}
        </FilterSelect>
        <FilterSelect
          aria-label="Filter by due date"
          value={dueDateFilter}
          onChange={setDueDateFilter}
        >
          <option value="ALL">Due Date: All</option>
          <option value="OVERDUE">Due Date: Overdue</option>
          <option value="THIS_WEEK">Due Date: This Week</option>
          <option value="THIS_MONTH">Due Date: This Month</option>
          <option value="NONE">Due Date: No Due Date</option>
        </FilterSelect>
        <FilterSelect
          aria-label="Sort invoices"
          value={sortBy}
          onChange={setSortBy}
        >
          <option value="RECENT">Sort By: Recent</option>
          <option value="OLDEST">Sort By: Oldest</option>
          <option value="DUE_SOON">Sort By: Due Soon</option>
          <option value="HIGHEST">Sort By: Highest Total</option>
          <option value="LOWEST">Sort By: Lowest Total</option>
        </FilterSelect>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <strong className="font-semibold">Load failed:</strong> {error}
          <button onClick={refresh} className="ml-3 underline">retry</button>
        </div>
      )}

      {/* ---- Invoices table ---- */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="max-h-[640px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Invoice</th>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Pet / Service</th>
                <th className="px-4 py-3 font-semibold">Issued</th>
                <th className="px-4 py-3 font-semibold">Due Date</th>
                <th className="px-4 py-3 font-semibold text-right">Total</th>
                <th className="px-4 py-3 font-semibold text-right">Balance</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    <div className="mt-2">Loading invoices…</div>
                  </td>
                </tr>
              )}
              {!loading && sorted.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                    <FileText className="mx-auto h-8 w-8 opacity-40" />
                    <div className="mt-2 font-medium">No invoices match this filter.</div>
                    <div className="text-xs">Click <span className="font-semibold">New Invoice</span> to create the first one.</div>
                  </td>
                </tr>
              )}
              {!loading && sorted.map((inv) => (
                <tr key={inv.id} className="border-t border-border/60 hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="font-mono font-semibold text-foreground">{inv.number}</div>
                    {inv.bookingId && (
                      <div className="text-xs text-muted-foreground">from booking</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{inv.customerName}</div>
                    {inv.customerEmail && (
                      <div className="text-xs text-muted-foreground">{inv.customerEmail}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {inv.petName && <div className="font-medium">{inv.petName}</div>}
                    {inv.bookingService && (
                      <div className="text-xs text-muted-foreground">{inv.bookingService}</div>
                    )}
                    {inv.items.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {inv.items.map((it, idx) => (
                          <span key={it.id || idx}>
                            {idx > 0 && ' · '}
                            {it.quantity > 1 ? `${it.quantity}× ` : ''}{it.description}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <div>{dateStr(inv.createdAt)}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {inv.dueDate ? dateStr(inv.dueDate) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">{fmt(inv.total, inv.currency)}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {inv.balanceDue > 0 ? (
                      <span className="font-semibold text-amber-700">{fmt(inv.balanceDue, inv.currency)}</span>
                    ) : (
                      <span className="text-emerald-600">{fmt(0, inv.currency)}</span>
                    )}
                    {inv.amountPaid > 0 && (
                      <div className="text-xs text-muted-foreground">paid {fmt(inv.amountPaid, inv.currency)}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold',
                      STATUS_TONE[inv.status] || STATUS_TONE.OPEN,
                    )}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      {inv.balanceDue > 0 && (
                        <button
                          onClick={() => setPayFor(inv)}
                          className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                          title="Record a walk-in payment"
                        >
                          <DollarSign className="h-3.5 w-3.5" />
                          Take Payment
                        </button>
                      )}
                      <button
                        onClick={() => printInvoice(inv)}
                        className="inline-flex items-center gap-1 rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
                        title="Print / save as PDF"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      <InvoiceRowActions inv={inv} onDone={refresh} onEdit={setEditFor} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {createOpen && (
        <CreateInvoiceModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); refresh(); }}
        />
      )}
      {payFor && (
        <RecordPaymentModal
          invoice={payFor}
          onClose={() => setPayFor(null)}
          onRecorded={() => { setPayFor(null); refresh(); }}
        />
      )}
      {editFor && (
        <EditInvoiceModal
          invoice={editFor}
          onClose={() => setEditFor(null)}
          onSaved={() => { setEditFor(null); refresh(); }}
        />
      )}
    </div>
  );
};

// ============================================================================
// Create Invoice modal — two modes:
//   A) From booking (preferred): pick a booking from a searchable list,
//      pre-fills the service line + pet name + customer.
//   B) Standalone: enter customer email + line items manually.
// ============================================================================

function CreateInvoiceModal({
  onClose, onCreated,
}: { onClose: () => void; onCreated: () => void }) {
  const [mode, setMode] = useState<'booking' | 'standalone'>('booking');
  const [bookings, setBookings] = useState<BookingOption[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [extraItems, setExtraItems] = useState<{ description: string; quantity: string; unitPrice: string }[]>([]);
  const [standaloneItems, setStandaloneItems] = useState<{ description: string; quantity: string; unitPrice: string }[]>([{ description: '', quantity: '1', unitPrice: '' }]);
  const [standaloneEmail, setStandaloneEmail] = useState('');
  const [depositOverride, setDepositOverride] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/bookings')
      .then((r) => r.ok ? r.json() : {})
      .then((d) => {
        // /api/bookings returns { appointments: [...] } with customerName /
        // customerEmail / petName / serviceName; map onto the BookingOption
        // shape (ownerName / email / dogName / service) this picker uses.
        const raw = Array.isArray(d) ? d : ((d as any).appointments || (d as any).bookings || []);
        setBookings(raw.map((a: any) => ({
          id: String(a.id),
          ownerName: a.ownerName || a.customerName || '—',
          dogName: a.dogName || a.petName || '',
          service: a.service || a.serviceName || 'Grooming',
          servicePrice: String(a.servicePrice ?? a.price ?? '0'),
          depositAmount: String(a.depositAmount ?? '0'),
          date: a.date || '',
          time: a.time || '',
          email: a.email || a.customerEmail || '',
          status: a.status || '',
        })));
      })
      .catch(() => setBookings([]))
      .finally(() => setBookingsLoading(false));
  }, []);

  const filteredBookings = bookings.filter((b) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [b.ownerName, b.dogName, b.service, b.email, b.date, b.status].join(' ').toLowerCase().includes(q);
  }).slice(0, 60);

  const selected = bookings.find((b) => b.id === selectedBookingId) || null;

  const computedItems = mode === 'booking'
    ? [
        ...(selected && Number(String(selected.servicePrice).replace(/[^0-9.]/g, '')) > 0
          ? [{
              description: `${selected.service || 'Grooming'} — ${selected.dogName || 'appointment'}`,
              quantity: 1,
              unitPrice: Number(String(selected.servicePrice).replace(/[^0-9.]/g, '')) || 0,
            }]
          : []),
        ...extraItems.filter((i) => i.description.trim()).map((i) => ({
          description: i.description.trim(),
          quantity: Number(i.quantity) || 1,
          unitPrice: Number(i.unitPrice) || 0,
        })),
      ]
    : standaloneItems.filter((i) => i.description.trim()).map((i) => ({
        description: i.description.trim(),
        quantity: Number(i.quantity) || 1,
        unitPrice: Number(i.unitPrice) || 0,
      }));

  const total = computedItems.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
  const deposit = mode === 'booking'
    ? (depositOverride !== '' ? Number(depositOverride) : (selected ? Number(String(selected.depositAmount).replace(/[^0-9.]/g, '')) : 0))
    : (depositOverride !== '' ? Number(depositOverride) : 0);
  const balance = Math.max(0, total - deposit);

  async function submit() {
    setErr(null);
    if (computedItems.length === 0) {
      setErr('Add at least one line item with a description.');
      return;
    }
    if (mode === 'standalone' && !standaloneEmail.trim()) {
      setErr('Customer email is required for a standalone invoice.');
      return;
    }
    setSubmitting(true);
    try {
      // Body shape matches the existing /api/admin/invoices POST route:
      //   { customer: { name, email, phone }, items: [{description, quantity, unitPrice}],
      //     dueDate?, notes?, bookingId? }
      const body = mode === 'booking'
        ? {
            customer: { name: selected?.ownerName || '', email: selected?.email || '' },
            items: computedItems,
            bookingId: selectedBookingId,
          }
        : {
            customer: { email: standaloneEmail.trim() },
            items: computedItems,
          };
      const r = await fetch('/api/admin/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`${r.status}: ${t.slice(0, 300)}`);
      }
      onCreated();
    } catch (e: any) {
      setErr(e.message || 'Failed to create invoice');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title="New Invoice" onClose={onClose} wide>
      <div className="flex gap-2 rounded-lg border border-border p-1">
        <button
          onClick={() => setMode('booking')}
          className={cn('flex-1 rounded-lg px-3 py-1.5 text-sm font-medium',
            mode === 'booking' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent')}
        >
          From Booking
        </button>
        <button
          onClick={() => setMode('standalone')}
          className={cn('flex-1 rounded-lg px-3 py-1.5 text-sm font-medium',
            mode === 'standalone' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent')}
        >
          Standalone
        </button>
      </div>

      {mode === 'booking' && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search bookings by owner, pet, service, date…"
              className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
            {bookingsLoading && <div className="p-4 text-center text-sm text-muted-foreground">Loading bookings…</div>}
            {!bookingsLoading && filteredBookings.length === 0 && (
              <div className="p-4 text-center text-sm text-muted-foreground">No bookings found.</div>
            )}
            {filteredBookings.map((b) => (
              <button
                key={b.id}
                onClick={() => setSelectedBookingId(b.id)}
                className={cn(
                  'flex w-full items-center justify-between border-b border-border/60 px-3 py-2 text-left text-sm hover:bg-accent',
                  selectedBookingId === b.id && 'bg-primary/10',
                )}
              >
                <div>
                  <div className="font-medium">{b.ownerName} — {b.dogName}</div>
                  <div className="text-xs text-muted-foreground">{b.service} · {b.date} {b.time}</div>
                </div>
                <div className="text-right font-mono text-xs">
                  <div>{b.servicePrice}</div>
                  {b.depositAmount && <div className="text-muted-foreground">dep {b.depositAmount}</div>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'standalone' && (
        <div className="space-y-3">
          <label className="block text-sm font-medium">Customer email</label>
          <input
            value={standaloneEmail}
            onChange={(e) => setStandaloneEmail(e.target.value)}
            placeholder="owner@example.com"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      )}

      {/* Line items editor */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Line items</label>
          {mode === 'booking' && (
            <button
              onClick={() => setExtraItems([...extraItems, { description: '', quantity: '1', unitPrice: '' }])}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Add-on line
            </button>
          )}
          {mode === 'standalone' && (
            <button
              onClick={() => setStandaloneItems([...standaloneItems, { description: '', quantity: '1', unitPrice: '' }])}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Add line
            </button>
          )}
        </div>
        <div className="space-y-2">
          {(mode === 'booking' ? extraItems : standaloneItems).map((item, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_70px_100px_28px] gap-2">
              <input
                value={item.description}
                onChange={(e) => {
                  const arr = mode === 'booking' ? [...extraItems] : [...standaloneItems];
                  arr[idx].description = e.target.value;
                  if (mode === 'booking') setExtraItems(arr); else setStandaloneItems(arr);
                }}
                placeholder="Description"
                className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                value={item.quantity}
                onChange={(e) => {
                  const arr = mode === 'booking' ? [...extraItems] : [...standaloneItems];
                  arr[idx].quantity = e.target.value;
                  if (mode === 'booking') setExtraItems(arr); else setStandaloneItems(arr);
                }}
                placeholder="Qty"
                inputMode="numeric"
                className="rounded-lg border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                value={item.unitPrice}
                onChange={(e) => {
                  const arr = mode === 'booking' ? [...extraItems] : [...standaloneItems];
                  arr[idx].unitPrice = e.target.value;
                  if (mode === 'booking') setExtraItems(arr); else setStandaloneItems(arr);
                }}
                placeholder="Unit $"
                inputMode="decimal"
                className="rounded-lg border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={() => {
                  if (mode === 'booking') setExtraItems(extraItems.filter((_, i) => i !== idx));
                  else setStandaloneItems(standaloneItems.filter((_, i) => i !== idx));
                }}
                className="inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 rounded-lg bg-muted/40 p-3 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Subtotal</div>
          <div className="font-mono font-semibold">{fmt(total)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Deposit</div>
          <input
            value={depositOverride}
            onChange={(e) => setDepositOverride(e.target.value)}
            placeholder={mode === 'booking' && selected ? String(selected.depositAmount || '$0.00') : '0.00'}
            inputMode="decimal"
            className="w-full rounded border border-input bg-background px-2 py-1 font-mono text-xs"
          />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Balance Due</div>
          <div className="font-mono font-semibold text-amber-700">{fmt(balance)}</div>
        </div>
      </div>

      {err && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">{err}</div>
      )}

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent">Cancel</button>
        <button
          onClick={submit}
          disabled={submitting || (mode === 'booking' && !selectedBookingId)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Create Invoice
        </button>
      </div>
    </ModalShell>
  );
}

// ============================================================================
// Record Payment modal — POST /api/admin/invoices/[id]/payments
// ============================================================================

function RecordPaymentModal({
  invoice, onClose, onRecorded,
}: { invoice: Invoice; onClose: () => void; onRecorded: () => void }) {
  const [amount, setAmount] = useState(String(invoice.balanceDue.toFixed(2)));
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const amountNum = Number(amount) || 0;
  const overBalance = amountNum > invoice.balanceDue + 0.01;

  async function submit() {
    setErr(null);
    if (!(amountNum > 0)) { setErr('Enter a positive amount.'); return; }
    if (overBalance) { setErr(`Amount exceeds balance due (${fmt(invoice.balanceDue, invoice.currency)}).`); return; }
    setSubmitting(true);
    try {
      // POST /api/admin/invoices/[id]/payments — uses the invoice's UUID (id),
      // not the display number, because the route looks up by id.
      const r = await fetch(`/api/admin/invoices/${invoice.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountNum, method, reference: reference || undefined, note: note || undefined }),
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`${r.status}: ${t.slice(0, 300)}`);
      }
      onRecorded();
    } catch (e: any) {
      setErr(e.message || 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title={`Record Payment — ${invoice.number}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-lg bg-muted/40 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Customer</span>
            <span className="font-medium">{invoice.customerName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total</span>
            <span className="font-mono">{fmt(invoice.total, invoice.currency)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Already paid</span>
            <span className="font-mono">{fmt(invoice.amountPaid, invoice.currency)}</span>
          </div>
          <div className="flex justify-between border-t border-border/60 pt-1 mt-1">
            <span className="font-semibold">Balance due</span>
            <span className="font-mono font-semibold text-amber-700">{fmt(invoice.balanceDue, invoice.currency)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Amount</label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              className={cn(
                'w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring',
                overBalance && 'border-destructive',
              )}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="cash">Cash</option>
              <option value="card">Card (in-person)</option>
              <option value="check">Check</option>
              <option value="venmo">Venmo / Zelle</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Reference (optional)</label>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="check #, last-4 of card, transaction id…"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Note (optional)</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="memo for the audit log"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {err && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">{err}</div>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent">Cancel</button>
          <button
            onClick={submit}
            disabled={submitting || overBalance || !(amountNum > 0)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            Record Payment
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ============================================================================
// Edit Invoice modal — SA-50: edits due date + notes via fin_edit_invoice.
// The server locks PAID/VOID invoices and writes the pre-edit snapshot to
// the audit log (versioned via before/after data).
// ============================================================================
function EditInvoiceModal({
  invoice, onClose, onSaved,
}: { invoice: Invoice; onClose: () => void; onSaved: () => void }) {
  const editInvoice = useEditInvoice();
  const [dueDate, setDueDate] = useState(invoice.dueDate ? invoice.dueDate.slice(0, 10) : '');
  const [notes, setNotes] = useState(invoice.notes || '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await editInvoice.mutateAsync({
        invoice_id: invoice.id,
        due_date: dueDate || undefined,
        notes,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Edit failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title={`Edit Invoice — ${invoice.number}`} onClose={onClose}>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Due date</label>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      {err && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{err}</div>}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent">Cancel</button>
        <button onClick={submit} disabled={busy} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {busy ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </ModalShell>
  );
}

// ---- Print invoice on this device's printer via the shared print
// document (letter/A4 geometry + auto-print from printer settings) ----
async function printInvoice(inv: Invoice) {
  const items = inv.items.map((it) => `<tr><td>${escapeHtml(it.description)}</td><td style="text-align:center">${it.quantity}</td><td style="text-align:right">${fmt(it.unitPrice, inv.currency)}</td><td style="text-align:right">${fmt(it.totalPrice, inv.currency)}</td></tr>`).join('');
  const ok = await openPrintDocument({
    docType: 'document',
    title: inv.number,
    extraCss: `
      h1{font-size:24px;margin:0}h2{font-size:16px;margin:0 0 8px;color:#444}
      table{width:100%;border-collapse:collapse;margin-top:16px}
      th,td{padding:8px 4px;border-bottom:1px solid #ddd;text-align:left;font-size:13px}
      th{background:#f5f5f5;font-weight:600}
      .totals{margin-top:16px;margin-left:auto;width:280px}
      .totals td{padding:4px 8px}
      .balance{font-weight:700;font-size:16px;border-top:2px solid #1a1a1a}
      .meta{display:flex;justify-content:space-between;margin-top:24px;font-size:12px;color:#666}
    `,
    bodyHtml: `
    <h1>UnSaid Memories</h1><h2>Invoice ${escapeHtml(inv.number)}</h2>
    <table><thead><tr><th>Description</th><th style="text-align:center">Qty</th><th style="text-align:right">Unit</th><th style="text-align:right">Total</th></tr></thead><tbody>${items}</tbody></table>
    <table class="totals">
      <tr><td>Subtotal</td><td style="text-align:right">${fmt(inv.subtotal, inv.currency)}</td></tr>
      <tr><td>Deposit paid</td><td style="text-align:right">${fmt(inv.depositPaid, inv.currency)}</td></tr>
      <tr><td>Amount paid</td><td style="text-align:right">${fmt(inv.amountPaid, inv.currency)}</td></tr>
      <tr class="balance"><td>Balance due</td><td style="text-align:right">${fmt(inv.balanceDue, inv.currency)}</td></tr>
    </table>
    <div class="meta"><div>Issued ${dateStr(inv.createdAt)}</div><div>Status: ${escapeHtml(inv.status)}</div></div>
    <div style="margin-top:24px;font-size:12px;color:#888">UnSaid Memories · unsaid.com</div>`,
  });
  if (!ok) alert('Pop-ups are blocked — allow pop-ups for this site to print invoices.');
}
function escapeHtml(s: string) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}

// ---- Shared modal shell ----
function ModalShell({
  title, onClose, children, wide,
}: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className={cn('max-h-[90vh] overflow-y-auto rounded-lg bg-card p-6 shadow-xl', wide ? 'w-full max-w-3xl' : 'w-full max-w-lg')}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-accent"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4">{children}</div>
      </div>
    </div>
  );
}
