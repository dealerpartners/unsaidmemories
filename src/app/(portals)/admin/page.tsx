'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  TrendingUp, TrendingDown, Factory, CheckCircle2, TriangleAlert,
  Gem, EyeOff, Eye, RefreshCw, SlidersHorizontal, Play, FileText,
  Receipt, DollarSign, Users, ChevronDown,
} from 'lucide-react';
import { ViewHeader, money, timeAgo } from '@/components/admin/ViewHeader';
import QuickCreateRail from '@/components/admin/quick-create/QuickCreate';
import { useSessionQuery } from '@/lib/hooks/useSessionQuery';
import { MANIFEST } from '@/lib/admin/global-manifest';

// /admin — Operations Vitals (owner's DASHBOARD_VIEW.html, View 1).
// Replaces the redirect-only stub: the manifest has always named /admin
// the dashboard domain's overview route. Every figure comes from
// /api/admin/dashboard/views (erp_orders, acct_ar_invoices,
// acct_payouts, the queue stores) — nothing is hard-coded. The header
// block (greeting + Live Vitals pill, Privacy, Refresh Nodes), the
// five Finance domain pills, and the ⚡ Create actions rail follow the
// owner's QUICK_ACTIONS.html: the rail's actions open dedicated
// creation surfaces (components/admin/quick-create/) rather than
// linking away. Controls with no backend (Customize layout prefs, the
// Create index's "Show all") are omitted rather than faked; see
// notes/dashboard-view-gaps-2026-11-02.md.

type Vitals = {
  gmv: { total: number; last30: number; deltaPct: number | null };
  printRuns: { active: number; slaAdherencePct: number | null; breached: number };
  podPipelines: { connected: number; names: string[]; elevated: string[] };
  overdue: { amount: number; count: number };
  funnel: {
    unpaid: { amount: number; count: number };
    paidCycle: { amount: number; count: number };
    deposited: { amount: number; count: number };
  };
  urgentTasks: Array<{
    id: string; kind: string; severity: 'critical' | 'warning' | 'info';
    title: string; detail: string; meta: string; at: string | null;
    actionLabel: string; href: string;
  }>;
  criticalCount: number;
};

// Finance group badge hexes — the revamp's QB palette, same resolution
// GlobalShell applies to the manifest iconBg strings.
const BADGE_HEX: Record<string, string> = {
  'bg-blue-900': '#1e3a8a', 'bg-qb-maroon': '#6b1e28', 'bg-qb-green': '#1e5a38',
  'bg-qb-teal': '#0e5e6f', 'bg-qb-navy': '#1f2937',
};
const BADGE_ICON: Record<string, typeof Play> = {
  play_arrow: Play, description: FileText, receipt: Receipt,
  attach_money: DollarSign, groups: Users,
};

