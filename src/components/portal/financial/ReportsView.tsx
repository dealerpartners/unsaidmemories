'use client';

import React, { useState, useEffect } from 'react';
import { DawgNavSection } from '@/lib/types';
import { Play, FileSpreadsheet, Download } from 'lucide-react';
import {
  useRunProfitLoss,
  useRunBalanceSheet,
  useRunTrialBalance,
  useRunGeneralLedger,
} from '@/hooks/admin/useActions';

// ============================================================================
// ReportsView — 3.13 Reports (SA-156).
//
// Every figure on the four ledger reports comes from the live report RPCs
// via the finance actions (fin_run_profit_loss / fin_run_balance_sheet /
// fin_run_trial_balance / fin_run_general_ledger → rpc_get_* over posted
// acct_journal_entries). The previous version rendered HARDCODED P&L,
// balance-sheet and trial-balance statements ($48,600 revenue, $71,810
// balanced-to-the-penny books that never existed) next to the RUN buttons
// — pure fiction, removed. A tab shows an honest "run the report" empty
// state until its real result is loaded, and exports operate on that
// loaded result only.
//
// The fin_run_* handlers REQUIRE dates (400 without them), so RUN passes
// a default period: year-to-date for P&L / GL, today for BS / TB.
// ============================================================================

// Convert report data to CSV string
function toCsv(data: unknown): string {
  if (!data) return '';
  const rows: unknown[] = Array.isArray(data) ? data : [data];
  // Flatten: if object has nested arrays, use the first array found
  let flat: Record<string, unknown>[] = [];
  for (const r of rows) {
    if (r && typeof r === 'object' && !Array.isArray(r)) {
      const vals = Object.values(r as Record<string, unknown>);
      const arr = vals.find(v => Array.isArray(v));
      if (arr) {
        flat.push(...(arr as Record<string, unknown>[]));
        continue;
      }
    }
    flat.push(r as Record<string, unknown>);
  }
  if (flat.length === 0) return '';
  const headers = [...new Set(flat.flatMap(r => Object.keys(r || {})))];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...flat.map(r => headers.map(h => esc(r?.[h])).join(','))].join('\n');
}

const money = (n: unknown) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const todayIso = () => new Date().toISOString().slice(0, 10);
const ytdStartIso = () => `${new Date().getFullYear()}-01-01`;

interface ReportsViewProps {
  onNavigateSection?: (section: DawgNavSection) => void;
}

type ReportKey = 'profit-loss' | 'balance-sheet' | 'trial-balance' | 'general-ledger';

