'use client';

import React, { useState, useEffect } from 'react';
import { DawgNavSection } from '@/lib/types';
import { openPrintDocument, escapeHtmlClient as esc } from '@/lib/printing/client';
import { PageHeader, PageTabs, KpiTiles, FilterSelect } from '../_shared/PageHeader';
import { cn } from '@/lib/utils';
import {
  useCollectDeposit,
  useApplyDepositToInvoice,
  useReleaseDeposit,
  useRefundDeposit,
  useForfeitDeposit,
  useTransferDeposit,
  useEditDeposit,
  useReceiptDeposit,
} from '@/hooks/admin/useActions';

interface DepositsViewProps {
  onNavigateSection?: (section: DawgNavSection) => void;
}

interface DepositRow {
  id: string;
  uuid: string | null;
  customer: string;
  phone: string;
  pet: string;
  breed: string;
  service: string;
  amount: number;
  collectedDate: string;
  collectedTime: string;
  targetApptDate: string;
  targetApptTime: string;
  method: string;
  auth: string;
  status: string;
  depositType: string;
  locationId: string | null;
  bookingId: string | null;
}

interface PolicySettings {
  enforce_24h: string;
  auto_revenue_sweep: string;
  vault_enabled: string;
  default_deposit_cents: string;
}

export const DepositsView: React.FC<DepositsViewProps> = ({ onNavigateSection }) => {
  const [activeTab, setActiveTab] = useState<'all' | 'held' | 'applied' | 'released' | 'forfeited' | 'refunded'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [rangeFilter, setRangeFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [amountFilter, setAmountFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [showCollectModal, setShowCollectModal] = useState(false);
  const [receiptData, setReceiptData] = useState<any>(null);

  // LIVE DATA — deposits from /api/admin/deposits (commerce_deposits registry
  // + pending Stripe payments). No mock rows.
  const [depositsList, setDepositsList] = useState<DepositRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [customers, setCustomers] = useState<{ id: string; label: string }[]>([]);
  const [auditLog, setAuditLog] = useState<{ id: string; timestamp: string; action: string; details: string }[]>([]);
  const [policies, setPolicies] = useState<PolicySettings>({
    enforce_24h: 'true', auto_revenue_sweep: 'true', vault_enabled: 'true', default_deposit_cents: '2500',
  });
  const [policiesPersisted, setPoliciesPersisted] = useState(true);
  const [policiesBusy, setPoliciesBusy] = useState(false);

  const loadDeposits = () => {
    setLoading(true);
    fetch('/api/admin/deposits')
      .then((r) => (r.ok ? r.json() : { deposits: [] }))
      .then((d) => setDepositsList(d.deposits || []))
      .catch(() => setDepositsList([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDeposits();
    fetch('/api/locations').then((r) => r.json()).then((d) => setLocations(d.locations || [])).catch(() => {});
    fetch('/api/admin/crm/customers?limit=200').then((r) => r.json()).then((d) => {
      const rows = d.customers || d.data || [];
      setCustomers(rows.map((c: any) => ({
        id: c.id,
        label: `${c.last_name || ''}, ${c.first_name || ''}`.trim() || c.email || c.id,
      })));
    }).catch(() => {});
    fetch('/api/admin/policy-settings?scope=deposits').then((r) => r.json()).then((d) => {
      if (d?.settings) setPolicies((p) => ({ ...p, ...d.settings }));
      if (d && d.persisted === false) setPoliciesPersisted(false);
    }).catch(() => {});
    fetch('/api/admin/deposits?audit=1').then((r) => r.json()).then((d) => setAuditLog(d.audit || [])).catch(() => {});
  }, []);

  // KPI aggregates over the live rows
  const heldRows = depositsList.filter((d) => d.status === 'HELD');
  const forfeitedRows = depositsList.filter((d) => d.status === 'FORFEITED');
  const refundedRows = depositsList.filter((d) => d.status === 'REFUNDED');
  const appliedThisMonth = depositsList.filter((d) => {
    if (d.status !== 'APPLIED' || !d.collectedDate) return false;
    return d.collectedDate.slice(0, 7) === new Date().toISOString().slice(0, 7);
  });
  const upcoming48h = heldRows.filter((d) => {
    if (!d.targetApptDate) return false;
    const t = new Date(d.targetApptDate).getTime();
    if (isNaN(t)) return false;
    return t >= Date.now() && t <= Date.now() + 48 * 3600 * 1000;
  });
  const sum = (rows: DepositRow[]) => rows.reduce((acc, d) => acc + (Number(d.amount) || 0), 0);
  const defaultDepositDollars = (Number(policies.default_deposit_cents) || 2500) / 100;

  const inRange = (dep: DepositRow) => {
    if (rangeFilter === 'all' || !dep.targetApptDate) return rangeFilter === 'all' ? true : false;
    const t = new Date(dep.targetApptDate).getTime();
    if (isNaN(t)) return false;
    const now = Date.now();
    const day = 24 * 3600 * 1000;
    if (rangeFilter === 'today') return t >= now - day && t <= now + day;
    if (rangeFilter === '7d') return t >= now && t <= now + 7 * day;
    if (rangeFilter === '30d') return t >= now && t <= now + 30 * day;
    if (rangeFilter === 'past') return t < now;
    return true;
  };

  const filteredDeposits = depositsList.filter((dep) => {
    // Tab filter
    if (activeTab === 'held' && dep.status !== 'HELD') return false;
    if (activeTab === 'applied' && dep.status !== 'APPLIED') return false;
    if (activeTab === 'released' && dep.status !== 'RELEASED') return false;
    if (activeTab === 'forfeited' && dep.status !== 'FORFEITED') return false;
    if (activeTab === 'refunded' && dep.status !== 'REFUNDED') return false;

    // Appointment-date range filter (real — was hardcoded before)
    if (!inRange(dep)) return false;

    // Type filter
    if (typeFilter !== 'all' && (dep.depositType || 'booking') !== typeFilter) return false;

    // Method + amount filters (the extended "More Filters" set)
    if (methodFilter !== 'all' && dep.method !== methodFilter) return false;
    if (amountFilter === 'under50' && !(dep.amount < 50)) return false;
    if (amountFilter === '50to100' && !(dep.amount >= 50 && dep.amount <= 100)) return false;
    if (amountFilter === 'over100' && !(dep.amount > 100)) return false;

    // Location filter (deposits carry no location yet — honest empty state)
    if (locationFilter !== 'all' && dep.locationId !== locationFilter) return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        dep.id.toLowerCase().includes(q) ||
        dep.customer.toLowerCase().includes(q) ||
        dep.pet.toLowerCase().includes(q) ||
        dep.phone.toLowerCase().includes(q) ||
        dep.service.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const collectDeposit = useCollectDeposit();
  const applyDeposit = useApplyDepositToInvoice();
  const releaseDeposit = useReleaseDeposit();
  const refundDeposit = useRefundDeposit();
  const forfeitDeposit = useForfeitDeposit();
  const transferDeposit = useTransferDeposit();
  const editDeposit = useEditDeposit();
  const receiptDeposit = useReceiptDeposit();
  const [busyDepositId, setBusyDepositId] = useState<string | null>(null);
  const [collectAmount, setCollectAmount] = useState('50.00');
  const [collectCustomerId, setCollectCustomerId] = useState('');
  const [collectMethod, setCollectMethod] = useState<'card' | 'cash' | 'manual_link'>('card');
  const [collectApptId, setCollectApptId] = useState('');
  const [collectBusy, setCollectBusy] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;
  const pageCount = Math.max(1, Math.ceil(filteredDeposits.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pagedDeposits = filteredDeposits.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const reload = () => {
    loadDeposits();
    fetch('/api/admin/deposits?audit=1').then((r) => r.json()).then((d) => setAuditLog(d.audit || [])).catch(() => {});
  };

  const exportCsv = async () => {
    // SA-62: server-built CSV export (fin_export_deposits) for the current
    // date-range filter. Falls back to a local CSV of the filtered rows if
    // the server export is unavailable — either way the data is real.
    const day = 24 * 3600 * 1000;
    const now = Date.now();
    let from: string | null = null;
    let to: string | null = null;
    if (rangeFilter === 'today') { from = new Date(now - day).toISOString(); to = new Date(now + day).toISOString(); }
    if (rangeFilter === '7d') { from = new Date(now).toISOString(); to = new Date(now + 7 * day).toISOString(); }
    if (rangeFilter === '30d') { from = new Date(now).toISOString(); to = new Date(now + 30 * day).toISOString(); }
    if (rangeFilter === 'past') { to = new Date(now).toISOString(); }
    try {
      const res = await fetch('/api/admin/finance/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fin_export_deposits', from, to }),
      });
      const d = await res.json();
      if (!res.ok || !d?.csv) throw new Error(d?.error || 'Export failed');
      const blob = new Blob([d.csv], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = d.filename || `deposits-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      return;
    } catch { /* fall through to local export */ }
    const header = ['Deposit ID', 'Customer', 'Phone', 'Pet', 'Service', 'Amount', 'Collected', 'Target Appt', 'Method', 'Status', 'Type'];
    const lines = filteredDeposits.map((d) => [
      d.id, d.customer, d.phone, d.pet, d.service, d.amount.toFixed(2),
      d.collectedDate, d.targetApptDate, d.method, d.status, d.depositType,
    ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `deposits-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleActionChange = async (dep: DepositRow, action: string) => {
    if (!action || action.includes('ACTION')) return;
    const id = dep.uuid || dep.id;
    setBusyDepositId(dep.id);
    try {
      if (action === 'APPLY TO BALANCE') {
        const invoiceId = window.prompt('Apply deposit to which invoice ID?');
        if (!invoiceId) return;
        await applyDeposit.mutateAsync({ deposit_id: id, invoice_id: invoiceId });
      } else if (action === 'RELEASE / REFUND') {
        await releaseDeposit.mutateAsync({ deposit_id: id });
      } else if (action === 'FORFEIT TO REVENUE') {
        const reason = window.prompt('Forfeit reason:', 'No-show') || 'No-show';
        await forfeitDeposit.mutateAsync({ deposit_id: id, reason });
      } else if (action === 'REFUND DEPOSIT') {
        await refundDeposit.mutateAsync({ deposit_id: id });
      } else if (action === 'TRANSFER') {
        const newCustomerId = window.prompt('Transfer to customer ID (UUID):');
        if (!newCustomerId) return;
        const reason = window.prompt('Transfer reason:', 'Customer request') || 'Transfer';
        await transferDeposit.mutateAsync({ deposit_id: id, new_customer_id: newCustomerId, reason } as any);
      } else if (action === 'EDIT') {
        const amount = window.prompt('New amount (USD, blank to keep):', String(dep.amount));
        const method = window.prompt('New method (blank to keep):', dep.method);
        const notes = window.prompt('Notes (blank to keep):', '');
        await editDeposit.mutateAsync({
          deposit_id: id,
          ...(amount?.trim() ? { amount: parseFloat(amount) } : {}),
          ...(method?.trim() ? { method } : {}),
          ...(notes?.trim() ? { notes } : {}),
        });
      } else if (action === 'PRINT RECEIPT') {
        const res: any = await receiptDeposit.mutateAsync({ deposit_id: id });
        setReceiptData(res?.receipt || res?.data?.receipt || null);
      }
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Deposit action failed');
    } finally {
      setBusyDepositId(null);
    }
  };

  const savePolicies = async () => {
    setPoliciesBusy(true);
    try {
      const res = await fetch('/api/admin/policy-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'deposits', settings: policies }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || 'Save failed');
      setPoliciesPersisted(true);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Policy save failed');
    } finally {
      setPoliciesBusy(false);
    }
  };

  return (
    <div className="flex flex-col w-full text-foreground bg-background select-text">
      {/* STATUS STRIP */}
      <div className="w-full bg-muted/60 border-b border-border px-4 py-2 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-success animate-pulse shrink-0"></span>
          <span className="font-medium text-[11px] text-muted-foreground">Deposit Management</span>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="font-medium">Live registry: <span className="text-foreground font-semibold tabular-nums">{depositsList.length} deposits</span> · <span className="text-foreground font-semibold tabular-nums">${sum(heldRows).toFixed(2)}</span> held in escrow</span>
        </div>
      </div>

      {/* SUB NAVIGATION TABS */}
      <PageTabs
        activeId={activeTab}
        onSelect={(id) => setActiveTab(id as typeof activeTab)}
        tabs={[
          { id: 'all', label: 'Deposits Dashboard' },
          { id: 'held', label: 'Held / Active', count: heldRows.length },
          { id: 'applied', label: 'Applied to Invoice' },
          { id: 'released', label: 'Released' },
          { id: 'forfeited', label: 'Forfeited / Late Cancel', count: forfeitedRows.length },
          { id: 'refunded', label: 'Refunded', count: refundedRows.length },
        ]}
      />

      {/* KPI TILES */}
      <div className="p-6 border-b border-border">
        <KpiTiles
          tiles={[
            {
              label: 'Total Active Deposits',
              value: `$${sum(heldRows).toFixed(2)}`,
              caption: 'Escrow balance across all held deposits',
              tone: 'primary',
            },
            {
              label: 'Held for Upcoming (48h)',
              value: `$${sum(upcoming48h).toFixed(2)}`,
              caption: 'Pre-appointment escrow holds',
              tone: 'warning',
            },
            {
              label: 'Applied This Month',
              value: `$${sum(appliedThisMonth).toFixed(2)}`,
              caption: 'MTD deposits applied to invoices',
              tone: 'success',
            },
            {
              label: 'Forfeited / Late Cancel',
              value: `$${sum(forfeitedRows).toFixed(2)}`,
              caption: 'Penalty revenue from no-shows',
              tone: 'destructive',
            },
            {
              label: 'Refunded Deposits',
              value: `$${sum(refundedRows).toFixed(2)}`,
              caption: `${refundedRows.length} deposits refunded`,
              tone: 'primary',
            },
            {
              label: 'Default Deposit Req.',
              value: `$${defaultDepositDollars.toFixed(2)}`,
              caption: 'Standard booking deposit amount',
              tone: 'primary',
            },
          ]}
        />
      </div>

      {/* FILTER & CONTROL BAR */}
      <div className="p-4 bg-muted/30 border-b border-border">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1 sm:max-w-md">
              <svg className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.39l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
              </svg>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-background border border-input rounded-lg pl-9 pr-3 h-9 text-[13px] text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring transition-colors"
                placeholder="Search dep ID, customer, pet breed..."
                type="text"
              />
            </div>
            <FilterSelect
              aria-label="Filter by appointment date"
              value={rangeFilter}
              onChange={(v) => setRangeFilter(v)}
            >
              <option value="all">All dates</option>
              <option value="today">Today</option>
              <option value="7d">Next 7 days</option>
              <option value="30d">Next 30 days</option>
              <option value="past">Past / Archive</option>
            </FilterSelect>
            <FilterSelect
              aria-label="Filter by deposit type"
              value={typeFilter}
              onChange={(v) => setTypeFilter(v)}
            >
              <option value="all">Type: All</option>
              <option value="booking">Booking deposit</option>
              <option value="manual">Manual</option>
            </FilterSelect>
            <FilterSelect
              aria-label="Filter by location"
              value={locationFilter}
              onChange={(v) => setLocationFilter(v)}
            >
              <option value="all">Location: All</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </FilterSelect>
            <FilterSelect
              aria-label="Filter by collection method"
              value={methodFilter}
              onChange={(v) => setMethodFilter(v)}
            >
              <option value="all">Method: All</option>
              {Array.from(new Set(depositsList.map((d) => d.method).filter(Boolean))).sort().map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </FilterSelect>
            <FilterSelect
              aria-label="Filter by amount band"
              value={amountFilter}
              onChange={(v) => setAmountFilter(v)}
            >
              <option value="all">Amount: All</option>
              <option value="under50">Under $50</option>
              <option value="50to100">$50 – $100</option>
              <option value="over100">Over $100</option>
            </FilterSelect>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowCollectModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-3.5 text-[13px] font-medium shadow-card transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <span>Collect Deposit</span>
            </button>
            <button
              onClick={() => {
                const depId = window.prompt('Deposit ID (e.g. DEP-XXXX) to apply:');
                if (!depId) return;
                const dep = depositsList.find((d) => d.id === depId || d.uuid === depId);
                const invoiceId = window.prompt('Apply to which invoice ID?');
                if (!invoiceId) return;
                setBusyDepositId(depId);
                applyDeposit.mutateAsync({ deposit_id: dep?.uuid || depId, invoice_id: invoiceId })
                  .then(() => reload())
                  .catch((e) => alert(e instanceof Error ? e.message : 'Apply failed'))
                  .finally(() => setBusyDepositId(null));
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background hover:bg-accent hover:text-accent-foreground text-foreground h-9 px-3.5 text-[13px] font-medium transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <span>Apply to Invoice</span>
            </button>
          </div>
        </div>
      </div>

      {/* MAIN DATA TABLE REGISTRY */}
      <div className="p-4 bg-background">
        <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
          <div className="bg-muted/40 border-b border-border px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-medium text-[11px] text-muted-foreground uppercase tracking-wider">Escrow Transaction Registry</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-success/10 text-success border border-success/20">Live</span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Showing <span className="font-semibold text-foreground tabular-nums">{filteredDeposits.length}</span> records · Total escrow: <span className="font-semibold text-primary tabular-nums">${(filteredDeposits.reduce((acc, curr) => acc + (curr.status === 'HELD' ? curr.amount : 0), 0)).toFixed(2)}</span>
            </div>
          </div>
          <div className="overflow-x-auto w-full">
            <table className="w-full border-collapse text-left text-[13px] text-foreground">
              <thead>
                <tr className="border-b border-border bg-muted/30 font-semibold uppercase text-[11px] tracking-wider text-muted-foreground">
                  <th className="p-3 border-r border-border font-semibold">ID / Ref</th>
                  <th className="p-3 border-r border-border font-semibold">Customer / Contact</th>
                  <th className="p-3 border-r border-border font-semibold">Pet &amp; Service</th>
                  <th className="p-3 border-r border-border text-right font-semibold">Amount</th>
                  <th className="p-3 border-r border-border font-semibold">Collected</th>
                  <th className="p-3 border-r border-border font-semibold">Target Apt</th>
                  <th className="p-3 border-r border-border font-semibold">Pay Method</th>
                  <th className="p-3 border-r border-border font-semibold">Status</th>
                  <th className="p-3 font-semibold text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-foreground">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-muted-foreground text-[13px]">Loading escrow ledger from database…</td>
                  </tr>
                ) : filteredDeposits.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-muted-foreground text-[13px]">No deposit records yet. Deposits appear here the moment the Stripe webhook confirms a $25 booking payment.</td>
                  </tr>
                ) : (
                pagedDeposits.map((dep) => (
                  <tr key={dep.id} className="hover:bg-accent/50 transition-colors">
                    <td className="p-3 border-r border-border font-semibold tabular-nums">{dep.id}</td>
                    <td className="p-3 border-r border-border">
                      <div className="font-medium text-foreground">{dep.customer}</div>
                      <div className="text-[10px] text-muted-foreground tabular-nums">{dep.phone}</div>
                    </td>
                    <td className="p-3 border-r border-border">
                      <div className="font-medium text-foreground">{dep.pet}</div>
                      <div className="text-[10px] text-muted-foreground">{dep.service}</div>
                    </td>
                    <td className="p-3 border-r border-border text-right font-semibold tabular-nums text-foreground">${dep.amount.toFixed(2)}</td>
                    <td className="p-3 border-r border-border">
                      <div className="text-foreground">{dep.collectedDate}</div>
                      <div className="text-[10px] text-muted-foreground tabular-nums">{dep.collectedTime}</div>
                    </td>
                    <td className="p-3 border-r border-border">
                      <div className="font-medium text-foreground">{dep.targetApptDate}</div>
                      <div className="text-[10px] text-muted-foreground tabular-nums">{dep.targetApptTime}</div>
                    </td>
                    <td className="p-3 border-r border-border">
                      <div className="font-medium text-foreground">{dep.method}</div>
                      <div className="text-[10px] text-muted-foreground tabular-nums">{dep.auth}</div>
                    </td>
                    <td className="p-3 border-r border-border">
                      <span className={cn(
                        "inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wider",
                        dep.status === 'HELD' ? 'bg-warning/10 text-warning border-warning/20' :
                        dep.status === 'APPLIED' ? 'bg-success/10 text-success border-success/20' :
                        dep.status === 'RELEASED' ? 'bg-muted text-muted-foreground border-border' :
                        'bg-destructive/10 text-destructive border-destructive/20'
                      )}>
                        {dep.status === 'HELD' ? 'Held / Active' : dep.status}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <select
                        onChange={(e) => { handleActionChange(dep, e.target.value); e.target.value = 'Action: Select'; }}
                        disabled={busyDepositId === dep.id}
                        className="bg-background text-foreground border border-input hover:border-primary/40 rounded-lg h-7 px-2 text-[11px] font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                        aria-label={`Actions for deposit ${dep.id}`}
                        defaultValue="Action: Select"
                      >
                        <option>Action: Select</option>
                        {dep.status === 'HELD' && (
                          <>
                            <option>Apply to Balance</option>
                            <option>Release / Refund</option>
                            <option>Forfeit to Revenue</option>
                            <option>Refund Deposit</option>
                            <option>Transfer</option>
                          </>
                        )}
                        <option>Edit</option>
                        <option>Print Receipt</option>
                      </select>
                    </td>
                  </tr>
                ))
                )}
              </tbody>
            </table>
          </div>
          <div className="p-3 bg-muted/40 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-4">
              <span>Page {String(safePage).padStart(2, '0')} of {String(pageCount).padStart(2, '0')}</span>
              <span className="text-muted-foreground/40">|</span>
              <span>Source: <span className="text-success font-semibold">commerce_deposits (live)</span></span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} className="px-3 h-7 rounded-lg border border-border bg-background hover:bg-accent hover:text-accent-foreground text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-50">Prev</button>
              <button className="px-3 h-7 rounded-lg bg-primary text-primary-foreground text-[11px] font-medium transition-colors cursor-pointer">{String(safePage).padStart(2, '0')}</button>
              <button onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={safePage >= pageCount} className="px-3 h-7 rounded-lg border border-border bg-background hover:bg-accent hover:text-accent-foreground text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-50">Next</button>
            </div>
          </div>
        </div>
      </div>

      {/* LOWER RULES & POLICIES FOOTER SECTION */}
      <div className="p-4 bg-card border-t border-border">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 border border-border bg-card flex flex-col justify-between">
            <div>
              <div className="bg-muted/40 border-b border-border px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] bg-primary text-primary-foreground px-1.5 py-0.5">CFG</span>
                  <span className="text-[12px] font-semibold text-foreground uppercase">DEPOSIT ESCROW POLICY SETTINGS</span>
                </div>
                <span className="text-[10px] text-muted-foreground">{policiesPersisted ? '[SEC_ENFORCED]' : '[DEFAULTS — NOT SAVED YET]'}</span>
              </div>
              <div className="p-4 space-y-4 text-[13px] text-foreground">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
                  <div className="max-w-xl">
                    <div className="font-semibold text-foreground text-sm">24-Hour Cancellation Requirement Flag</div>
                    <div className="text-[12px] text-muted-foreground/70 mt-1">
                      Appointments cancelled under 24 hours automatically tag the security escrow deposit as eligibility-forfeited.
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      checked={policies.enforce_24h === 'true'}
                      onChange={(e) => setPolicies((p) => ({ ...p, enforce_24h: e.target.checked ? 'true' : 'false' }))}
                      className="w-4 h-4 rounded-lg accent-black border border-border cursor-pointer" type="checkbox" />
                    <span className="tabular-nums font-semibold text-foreground">ENFORCE_24H</span>
                  </label>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
                  <div className="max-w-xl">
                    <div className="font-semibold text-foreground text-sm">Automated Forfeit &amp; Ledger Allocation Rule</div>
                    <div className="text-[12px] text-muted-foreground/70 mt-1">
                      Automatically converts unredeemed deposit amounts to General Salon Forfeit Revenue after appointment window expiration (+60m).
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      checked={policies.auto_revenue_sweep === 'true'}
                      onChange={(e) => setPolicies((p) => ({ ...p, auto_revenue_sweep: e.target.checked ? 'true' : 'false' }))}
                      className="w-4 h-4 rounded-lg accent-black border border-border cursor-pointer" type="checkbox" />
                    <span className="tabular-nums font-semibold text-foreground">AUTO_REVENUE_SWEEP</span>
                  </label>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
                  <div className="max-w-xl">
                    <div className="font-semibold text-foreground text-sm">PCI Card Tokenization &amp; Vaulting</div>
                    <div className="text-[12px] text-muted-foreground/70 mt-1">
                      Retain customer billing instrument cryptographic tokens for remaining balance payment upon appointment completion.
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      checked={policies.vault_enabled === 'true'}
                      onChange={(e) => setPolicies((p) => ({ ...p, vault_enabled: e.target.checked ? 'true' : 'false' }))}
                      className="w-4 h-4 rounded-lg accent-black border border-border cursor-pointer" type="checkbox" />
                    <span className="tabular-nums font-semibold text-foreground">VAULT_ENABLED</span>
                  </label>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="max-w-xl">
                    <div className="font-semibold text-foreground text-sm">Default Deposit Amount (cents)</div>
                    <div className="text-[12px] text-muted-foreground/70 mt-1">
                      Standard amount collected for booking deposits when no service-specific amount applies.
                    </div>
                  </div>
                  <input
                    value={policies.default_deposit_cents}
                    onChange={(e) => setPolicies((p) => ({ ...p, default_deposit_cents: e.target.value.replace(/[^0-9]/g, '') }))}
                    className="w-28 bg-background border border-input rounded-lg px-3 h-9 text-[13px] tabular-nums"
                    inputMode="numeric"
                  />
                </div>
              </div>
            </div>
            <div className="p-3 bg-muted/40 border-t border-border flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground/70">POLICY SCOPE: DEPOSITS // SAVED TO policy_settings</span>
              <button
                onClick={savePolicies}
                disabled={policiesBusy}
                className="bg-primary text-primary-foreground hover:bg-muted hover:text-foreground border border-border px-4 py-1.5 text-[12px] uppercase tracking-wider transition-colors rounded-lg cursor-pointer disabled:opacity-50"
              >
                {policiesBusy ? 'SAVING…' : 'UPDATE POLICY REGISTRY'}
              </button>
            </div>
          </div>

          {/* RIGHT COL: AUDIT LOG */}
          <div className="border border-border bg-card flex flex-col justify-between">
            <div>
              <div className="bg-muted/40 border-b border-border px-4 py-2 flex items-center justify-between">
                <span className="text-[12px] font-semibold text-foreground uppercase">AUDIT LOG // DEPOSITS</span>
                <span className="text-[10px] text-muted-foreground">REALTIME_EVENT_BUS</span>
              </div>
              <div className="p-4 divide-y divide-border text-[12px] text-foreground max-h-[300px] overflow-y-auto">
                {auditLog.length === 0 ? (
                  <p className="py-4 text-center text-muted-foreground text-[12px]">No deposit events recorded yet.</p>
                ) : auditLog.map((ev) => (
                  <div key={ev.id} className="py-2.5">
                    <div className="flex items-center justify-between text-muted-foreground/70 text-[10px]">
                      <span>{ev.action}</span>
                      <span>{new Date(ev.timestamp).toLocaleString()}</span>
                    </div>
                    <div className="font-semibold text-foreground mt-1">{ev.details}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-3 bg-muted/40 border-t border-border text-center">
              <button
                onClick={exportCsv}
                className="text-[12px] font-semibold text-foreground hover:underline uppercase block w-full text-center cursor-pointer"
              >
                DOWNLOAD DEPOSIT REGISTRY (CSV) →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* COLLECT DEPOSIT MODAL */}
      {showCollectModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-none z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-card border border-border">
            <div className="bg-muted/40 border-b border-border p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium text-[9px] bg-primary text-primary-foreground px-1.5 py-0.5 uppercase">Escrow Intake</span>
                <span className="font-display text-[13px] font-semibold tracking-tight text-foreground">Collect New Deposit</span>
              </div>
              <button 
                onClick={() => setShowCollectModal(false)}
                className="text-[12px] font-semibold text-foreground hover:border-brand-teal/60 hover:bg-brand-teal/5 hover:text-brand-teal px-2 py-0.5 border border-border cursor-pointer"
              >
                [X]
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1 uppercase">SELECT CUSTOMER &amp; PET RECORD //*</label>
                <select
                  value={collectCustomerId}
                  onChange={(e) => setCollectCustomerId(e.target.value)}
                  className="w-full bg-card border border-border px-3 py-2 text-[13px] text-foreground focus:outline-none rounded-lg"
                >
                  <option value="">— Select a customer —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
                {customers.length === 0 && (
                  <p className="text-[11px] text-muted-foreground mt-1">No customers found. Add one in the CRM first.</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1 uppercase">DEPOSIT AMOUNT ($USD) //*</label>
                  <input className="w-full bg-card border border-border px-3 py-2 text-[13px] text-foreground focus:outline-none rounded-lg" type="text" value={collectAmount} onChange={(e) => setCollectAmount(e.target.value)} />
                </div>
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1 uppercase">APPOINTMENT ID (OPTIONAL)</label>
                  <input className="w-full bg-card border border-border px-3 py-2 text-[13px] text-foreground focus:outline-none rounded-lg" type="text" value={collectApptId} onChange={(e) => setCollectApptId(e.target.value)} placeholder="Appointment UUID, if linked" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1 uppercase">PAYMENT INTAKE CHANNEL //*</label>
                <div className="grid grid-cols-3 gap-2 text-[11px] font-semibold">
                  {([['card', 'CARD ON FILE'], ['cash', 'AT COUNTER'], ['manual_link', 'MANUAL LINK']] as const).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setCollectMethod(value)}
                      className={`border border-border p-2 text-center cursor-pointer ${collectMethod === value ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground hover:bg-muted/40'}`}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-3 bg-muted/40 border border-border text-[11px] text-foreground">
                RULE: Escrow will be isolated in Vault Account #400-ESCROW until final checkout or forfeiture confirmation.
              </div>
            </div>
            <div className="p-4 bg-muted/40 border-t border-border flex items-center justify-between">
              <button 
                onClick={() => setShowCollectModal(false)}
                className="border border-border bg-card hover:bg-muted px-4 py-1.5 text-[12px] uppercase tracking-wider rounded-lg cursor-pointer"
              >
                ABORT
              </button>
              <button 
                onClick={async () => {
                  const cents = Math.round(parseFloat(collectAmount || '0') * 100);
                  if (!cents || cents <= 0) { alert('Enter a valid deposit amount'); return; }
                  if (!collectCustomerId) { alert('Select a customer for this deposit'); return; }
                  setCollectBusy(true);
                  try {
                    await collectDeposit.mutateAsync({
                      customer_id: collectCustomerId,
                      amount_cents: cents,
                      ...(collectApptId.trim() ? { appointment_id: collectApptId.trim() } : {}),
                      method: collectMethod === 'card' ? 'card' : collectMethod,
                    } as any);
                    setShowCollectModal(false);
                    setCollectCustomerId('');
                    setCollectApptId('');
                    reload();
                  } catch (e) {
                    alert(e instanceof Error ? e.message : 'Collect deposit failed');
                  } finally {
                    setCollectBusy(false);
                  }
                }}
                disabled={collectBusy}
                className="border border-border bg-primary text-primary-foreground hover:bg-muted hover:text-foreground px-4 py-1.5 text-[12px] uppercase tracking-wider rounded-lg cursor-pointer disabled:opacity-50"
              >
                {collectBusy ? 'PROCESSING…' : 'CONFIRM ESCROW HOLD'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DEPOSIT RECEIPT MODAL */}
      {receiptData && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-card border border-border">
            <div className="bg-muted/40 border-b border-border p-4 flex items-center justify-between">
              <span className="text-[13px] font-semibold text-foreground">Deposit Receipt</span>
              <button onClick={() => setReceiptData(null)} className="text-[12px] font-semibold px-2 py-0.5 border border-border cursor-pointer">[X]</button>
            </div>
            <div className="p-4 space-y-2 text-[13px]">
              <div className="flex justify-between"><span className="text-muted-foreground">Deposit #</span><span className="font-semibold tabular-nums">{receiptData.depositNumber}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-semibold tabular-nums">${Number(receiptData.amount || 0).toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="font-semibold">{String(receiptData.status || '').toUpperCase()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Method</span><span>{receiptData.method || '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Collected</span><span className="tabular-nums">{receiptData.collectedAt ? new Date(receiptData.collectedAt).toLocaleString() : '—'}</span></div>
            </div>
            <div className="p-4 bg-muted/40 border-t border-border flex justify-end">
              <button
                onClick={async () => {
                  // Print the deposit receipt as a standalone document
                  // on this device's printer — not the admin screen.
                  const row = (l: string, v: string) =>
                    `<div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0;"><span style="color:#666;">${l}</span><span style="font-weight:600;">${v}</span></div>`;
                  const ok = await openPrintDocument({
                    docType: 'receipt',
                    title: `Deposit Receipt ${receiptData.depositNumber}`,
                    bodyHtml: `
                      <h1 style="font-size:16px;margin:0 0 4px;">UnSaid Memories</h1>
                      <p style="margin:0 0 10px;color:#666;font-size:11px;">Deposit Receipt</p>
                      ${row('Deposit #', esc(receiptData.depositNumber))}
                      ${row('Amount', `$${Number(receiptData.amount || 0).toFixed(2)}`)}
                      ${row('Status', esc(String(receiptData.status || '').toUpperCase()))}
                      ${row('Method', esc(receiptData.method || '—'))}
                      ${row('Collected', receiptData.collectedAt ? esc(new Date(receiptData.collectedAt).toLocaleString()) : '—')}`,
                  });
                  if (!ok) alert('Pop-ups are blocked — allow pop-ups for this site to print.');
                }}
                className="border border-border bg-primary text-primary-foreground px-4 py-1.5 text-[12px] uppercase rounded-lg cursor-pointer"
              >Print</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