export default function OperationsVitalsPage() {
  const [vitals, setVitals] = useState<Vitals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const { user } = useSessionQuery();

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/admin/dashboard/views', { cache: 'no-store' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Failed to load vitals');
      setVitals(j.data?.vitals ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load vitals');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const firstName = useMemo(() => {
    const u = user as unknown as { name?: string; email?: string } | null;
    const raw = u?.name ?? null;
    return raw ? raw.split(/\s+/)[0] : null;
  }, [user]);

  const greeting = useMemo(() => {
    const hour = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false }));
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const masked = (v: unknown) => (privacy ? '••••••' : money(v));

  const funnelTotal = (vitals?.funnel.unpaid.count ?? 0) + (vitals?.funnel.paidCycle.count ?? 0);
  const unpaidShare = funnelTotal > 0 ? Math.round(((vitals?.funnel.unpaid.count ?? 0) / funnelTotal) * 100) : 0;
  const paidShare = funnelTotal > 0 ? Math.round(((vitals?.funnel.paidCycle.count ?? 0) / funnelTotal) * 100) : 0;

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1400px] mx-auto p-8">
      <ViewHeader
        title={
          <span className="flex items-center gap-3 flex-wrap">
            {greeting}{firstName ? `, ${firstName}` : ''}!
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold" style={{ backgroundColor: '#8af5be', color: '#006c47' }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#006c47' }} />
              Live Vitals (/admin)
            </span>
          </span>
        }
      >
        <button
          type="button"
          onClick={() => setPrivacy((p) => !p)}
          className="flex items-center gap-1 px-3 py-1.5 bg-card border border-border rounded-md text-sm font-semibold hover:bg-muted/50 text-foreground"
          data-tip={privacy ? 'Show amounts again' : 'Hide money amounts on this page'}
        >
          {privacy ? <Eye size={18} /> : <EyeOff size={18} />} Privacy
        </button>
        <button
          type="button"
          onClick={load}
          disabled={refreshing}
          className="flex items-center gap-1 px-4 py-1.5 rounded-md text-sm font-semibold text-white shadow-sm disabled:opacity-60"
          style={{ backgroundColor: '#171420', color: '#ffffff' }}
        >
          <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} /> Refresh Nodes
        </button>
      </ViewHeader>

      {error ? (
        <p className="text-[13px] flex items-center gap-2" style={{ color: '#b3261e' }}>
          <TriangleAlert size={14} /> {error}
        </p>
      ) : null}

      {/* Finance group chips — first route of each group in the manifest */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {MANIFEST.finance.groups.map((g) => {
          const Icon = BADGE_ICON[g.icon ?? ''] ?? Play;
          return (
            <Link
              key={g.group}
              href={g.routes[0]?.route ?? '/admin/dashboard'}
              className="flex items-center gap-2 px-3.5 py-1.5 bg-card border border-border rounded-full shadow-sm text-sm font-medium shrink-0 hover:border-[#0a6400]"
            >
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: BADGE_HEX[g.iconBg ?? ''] ?? '#1f2937' }}>
                <Icon size={12} />
              </span>
              <span>{g.group}</span>
            </Link>
          );
        })}
      </div>

      {/* ⚡ Create actions rail — the owner's QUICK_ACTIONS.html: every
          action opens its dedicated creation surface (overlays for
          Invoice/Bill, right drawers for the rest) instead of linking
          away. The surfaces live in components/admin/quick-create/. */}
      <QuickCreateRail />

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Gross Merchandise Vol</span>
          <div className="text-3xl font-semibold mt-2 mb-1">{vitals ? masked(vitals.gmv.total) : '—'}</div>
          <span className="text-xs font-medium flex items-center gap-1" style={{ color: '#0a6400' }}>
            {vitals?.gmv.deltaPct != null ? (
              <>
                {vitals.gmv.deltaPct >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {vitals.gmv.deltaPct >= 0 ? '+' : ''}{vitals.gmv.deltaPct}% vs last cycle
              </>
            ) : (
              <>{money(vitals?.gmv.last30)} in the last 30 days</>
            )}
          </span>
        </div>
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Print Runs</span>
          <div className="text-3xl font-semibold mt-2 mb-1">{vitals ? `${vitals.printRuns.active} Orders` : '—'}</div>
          <span className="text-xs font-medium flex items-center gap-1" style={{ color: '#006c47' }}>
            <Factory size={14} />
            {vitals?.printRuns.slaAdherencePct != null
              ? `${vitals.printRuns.slaAdherencePct}% SLA adherence (${vitals.printRuns.breached} breached)`
              : 'No SLA deadlines recorded yet'}
          </span>
        </div>
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">POD Sync Pipelines</span>
          <div className="text-3xl font-semibold mt-2 mb-1">{vitals ? `${vitals.podPipelines.connected} Connected` : '—'}</div>
          <span className="text-xs font-medium flex items-center gap-1" style={{ color: '#0a6400' }}>
            <CheckCircle2 size={14} />
            {vitals && vitals.podPipelines.elevated.length > 0
              ? vitals.podPipelines.elevated.join(', ')
              : 'Suppliers with synced catalogs'}
          </span>
        </div>
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Overdue Ledger Accruals</span>
          <div className="text-3xl font-semibold mt-2 mb-1" style={{ color: '#ba1a1a' }}>{vitals ? masked(vitals.overdue.amount) : '—'}</div>
          <span className="text-xs font-medium flex items-center gap-1" style={{ color: '#ba1a1a' }}>
            <TriangleAlert size={14} /> {vitals?.overdue.count ?? 0} invoices flagged
          </span>
        </div>
      </div>

      {/* Sales & Get Paid funnel */}
      <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold uppercase tracking-wider">Sales &amp; Get Paid Funnel</span>
            <span className="text-xs text-muted-foreground">Real-time settlement lifecycle</span>
          </div>
          <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground border border-border px-2.5 py-1 rounded bg-card">
            Last 30 days <ChevronDown size={16} />
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="border border-border rounded-lg p-4 bg-muted/40 flex flex-col justify-between">
            <div>
              <h3 className="font-semibold text-sm mb-0.5">Payment Request</h3>
              <p className="text-xs text-muted-foreground mb-3">Send customer payment links</p>
              <Link href="/admin/integrations" className="text-xs hover:underline flex items-center gap-1 font-semibold" style={{ color: '#0077c5' }}>
                <Gem size={14} /> Stripe Connect
              </Link>
            </div>
            <div className="mt-4">
              <Link href="/admin/invoices" className="inline-flex items-center gap-1 px-3 py-1.5 bg-card border border-border rounded-full text-xs font-semibold hover:bg-muted/60">
                Request payment <ChevronDown size={14} />
              </Link>
            </div>
          </div>
          <div className="border border-border rounded-lg p-4 bg-card flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
              <span>UNPAID INVOICES</span>
              <span className="font-bold" style={{ color: '#ba1a1a' }}>{vitals?.funnel.unpaid.count ?? 0} Due</span>
            </div>
            <div className="my-2"><span className="text-3xl font-semibold">{vitals ? masked(vitals.funnel.unpaid.amount) : '—'}</span></div>
            <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
              <div className="h-full" style={{ backgroundColor: '#ba1a1a', width: `${unpaidShare}%` }} />
            </div>
          </div>
          <div className="border border-border rounded-lg p-4 bg-card flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
              <span>PAID THIS CYCLE</span>
              <span className="font-bold" style={{ color: '#0a6400' }}>{vitals?.funnel.paidCycle.count ?? 0} Settled</span>
            </div>
            <div className="my-2"><span className="text-3xl font-semibold">{vitals ? masked(vitals.funnel.paidCycle.amount) : '—'}</span></div>
            <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
              <div className="h-full" style={{ backgroundColor: '#0a6400', width: `${paidShare}%` }} />
            </div>
          </div>
          <div className="border border-border rounded-lg p-4 bg-card flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
              <span>DEPOSITED IN BANK</span>
              <span className="font-bold" style={{ color: '#006c47' }}>ACH Clearing</span>
            </div>
            <div className="my-2"><span className="text-3xl font-semibold">{vitals ? masked(vitals.funnel.deposited.amount) : '—'}</span></div>
            <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
              <div className="h-full" style={{ backgroundColor: '#006c47', width: vitals && vitals.funnel.paidCycle.amount > 0 ? `${Math.min(100, Math.round((vitals.funnel.deposited.amount / vitals.funnel.paidCycle.amount) * 100))}%` : '0%' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Urgent operational tasks */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/30">
          <div>
            <h2 className="text-sm font-bold">Urgent Operational Tasks</h2>
            <p className="text-xs text-muted-foreground">Actionable items requiring operator attention today.</p>
          </div>
          {vitals && vitals.criticalCount > 0 ? (
            <span className="px-2.5 py-1 rounded-full font-bold text-[11px]" style={{ backgroundColor: '#ffdad6', color: '#93000a' }}>
              {vitals.criticalCount} Critical Deadlines
            </span>
          ) : null}
        </div>
        <div className="divide-y divide-border text-sm">
          {!vitals ? (
            <p className="px-5 py-4 text-muted-foreground text-[13px]">Loading tasks…</p>
          ) : vitals.urgentTasks.length === 0 ? (
            <p className="px-5 py-4 text-muted-foreground text-[13px]">Nothing urgent right now — no SLA breaches, stock alerts, verifications, or high-priority tasks are open.</p>
          ) : (
            vitals.urgentTasks.map((t) => (
              <div key={t.id} className="px-5 py-3.5 flex items-center justify-between hover:bg-muted/40 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: t.severity === 'critical' ? '#ba1a1a' : t.severity === 'warning' ? '#f97316' : '#0077c5' }}
                  />
                  <div className="min-w-0">
                    <span className="font-semibold text-sm block truncate">{t.title}</span>
                    <p className="text-xs text-muted-foreground truncate">{t.detail}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs font-medium" style={{ color: t.severity === 'critical' ? '#ba1a1a' : undefined }}>
                    {t.meta || (t.at ? timeAgo(t.at) : '')}
                  </span>
                  <Link href={t.href} className="px-3 py-1 bg-card border border-border rounded text-xs font-semibold hover:bg-[#0a6400] hover:text-white">
                    {t.actionLabel}
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
        <SlidersHorizontal size={13} /> Customize for this page is not wired yet — dashboard layout preferences have no store yet (see the dashboard gap list).
      </p>
    </div>
  );
}
