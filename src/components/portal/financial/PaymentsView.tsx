'use client';

import React, { useState } from 'react';
import { DawgNavSection } from '@/lib/types';
import { CreditCard, Search, Shield, DollarSign, Calculator, Check, Receipt, FileText, RotateCcw, AlertTriangle } from 'lucide-react';
import { PageHeader, PageTabs, FilterSelect, KpiTiles } from '../_shared/PageHeader';
import { FailedPaymentsList } from './FailedPayments';
import { usePrintReceipt, useCreateInvoiceAction, useSendPaymentReminders } from '@/hooks/admin/useActions';
import { cn } from '@/lib/utils';
import { openPrintDocument, escapeHtmlClient as esc } from '@/lib/printing/client';

interface PaymentRow {
  id: string;
  dbId: string;
  customerId: string | null;
  customer: string;
  service: string;
  amount: number;
  method: string;
  date: string | null;
  time: string | null;
  status: string;
  details: string;
  pet: string | null;
  staff: string;
  locationId: string | null;
}

interface DepositRegisterRow {
  id: string;
  customer: string;
  pet: string;
  service: string;
  amount: number;
  status: string;
  method: string;
  collectedDate: string;
  targetApptDate: string;
}

interface CheckoutRow {
  id: string;
  customer: string;
  pet: string;
  service: string;
  date: string;
  time: string;
  status: string;
}

interface PaymentsViewProps {
  onNavigateSection?: (section: DawgNavSection) => void;
  onOpenQuickPayment?: () => void;
  /** Landing sub-view — /admin/payments/checkouts opens the queue directly (§3.2 Checkouts as its own surface). */
  defaultSubView?: SubView;
}

const fmtMoney = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);

type SubView = 'overview' | 'retail' | 'ecommerce' | 'cash' | 'pending' | 'checkouts';
type PayTab = 'all' | 'completed' | 'pending' | 'deposits' | 'cash' | 'cashcheck' | 'card' | 'online' | 'failed' | 'refunded';

