'use client';

import React, { useState } from 'react';
import { DawgNavSection } from '@/lib/types';
import { openPrintDocument, escapeHtmlClient as esc } from '@/lib/printing/client';
import { PageTabs, KpiTiles, FilterSelect } from '../_shared/PageHeader';
import { cn } from '@/lib/utils';
import {
  useApproveRefund,
  useRejectRefund,
  useDisputeRefund,
  useEditRefund,
  useVoidRefund,
  useRespondDispute,
  useAcceptDispute,
} from '@/hooks/admin/useActions';

interface RefundsViewProps {
  onNavigateSection?: (section: DawgNavSection) => void;
}

interface RefundSummary {
  totalRefundedMtd: number;
  refundTransactions: number;
  allRefunds: number;
  completed: number;
  pendingApproval: number;
  disputes: number;
  disputeAmount: number;
  storeCreditIssuedMtd: number;
  storeCreditOutstanding: number;
  refundRate: number;
}

interface RefundPolicy {
  policy_mode: string;
  no_show_window_hours: string;
  chargeback_fee_cents: string;
  approval_required_above_cents: string;
}

export const RefundsView: React.FC<RefundsViewProps> = ({ onNavigateSection }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'all' | 'pending' | 'disputes' | 'credit' | 'policies'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [reasonFilter, setReasonFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [staffFilter, setStaffFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [selectedDisputeId, setSelectedDisputeId] = useState<string | null>(null);
  const [detailModal, setDetailModal] = useState<{ title: string; body: any } | null>(null);
  const [evidenceNotes, setEvidenceNotes] = useState('');

  // Real data from /api/admin/refunds
  const [refunds, setRefunds] = useState<any[]>([]);
  const [disputes, setDisputes] = useState<any[]>([]);
  const [summary, setSummary] = useState<RefundSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [policy, setPolicy] = useState<RefundPolicy>({
    policy_mode: 'strict', no_show_window_hours: '24', chargeback_fee_cents: '1500', approval_required_above_cents: '10000',
  });
  const [policyPersisted, setPolicyPersisted] = useState(true);
  const [policyBusy, setPolicyBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  // Issue-refund form state
  const [formTxn, setFormTxn] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formReason, setFormReason] = useState('requested_by_customer');
  const [formPayout, setFormPayout] = useState<'original_payment' | 'store_credit'>('original_payment');
  const [formCustomerId, setFormCustomerId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loadData = React.useCallback(() => {
    setLoading(true);
    setError(null);
    fetch('/api/admin/refunds', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d?.error) { setError(d.error); return; }
        setRefunds(d.refunds || []);
        setDisputes(d.disputes || []);
        setSummary(d.summary || null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
    fetch('/api/admin/policy-settings?scope=refunds')
      .then((r) => r.json())
      .then((d) => {
        if (d?.settings) setPolicy((p) => ({ ...p, ...d.settings }));
        if (d && d.persisted === false) setPolicyPersisted(false);
      })
      .catch(() => {});
  }, []);

  React.useEffect(() => { loadData(); }, [loadData]);

  const savePolicy = async () => {
    setPolicyBusy(true);
    try {
      const res = await fetch('/api/admin/policy-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'refunds', settings: policy }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || 'Save failed');
      setPolicyPersisted(true);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Policy save failed');
    } finally {
      setPolicyBusy(false);
    }
  };

  const syncDisputes = async () => {
    setSyncBusy(true);
    setSyncMsg('');
    try {
      const res = await fetch('/api/admin/disputes/sync', { method: 'POST' });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || 'Sync failed');
      setSyncMsg(`Synced ${d.synced} disputes from Stripe.`);
      loadData();
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncBusy(false);
    }
  };

  const submitRefund = async () => {
    const amount = parseFloat(formAmount);
    if (!amount || amount <= 0) { setSubmitError('Enter a valid amount'); return; }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/admin/refunds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          reason: formReason,
          reference: formTxn || undefined,
          refund_method: formPayout === 'store_credit' ? 'store_credit' : 'manual',
          customerId: formCustomerId.trim() || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok || d?.error) throw new Error(d?.error || `HTTP ${res.status}`);
      setShowIssueModal(false);
      setFormTxn(''); setFormAmount(''); setFormCustomerId('');
      if (d?.requiresApproval) setSyncMsg(d.message || 'Refund is pending approval.');
      loadData();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Refund failed');
    } finally {
      setSubmitting(false);
    }
  };

  // Unified list for display: refunds + disputes
  const refundsAndDisputes = [
    ...refunds.map((r: any) => ({
      id: r.refund_number || r.id,
      uuid: r.id,
      customer: r.customer_email || '—',
      phone: '',
      email: r.customer_email || '',
      service: (r.lines || []).map((l: any) => l.item_name).join(', ') || 'Refund',
      amount: parseFloat(String(r.amount || 0)),
      origTxId: r.processor_reference || '',
      origTxDate: (r.created_at || '').slice(0, 10),
      disputeDate: (r.created_at || '').slice(0, 10),
      processedDate: (r.processed_at || '').slice(0, 10),
      reasonCode: r.reason || '',
      reason: r.reason || '',
      refundMethod: r.refund_method || '',
      storeCreditId: r.store_credit_id || null,
      createdBy: r.created_by || '',
      acquirerRef: r.processor_reference || '',
      status: String(r.status || '').toUpperCase(),
      evidenceFile: '',
      refundStatus: String(r.status || '').toUpperCase(),
      kind: 'refund' as const,
    })),
    ...disputes.map((d: any) => ({
      id: d.dispute_number || d.id,
      uuid: d.id,
      customer: '—',
      phone: '',
      email: '',
      service: d.reason || 'Dispute',
      amount: parseFloat(String(d.amount || 0)),
      origTxId: d.processor_dispute_id || '',
      origTxDate: (d.created_at || '').slice(0, 10),
      disputeDate: (d.created_at || '').slice(0, 10),
      processedDate: (d.created_at || '').slice(0, 10),
      reasonCode: d.reason || '',
      reason: d.reason || '',
      refundMethod: '',
      storeCreditId: null,
      createdBy: '',
      acquirerRef: d.processor_dispute_id || '',
      status: String(d.status || '').toUpperCase(),
      evidenceFile: '',
      refundStatus: String(d.status || '').toUpperCase(),
      kind: 'dispute' as const,
    })),
  ];

  const inDateRange = (dateStr: string) => {
    if (dateFilter === 'all' || !dateStr) return true;
    const t = new Date(dateStr).getTime();
    if (isNaN(t)) return false;
    const now = Date.now();
    const day = 24 * 3600 * 1000;
    if (dateFilter === 'today') return t >= now - day;
    if (dateFilter === '7d') return t >= now - 7 * day;
    if (dateFilter === '30d') return t >= now - 30 * day;
    if (dateFilter === 'mtd') return dateStr.slice(0, 7) === new Date().toISOString().slice(0, 7);
    return true;
  };

  const filteredItems = refundsAndDisputes.filter((item) => {
    // Tab filter
    if (activeTab === 'disputes' && item.kind !== 'dispute') return false;
    if (activeTab === 'pending' && !['PENDING', 'PENDING_APPROVAL', 'REQUIRES_APPROVAL', 'OPEN'].includes(item.status)) return false;
    // Store-credit refunds are real rows: refund_method='store_credit' (or a
    // linked store_credit_id). The old filter matched a status that never
    // exists ('STORE_CREDIT_CONVERTED'), so this tab was always empty.
    if (activeTab === 'credit' && !(item.refundMethod === 'store_credit' || item.storeCreditId)) return false;

    // Stage filter (real — maps to dispute/refund statuses)
    if (stageFilter !== 'all') {
      if (stageFilter === 'open' && !['OPEN', 'NEEDS_RESPONSE'].includes(item.status)) return false;
      if (stageFilter === 'review' && !['UNDER_REVIEW', 'DISPUTE_UNDER_REVIEW'].includes(item.status)) return false;
      if (stageFilter === 'closed' && !['WON', 'LOST', 'CLOSED', 'COMPLETED', 'REFUNDED'].includes(item.status)) return false;
    }

    // Reason / method / staff / date filters
    if (reasonFilter !== 'all' && item.reason !== reasonFilter) return false;
    if (methodFilter !== 'all' && item.refundMethod !== methodFilter) return false;
    if (staffFilter !== 'all' && item.createdBy !== staffFilter) return false;
    if (!inDateRange(item.disputeDate)) return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        item.id.toLowerCase().includes(q) ||
        item.customer.toLowerCase().includes(q) ||
        item.service.toLowerCase().includes(q) ||
        item.origTxId.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const selectedDispute = refundsAndDisputes.find(d => d.id === selectedDisputeId);
  const reasonOptions = Array.from(new Set(refundsAndDisputes.map((i) => i.reason).filter(Boolean)));
  const methodOptions = Array.from(new Set(refundsAndDisputes.map((i) => i.refundMethod).filter(Boolean)));
  const staffOptions = Array.from(new Set(refundsAndDisputes.map((i) => i.createdBy).filter(Boolean)));

  const approveRefund = useApproveRefund();
  const rejectRefund = useRejectRefund();
  const disputeRefund = useDisputeRefund();
  const editRefund = useEditRefund();
  const voidRefund = useVoidRefund();
  const respondDispute = useRespondDispute();
  const acceptDispute = useAcceptDispute();
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const runRefundAction = async (
    label: string,
    refundId: string,
    fn: () => Promise<unknown>,
  ) => {
    setActionBusy(label);
    try {
      await fn();
      loadData();
    } catch (e) {
      alert(e instanceof Error ? e.message : `${label} failed`);
    } finally {
      setActionBusy(null);
    }
  };

  const handleRebut = () => {
    if (!selectedDispute) return;
    runDisputeAction('Rebuttal', () =>
      respondDispute.mutateAsync({ dispute_id: selectedDispute.uuid, notes: evidenceNotes || undefined } as any),
    );
  };

  const handleAcceptDispute = () => {
    if (!selectedDispute) return;
    const conf = window.confirm('Accept this dispute? Funds are forfeited to the cardholder and a chargeback fee may apply.');
    if (!conf) return;
    runDisputeAction('Accept', () => acceptDispute.mutateAsync({ dispute_id: selectedDispute.uuid }));
  };

  const runDisputeAction = async (label: string, fn: () => Promise<unknown>) => {
    setActionBusy(label);
    try {
      await fn();
      setEvidenceNotes('');
      loadData();
    } catch (e) {
      alert(e instanceof Error ? e.message : `${label} failed`);
    } finally {
      setActionBusy(null);
    }
  };

  const handleEditRefund = (item: any) => {
    const amount = window.prompt('New amount (USD):', String(item.amount));
    if (amount == null) return;
    const reason = window.prompt('Reason:', item.reason) || item.reason;
    runRefundAction('Edit', item.id, () =>
      editRefund.mutateAsync({ refund_id: item.uuid, amount: parseFloat(amount), reason } as any),
    );
  };

  const handleVoidRefund = (item: any) => {
    if (!window.confirm(`Void refund ${item.id}?`)) return;
    const reason = window.prompt('Void reason:', 'Entered in error') || 'Voided';
    runRefundAction('Void', item.id, () => voidRefund.mutateAsync({ refund_id: item.uuid, reason }));
  };

  const handleRefundNotes = (item: any) => {
    const note = window.prompt('Add a note to this refund:');
    if (!note) return;
    runRefundAction('Note', item.id, () =>
      fetch('/api/admin/finance/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fin_refund_notes', refund_id: item.uuid, note }),
      }).then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d?.error || 'Note failed');
      }),
    );
  };

  const showDetail = (title: string, body: any) => setDetailModal({ title, body });

  return (
    <div className="flex flex-col w-full text-foreground bg-background select-text">
      {/* STATUS STRIP */}
      <div className="w-full bg-muted/60 border-b border-border px-4 py-2 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-success animate-pulse shrink-0"></span>
          <span className="font-medium text-[11px] text-muted-foreground">Refunds &amp; Dispute Center</span>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="font-medium">Gateway: <span className="text-warning font-semibold">Stripe disabled</span> <span className="text-muted-foreground/60">(processor decision pending — refunds record to the local ledger only)</span></span>
          <span className="font-medium hidden sm:inline">Dispute Ratio: <span className="text-success font-semibold tabular-nums">{summary ? `${summary.refundRate.toFixed(2)}%` : '—'}</span> <span className="text-muted-foreground/60">(MTD)</span></span>
        </div>
      </div>

      {/* SUB NAVIGATION TABS */}
      <PageTabs
        activeId={activeTab}
        onSelect={(id) => setActiveTab(id as typeof activeTab)}
        tabs={[
          { id: 'all', label: 'All Refunds & Disputes', count: refunds.length + disputes.length },
          { id: 'disputes', label: 'Disputes Active', count: disputes.length },
          { id: 'pending', label: 'Pending Approval', count: summary?.pendingApproval || 0 },
          { id: 'credit', label: 'Store Credit Issued' },
          { id: 'policies', label: 'Refund Policies' },
        ]}
      />

      {/* KPI TILES — computed from live data */}
      <div className="p-6 border-b border-border">
        <KpiTiles
          tiles={[
            {
              label: 'Total Refunded (MTD)',
              value: summary ? `$${summary.totalRefundedMtd.toFixed(2)}` : '—',
              caption: 'Refunds processed this month',
              tone: 'destructive',
            },
            {
              label: 'Refund Transactions',
              value: summary ? String(summary.refundTransactions) : '—',
              caption: `${summary?.completed || 0} completed · ${summary?.pendingApproval || 0} pending approval`,
              tone: 'primary',
            },
            {
              label: 'Completed',
              value: summary ? String(summary.completed) : '—',
              caption: 'Refunds completed',
              tone: 'success',
            },
            {
              label: 'Active Disputes',
              value: summary ? String(summary.disputes) : '—',
              caption: summary ? `$${summary.disputeAmount.toFixed(2)} under dispute` : '',
              tone: 'warning',
            },
            {
              label: 'Refund Rate (MTD)',
              value: summary ? `${summary.refundRate.toFixed(2)}%` : '—',
              caption: 'Refunded vs gross payments',
              tone: 'primary',
            },
            {
              label: 'Store Credit Issued (MTD)',
              value: summary ? `$${summary.storeCreditIssuedMtd.toFixed(2)}` : '—',
              caption: summary ? `$${summary.storeCreditOutstanding.toFixed(2)} outstanding` : '',
              tone: 'success',
            },
            {
              label: 'Refund Policy',
              value: policy.policy_mode === 'strict' ? 'Strict' : 'Standard',
              caption: `No refund on no-shows under ${policy.no_show_window_hours}h`,
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
                placeholder="Search dispute ID, customer, acquirer ARN..."
                type="text"
              />
            </div>
            <FilterSelect
              aria-label="Filter by stage"
              value={stageFilter}
              onChange={(v) => setStageFilter(v)}
            >
              <option value="all">All stages</option>
              <option value="open">Open / Needs response</option>
              <option value="review">Under review</option>
              <option value="closed">Closed / Settled</option>
            </FilterSelect>
            <FilterSelect
              aria-label="Filter by reason"
              value={reasonFilter}
              onChange={(v) => setReasonFilter(v)}
            >
              <option value="all">Reason: All</option>
              {reasonOptions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </FilterSelect>
            <FilterSelect
              aria-label="Filter by method"
              value={methodFilter}
              onChange={(v) => setMethodFilter(v)}
            >
              <option value="all">Method: All</option>
              {methodOptions.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </FilterSelect>
            <FilterSelect
              aria-label="Filter by date"
              value={dateFilter}
              onChange={(v) => setDateFilter(v)}
            >
              <option value="all">Date: All</option>
              <option value="today">Today</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="mtd">This month</option>
            </FilterSelect>
            <FilterSelect
              aria-label="Filter by staff operator"
              value={staffFilter}
              onChange={(v) => setStaffFilter(v)}
            >
              <option value="all">Staff: All Operators</option>
              {staffOptions.map((s) => (
                <option key={s} value={s}>Staff: {s.slice(0, 8)}…</option>
              ))}
            </FilterSelect>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={syncDisputes}
              disabled={syncBusy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background hover:bg-accent h-9 px-3.5 text-[13px] font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              <span>{syncBusy ? 'Syncing…' : 'Sync Stripe Disputes'}</span>
            </button>
            <button
              onClick={() => {
                setShowIssueModal(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-3.5 text-[13px] font-medium shadow-card transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <span>Initiate Internal Refund</span>
            </button>
          </div>
        </div>
        {syncMsg && <p className="px-4 pb-2 text-[12px] text-muted-foreground">{syncMsg}</p>}
      </div>

      {activeTab === 'policies' ? (
        /* REFUND POLICY SETTINGS — real, backed by policy_settings */
        <div className="p-6 max-w-2xl">
          <h3 className="text-[14px] font-semibold text-foreground uppercase">Refund Policy Settings</h3>
          {!policyPersisted && (
            <p className="mt-2 text-[12px] text-warning">Showing defaults — the policy_settings table is not migrated yet.</p>
          )}
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1 uppercase">Policy mode</label>
              <select
                value={policy.policy_mode}
                onChange={(e) => setPolicy((p) => ({ ...p, policy_mode: e.target.value }))}
                className="w-full max-w-xs bg-card border border-input rounded-lg px-3 h-9 text-[13px]"
              >
                <option value="strict">Strict — no refunds on no-shows inside the window</option>
                <option value="standard">Standard — manager approval for exceptions</option>
                <option value="lenient">Lenient — refunds at staff discretion</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1 uppercase">No-show window (hours)</label>
              <input
                value={policy.no_show_window_hours}
                onChange={(e) => setPolicy((p) => ({ ...p, no_show_window_hours: e.target.value.replace(/[^0-9]/g, '') }))}
                className="w-28 bg-background border border-input rounded-lg px-3 h-9 text-[13px] tabular-nums" inputMode="numeric"
              />
            </div>
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1 uppercase">Chargeback fee (cents)</label>
              <input
                value={policy.chargeback_fee_cents}
                onChange={(e) => setPolicy((p) => ({ ...p, chargeback_fee_cents: e.target.value.replace(/[^0-9]/g, '') }))}
                className="w-28 bg-background border border-input rounded-lg px-3 h-9 text-[13px] tabular-nums" inputMode="numeric"
              />
            </div>
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1 uppercase">Approval required above (cents)</label>
              <input
                value={policy.approval_required_above_cents}
                onChange={(e) => setPolicy((p) => ({ ...p, approval_required_above_cents: e.target.value.replace(/[^0-9]/g, '') }))}
                className="w-28 bg-background border border-input rounded-lg px-3 h-9 text-[13px] tabular-nums" inputMode="numeric"
              />
            </div>
            <button
              onClick={savePolicy}
              disabled={policyBusy}
              className="bg-primary text-primary-foreground px-4 py-2 text-[12px] uppercase tracking-wider rounded-lg cursor-pointer disabled:opacity-50"
            >
              {policyBusy ? 'SAVING…' : 'SAVE REFUND POLICIES'}
            </button>
          </div>
        </div>
      ) : (
      /* TWO-COLUMN LAYOUT: WORKLIST & DISPUTE RESOLVER */
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 lg:divide-x divide-border">
        {/* LEFT COL: MASTER WORKLIST REGISTRY (5 COLS) */}
        <div className="lg:col-span-5 bg-background p-4">
          <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
            <div className="bg-muted/40 border-b border-border px-4 py-2.5 flex items-center justify-between">
              <span className="font-medium text-[11px] text-muted-foreground uppercase tracking-wider">Active Queue</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground border border-border">FIFO Order</span>
            </div>
            <div className="divide-y divide-border max-h-[600px] overflow-y-auto custom-scrollbar">
              {loading ? (
                <div className="p-8 text-center text-muted-foreground text-[13px]">Loading refunds…</div>
              ) : error ? (
                <div className="p-8 text-center">
                  <p className="text-[13px] text-destructive">Failed to load: {error}</p>
                  <button onClick={loadData} className="mt-2 text-[12px] underline cursor-pointer">Retry</button>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-[13px]">No refunds or disputes found.</div>
              ) : filteredItems.map((item) => {
                const isSelected = selectedDisputeId === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedDisputeId(item.id)}
                    className={cn(
                      "p-4 cursor-pointer transition-colors flex flex-col justify-between",
                      isSelected
                        ? "bg-primary/5 border-l-2 border-l-primary"
                        : "hover:bg-accent/50 border-l-2 border-l-transparent",
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[12px] font-semibold tabular-nums text-foreground">{item.id}</span>
                      <span className={cn(
                        "inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wider",
                        item.status === 'REFUNDED'
                          ? "bg-muted text-muted-foreground border-border"
                          : item.status === 'DISPUTE_UNDER_REVIEW'
                          ? "bg-warning/10 text-warning border-warning/20 animate-pulse"
                          : "bg-destructive/10 text-destructive border-destructive/20",
                      )}>
                        {item.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex justify-between text-[13px] mb-1">
                      <span className="font-medium text-foreground">{item.customer}</span>
                      <span className="font-semibold tabular-nums text-foreground">${item.amount.toFixed(2)}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-1">{item.service}</p>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-3 pt-2 border-t border-dashed border-border">
                      <span>Original Tx #: <span className="tabular-nums">{item.origTxId || '—'}</span></span>
                      <span>Processed: <span className="tabular-nums">{item.processedDate || '—'}</span></span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1">
                      <span>Refund Method: <span className="tabular-nums">{item.refundMethod ? item.refundMethod.replace(/_/g, ' ') : '—'}</span></span>
                      <span>Disp Date: <span className="tabular-nums">{item.disputeDate}</span></span>
                    </div>
                    {item.kind === 'refund' && (
                      <div className="flex flex-wrap gap-1 mt-2" onClick={(e) => e.stopPropagation()}>
                        {['Edit', 'Void', 'Notes', 'Receipt', 'Original'].map((a) => (
                          <button
                            key={a}
                            disabled={!!actionBusy}
                            onClick={() => {
                              if (a === 'Edit') handleEditRefund(item);
                              else if (a === 'Void') handleVoidRefund(item);
                              else if (a === 'Notes') handleRefundNotes(item);
                              else if (a === 'Receipt') {
                                // SA-47: server receipt (fin_receipt_refund), local data as fallback.
                                fetch('/api/admin/finance/actions', {
                                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ action: 'fin_receipt_refund', refund_id: item.uuid }),
                                }).then(async (r) => {
                                  const d = await r.json();
                                  if (!r.ok || !d?.receipt) throw new Error(d?.error || 'Receipt failed');
                                  const rc = d.receipt;
                                  showDetail(`Receipt — ${item.id}`, {
                                    'Refund #': rc.refundNumber || item.id,
                                    Amount: `$${Number(rc.amount || 0).toFixed(2)}`,
                                    Status: rc.status || item.status,
                                    Reason: rc.reason || '—',
                                    Method: rc.method || '—',
                                    Date: rc.date || item.disputeDate,
                                    'Processor Ref': rc.processorReference || '—',
                                  });
                                }).catch(() => showDetail(`Receipt — ${item.id}`, {
                                  'Refund #': item.id,
                                  Amount: `$${item.amount.toFixed(2)}`,
                                  Status: item.status,
                                  Reason: item.reason || '—',
                                  Method: item.refundMethod || '—',
                                  Date: item.disputeDate,
                                  'Original Txn': item.origTxId || '—',
                                }));
                              }
                              else if (a === 'Original') {
                                // SA-68: server view of the original transaction, local data as fallback.
                                fetch('/api/admin/finance/actions', {
                                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ action: 'fin_view_original_refund', refund_id: item.uuid }),
                                }).then(async (r) => {
                                  const d = await r.json();
                                  if (!r.ok || !d?.originalPayment) throw new Error(d?.error || 'Lookup failed');
                                  const op = d.originalPayment;
                                  showDetail(`Original transaction — ${item.id}`, {
                                    'Payment #': op.paymentNumber || '—',
                                    'Original Txn': op.externalReference || item.origTxId || '—',
                                    Status: op.status || '—',
                                    Amount: `$${Number(op.amount || 0).toFixed(2)}`,
                                    Date: op.date || item.origTxDate,
                                    Customer: item.customer,
                                    Service: item.service,
                                  });
                                }).catch(() => showDetail(`Original transaction — ${item.id}`, {
                                  'Original Txn': item.origTxId || '—',
                                  'Txn Date': item.origTxDate,
                                  Customer: item.customer,
                                  Amount: `$${item.amount.toFixed(2)}`,
                                  Service: item.service,
                                }));
                              }
                            }}
                            className="h-6 px-2 rounded border border-border bg-background text-[10px] font-medium hover:bg-accent cursor-pointer disabled:opacity-50"
                          >
                            {a}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT COL: STRIPE GATEWAY DISPUTE REBUTTAL TERMINAL (7 COLS) */}
        <div className="lg:col-span-7 bg-muted/30 p-6">
          {selectedDispute ? (
            <div className="border border-border bg-card p-6 shadow-card-md">
              {/* HEAD */}
              <div className="border-b border-border pb-4 mb-4 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-muted-foreground uppercase">DISPUTE RECORD — EVIDENCE STORED LOCALLY (STRIPE SUBMISSION GATED OFF)</div>
                  <h3 className="text-lg font-semibold tabular-nums mt-1 text-foreground">{selectedDispute.id} - EVIDENCE PACK</h3>
                </div>
                <span className="text-[10px] bg-destructive/10 border border-destructive/20 text-destructive px-2.5 py-1 font-semibold uppercase">
                  STATUS: {selectedDispute.status.replace(/_/g, ' ')}
                </span>
              </div>

              {/* DETAILS */}
              <div className="grid grid-cols-2 gap-4 text-[13px] tabular-nums border-b border-border pb-4 mb-4">
                <div className="space-y-2">
                  <p><span className="text-muted-foreground">DISPUTED AMT:</span> <strong className="text-foreground text-sm">${selectedDispute.amount.toFixed(2)} USD</strong></p>
                  <p><span className="text-muted-foreground">REASON CODE:</span> <strong className="text-foreground">{selectedDispute.reasonCode}</strong></p>
                  <p><span className="text-muted-foreground">ORIGINAL TXN:</span> <strong className="text-foreground">{selectedDispute.origTxId} ({selectedDispute.origTxDate})</strong></p>
                </div>
                <div className="space-y-2">
                  <p><span className="text-muted-foreground">CUSTOMER:</span> <strong className="text-foreground">{selectedDispute.customer}</strong></p>
                  <p><span className="text-muted-foreground">ACQUIRER ARN:</span> <strong className="text-foreground select-all">{selectedDispute.acquirerRef}</strong></p>
                  <p><span className="text-muted-foreground">CONTACT:</span> <strong className="text-foreground">{selectedDispute.phone}</strong></p>
                </div>
              </div>

              {/* CORE ACTIONS */}
              <div className="space-y-4">
                <h4 className="text-[12px] font-semibold text-foreground uppercase">DISPUTE EVIDENCE &amp; RESOLUTION</h4>
                <div className="p-4 border border-border bg-muted/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-foreground uppercase">EVIDENCE NOTES</span>
                    <span className="text-[10px] text-muted-foreground border border-border px-1">SAVED TO DISPUTE RECORD</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Write the rebuttal summary (service records, timestamps, policy references). Saved to the dispute when you submit.
                  </p>
                  <textarea
                    value={evidenceNotes}
                    onChange={(e) => setEvidenceNotes(e.target.value)}
                    rows={4}
                    placeholder="e.g. Groom completed 2026-10-10 11:00, signed intake on file, 24h cancellation policy acknowledged at booking."
                    className="w-full bg-card border border-input rounded-lg px-3 py-2 text-[12px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>

                {/* RESOLUTION BUTTONS — real API calls */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                  <button
                    onClick={handleAcceptDispute}
                    disabled={!!actionBusy || selectedDispute.kind !== 'dispute'}
                    className="border border-border bg-card hover:bg-destructive/5 hover:text-destructive px-4 py-2.5 text-[12px] uppercase font-semibold tracking-wider transition-colors rounded-lg cursor-pointer disabled:opacity-50"
                  >
                    {actionBusy === 'Accept' ? 'WORKING…' : 'ACCEPT DISPUTE (CONCEDE)'}
                  </button>
                  <button
                    onClick={handleRebut}
                    disabled={!!actionBusy || selectedDispute.kind !== 'dispute'}
                    className="border border-border bg-primary text-primary-foreground hover:bg-muted/40 hover:text-foreground px-4 py-2.5 text-[12px] uppercase font-semibold tracking-wider transition-colors rounded-lg cursor-pointer disabled:opacity-50"
                  >
                    {actionBusy === 'Rebuttal' ? 'WORKING…' : 'SUBMIT REBUTTAL'}
                  </button>
                </div>
                {selectedDispute.kind !== 'dispute' && (
                  <p className="text-[11px] text-muted-foreground">Rebuttal actions apply to disputes. Select a dispute record to respond.</p>
                )}
                {/* REAL REFUND ACTIONS — wired to /api/admin/finance/actions */}
                <div className="grid grid-cols-3 gap-2 pt-2">
                  <button
                    disabled={!!actionBusy || selectedDispute.kind !== 'refund'}
                    onClick={() => selectedDispute && runRefundAction('Approve', selectedDispute.id, () => approveRefund.mutateAsync({ refund_id: selectedDispute.uuid }))}
                    className="border border-border bg-card hover:bg-accent px-3 py-2 text-[11px] uppercase font-semibold tracking-wider rounded-lg cursor-pointer disabled:opacity-50"
                  >
                    {actionBusy === 'Approve' ? 'WORKING…' : 'APPROVE REFUND'}
                  </button>
                  <button
                    disabled={!!actionBusy || selectedDispute.kind !== 'refund'}
                    onClick={() => {
                      if (!selectedDispute) return;
                      const reason = window.prompt('Rejection reason:', 'Duplicate request') || 'Rejected';
                      runRefundAction('Reject', selectedDispute.id, () => rejectRefund.mutateAsync({ refund_id: selectedDispute.uuid, reason }));
                    }}
                    className="border border-border bg-card hover:bg-accent px-3 py-2 text-[11px] uppercase font-semibold tracking-wider rounded-lg cursor-pointer disabled:opacity-50"
                  >
                    {actionBusy === 'Reject' ? 'WORKING…' : 'REJECT REFUND'}
                  </button>
                  <button
                    disabled={!!actionBusy || selectedDispute.kind !== 'refund'}
                    onClick={() => {
                      if (!selectedDispute) return;
                      const notes = window.prompt('Dispute notes:', '') || '';
                      runRefundAction('Dispute', selectedDispute.id, () => disputeRefund.mutateAsync({ refund_id: selectedDispute.uuid, notes }));
                    }}
                    className="border border-border bg-card hover:bg-accent px-3 py-2 text-[11px] uppercase font-semibold tracking-wider rounded-lg cursor-pointer disabled:opacity-50"
                  >
                    {actionBusy === 'Dispute' ? 'WORKING…' : 'OPEN DISPUTE'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center p-8 border border-dashed border-border">
              <p className="text-[12px] text-muted-foreground uppercase">SELECT A DISPUTE RECORD TO OPEN MITIGATION TERMINAL</p>
            </div>
          )}
        </div>
      </div>
      )}

      {/* DETAIL MODAL (receipt / original transaction) */}
      {detailModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-card border border-border">
            <div className="bg-muted/40 border-b border-border p-4 flex items-center justify-between">
              <span className="text-[13px] font-semibold text-foreground">{detailModal.title}</span>
              <button onClick={() => setDetailModal(null)} className="text-[12px] font-semibold px-2 py-0.5 border border-border cursor-pointer">[X]</button>
            </div>
            <div className="p-4 space-y-2 text-[13px]">
              {Object.entries(detailModal.body).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-medium text-right break-all">{String(v)}</span>
                </div>
              ))}
            </div>
            <div className="p-4 bg-muted/40 border-t border-border flex justify-end">
              <button
                onClick={async () => {
                  // Print the record as a standalone receipt document on
                  // this device's printer — not the admin screen behind
                  // the modal.
                  const rows = Object.entries(detailModal.body).map(([k, v]) =>
                    `<div style="display:flex;justify-content:space-between;gap:16px;font-size:13px;padding:3px 0;border-bottom:1px solid #f3f4f6;"><span style="color:#666;">${esc(k)}</span><span style="font-weight:500;text-align:right;">${esc(String(v))}</span></div>`).join('');
                  const ok = await openPrintDocument({
                    docType: 'receipt',
                    title: detailModal.title,
                    bodyHtml: `<h1 style="font-size:16px;margin:0 0 10px;">${esc(detailModal.title)}</h1>${rows}`,
                  });
                  if (!ok) alert('Pop-ups are blocked — allow pop-ups for this site to print.');
                }}
                className="border border-border bg-primary text-primary-foreground px-4 py-1.5 text-[12px] uppercase rounded-lg cursor-pointer"
              >Print</button>
            </div>
          </div>
        </div>
      )}

      {/* INTERNAL ISSUE REFUND MODAL */}

      {/* INTERNAL ISSUE REFUND MODAL */}
      {showIssueModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-none z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-card border border-border">
            <div className="bg-muted/40 border-b border-border p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 font-semibold uppercase">TXN_REVERSAL</span>
                <span className="text-[12px] font-semibold text-foreground">INITIATE LEDGER-REVERSIBLE REFUND</span>
              </div>
              <button 
                onClick={() => setShowIssueModal(false)}
                className="text-[12px] font-semibold text-foreground hover:border-brand-teal/60 hover:bg-brand-teal/5 hover:text-brand-teal px-2 py-0.5 border border-border cursor-pointer"
              >
                [X]
              </button>
            </div>
            <div className="p-4 space-y-4">
              {submitError && (
                <p className="text-[12px] text-destructive border border-destructive/30 bg-destructive/10 px-3 py-2 rounded">{submitError}</p>
              )}
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1 uppercase">TARGET INVOICE / TXN REFERENCE //*</label>
                <input value={formTxn} onChange={(e) => setFormTxn(e.target.value)} className="w-full bg-card border border-border px-3 py-2 text-[13px] text-foreground focus:outline-none rounded-lg" type="text" placeholder="e.g. TXN-901842" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1 uppercase">REFUND REASON CATEGORY //*</label>
                  <select value={formReason} onChange={(e) => setFormReason(e.target.value)} className="w-full bg-card border border-border px-3 py-2 text-[13px] text-foreground focus:outline-none rounded-lg">
                    <option value="requested_by_customer">01 // CUSTOMER SATISFACTION REFUND</option>
                    <option value="duplicate">04 // DUPLICATE TXN REVERSION</option>
                    <option value="fraudulent">10 // FRAUDULENT</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1 uppercase">REVERSAL AMOUNT ($USD) //*</label>
                  <input value={formAmount} onChange={(e) => setFormAmount(e.target.value)} className="w-full bg-card border border-border px-3 py-2 text-[13px] text-foreground focus:outline-none rounded-lg" type="text" placeholder="50.00" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1 uppercase">REVERSAL REFUND PAYOUT TYPE //*</label>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold">
                  {([['original_payment', 'CREDIT BACK TO CARD'], ['store_credit', 'CONVERT TO STORE CREDIT']] as const).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setFormPayout(value)}
                      className={`border border-border p-2 text-center cursor-pointer ${formPayout === value ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground hover:bg-muted/40'}`}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {formPayout === 'original_payment' && (
                  <p className="mt-1 text-[11px] text-muted-foreground">Stripe is disabled, so this records a manual ledger refund (no processor chargeback is sent).</p>
                )}
              </div>
              {formPayout === 'store_credit' && (
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1 uppercase">CUSTOMER ID (UUID) FOR THE STORE CREDIT</label>
                  <input value={formCustomerId} onChange={(e) => setFormCustomerId(e.target.value)} className="w-full bg-card border border-border px-3 py-2 text-[13px] text-foreground focus:outline-none rounded-lg" type="text" placeholder="Optional — leave blank for an unassigned credit" />
                </div>
              )}
            </div>
            <div className="p-4 bg-muted/40 border-t border-border flex items-center justify-between">
              <button 
                onClick={() => setShowIssueModal(false)}
                className="border border-border bg-card hover:bg-muted px-4 py-1.5 text-[12px] uppercase tracking-wider rounded-lg cursor-pointer"
              >
                ABORT
              </button>
              <button
                onClick={submitRefund}
                disabled={submitting}
                className="border border-border bg-primary text-primary-foreground hover:bg-muted hover:text-foreground px-4 py-1.5 text-[12px] uppercase tracking-wider rounded-lg cursor-pointer disabled:opacity-50"
              >
                {submitting ? 'PROCESSING…' : 'AUTHORIZE REFUND'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