export const ReportsView: React.FC<ReportsViewProps> = ({ onNavigateSection }) => {
  const [activeReportTab, setActiveReportTab] = useState<'profit-loss' | 'balance-sheet' | 'trial-balance' | 'general-ledger-audit' | 'revenue-telemetry' | 'disputes-chargebacks' | 'scheduled-payouts'>('profit-loss');

  // --- Disputes (real commerce_disputes via /api/admin/disputes) ----------
  type Dispute = {
    id: string; dispute_number: string | null; reason: string | null;
    status: string; amount: number; opened_at: string | null; due_at: string | null;
    processor_dispute_id: string | null;
  };
  const [disputesList, setDisputesList] = useState<Dispute[]>([]);
  const [disputesLoading, setDisputesLoading] = useState(true);
  const [selectedDispute, setSelectedDispute] = useState<string | null>(null);
  const [responseEvidence, setResponseEvidence] = useState('');
  const [disputeBusy, setDisputeBusy] = useState(false);
  const [disputeNotice, setDisputeNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/admin/disputes', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const list = d.disputes || [];
        setDisputesList(list);
        if (list.length > 0) setSelectedDispute(list[0].id);
      })
      .catch(() => {})
      .finally(() => { if (alive) setDisputesLoading(false); });
    return () => { alive = false; };
  }, []);

  // Evidence recording: the LOCAL record executes — respond_dispute
  // appends the evidence to the dispute's notes and sets it under_review,
  // audited. Transmission to Stripe is the separate C3 leg below
  // (handleDisputeStripeSubmit → /api/admin/disputes/evidence).
  // NOTE on statuses: commerce_disputes.status CHECK allows only
  // open | under_review | won | lost | accepted — the form therefore keys
  // off 'open'/'under_review', never the Stripe-only 'needs_response'.
  const handleDisputeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDispute || !responseEvidence.trim()) return;
    setDisputeBusy(true); setDisputeNotice(null);
    try {
      const res = await fetch('/api/admin/finance/actions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'respond_dispute', payload: { dispute_id: selectedDispute, notes: responseEvidence.trim() } }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) throw new Error(d.error || 'Could not record evidence');
      setDisputesList(prev => prev.map(x => x.id === selectedDispute ? { ...x, status: 'under_review' } : x));
      setResponseEvidence('');
      setDisputeNotice('Evidence recorded on the dispute (status: under review, audit-logged). It has NOT been transmitted to Stripe — use “Submit evidence to Stripe” to send the assembled pack to the processor.');
    } catch (err) {
      setDisputeNotice(err instanceof Error ? err.message : 'Could not record evidence');
    } finally { setDisputeBusy(false); }
  };

  // C3 · Stripe submission leg (POST /api/admin/disputes/evidence): the
  // evidence pack is assembled server-side from the real payment/customer
  // records, the textarea text rides as uncategorized_text, and Stripe's
  // disputes.update evidence + submit calls carry it. The route records
  // the submission on commerce_disputes (evidence_submitted_at/by/payload).
  // Honest failures surface verbatim: Stripe not configured (503), a
  // local-only dispute with no Stripe id (400), or a Stripe error (502).
  const handleDisputeStripeSubmit = async () => {
    if (!selectedDispute) return;
    setDisputeBusy(true); setDisputeNotice(null);
    try {
      const res = await fetch('/api/admin/disputes/evidence', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dispute_id: selectedDispute,
          evidence: responseEvidence.trim() ? { uncategorized_text: responseEvidence.trim() } : {},
          submit: true,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) throw new Error(d.error || 'Stripe evidence submission failed');
      setDisputesList(prev => prev.map(x => x.id === selectedDispute ? { ...x, status: 'under_review' } : x));
      setResponseEvidence('');
      setDisputeNotice(`Evidence submitted to Stripe (dispute ${d.stripe?.dispute_id}, Stripe status: ${d.stripe?.status}) and recorded on the local dispute record.`);
    } catch (err) {
      setDisputeNotice(err instanceof Error ? err.message : 'Stripe evidence submission failed');
    } finally { setDisputeBusy(false); }
  };

  // --- Revenue telemetry (real /api/admin/reports/revenue) ----------------
  const [revDaily, setRevDaily] = useState<{ day: string; revenue: number; payments: number }[]>([]);
  const [revMtd, setRevMtd] = useState<{ mtd_revenue?: number; mtd_payments?: number; avg_ticket?: number }>({});
  const [revDisputes, setRevDisputes] = useState<{ ytd_disputes?: number; ytd_dispute_amount?: number }>({});
  const [revLoading, setRevLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    fetch('/api/admin/reports/revenue', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setRevDaily(d.daily || []);
        setRevMtd(d.mtd || {});
        setRevDisputes(d.disputes || {});
      })
      .catch(() => {})
      .finally(() => { if (alive) setRevLoading(false); });
    return () => { alive = false; };
  }, []);

  // --- Scheduled payouts report (real /api/admin/payouts) -----------------
  type PayoutRow = { id: string; seller_name: string | null; amount: number; status: string; scheduled_at: string | null; paid_at: string | null };
  const [payoutRows, setPayoutRows] = useState<PayoutRow[]>([]);
  const [payoutCounts, setPayoutCounts] = useState<Record<string, { n: number; total: number }>>({});
  const [payoutsLoading, setPayoutsLoading] = useState(true);
  const [payoutsError, setPayoutsError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch('/api/admin/payouts', { cache: 'no-store' })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!alive) return;
        if (!ok) { setPayoutsError(d?.error || 'Payouts are unavailable for your permissions.'); return; }
        setPayoutRows(d.payouts || []);
        setPayoutCounts(d.counts || {});
      })
      .catch(() => { if (alive) setPayoutsError('Payouts failed to load.'); })
      .finally(() => { if (alive) setPayoutsLoading(false); });
    return () => { alive = false; };
  }, []);

  // --- Ledger report runners (SA-156) --------------------------------------
  const runPL = useRunProfitLoss();
  const runBS = useRunBalanceSheet();
  const runTB = useRunTrialBalance();
  const runGL = useRunGeneralLedger();
  const [plData, setPlData] = useState<any>(null);
  const [bsData, setBsData] = useState<any>(null);
  const [tbData, setTbData] = useState<any>(null);
  const [glData, setGlData] = useState<any>(null);
  const [reportBusy, setReportBusy] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  const runReport = async (key: ReportKey) => {
    setReportBusy(key);
    setReportError(null);
    try {
      let body: any;
      if (key === 'profit-loss') {
        body = await runPL.mutateAsync({ start_date: ytdStartIso(), end_date: todayIso() } as any);
        setPlData(body?.profitAndLoss ?? body?.data?.profitAndLoss ?? body?.data ?? body);
      } else if (key === 'balance-sheet') {
        body = await runBS.mutateAsync({ as_of_date: todayIso() } as any);
        setBsData(body?.balanceSheet ?? body?.data?.balanceSheet ?? body?.data ?? body);
      } else if (key === 'trial-balance') {
        body = await runTB.mutateAsync({ end_date: todayIso() } as any);
        setTbData(body?.trialBalance ?? body?.data?.trialBalance ?? body?.data ?? body);
      } else {
        body = await runGL.mutateAsync({ start_date: ytdStartIso(), end_date: todayIso() } as any);
        setGlData(body?.generalLedger ?? body?.data?.generalLedger ?? body?.data ?? body);
      }
    } catch (e) {
      setReportError(e instanceof Error ? e.message : 'Report failed');
    } finally {
      setReportBusy(null);
    }
  };

  const exportCsv = (data: unknown, name: string) => {
    if (!data) return;
    const csv = toCsv(data);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}-${todayIso()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = async (title: string, data: unknown) => {
    if (!data) return;
    try {
      const res = await fetch('/api/admin/reports/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, data }),
      });
      const html = await res.text();
      const w = window.open('', '_blank');
      if (w) { w.document.write(html); w.document.close(); }
    } catch (e) { console.error('PDF export failed:', e); }
  };

  const reportBtnCls = 'bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1 text-[11px] font-semibold rounded-lg flex items-center gap-1.5 disabled:opacity-50 cursor-pointer';
  const exportBtnCls = 'bg-card hover:bg-muted/40 text-foreground border border-border px-3 py-1 text-[11px] font-semibold cursor-pointer rounded-lg flex items-center gap-1.5 disabled:opacity-50';

  const ExportButtons = ({ data, title, name }: { data: unknown; title: string; name: string }) => (
    <>
      <button onClick={() => exportPdf(title, data)} disabled={!data} className={exportBtnCls}>
        <Download className="w-3 h-3" /> EXPORT PDF
      </button>
      <button onClick={() => exportCsv(data, name)} disabled={!data} className={exportBtnCls}>
        <FileSpreadsheet className="w-3 h-3" /> EXPORT CSV
      </button>
    </>
  );

  const RunEmpty = ({ what }: { what: string }) => (
    <div className="border border-border bg-card p-12 text-center text-muted-foreground text-[13px]">
      No {what} loaded yet. Press RUN REPORT — figures are computed live from the posted general ledger (rpc_get_*). Nothing is shown here that the ledger doesn't hold.
    </div>
  );

  return (
    <div className="flex flex-col w-full text-foreground bg-card select-text">
      {/* SYSTEM CONTEXT STRIP — honest source label (was the hardcoded
          fiction 'COMPLIANCE_PASS: TRUE / LEDGER_LOCK: LOCKED'). */}
      <div className="w-full bg-muted/40 border-b border-border px-4 py-2 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-black inline-block"></span>
          <span className="font-medium text-[11px] text-muted-foreground">
            Financial &amp; Compliance Reports
          </span>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
          <span>SOURCE: POSTED JOURNAL ENTRIES (acct_journal_entries)</span>
          <span>REPORTS RUN LIVE VIA rpc_get_*</span>
        </div>
      </div>

      {/* SUB-TABS STRIP */}
      <div className="w-full bg-card border-b border-border overflow-x-auto flex shrink-0">
        {([
          ['profit-loss', '[01]', 'PROFIT & LOSS (P&L)'],
          ['balance-sheet', '[02]', 'BALANCE SHEET'],
          ['trial-balance', '[03]', 'TRIAL BALANCE & LEDGER'],
          ['general-ledger-audit', '[04]', 'GENERAL LEDGER AUDIT'],
          ['revenue-telemetry', '[05]', 'REVENUE TELEMETRY'],
          ['disputes-chargebacks', '[06]', 'DISPUTES & CHARGEBACKS'],
          ['scheduled-payouts', '[07]', 'SCHEDULED PAYOUTS'],
        ] as const).map(([tab, num, label]) => (
          <button
            key={tab}
            onClick={() => setActiveReportTab(tab)}
            className={`px-6 py-3.5 text-[12px] uppercase border-r border-border flex items-center gap-2 cursor-pointer transition-colors shrink-0 ${
              activeReportTab === tab ? 'bg-primary text-primary-foreground font-semibold' : 'bg-card text-foreground hover:bg-muted/40'
            }`}
          >
            <span>{num}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>

      {reportError && (
        <div className="mx-6 mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex items-center justify-between">
          <p className="text-[12px] text-destructive">{reportError}</p>
          <button onClick={() => setReportError(null)} className="text-[11px] underline text-muted-foreground hover:text-foreground">Dismiss</button>
        </div>
      )}

      {/* TAB CONTENT: PROFIT & LOSS */}
      {activeReportTab === 'profit-loss' && (
        <div className="animate-fade-in p-6 space-y-6 bg-muted/30 min-h-[500px]">
          <div className="bg-card border border-border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="font-medium text-[11px] uppercase tracking-wider text-muted-foreground">Compliance › Reports › P&amp;L</span>
              <h2 className="font-display text-sm font-semibold tracking-tight text-foreground">Profit &amp; Loss — rpc_get_profit_and_loss</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {plData ? `Period: ${plData.dateRange?.from} → ${plData.dateRange?.to} (year-to-date default)` : 'Default period: year-to-date.'}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => runReport('profit-loss')} disabled={!!reportBusy} className={reportBtnCls}>
                <Play className="w-3 h-3" /> {reportBusy === 'profit-loss' ? 'RUNNING…' : 'RUN REPORT'}
              </button>
              <ExportButtons data={plData} title="Profit & Loss" name="pl-report" />
            </div>
          </div>

          {!plData ? <RunEmpty what="P&L result" /> : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 border border-border divide-x divide-y lg:divide-y-0 divide-border bg-card">
                <div className="p-4">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">TOTAL REVENUE</span>
                  <p className="text-lg font-semibold tabular-nums tracking-tight mt-2">{money(plData.totals?.revenue)}</p>
                </div>
                <div className="p-4">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">TOTAL EXPENSES</span>
                  <p className="text-lg font-semibold tabular-nums tracking-tight mt-2">{money(plData.totals?.expenses)}</p>
                </div>
                <div className="p-4 bg-muted/30">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">NET INCOME</span>
                  <p className="text-lg font-semibold tabular-nums tracking-tight mt-2">{money(plData.totals?.netIncome)}</p>
                </div>
                <div className="p-4">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">ACCOUNTS WITH ACTIVITY</span>
                  <p className="text-lg font-semibold tabular-nums tracking-tight mt-2">{(plData.accounts || []).length}</p>
                </div>
              </div>

              <div className="bg-card border border-border overflow-x-auto">
                <table className="w-full text-left text-[13px] border-collapse">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border font-semibold uppercase text-[11px]">
                      <th className="p-3 border-r border-border">GL CODE</th>
                      <th className="p-3 border-r border-border">ACCOUNT</th>
                      <th className="p-3 border-r border-border">TYPE</th>
                      <th className="p-3 border-r border-border text-right">DEBIT</th>
                      <th className="p-3 border-r border-border text-right">CREDIT</th>
                      <th className="p-3 text-right">NET</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(plData.accounts || []).length === 0 ? (
                      <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No revenue or expense activity in this period — the ledger holds no P&amp;L lines for the range.</td></tr>
                    ) : (plData.accounts || []).map((a: any) => (
                      <tr key={a.code} className="hover:bg-muted/30">
                        <td className="p-3 border-r border-border tabular-nums">{a.code}</td>
                        <td className="p-3 border-r border-border font-medium">{a.name}</td>
                        <td className="p-3 border-r border-border uppercase text-muted-foreground">{a.type}</td>
                        <td className="p-3 border-r border-border text-right tabular-nums">{money(a.debit)}</td>
                        <td className="p-3 border-r border-border text-right tabular-nums">{money(a.credit)}</td>
                        <td className="p-3 text-right font-semibold tabular-nums">{money(a.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/40 border-t border-border font-semibold">
                      <td className="p-3 uppercase text-right" colSpan={5}>NET INCOME (REVENUE − EXPENSES)</td>
                      <td className="p-3 text-right tabular-nums">{money(plData.totals?.netIncome)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB CONTENT: BALANCE SHEET */}
      {activeReportTab === 'balance-sheet' && (
        <div className="animate-fade-in p-6 space-y-6 bg-muted/30 min-h-[500px]">
          <div className="bg-card border border-border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="font-medium text-[11px] uppercase tracking-wider text-muted-foreground">Compliance › Reports › Balance Sheet</span>
              <h2 className="font-display text-sm font-semibold tracking-tight text-foreground">Balance Sheet — rpc_get_balance_sheet</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {bsData ? `As of: ${bsData.asOfDate}` : 'Default: as of today.'} Currency: USD.
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => runReport('balance-sheet')} disabled={!!reportBusy} className={reportBtnCls}>
                <Play className="w-3 h-3" /> {reportBusy === 'balance-sheet' ? 'RUNNING…' : 'RUN REPORT'}
              </button>
              <ExportButtons data={bsData} title="Balance Sheet" name="balance-sheet" />
            </div>
          </div>

          {!bsData ? <RunEmpty what="balance sheet" /> : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 border border-border divide-x divide-y lg:divide-y-0 divide-border bg-card">
                <div className="p-4">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">TOTAL ASSETS</span>
                  <p className="text-lg font-semibold tabular-nums tracking-tight mt-2">{money(bsData.totals?.assets)}</p>
                </div>
                <div className="p-4">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">TOTAL LIABILITIES</span>
                  <p className="text-lg font-semibold tabular-nums tracking-tight mt-2">{money(bsData.totals?.liabilities)}</p>
                </div>
                <div className="p-4">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">EQUITY (INCL. CURRENT-PERIOD NET INCOME {money(bsData.totals?.currentPeriodNetIncome)})</span>
                  <p className="text-lg font-semibold tabular-nums tracking-tight mt-2">{money(bsData.totals?.equityWithNetIncome)}</p>
                </div>
                <div className={`p-4 ${bsData.balanced ? 'bg-success/10' : 'bg-destructive/10'}`}>
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">ACCOUNTING EQUATION</span>
                  <p className="text-lg font-semibold tabular-nums tracking-tight mt-2">{bsData.balanced ? 'BALANCED' : 'OUT OF BALANCE'}</p>
                  <span className="text-[10px] text-muted-foreground">Assets = Liabilities + Equity</span>
                </div>
              </div>

              <div className="bg-card border border-border overflow-x-auto">
                <table className="w-full text-left text-[13px] border-collapse">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border font-semibold uppercase text-[11px]">
                      <th className="p-3 border-r border-border">SECTION</th>
                      <th className="p-3 border-r border-border">GL CODE</th>
                      <th className="p-3 border-r border-border">ACCOUNT</th>
                      <th className="p-3 text-right">BALANCE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(bsData.detail || []).length === 0 ? (
                      <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No asset, liability or equity balances as of this date.</td></tr>
                    ) : (bsData.detail || []).map((r: any, i: number) => (
                      <tr key={`${r.code}-${i}`} className="hover:bg-muted/30">
                        <td className="p-3 border-r border-border uppercase text-muted-foreground">{r.section || r.type}</td>
                        <td className="p-3 border-r border-border tabular-nums">{r.code}</td>
                        <td className="p-3 border-r border-border font-medium">{r.name}</td>
                        <td className="p-3 text-right font-semibold tabular-nums">{money(r.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB CONTENT: TRIAL BALANCE */}
      {activeReportTab === 'trial-balance' && (
        <div className="animate-fade-in p-6 bg-muted/30 min-h-[500px] space-y-6">
          <div className="bg-card border border-border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="font-medium text-[11px] uppercase tracking-wider text-muted-foreground">Compliance › Trial Balance</span>
              <h2 className="font-display text-sm font-semibold tracking-tight text-foreground">Trial Balance — rpc_get_trial_balance</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">{tbData ? `As of: ${tbData.asOfDate}` : 'Default: as of today.'}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => runReport('trial-balance')} disabled={!!reportBusy} className={reportBtnCls}>
                <Play className="w-3 h-3" /> {reportBusy === 'trial-balance' ? 'RUNNING…' : 'RUN REPORT'}
              </button>
              <ExportButtons data={tbData} title="Trial Balance" name="trial-balance" />
            </div>
          </div>

          {!tbData ? <RunEmpty what="trial balance" /> : (
            <div className="border border-border bg-card p-6">
              <div className="border border-border overflow-x-auto">
                <table className="w-full text-left text-[13px] text-foreground border-collapse">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border font-semibold uppercase">
                      <th className="p-3 border-r border-border">ACCOUNT GL CODE</th>
                      <th className="p-3 border-r border-border">ACCOUNT DESCRIPTION</th>
                      <th className="p-3 border-r border-border">TYPE</th>
                      <th className="p-3 border-r border-border text-right w-44">TOTAL DEBIT (DR)</th>
                      <th className="p-3 text-right w-44">TOTAL CREDIT (CR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border font-medium">
                    {(tbData.accounts || []).length === 0 ? (
                      <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No posted journal lines as of this date.</td></tr>
                    ) : (tbData.accounts || []).map((a: any) => (
                      <tr key={a.code} className="hover:bg-muted/30">
                        <td className="p-3 border-r border-border tabular-nums">{a.code}</td>
                        <td className="p-3 border-r border-border">{a.name}</td>
                        <td className="p-3 border-r border-border uppercase text-muted-foreground">{a.type}</td>
                        <td className="p-3 border-r border-border text-right font-semibold tabular-nums">{money(a.debit)}</td>
                        <td className="p-3 text-right font-semibold tabular-nums">{money(a.credit)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/40 border-t border-border font-semibold text-foreground">
                      <td className="p-3 border-r border-border uppercase text-right" colSpan={3}>TOTALS</td>
                      <td className="p-3 border-r border-border text-right tabular-nums">{money(tbData.totals?.totalDebit)}</td>
                      <td className="p-3 text-right tabular-nums">{money(tbData.totals?.totalCredit)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {tbData.totals?.balanced ? (
                <div className="bg-success/10 border border-success/20 p-3 mt-4 text-[10px] font-semibold text-success uppercase flex items-center justify-between">
                  <span>LEDGER EQUILIBRIUM: DEBITS EQUAL CREDITS ({money(tbData.totals?.totalDebit)})</span>
                </div>
              ) : (
                <div className="bg-destructive/10 border border-destructive/20 p-3 mt-4 text-[10px] font-semibold text-destructive uppercase flex items-center justify-between">
                  <span>OUT OF BALANCE BY {money(Math.abs(Number(tbData.totals?.totalDebit || 0) - Number(tbData.totals?.totalCredit || 0)))} — INVESTIGATE BEFORE CLOSING THE PERIOD</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: GENERAL LEDGER AUDIT */}
      {activeReportTab === 'general-ledger-audit' && (
        <div className="animate-fade-in p-6 bg-muted/30 min-h-[500px] space-y-6">
          <div className="bg-card border border-border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="font-medium text-[11px] uppercase tracking-wider text-muted-foreground">Compliance › Reports › General Ledger</span>
              <h2 className="font-display text-sm font-semibold tracking-tight text-foreground">General Ledger — rpc_get_general_ledger</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {glData ? `Period: ${glData.dateRange?.from} → ${glData.dateRange?.to} · ${glData.lineCount} lines · Dr ${money(glData.totalDebit)} / Cr ${money(glData.totalCredit)}` : 'Default period: year-to-date.'}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => runReport('general-ledger')} disabled={!!reportBusy} className={reportBtnCls}>
                <Play className="w-3 h-3" /> {reportBusy === 'general-ledger' ? 'RUNNING…' : 'RUN LEDGER'}
              </button>
              <ExportButtons data={glData} title="General Ledger" name="general-ledger" />
              <button
                onClick={() => { if (onNavigateSection) onNavigateSection('books'); }}
                className={exportBtnCls}
              >
                OPEN GL LEDGER BOOKS VIEW
              </button>
            </div>
          </div>

          {!glData ? <RunEmpty what="general ledger result" /> : (
            <div className="bg-card border border-border overflow-x-auto">
              <table className="w-full text-left text-[12px] border-collapse">
                <thead>
                  <tr className="bg-muted/30 border-b border-border font-semibold uppercase text-[11px]">
                    <th className="p-3 border-r border-border">ENTRY</th>
                    <th className="p-3 border-r border-border">DATE</th>
                    <th className="p-3 border-r border-border">ACCOUNT</th>
                    <th className="p-3 border-r border-border">DESCRIPTION</th>
                    <th className="p-3 border-r border-border text-right">DEBIT</th>
                    <th className="p-3 border-r border-border text-right">CREDIT</th>
                    <th className="p-3 text-right">RUNNING BALANCE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(glData.lines || []).length === 0 ? (
                    <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No journal lines in this period.</td></tr>
                  ) : (glData.lines || []).slice(0, 200).map((l: any, i: number) => (
                    <tr key={`${l.entryNo}-${l.lineNo}-${i}`} className="hover:bg-muted/30">
                      <td className="p-3 border-r border-border tabular-nums">{l.entryNo}</td>
                      <td className="p-3 border-r border-border tabular-nums">{l.entryDate ? new Date(l.entryDate).toLocaleDateString() : '—'}</td>
                      <td className="p-3 border-r border-border"><span className="tabular-nums">{l.accountCode}</span> · {l.accountName}</td>
                      <td className="p-3 border-r border-border text-muted-foreground">{l.description || l.memo || '—'}</td>
                      <td className="p-3 border-r border-border text-right tabular-nums">{Number(l.debit) ? money(l.debit) : '—'}</td>
                      <td className="p-3 border-r border-border text-right tabular-nums">{Number(l.credit) ? money(l.credit) : '—'}</td>
                      <td className="p-3 text-right tabular-nums">{money(l.runningBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(glData.lines || []).length > 200 && (
                <p className="p-3 text-[11px] text-muted-foreground text-center">Showing the first 200 of {glData.lineCount} lines — export CSV for the full ledger.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: REVENUE TELEMETRY */}
      {activeReportTab === 'revenue-telemetry' && (
        <div className="animate-fade-in p-6 bg-muted/30 min-h-[500px] space-y-6">
          <div className="bg-card border border-border p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <span className="text-[11px] text-muted-foreground/70 uppercase">Revenue // Last 14 days</span>
                <h2 className="text-sm font-semibold tabular-nums uppercase text-foreground">Daily Revenue</h2>
              </div>
              <span className="font-semibold text-[13px] tabular-nums">
                MTD: ${(Number(revMtd.mtd_revenue) || 0).toFixed(2)}
              </span>
            </div>

            {revLoading ? (
              <p className="p-8 text-center text-muted-foreground text-[13px]">Loading revenue…</p>
            ) : revDaily.length === 0 ? (
              <p className="p-12 text-center text-muted-foreground text-[13px]">
                No revenue data yet. Completed payments will appear here.
              </p>
            ) : (
              <>
                <div className="border border-border p-4 bg-muted/30 h-[220px] flex items-end justify-between gap-2">
                  {revDaily.map((d) => {
                    const max = Math.max(...revDaily.map((x) => Number(x.revenue)), 1);
                    const h = Math.max(2, (Number(d.revenue) / max) * 100);
                    const dt = new Date(d.day);
                    return (
                      <div key={d.day} className="flex-1 flex flex-col items-center h-full justify-end" title={`${d.day}: $${Number(d.revenue).toFixed(2)}`}>
                        <div className="w-full bg-black hover:opacity-80 transition-opacity" style={{ height: `${h}%` }}></div>
                        <span className="text-[10px] mt-2 font-semibold text-muted-foreground">
                          {dt.toLocaleDateString(undefined, { weekday: 'narrow' })}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-[13px] text-foreground pt-4">
                  <div className="border border-border p-3 bg-card">
                    <span className="text-[9px] uppercase font-semibold text-muted-foreground/70">Gross Receipts (MTD)</span>
                    <p className="text-base font-semibold mt-1 tabular-nums">${(Number(revMtd.mtd_revenue) || 0).toFixed(2)}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">All succeeded/captured payments, before refunds</p>
                  </div>
                  <div className="border border-border p-3 bg-card">
                    <span className="text-[9px] uppercase font-semibold text-muted-foreground/70">MTD Revenue</span>
                    <p className="text-base font-semibold mt-1 tabular-nums">${(Number(revMtd.mtd_revenue) || 0).toFixed(2)}</p>
                  </div>
                  <div className="border border-border p-3 bg-card">
                    <span className="text-[9px] uppercase font-semibold text-muted-foreground/70">MTD Payments</span>
                    <p className="text-base font-semibold mt-1 tabular-nums">{revMtd.mtd_payments ?? 0}</p>
                  </div>
                  <div className="border border-border p-3 bg-card">
                    <span className="text-[9px] uppercase font-semibold text-muted-foreground/70">Avg Ticket (MTD)</span>
                    <p className="text-base font-semibold mt-1 tabular-nums">${(Number(revMtd.avg_ticket) || 0).toFixed(2)}</p>
                  </div>
                  <div className="border border-border p-3 bg-card">
                    <span className="text-[9px] uppercase font-semibold text-muted-foreground/70">Disputes YTD</span>
                    <p className="text-base font-semibold mt-1 tabular-nums">
                      {revDisputes.ytd_disputes ?? 0} (${(Number(revDisputes.ytd_dispute_amount) || 0).toFixed(2)})
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: DISPUTES & CHARGEBACKS */}
      {activeReportTab === 'disputes-chargebacks' && (
        <div className="animate-fade-in p-6 bg-muted/30 min-h-[500px] grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* CHARGEBACKS YTD — the named aggregate for this report, from
              the live disputes list (opened in the current year). */}
          <div className="lg:col-span-12 grid grid-cols-2 md:grid-cols-4 gap-4">
            {(() => {
              const yr = new Date().getFullYear();
              const ytd = disputesList.filter((d) => d.opened_at && new Date(d.opened_at).getFullYear() === yr);
              const ytdAmt = ytd.reduce((s, d) => s + Number(d.amount || 0), 0);
              const open = disputesList.filter((d) => d.status === 'open' || d.status === 'under_review').length;
              return (
                <>
                  <div className="border border-border p-3 bg-card">
                    <span className="text-[9px] uppercase font-semibold text-muted-foreground/70">Chargebacks YTD ({yr})</span>
                    <p className="text-base font-semibold mt-1 tabular-nums">{ytd.length}</p>
                  </div>
                  <div className="border border-border p-3 bg-card">
                    <span className="text-[9px] uppercase font-semibold text-muted-foreground/70">Chargeback Amount YTD</span>
                    <p className="text-base font-semibold mt-1 tabular-nums">${ytdAmt.toFixed(2)}</p>
                  </div>
                  <div className="border border-border p-3 bg-card">
                    <span className="text-[9px] uppercase font-semibold text-muted-foreground/70">Open / Under Review</span>
                    <p className="text-base font-semibold mt-1 tabular-nums">{open}</p>
                  </div>
                  <div className="border border-border p-3 bg-card">
                    <span className="text-[9px] uppercase font-semibold text-muted-foreground/70">Source</span>
                    <p className="text-[11px] font-semibold mt-1">commerce_disputes · live</p>
                  </div>
                </>
              );
            })()}
          </div>
          {/* DISPUTES INTAKE */}
          <div className="lg:col-span-5 bg-card border border-border flex flex-col">
            <div className="bg-muted/40 border-b border-border p-3 tabular-nums font-semibold text-[13px] uppercase flex justify-between items-center">
              <span>DISPUTES INTAKE</span>
              <span className="text-[10px] bg-muted border border-border px-1.5 py-0.5">COMMERCE_DISPUTES · LOCAL RECORDS</span>
            </div>
            <div className="divide-y divide-border overflow-y-auto flex-1 h-[450px] custom-scrollbar bg-card text-[12px]">
              {disputesLoading ? (
                <p className="p-8 text-center text-muted-foreground">Loading disputes…</p>
              ) : disputesList.length === 0 ? (
                <p className="p-12 text-center text-muted-foreground text-[13px]">
                  No disputes on record in commerce_disputes for this business.
                </p>
              ) : disputesList.map(disp => (
                <button
                  key={disp.id}
                  onClick={() => { setSelectedDispute(disp.id); setDisputeNotice(null); }}
                  className={`w-full text-left p-4 space-y-2 cursor-pointer transition-colors block border-none ${
                    selectedDispute === disp.id ? 'bg-muted/40' : 'hover:bg-muted/30 bg-card'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{disp.dispute_number || disp.id.slice(0, 8)}</span>
                    <span className="text-destructive font-semibold">${Number(disp.amount).toFixed(2)}</span>
                  </div>
                  <p className="text-muted-foreground truncate max-w-[280px]">{disp.reason || '—'}</p>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground/70 font-medium">
                    <span>Opened: {disp.opened_at ? new Date(disp.opened_at).toLocaleDateString() : '—'}</span>
                    <span className={`text-[9px] font-semibold border px-2 py-0.5 uppercase ${
                      disp.status === 'open' ? 'bg-warning/10 border-warning/20 text-warning animate-pulse' :
                      disp.status === 'won' ? 'bg-success/10 border-success/20 text-success' :
                      'bg-muted/40 border-border text-muted-foreground'
                    }`}>
                      {disp.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* RESPONSE EVIDENCE BUILDER */}
          <div className="lg:col-span-7 bg-card border border-border">
            {(() => {
              const disp = disputesList.find(d => d.id === selectedDispute);
              if (!disp) return <div className="p-6 text-[12px] text-muted-foreground/70 text-center">Select a dispute case from the intake list.</div>;
              const actionable = disp.status === 'open' || disp.status === 'under_review';

              return (
                <div className="p-4 space-y-4">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <div>
                      <span className="text-[11px] bg-primary text-primary-foreground px-1.5 py-0.5 font-semibold uppercase">DISPUTE DETAIL // {disp.dispute_number || disp.id.slice(0, 8)}</span>
                      <h3 className="text-sm font-semibold tabular-nums mt-1.5 uppercase">{disp.reason || 'Dispute'}</h3>
                    </div>
                    <span className="text-destructive font-semibold text-sm tabular-nums">${Number(disp.amount).toFixed(2)}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-[12px]">
                    <div>
                      <span className="text-[9px] text-muted-foreground/70 font-semibold uppercase">REASON CODE / CLAIM</span>
                      <p className="font-semibold text-foreground mt-1">{disp.reason || '—'}</p>
                    </div>
                    <div>
                      <span className="text-[9px] text-muted-foreground/70 font-semibold uppercase">OPENED</span>
                      <p className="font-semibold text-foreground mt-1">{disp.opened_at ? new Date(disp.opened_at).toLocaleDateString() : '—'}</p>
                    </div>
                    <div>
                      <span className="text-[9px] text-muted-foreground/70 font-semibold uppercase">STATUS</span>
                      <p className="font-semibold text-foreground mt-1 uppercase">{disp.status.replace(/_/g, ' ')}</p>
                    </div>
                    <div>
                      <span className="text-[9px] text-muted-foreground/70 font-semibold uppercase">RESPONSE DUE</span>
                      <p className="font-semibold text-foreground mt-1">{disp.due_at ? new Date(disp.due_at).toLocaleDateString() : '—'}</p>
                    </div>
                  </div>

                  {disputeNotice && (
                    <div className="border border-border bg-muted/40 p-3 text-[11px] text-foreground">{disputeNotice}</div>
                  )}

                  {actionable ? (
                    <form onSubmit={handleDisputeSubmit} className="space-y-4">
                      <div>
                        <label className="block font-medium text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Response Evidence Pack &amp; Grooming Logs *</label>
                        <textarea
                          required
                          value={responseEvidence}
                          onChange={(e) => setResponseEvidence(e.target.value)}
                          rows={4}
                          className="w-full bg-card border border-border p-2 text-[12px] focus:outline-none text-foreground placeholder:text-muted-foreground/50"
                          placeholder="e.g. Signed waiver on file, grooming completion notes, and service photos — recorded on the dispute and audit-logged."
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Recording evidence saves it on the dispute in this app (status → under review) and writes an audit row.
                        Submitting to Stripe assembles the pack from the real payment and customer records (the text above
                        rides as the evidence narrative) and sends it via Stripe&apos;s disputes evidence flow, recording the
                        submission on the dispute. A dispute with no Stripe dispute id{disp.processor_dispute_id ? '' : ' — like this one'} cannot
                        be submitted{disp.processor_dispute_id ? '' : ' — it is a local record only'}.
                      </p>
                      <button
                        type="submit"
                        disabled={disputeBusy}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 border border-border px-4 py-2 text-[12px] uppercase tracking-wider font-semibold transition-colors cursor-pointer rounded-lg w-full disabled:opacity-50"
                      >
                        {disputeBusy ? 'RECORDING…' : 'RECORD EVIDENCE & MARK UNDER REVIEW'}
                      </button>
                      <button
                        type="button"
                        onClick={handleDisputeStripeSubmit}
                        disabled={disputeBusy || !disp.processor_dispute_id}
                        title={disp.processor_dispute_id ? 'Assemble the evidence pack and submit it to Stripe' : 'This dispute has no Stripe dispute id — local record only'}
                        className="bg-card hover:bg-muted/40 border border-border px-4 py-2 text-[12px] uppercase tracking-wider font-semibold transition-colors cursor-pointer rounded-lg w-full disabled:opacity-50"
                      >
                        {disputeBusy ? 'WORKING…' : 'SUBMIT EVIDENCE TO STRIPE'}
                      </button>
                    </form>
                  ) : (
                    <div className="border border-border bg-muted/40 p-3 text-center text-[12px] text-muted-foreground font-semibold uppercase">
                      <span>STATUS: {disp.status.replace(/_/g, ' ')} — NO EVIDENCE ACTION AVAILABLE FOR THIS STATUS IN THIS VIEW.</span>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* TAB CONTENT: SCHEDULED PAYOUTS — the payout schedule as a report
          (seller_payouts via /api/admin/payouts). Execution and approval
          stay on the Payouts door; this tab reports the schedule. */}
      {activeReportTab === 'scheduled-payouts' && (
        <div className="animate-fade-in p-6 bg-muted/30 min-h-[500px] space-y-6">
          <div className="bg-card border border-border p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <span className="text-[11px] text-muted-foreground/70 uppercase">Reports // Seller Payouts</span>
                <h2 className="text-sm font-semibold tabular-nums uppercase text-foreground">Scheduled Payouts</h2>
              </div>
              <a href="/admin/payouts" className="text-[11px] underline">Open the Payouts queue →</a>
            </div>
            {payoutsLoading ? (
              <p className="p-8 text-center text-muted-foreground text-[13px]">Loading payout schedule…</p>
            ) : payoutsError ? (
              <p className="p-8 text-center text-muted-foreground text-[13px]">{payoutsError}</p>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[13px]">
                  {(['pending', 'approved', 'paid', 'on_hold'] as const).map((st) => (
                    <div key={st} className="border border-border p-3 bg-card">
                      <span className="text-[9px] uppercase font-semibold text-muted-foreground/70">{st.replace('_', ' ')}</span>
                      <p className="text-base font-semibold mt-1 tabular-nums">
                        {payoutCounts[st]?.n ?? 0} · ${Number(payoutCounts[st]?.total || 0).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
                {payoutRows.length === 0 ? (
                  <p className="p-8 text-center text-muted-foreground text-[13px]">No payouts on the schedule yet.</p>
                ) : (
                  <div className="overflow-x-auto border border-border">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="bg-muted/40 text-left">
                          <th className="p-3 border-r border-border">Seller</th>
                          <th className="p-3 border-r border-border text-right">Amount</th>
                          <th className="p-3 border-r border-border">Status</th>
                          <th className="p-3 border-r border-border">Scheduled</th>
                          <th className="p-3">Paid</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payoutRows.slice(0, 100).map((p) => (
                          <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                            <td className="p-3 border-r border-border">{p.seller_name || '—'}</td>
                            <td className="p-3 border-r border-border text-right tabular-nums">${Number(p.amount || 0).toFixed(2)}</td>
                            <td className="p-3 border-r border-border uppercase">{p.status}</td>
                            <td className="p-3 border-r border-border tabular-nums">{p.scheduled_at ? new Date(p.scheduled_at).toLocaleDateString() : '—'}</td>
                            <td className="p-3 tabular-nums">{p.paid_at ? new Date(p.paid_at).toLocaleDateString() : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