export const PaymentsView: React.FC<PaymentsViewProps> = ({ onNavigateSection, onOpenQuickPayment, defaultSubView }) => {
  const [activeSubView, setActiveSubView] = useState<SubView>(defaultSubView || 'overview');

  // Search + filter state — every filter actually filters the live list below.
  const [paymentsSearch, setPaymentsSearch] = useState('');
  const [paymentsTab, setPaymentsTab] = useState<PayTab>('all');
  const [methodFilter, setMethodFilter] = useState('ALL');
  const [locationFilter, setLocationFilter] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('ALL');
  const [staffFilter, setStaffFilter] = useState('ALL');
  const [checkoutSearch, setCheckoutSearch] = useState('');

  // Real locations for the location filter.
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  React.useEffect(() => {
    fetch('/api/locations', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { locations: [] }))
      .then((d) => setLocations(Array.isArray(d.locations) ? d.locations : []))
      .catch(() => setLocations([]));
  }, []);

  // Interactive cash register denominations calculator (functional, user-driven).
  const [cashCalc, setCashCalc] = useState({
    hundreds: 0, fifties: 0, twenties: 0, tens: 0, fives: 0, ones: 0,
    quarters: 0, dimes: 0, nickels: 0, pennies: 0,
    openingFloat: 200, expectedInflow: 0,
  });
  const countedTill =
    cashCalc.hundreds * 100 + cashCalc.fifties * 50 + cashCalc.twenties * 20 +
    cashCalc.tens * 10 + cashCalc.fives * 5 + cashCalc.ones * 1 +
    cashCalc.quarters * 0.25 + cashCalc.dimes * 0.1 + cashCalc.nickels * 0.05 + cashCalc.pennies * 0.01;
  const totalExpected = cashCalc.openingFloat + cashCalc.expectedInflow;
  const variance = countedTill - totalExpected;

  // Real payments from /api/admin/payments.
  const [paymentsList, setPaymentsList] = useState<PaymentRow[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);

  // Real checkout queue: completed appointments without a recorded payment.
  const [checkoutQueue, setCheckoutQueue] = useState<CheckoutRow[]>([]);
  const [checkoutLoading, setCheckoutLoading] = useState(true);

  // §3.3 Summary extras — outstanding invoices + gift-card liability,
  // from the Accounting cluster's shared summary API.
  const [acctSummary, setAcctSummary] = useState<{ outstanding: { count: number; total: number }; giftCards: { liability: number; activeCount: number } } | null>(null);
  React.useEffect(() => {
    fetch('/api/admin/accounting/summary', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !d.error) setAcctSummary(d); })
      .catch(() => {});
  }, []);

  // §3.3 Register — Deposits tab: the REAL deposit registry
  // (commerce_deposits via /api/admin/deposits, which already merges
  // pending deposit payments into the same rows) — not a second
  // pending-payments filter wearing a deposits label.
  const [depositRows, setDepositRows] = useState<DepositRegisterRow[]>([]);
  const [depositsLoading, setDepositsLoading] = useState(true);
  React.useEffect(() => {
    fetch('/api/admin/deposits', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { deposits: [] }))
      .then((d: any) => {
        const rows: DepositRegisterRow[] = (d.deposits || []).map((x: any) => ({
          id: String(x.id), customer: String(x.customer || '—'), pet: String(x.pet || ''),
          service: String(x.service || ''), amount: Number(x.amount) || 0,
          status: String(x.status || ''), method: String(x.method || ''),
          collectedDate: String(x.collectedDate || ''), targetApptDate: String(x.targetApptDate || ''),
        }));
        setDepositRows(rows);
      })
      .catch(() => setDepositRows([]))
      .finally(() => setDepositsLoading(false));
  }, []);

  const printReceipt = usePrintReceipt();
  const createInvoice = useCreateInvoiceAction();
  const sendReminders = useSendPaymentReminders();
  const [remindersBusy, setRemindersBusy] = useState(false);
  const handleSendReminders = async () => {
    if (!window.confirm('Email a payment reminder for every overdue invoice? Reminders sent in the last 7 days are skipped.')) return;
    setRemindersBusy(true);
    setActionMsg(null);
    try {
      const res: any = await sendReminders.mutateAsync({});
      setActionMsg(res?.message || `Sent ${res?.sent ?? 0} reminder(s).`);
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Reminders failed.');
    } finally {
      setRemindersBusy(false);
    }
  };
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const loadPayments = React.useCallback(() => {
    setPaymentsLoading(true);
    setActionMsg(null);
    fetch('/api/admin/payments?limit=200', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d?.error) {
          setPaymentsError(d.error);
          return;
        }
        const mapped: PaymentRow[] = (d.payments || []).map((p: any) => ({
          id: String(p.id),
          dbId: String(p.dbId || p.id),
          customerId: p.customerId ? String(p.customerId) : null,
          customer: String(p.customer || 'Walk-in'),
          service: String(p.tender || ''),
          amount: Number(p.amount) || 0,
          method: String(p.tender || 'OTHER').toUpperCase().replace(/\s+/g, '_'),
          date: p.date || null,
          time: p.time || null,
          status: String(p.status || 'UNKNOWN'),
          details: String(p.reference || ''),
          pet: p.pet ? String(p.pet) : null,
          staff: String(p.staff || '—'),
          locationId: p.locationId || null,
        }));
        setPaymentsList(mapped);
        setPaymentsError(null);
      })
      .catch((e) => setPaymentsError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setPaymentsLoading(false));
  }, []);

  React.useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  React.useEffect(() => {
    setCheckoutLoading(true);
    fetch('/api/bookings?limit=200', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : {}))
      .then((d: any) => {
        const raw = Array.isArray(d) ? d : d.appointments || d.bookings || [];
        // Awaiting checkout = completed/in-service appointments.
        const awaiting = raw
          .filter((a: any) => {
            const s = String(a.status || '').toLowerCase();
            return s === 'completed' || s === 'in_service' || s === 'checked_in';
          })
          .map((a: any) => ({
            id: String(a.id),
            customer: a.ownerName || a.customerName || '—',
            pet: a.dogName || a.petName || '',
            service: a.service || a.serviceName || 'Grooming',
            date: a.date || '',
            time: a.time || '',
            status: String(a.status || '').toUpperCase(),
          }));
        setCheckoutQueue(awaiting);
      })
      .catch(() => setCheckoutQueue([]))
      .finally(() => setCheckoutLoading(false));
  }, []);

  // ---- Real KPI aggregates over the live rows ----
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const paidRows = paymentsList.filter((p) => p.status === 'PAID');
  const mtdRevenue = paidRows
    .filter((p) => p.date && new Date(p.date + 'T12:00:00') >= monthStart)
    .reduce((s, p) => s + p.amount, 0);
  const completedCount = paidRows.length;
  const pendingCount = paymentsList.filter((p) => p.status === 'PENDING' || p.status === 'PENDING_AUTH').length;
  const refundedRows = paymentsList.filter((p) => p.status === 'REFUNDED');
  const avgTicket = completedCount > 0 ? paidRows.reduce((s, p) => s + p.amount, 0) / completedCount : 0;

  // ---- Distinct filter options from live data ----
  const methodOptions = Array.from(new Set(paymentsList.map((p) => p.method))).sort();
  const staffOptions = Array.from(new Set(paymentsList.map((p) => p.staff).filter((s) => s && s !== '—'))).sort();

  const resetFilters = () => {
    setPaymentsSearch('');
    setMethodFilter('ALL');
    setLocationFilter('ALL');
    setDateFilter('ALL');
    setStaffFilter('ALL');
    setPaymentsTab('all');
  };
  const filtersActive =
    paymentsSearch.trim() !== '' || methodFilter !== 'ALL' || locationFilter !== 'ALL' ||
    dateFilter !== 'ALL' || staffFilter !== 'ALL' || paymentsTab !== 'all';

  const dateMatches = (p: PaymentRow) => {
    if (dateFilter === 'ALL') return true;
    if (!p.date) return false;
    const d = new Date(p.date + 'T12:00:00');
    if (isNaN(d.getTime())) return false;
    const now = new Date();
    if (dateFilter === 'TODAY') return d.toDateString() === now.toDateString();
    if (dateFilter === 'WEEK') {
      const weekAgo = new Date(now);
      weekAgo.setDate(now.getDate() - 7);
      return d >= weekAgo;
    }
    if (dateFilter === 'MONTH') return d >= monthStart;
    return true;
  };

  const CARD_METHODS = ['CREDIT_CARD', 'CARD', 'VISA', 'MASTERCARD', 'AMEX', 'DISCOVER', 'STRIPE_(CARD)'];
  const ONLINE_METHODS = ['STRIPE_(CARD)', 'E_STORE_AUTOPAY', 'ONLINE'];

  const filteredPayments = paymentsList.filter((p) => {
    if (paymentsTab === 'completed' && p.status !== 'PAID') return false;
    if (paymentsTab === 'pending' && p.status !== 'PENDING' && p.status !== 'PENDING_AUTH') return false;
    if (paymentsTab === 'cash' && p.method !== 'CASH') return false;
    if (paymentsTab === 'cashcheck' && p.method !== 'CASH' && p.method !== 'CHECK') return false;
    if (paymentsTab === 'card' && !CARD_METHODS.includes(p.method)) return false;
    if (paymentsTab === 'online' && !ONLINE_METHODS.includes(p.method)) return false;
    if (paymentsTab === 'refunded' && p.status !== 'REFUNDED') return false;

    if (methodFilter !== 'ALL' && p.method !== methodFilter) return false;
    if (locationFilter !== 'ALL' && p.locationId !== locationFilter) return false;
    if (staffFilter !== 'ALL' && p.staff !== staffFilter) return false;
    if (!dateMatches(p)) return false;

    if (paymentsSearch.trim()) {
      const q = paymentsSearch.toLowerCase();
      return (
        p.id.toLowerCase().includes(q) ||
        p.customer.toLowerCase().includes(q) ||
        p.details.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredCheckouts = checkoutQueue.filter((c) => {
    if (!checkoutSearch.trim()) return true;
    const q = checkoutSearch.toLowerCase();
    return [c.id, c.customer, c.pet, c.service].join(' ').toLowerCase().includes(q);
  });

  const pendingPayments = paymentsList.filter((p) => p.status === 'PENDING' || p.status === 'PENDING_AUTH');

  const handlePrintReceipt = async (p: PaymentRow) => {
    setActionBusy(`print-${p.dbId}`);
    setActionMsg(null);
    try {
      const res: any = await printReceipt.mutateAsync({ payment_id: p.dbId });
      if (res?.ok && res?.receipt) {
        const r = res.receipt;
        // SA-47: render the server-assembled receipt into the shared
        // print document — receipt paper geometry from the tenant's
        // printer settings, printed on this device's printer.
        const ok = await openPrintDocument({
          docType: 'receipt',
          title: `Receipt ${r.paymentNumber}`,
          extraCss: `
            h1{font-size:18px;margin:0 0 4px} .meta{color:#666;font-size:12px;margin-bottom:16px}
            table{width:100%;border-collapse:collapse;margin:12px 0}
            td{padding:6px 0;border-bottom:1px solid #eee} .total{font-weight:700;font-size:16px;border-top:2px solid #111}
          `,
          bodyHtml: `
            <h1>UnSaid Memories</h1><div class="meta">Payment Receipt</div>
            <table>
              <tr><td>Receipt #</td><td style="text-align:right">${esc(r.paymentNumber)}</td></tr>
              ${r.customerName ? `<tr><td>Customer</td><td style="text-align:right">${esc(r.customerName)}</td></tr>` : ''}
              ${r.tender ? `<tr><td>Method</td><td style="text-align:right">${esc(r.tender)}</td></tr>` : ''}
              <tr><td>Date</td><td style="text-align:right">${esc(new Date(r.date).toLocaleString())}</td></tr>
              <tr><td>Status</td><td style="text-align:right">${esc(r.status)}</td></tr>
              <tr class="total"><td>Amount</td><td style="text-align:right">${esc(fmtMoney(Number(r.amount)))}</td></tr>
            </table>
            <div class="meta">unsaid.com · Thank you!</div>`,
        });
        setActionMsg(ok ? `Receipt ${r.paymentNumber} ready.` : 'Pop-ups are blocked — allow pop-ups for this site to print receipts.');
      } else {
        setActionMsg(res?.error || 'Print failed.');
      }
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Print failed.');
    } finally {
      setActionBusy(null);
    }
  };

  const handleCreateInvoice = async (p: PaymentRow) => {
    if (!p.customerId) {
      setActionMsg(`Payment ${p.id} has no customer on file — an invoice needs a customer. Open the customer record and create the invoice from there.`);
      return;
    }
    if (!window.confirm(`Create an invoice for payment ${p.id} (${fmtMoney(p.amount)})?`)) return;
    setActionBusy(`inv-${p.dbId}`);
    setActionMsg(null);
    try {
      const res: any = await createInvoice.mutateAsync({
        customer_id: p.customerId,
        line_items: [{ description: `Payment ${p.id} — ${p.service || 'services'}`, quantity: 1, unit_price_cents: Math.round(p.amount * 100) }],
        notes: `Created from payment ${p.id}`,
      } as any);
      if (res?.ok) {
        setActionMsg(`Invoice ${res.invoiceNumber || ''} created from payment ${p.id}.`);
      } else {
        setActionMsg(res?.error || 'Could not create invoice — a customer is required.');
      }
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Could not create invoice.');
    } finally {
      setActionBusy(null);
    }
  };

  // SA-49 Batch Export — server-side CSV generation via the finance
  // batch_export action; the browser only downloads the returned file.
  const [exportBusy, setExportBusy] = useState(false);
  const handleBatchExport = async () => {
    setExportBusy(true);
    setActionMsg(null);
    try {
      const res = await fetch('/api/admin/finance/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fin_batch_export', payload: {} }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        setActionMsg(j.error || 'Batch export failed.');
        return;
      }
      if (!j.count) {
        setActionMsg('No payments to export yet.');
        return;
      }
      const blob = new Blob([j.csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = j.filename || 'payments-export.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setActionMsg(`Exported ${j.count} payment(s) — ${fmtMoney(Number(j.totalAmount || 0))} total — to ${j.filename}.`);
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Batch export failed.');
    } finally {
      setExportBusy(false);
    }
  };

  const TAB_LABELS: Record<PayTab, string> = {
    all: 'All Payments', completed: 'Completed', pending: 'Pending / Processing',
    deposits: 'Pending / Deposits', cash: 'Cash', cashcheck: 'Cash & Check',
    card: 'Card', online: 'Online', failed: 'Failed', refunded: 'Refunded',
  };

  return (
    <div className="flex flex-col w-full text-foreground bg-background select-text">
      {/* STATUS STRIP */}
      <div className="w-full bg-muted/60 border-b border-border px-4 py-2 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-success animate-pulse shrink-0"></span>
          <span className="font-medium text-[11px] text-muted-foreground">Payments &amp; Checkouts</span>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="font-medium">Currency: <span className="text-foreground font-semibold">USD</span></span>
        </div>
      </div>

      {/* PAGE HEADER */}
      <PageHeader
        contextLabel="Payments & Checkouts"
        statusItems={[
          { label: 'Payments loaded:', value: String(paymentsList.length), tone: 'info' },
          { label: 'Currency:', value: 'USD' },
        ]}
        title="Payments"
        badge="Financial Register"
        description="Every payment below is a live row from the database. Filter by method, location, date, or staff."
      />

      {/* SUB NAVIGATION TABS */}
      <PageTabs
        activeId={activeSubView}
        onSelect={(id) => setActiveSubView(id as SubView)}
        tabs={[
          { id: 'overview', label: 'Financial Register' },
          { id: 'retail', label: 'Retail Payments' },
          { id: 'ecommerce', label: 'Ecommerce' },
          { id: 'cash', label: 'Cash & Register Till' },
          { id: 'pending', label: 'Pending Authorizations' },
          { id: 'checkouts', label: 'Checkouts Queue' },
        ]}
      />

      {actionMsg && (
        <div className="mx-6 mt-4 rounded-lg border border-border bg-card px-4 py-2 text-sm">{actionMsg}</div>
      )}

      {/* VIEW: OVERVIEW (FINANCIAL REGISTER) */}
      {activeSubView === 'overview' && (
        <div className="animate-fade-in p-6 space-y-6">
          <KpiTiles
            tiles={[
              { label: 'Total Revenue (MTD)', value: fmtMoney(mtdRevenue), caption: `${completedCount} completed payments`, tone: 'primary', icon: DollarSign },
              { label: 'Completed Payments', value: String(completedCount), caption: `Avg ticket ${fmtMoney(avgTicket)}`, icon: Check },
              { label: 'Pending / Processing', value: String(pendingCount), caption: 'Awaiting capture', tone: 'warning', icon: Shield },
              { label: 'Refunded', value: `${refundedRows.length} (${fmtMoney(refundedRows.reduce((s, p) => s + p.amount, 0))})`, caption: 'Refunds issued', tone: 'default', icon: CreditCard },
              { label: 'Outstanding Invoices', value: acctSummary ? fmtMoney(acctSummary.outstanding.total) : '—', caption: acctSummary ? `${acctSummary.outstanding.count} open invoice(s) in AR` : 'Loading AR…', tone: 'warning', icon: FileText },
              { label: 'Gift Cards Balance', value: acctSummary ? fmtMoney(acctSummary.giftCards.liability) : '—', caption: acctSummary ? `${acctSummary.giftCards.activeCount} active card(s) outstanding` : 'Loading gift cards…', tone: 'default', icon: CreditCard },
            ]}
          />

          {/* CONTROL BAR: search + real filters */}
          <div className="flex flex-col gap-3 bg-card border border-border rounded-xl shadow-card p-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative flex-1">
                <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={paymentsSearch}
                  onChange={(e) => setPaymentsSearch(e.target.value)}
                  className="w-full bg-background border border-input rounded-lg pl-9 pr-3 h-9 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Search txn ID, customer, reference..."
                  type="text"
                />
              </div>
              <button
                onClick={handleSendReminders}
                disabled={remindersBusy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background hover:bg-accent h-9 px-3.5 text-[13px] font-medium justify-center disabled:opacity-50"
              >
                <AlertTriangle className="size-4" />
                {remindersBusy ? 'Sending…' : 'Send Reminders'}
              </button>
              <button
                onClick={handleBatchExport}
                disabled={exportBusy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background hover:bg-accent h-9 px-3.5 text-[13px] font-medium justify-center disabled:opacity-50"
              >
                <FileText className="size-4" />
                {exportBusy ? 'Exporting…' : 'Batch Export'}
              </button>
              <button
                onClick={onOpenQuickPayment}
                data-tip="Record money a customer paid you outside the online store — check, transfer, or in person — so their balance is right."
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-3.5 text-[13px] font-medium justify-center"
              >
                <DollarSign className="size-4" />
                Record Direct Payment
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <FilterSelect aria-label="Filter by method" value={methodFilter} onChange={setMethodFilter}>
                <option value="ALL">Method: All</option>
                {methodOptions.map((m) => (
                  <option key={m} value={m}>Method: {m.replace(/_/g, ' ')}</option>
                ))}
              </FilterSelect>
              <FilterSelect aria-label="Filter by location" value={locationFilter} onChange={setLocationFilter}>
                <option value="ALL">Location: All</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>Location: {l.name}</option>
                ))}
              </FilterSelect>
              <FilterSelect aria-label="Filter by date" value={dateFilter} onChange={setDateFilter}>
                <option value="ALL">Date: All Time</option>
                <option value="TODAY">Date: Today</option>
                <option value="WEEK">Date: Last 7 Days</option>
                <option value="MONTH">Date: This Month</option>
              </FilterSelect>
              <FilterSelect aria-label="Filter by staff" value={staffFilter} onChange={setStaffFilter}>
                <option value="ALL">Staff: All</option>
                {staffOptions.map((s) => (
                  <option key={s} value={s}>Staff: {s}</option>
                ))}
              </FilterSelect>
              {filtersActive && (
                <button
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-3 h-9 text-[13px] font-medium hover:bg-accent"
                >
                  <RotateCcw className="size-3.5" />
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* REGISTER TABS */}
          <div className="bg-background border border-border rounded-xl shadow-card flex overflow-x-auto custom-scrollbar">
            {(Object.keys(TAB_LABELS) as PayTab[]).map((tab) => {
              const isActive = paymentsTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setPaymentsTab(tab)}
                  className={cn(
                    'px-5 py-2.5 text-[12px] font-medium border-r border-border cursor-pointer transition-colors duration-150 whitespace-nowrap',
                    isActive ? 'text-primary' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  {TAB_LABELS[tab]}
                </button>
              );
            })}
          </div>

          {paymentsTab === 'failed' ? (
            <FailedPaymentsList />
          ) : paymentsTab === 'deposits' ? (
            <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden overflow-x-auto">
              <table className="w-full border-collapse text-left text-[13px] text-foreground">
                <thead>
                  <tr className="bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground">
                    <th className="p-3 border-r border-border font-semibold">Deposit ID</th>
                    <th className="p-3 border-r border-border font-semibold">Customer &amp; Pet</th>
                    <th className="p-3 border-r border-border font-semibold">Service</th>
                    <th className="p-3 border-r border-border font-semibold">Method</th>
                    <th className="p-3 border-r border-border font-semibold">Collected</th>
                    <th className="p-3 border-r border-border font-semibold">Appointment</th>
                    <th className="p-3 border-r border-border text-right font-semibold">Amount</th>
                    <th className="p-3 text-center font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-medium">
                  {depositsLoading ? (
                    <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Loading deposit registry…</td></tr>
                  ) : depositRows.length === 0 ? (
                    <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No deposits in the registry yet. Manage deposits in full at Deposits.</td></tr>
                  ) : depositRows.map((d) => (
                    <tr key={d.id} className="hover:bg-accent/50 transition-colors">
                      <td className="p-3 border-r border-border font-semibold tabular-nums">{d.id}</td>
                      <td className="p-3 border-r border-border font-medium">{d.customer}{d.pet ? <div className="text-[11px] text-muted-foreground font-normal">Pet: {d.pet}</div> : null}</td>
                      <td className="p-3 border-r border-border text-muted-foreground">{d.service}</td>
                      <td className="p-3 border-r border-border text-muted-foreground">{d.method}</td>
                      <td className="p-3 border-r border-border">{d.collectedDate || '—'}</td>
                      <td className="p-3 border-r border-border">{d.targetApptDate || '—'}</td>
                      <td className="p-3 border-r border-border text-right font-semibold tabular-nums">${d.amount.toFixed(2)}</td>
                      <td className="p-3 text-center">
                        <span className="inline-flex items-center text-[10px] font-semibold border px-2 py-0.5 rounded-full uppercase bg-muted border-border text-muted-foreground">{d.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden overflow-x-auto">
              <table className="w-full border-collapse text-left text-[13px] text-foreground">
                <thead>
                  <tr className="bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground">
                    <th className="p-3 border-r border-border font-semibold">Transaction ID</th>
                    <th className="p-3 border-r border-border font-semibold">Customer &amp; Pet</th>
                    <th className="p-3 border-r border-border font-semibold">Service</th>
                    <th className="p-3 border-r border-border font-semibold">Method</th>
                    <th className="p-3 border-r border-border font-semibold">Date &amp; Time</th>
                    <th className="p-3 border-r border-border font-semibold">Groomer</th>
                    <th className="p-3 border-r border-border text-right font-semibold">Amount</th>
                    <th className="p-3 border-r border-border text-center font-semibold">Status</th>
                    <th className="p-3 text-center font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-medium">
                  {paymentsLoading ? (
                    <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Loading payments…</td></tr>
                  ) : paymentsError ? (
                    <tr><td colSpan={9} className="p-8 text-center text-destructive">Failed to load: {paymentsError}</td></tr>
                  ) : filteredPayments.length === 0 ? (
                    <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">No payments match these filters.</td></tr>
                  ) : filteredPayments.map((p) => (
                    <tr key={p.dbId} className="hover:bg-accent/50 transition-colors">
                      <td className="p-3 border-r border-border font-semibold tabular-nums">{p.id}</td>
                      <td className="p-3 border-r border-border font-medium">{p.customer}{p.pet ? <div className="text-[11px] text-muted-foreground font-normal">Pet: {p.pet}</div> : null}</td>
                      <td className="p-3 border-r border-border text-muted-foreground truncate max-w-[200px]">{p.service}</td>
                      <td className="p-3 border-r border-border text-muted-foreground">{p.method.replace(/_/g, ' ')}</td>
                      <td className="p-3 border-r border-border">
                        <div className="text-foreground">{p.date || '—'}</div>
                        <div className="text-[10px] text-muted-foreground">{p.time || ''}</div>
                      </td>
                      <td className="p-3 border-r border-border text-muted-foreground">{p.staff}</td>
                      <td className="p-3 border-r border-border text-right font-semibold tabular-nums">${p.amount.toFixed(2)}</td>
                      <td className="p-3 border-r border-border text-center">
                        <span className={cn(
                          'inline-flex items-center text-[10px] font-semibold border px-2 py-0.5 rounded-full uppercase',
                          p.status === 'PAID' ? 'bg-success/10 border-success/20 text-success'
                          : p.status === 'REFUNDED' ? 'bg-muted border-border text-muted-foreground'
                          : 'bg-warning/10 border-warning/20 text-warning',
                        )}>
                          {p.status}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handlePrintReceipt(p)}
                            disabled={actionBusy === `print-${p.dbId}`}
                            title="Print receipt"
                            className="inline-flex items-center gap-1 rounded-lg border border-input bg-background px-2 py-1 text-[11px] font-medium hover:bg-accent disabled:opacity-50"
                          >
                            <Receipt className="size-3.5" />
                            {actionBusy === `print-${p.dbId}` ? '…' : 'Receipt'}
                          </button>
                          <button
                            onClick={() => handleCreateInvoice(p)}
                            disabled={actionBusy === `inv-${p.dbId}`}
                            title="Create invoice from this payment"
                            className="inline-flex items-center gap-1 rounded-lg border border-input bg-background px-2 py-1 text-[11px] font-medium hover:bg-accent disabled:opacity-50"
                          >
                            <FileText className="size-3.5" />
                            {actionBusy === `inv-${p.dbId}` ? '…' : 'Invoice'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* VIEW: RETAIL PAYMENTS */}
      {activeSubView === 'retail' && (
        <div className="animate-fade-in p-6 space-y-6">
          <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <h3 className="mt-3 font-semibold">Card charging isn&apos;t enabled at the register</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
              The register records payments — it doesn&apos;t charge cards. Cash, check, and gift card
              payments below are live records from the register.
            </p>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="bg-muted/40 border-b border-border p-3 font-semibold text-[13px] uppercase">
              In-Person Transaction Log
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px] border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/30 font-semibold uppercase text-[11px] text-muted-foreground">
                    <th className="p-3 border-r border-border">Txn ID</th>
                    <th className="p-3 border-r border-border">Customer</th>
                    <th className="p-3 border-r border-border text-right">Amount</th>
                    <th className="p-3 border-r border-border">Method</th>
                    <th className="p-3 text-center">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paymentsList.filter((p) => ['CASH', 'CHECK', 'CARD', 'VISA', 'MASTERCARD', 'AMEX', 'DISCOVER'].includes(p.method)).map((p) => (
                    <tr key={p.dbId} className="hover:bg-muted/30">
                      <td className="p-3 border-r border-border font-semibold tabular-nums">{p.id}</td>
                      <td className="p-3 border-r border-border">{p.customer}</td>
                      <td className="p-3 border-r border-border text-right font-semibold tabular-nums">${p.amount.toFixed(2)}</td>
                      <td className="p-3 border-r border-border text-muted-foreground">{p.method.replace(/_/g, ' ')}</td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => handlePrintReceipt(p)}
                          disabled={actionBusy === `print-${p.dbId}`}
                          className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                          <Receipt className="size-3.5" />
                          {actionBusy === `print-${p.dbId}` ? 'Working…' : 'Print Receipt'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {paymentsList.filter((p) => ['CASH', 'CHECK', 'CARD', 'VISA', 'MASTERCARD', 'AMEX', 'DISCOVER'].includes(p.method)).length === 0 && (
                    <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No in-person payments recorded yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: ECOMMERCE */}
      {activeSubView === 'ecommerce' && (
        <div className="animate-fade-in p-6 space-y-6">
          <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
            <CreditCard className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <h3 className="mt-3 font-semibold">Ecommerce gateway status</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
              Online card processing is currently unavailable — the Stripe platform account is
              disabled and a replacement-processor decision is pending, so no new online charges
              can be taken. Online payments already recorded are listed below.
            </p>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="bg-muted/40 border-b border-border p-3 font-semibold text-[13px] uppercase">
              Online Transactions
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px] border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/30 font-semibold uppercase text-[11px] text-muted-foreground">
                    <th className="p-3 border-r border-border">Txn ID</th>
                    <th className="p-3 border-r border-border">Customer</th>
                    <th className="p-3 border-r border-border text-right">Amount</th>
                    <th className="p-3 border-r border-border">Date</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paymentsList.filter((p) => ONLINE_METHODS.includes(p.method)).map((p) => (
                    <tr key={p.dbId} className="hover:bg-muted/30">
                      <td className="p-3 border-r border-border font-semibold tabular-nums">{p.id}</td>
                      <td className="p-3 border-r border-border">{p.customer}</td>
                      <td className="p-3 border-r border-border text-right font-semibold tabular-nums">${p.amount.toFixed(2)}</td>
                      <td className="p-3 border-r border-border text-muted-foreground">{p.date || '—'}</td>
                      <td className="p-3 text-center">
                        <span className={cn(
                          'inline-flex items-center text-[10px] font-semibold border px-2 py-0.5 rounded-full uppercase',
                          p.status === 'PAID' ? 'bg-success/10 border-success/20 text-success' : 'bg-warning/10 border-warning/20 text-warning',
                        )}>
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {paymentsList.filter((p) => ONLINE_METHODS.includes(p.method)).length === 0 && (
                    <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No online payments recorded yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: CASH & REGISTER TILL */}
      {activeSubView === 'cash' && (
        <div className="animate-fade-in p-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-card border border-border rounded-xl p-6 space-y-6">
              <div className="border-b border-border pb-2 flex items-center justify-between">
                <span className="text-[12px] font-semibold uppercase">Denomination Till Count</span>
                <Calculator className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-[12px]">
                <div className="space-y-2">
                  <span className="text-[10px] font-semibold uppercase text-muted-foreground block border-b border-border pb-1">Bills</span>
                  {([['hundreds', '$100'], ['fifties', '$50'], ['twenties', '$20'], ['tens', '$10'], ['fives', '$5'], ['ones', '$1']] as const).map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between">
                      <span>{label} Bills:</span>
                      <input type="number" min={0} value={cashCalc[key]}
                        onChange={(e) => setCashCalc((prev) => ({ ...prev, [key]: Math.max(0, parseInt(e.target.value) || 0) }))}
                        className="w-20 bg-background border border-input p-1 text-right tabular-nums rounded" />
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <span className="text-[10px] font-semibold uppercase text-muted-foreground block border-b border-border pb-1">Coins</span>
                  {([['quarters', 'Quarters (25¢)'], ['dimes', 'Dimes (10¢)'], ['nickels', 'Nickels (5¢)'], ['pennies', 'Pennies (1¢)']] as const).map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between">
                      <span>{label}:</span>
                      <input type="number" min={0} value={cashCalc[key]}
                        onChange={(e) => setCashCalc((prev) => ({ ...prev, [key]: Math.max(0, parseInt(e.target.value) || 0) }))}
                        className="w-20 bg-background border border-input p-1 text-right tabular-nums rounded" />
                    </div>
                  ))}
                  <div className="pt-4 border-t border-border space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-muted-foreground text-[10px]">Opening Float:</span>
                      <input type="number" value={cashCalc.openingFloat}
                        onChange={(e) => setCashCalc((prev) => ({ ...prev, openingFloat: parseFloat(e.target.value) || 0 }))}
                        className="w-20 bg-background border border-input p-1 text-right tabular-nums rounded" />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-muted-foreground text-[10px]">Expected Cash Inflow:</span>
                      <input type="number" value={cashCalc.expectedInflow}
                        onChange={(e) => setCashCalc((prev) => ({ ...prev, expectedInflow: parseFloat(e.target.value) || 0 }))}
                        className="w-20 bg-background border border-input p-1 text-right tabular-nums rounded" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-card border border-border rounded-xl p-6 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase">Till Audit</span>
                <div className="divide-y divide-border text-[12px] pt-2">
                  <div className="py-2.5 flex justify-between"><span>Counted Till:</span><strong>{fmtMoney(countedTill)}</strong></div>
                  <div className="py-2.5 flex justify-between"><span>Expected:</span><strong>{fmtMoney(totalExpected)}</strong></div>
                  <div className="py-2.5 flex justify-between"><span>Variance:</span>
                    <strong className={variance === 0 ? 'text-success' : 'text-destructive'}>
                      {variance === 0 ? fmtMoney(0) : `${variance > 0 ? '+' : ''}${fmtMoney(variance)}`}
                    </strong>
                  </div>
                </div>
                <div className={cn('p-3 text-[11px] font-semibold uppercase text-center rounded-lg border',
                  variance === 0 ? 'bg-success/10 border-success/20 text-success' : 'bg-warning/10 border-warning/20 text-warning')}>
                  {variance === 0 ? 'Till balanced' : `Variance: ${variance > 0 ? 'surplus' : 'deficit'} — supervisor review needed`}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Count the physical till above, then close the register from the POS screen. Cash movements
                are recorded per register session.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: PENDING AUTHORIZATIONS */}
      {activeSubView === 'pending' && (
        <div className="animate-fade-in p-6 space-y-6">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="bg-muted/40 border-b border-border p-3 font-semibold text-[13px] uppercase flex items-center gap-2">
              <Shield className="w-4 h-4 text-muted-foreground" />
              Pending Authorizations &amp; Holds
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px] border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/30 font-semibold uppercase text-[11px] text-muted-foreground">
                    <th className="p-3 border-r border-border">Txn ID</th>
                    <th className="p-3 border-r border-border">Customer</th>
                    <th className="p-3 border-r border-border text-right">Amount</th>
                    <th className="p-3 border-r border-border">Method</th>
                    <th className="p-3 border-r border-border">Date</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pendingPayments.map((p) => (
                    <tr key={p.dbId} className="hover:bg-muted/30">
                      <td className="p-3 border-r border-border font-semibold tabular-nums">{p.id}</td>
                      <td className="p-3 border-r border-border">{p.customer}</td>
                      <td className="p-3 border-r border-border text-right font-semibold tabular-nums">${p.amount.toFixed(2)}</td>
                      <td className="p-3 border-r border-border text-muted-foreground">{p.method.replace(/_/g, ' ')}</td>
                      <td className="p-3 border-r border-border text-muted-foreground">{p.date || '—'}</td>
                      <td className="p-3 text-center">
                        <span className="inline-flex items-center text-[10px] font-semibold border px-2 py-0.5 rounded-full uppercase bg-warning/10 border-warning/20 text-warning">
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {pendingPayments.length === 0 && (
                    <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No pending authorizations. Every payment below the register is settled.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: CHECKOUTS QUEUE */}
      {activeSubView === 'checkouts' && (
        <div className="animate-fade-in p-6 space-y-6">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="bg-muted/40 border-b border-border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Appointments Awaiting Checkout</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">Completed or in-service appointments from live bookings.</p>
              </div>
              <div className="relative">
                <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={checkoutSearch}
                  onChange={(e) => setCheckoutSearch(e.target.value)}
                  placeholder="Search customer, pet, service…"
                  className="bg-background border border-input rounded-lg pl-9 pr-3 h-9 text-[13px] w-64 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px] border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/30 font-semibold uppercase text-[11px] text-muted-foreground">
                    <th className="p-3 border-r border-border">Appointment</th>
                    <th className="p-3 border-r border-border">Customer / Pet</th>
                    <th className="p-3 border-r border-border">Service</th>
                    <th className="p-3 border-r border-border">Date</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {checkoutLoading ? (
                    <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Loading…</td></tr>
                  ) : filteredCheckouts.length === 0 ? (
                    <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No appointments are currently awaiting checkout.</td></tr>
                  ) : filteredCheckouts.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/30">
                      <td className="p-3 border-r border-border font-semibold tabular-nums">{c.id.slice(0, 8)}</td>
                      <td className="p-3 border-r border-border">
                        <div className="font-medium">{c.customer}</div>
                        {c.pet && <div className="text-[11px] text-muted-foreground">{c.pet}</div>}
                      </td>
                      <td className="p-3 border-r border-border text-muted-foreground">{c.service}</td>
                      <td className="p-3 border-r border-border text-muted-foreground">{c.date} {c.time}</td>
                      <td className="p-3 text-center">
                        <span className="inline-flex items-center text-[10px] font-semibold border px-2 py-0.5 rounded-full uppercase bg-warning/10 border-warning/20 text-warning">
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
