'use client';

// ============================================================================
// PlatformAnalyticsView — Admin tree §I ANALYTICS ADMIN, mounted at the
// top of /admin/analytics above the Master Tree B.9 salon report runner
// (AnalyticsView, untouched — the B.9 base that was already live).
//   I1 Platform Metrics — computed at read from the commerce spine.
//   I2 Seller Analytics — the KPI machinery: definitions (configuration
//        seeded from Sunny's text), computed facts + snapshots per
//        seller, category performance, listing quality, and Search
//        performance served as its stated absence. The Compute button
//        runs the writer (POST action 'compute', audited).
//   I3 Customer Analytics — cohorts, lifetime value (recorded + computed
//        legs, never blended), churn, Search behavior as stated absence.
//   I4 — the governed NL→SQL explorer lives at /admin/analytics/explorer.
// Every number on this face comes from the APIs' live computation over
// real rows; every block names its derivation. Honest zeros where the
// population is zero — nothing is padded.
// ============================================================================

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BarChart3, RefreshCw, Search, Users, Store, Compass } from 'lucide-react';

type Any = Record<string, any>;

const money = (v: number | null | undefined) => (v == null ? '—' : `$${Number(v).toFixed(2)}`);

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="border border-border rounded-lg p-4 bg-card mb-4">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h2 className="font-semibold text-sm">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-border/60 rounded-lg p-3 bg-background">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-bold mt-0.5">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

const Note = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">{children}</p>
);

export const PlatformAnalyticsView: React.FC = () => {
  const [platform, setPlatform] = useState<Any | null>(null);
  const [sellers, setSellers] = useState<Any | null>(null);
  const [customers, setCustomers] = useState<Any | null>(null);
  const [perfAlerts, setPerfAlerts] = useState<Any | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evalMsg, setEvalMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [computing, setComputing] = useState(false);
  const [computeMsg, setComputeMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, s, c] = await Promise.all([
        fetch('/api/admin/analytics/platform').then((r) => r.json()),
        fetch('/api/admin/analytics/sellers').then((r) => r.json()),
        fetch('/api/admin/analytics/customers').then((r) => r.json()),
      ]);
      if (p.error) throw new Error(p.error);
      if (s.error) throw new Error(s.error);
      if (c.error) throw new Error(c.error);
      setPlatform(p); setSellers(s); setCustomers(c);
      // A4 performance alerts are their own store/route — a failure there
      // must not blank the analytics face, so this leg is best-effort.
      fetch('/api/admin/sellers/performance-alerts')
        .then((r) => r.json())
        .then((d) => { if (!d.error) setPerfAlerts(d); })
        .catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load analytics');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const compute = async () => {
    setComputing(true); setComputeMsg(null);
    try {
      const res = await fetch('/api/admin/analytics/sellers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'compute' }),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setComputeMsg(`Compute run recorded: ${res.factsWritten} facts, ${res.snapshotsWritten} KPI snapshots across ${res.sellersComputed} seller(s).`);
      await load();
    } catch (e) {
      setComputeMsg(e instanceof Error ? e.message : 'Compute failed');
    } finally { setComputing(false); }
  };

  const evaluateAlerts = async () => {
    setEvaluating(true); setEvalMsg(null);
    try {
      const res = await fetch('/api/admin/sellers/performance-alerts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'evaluate' }),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      const notComputable = (res.outcomes || []).filter((o: Any) => o.outcome === 'not_computable').length;
      setEvalMsg(`Evaluation recorded: ${res.alertsWritten} alert(s) written, ${(res.outcomes || []).length} seller/KPI outcome(s)${notComputable ? `, ${notComputable} not computable (no attributed orders)` : ''}.`);
      await load();
    } catch (e) {
      setEvalMsg(e instanceof Error ? e.message : 'Evaluation failed');
    } finally { setEvaluating(false); }
  };

  const acknowledgeAlert = async (id: string) => {
    try {
      await fetch('/api/admin/sellers/performance-alerts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'acknowledge', alert_id: id }),
      });
      await load();
    } catch { /* the list reload shows the true state either way */ }
  };

  if (error) return <div className="border border-border rounded-lg p-4 bg-card mb-4 text-sm text-destructive">{error}</div>;
  if (!platform || !sellers || !customers) {
    return <div className="border border-border rounded-lg p-4 bg-card mb-4 text-sm text-muted-foreground">Loading platform analytics…</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          <h1 className="text-lg font-bold">Analytics Admin — Platform · Seller · Customer</h1>
        </div>
        <Link href="/admin/analytics/explorer" className="text-[12px] font-semibold border border-border rounded-lg px-3 py-1.5 bg-card hover:bg-muted/40 flex items-center gap-1.5">
          <Compass className="w-3.5 h-3.5" /> I4 · Data Explorer
        </Link>
      </div>

      {/* ── I1 · Platform Metrics ─────────────────────────────────────── */}
      <Section icon={<BarChart3 className="w-4 h-4" />} title="I1 · Platform Metrics">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <Stat label="GMV (all time)" value={money(platform.gmv.allTime)} sub={`${money(platform.gmv.last30d)} last 30d`} />
          <Stat label="Orders" value={String(platform.orders.allTime)} sub={`${platform.orders.last30d} last 30d`} />
          <Stat label="Returns recorded" value={String(platform.returns.total)} sub={`customer ${platform.returns.customerRequests} · RMA ${platform.returns.rmaAuthorizations} · seller ${platform.returns.sellerRequests}`} />
          <Stat label="Refunds (records)" value={money(platform.refunds.recordsCompletedAmount)} sub={`${platform.refunds.recordsCompletedCount} completed records`} />
          <Stat label="Revenue (collected)" value={money(platform.revenue.allTime)} sub={`${platform.revenue.paymentCount} payments · ${money(platform.revenue.last30d)} last 30d`} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {platform.orders.byStatus.map((s: Any) => (
            <span key={s.status} className="text-[11px] border border-border/60 rounded px-2 py-0.5 bg-background">{s.status}: {s.count}</span>
          ))}
          <span className="text-[11px] border border-border/60 rounded px-2 py-0.5 bg-background">
            payments marked refunded: {money(platform.refunds.paymentsRefundedAmount)} ({platform.refunds.paymentsRefundedCount})
          </span>
        </div>
        <Note>GMV — {platform.gmv.derivation}</Note>
        <Note>Refunds — {platform.refunds.derivation}</Note>
        <Note>Revenue — {platform.revenue.derivation}</Note>
      </Section>

      {/* ── I2 · Seller Analytics ─────────────────────────────────────── */}
      <Section icon={<Store className="w-4 h-4" />} title="I2 · Seller Analytics — KPI machinery (A4)">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[12px] text-muted-foreground">
            {(sellers.seededConfiguration.kpiSeeded.length + sellers.seededConfiguration.metricSeeded.length) > 0
              ? `Seeded definition configuration this read: ${[...sellers.seededConfiguration.kpiSeeded, ...sellers.seededConfiguration.metricSeeded].join(', ')}. `
              : ''}
            Definitions are configuration from the tree&apos;s text; targets/thresholds are unset — no delivered text names a number for any KPI.
          </p>
          <button onClick={compute} disabled={computing}
            className="bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1.5 text-[11px] font-semibold rounded-lg flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shrink-0">
            <RefreshCw className="w-3 h-3" /> {computing ? 'COMPUTING…' : 'RUN KPI COMPUTE'}
          </button>
        </div>
        {computeMsg && <p className="text-[11px] mb-2">{computeMsg}</p>}

        {sellers.sellers.length === 0 && <p className="text-[12px] text-muted-foreground">No sellers recorded for this tenant.</p>}
        {sellers.sellers.map((s: Any) => (
          <div key={s.id} className="border border-border/60 rounded-lg p-3 bg-background mb-2">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-[13px]">{s.name ?? s.id} <span className="text-muted-foreground font-normal">· {s.status} · {s.sellerType}</span></div>
              <div className="text-[11px] text-muted-foreground">
                Payout tier (admin-assigned record): {s.payoutTier.proTier ?? 'not recorded'} — KPI compute does not assign tiers
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
              {Object.keys(s.facts).length === 0 && (
                <p className="text-[11px] text-muted-foreground col-span-full">No computed facts yet — run the KPI compute.</p>
              )}
              {(Object.entries(s.facts) as [string, Any][]).map(([k, f]) => (
                <div key={k} className="border border-border/40 rounded p-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</div>
                  <div className="text-sm font-bold">{f.value}</div>
                </div>
              ))}
              {(Object.entries(s.kpiSnapshots) as [string, Any][]).map(([k, f]) => (
                <div key={k} className="border border-border/40 rounded p-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">KPI · {k}</div>
                  <div className="text-sm font-bold">{f.value}</div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Listing quality: {s.listingQuality.withRecordedScore} of {s.listingQuality.listings} listings carry a recorded health score
              {s.listingQuality.meanRecordedScore != null ? ` — mean ${s.listingQuality.meanRecordedScore}` : ''}.
            </p>
          </div>
        ))}

        <h3 className="font-semibold text-[12px] mt-3 mb-1">Category performance (from seller listings)</h3>
        {sellers.categoryPerformance.rows.length === 0
          ? <p className="text-[11px] text-muted-foreground">No seller listings recorded — category performance is honestly empty. Order/GMV performance by category is not computable: orders carry no seller or listing attribution.</p>
          : (
            <table className="w-full text-[12px]">
              <thead><tr className="text-left text-muted-foreground"><th className="py-1">Category</th><th>Listings</th><th>Approved</th><th>Avg price</th></tr></thead>
              <tbody>
                {sellers.categoryPerformance.rows.map((r: Any, i: number) => (
                  <tr key={i} className="border-t border-border/40"><td className="py-1">{r.categoryName ?? r.categoryId ?? 'Uncategorized'}</td><td>{r.listings}</td><td>{r.approved}</td><td>{money(r.avgPrice)}</td></tr>
                ))}
              </tbody>
            </table>
          )}

        {sellers.notComputableMetrics.length > 0 && (
          <>
            <h3 className="font-semibold text-[12px] mt-3 mb-1">Defined but not computed by the KPI compute</h3>
            <p className="text-[11px] text-muted-foreground">
              {sellers.notComputableMetrics.join(' · ')} — the KPI compute above never writes these rates.
              They are evaluated separately by the A4 performance-alerts run below, from the seller_orders
              attribution bridge (and commerce_orders seller metadata where the bridge holds no rows): a seller
              with no attributed orders gets a recorded &lsquo;not computable — no attributed orders&rsquo; outcome,
              never a fabricated 0. Each definition&apos;s recorded formula states its source.
            </p>
          </>
        )}
        <Note><Search className="w-3 h-3 inline" /> Search performance — {sellers.searchPerformance.derivation}</Note>
      </Section>

      {/* ── A4 · Seller Performance Alerts ────────────────────────────── */}
      <Section icon={<Store className="w-4 h-4" />} title="A4 · Seller Performance Alerts — late shipment & return rate">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[12px] text-muted-foreground">
            Alerts are written to seller_performance_alerts only when a rate computed from real attributed
            orders breaches the threshold configured on its seller_kpi_definitions row. No threshold
            configured → the rate is reported, no alert is written.
          </p>
          <button onClick={evaluateAlerts} disabled={evaluating}
            className="bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1.5 text-[11px] font-semibold rounded-lg flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shrink-0">
            <RefreshCw className="w-3 h-3" /> {evaluating ? 'EVALUATING…' : 'RUN ALERT EVALUATION'}
          </button>
        </div>
        {evalMsg && <p className="text-[11px] mb-2">{evalMsg}</p>}
        {!perfAlerts ? (
          <p className="text-[11px] text-muted-foreground">Performance alerts could not be loaded (the A4 store may need migration 20261083 applied).</p>
        ) : (
          <>
            <p className="text-[12px] mb-2">
              <strong>{perfAlerts.counts.open}</strong> open alert(s) · {perfAlerts.counts.total} recorded
              {perfAlerts.lastEvaluation && <> · last evaluation {String(perfAlerts.lastEvaluation.at).slice(0, 10)} wrote {perfAlerts.lastEvaluation.alerts_written ?? 0} alert(s)</>}
            </p>
            {perfAlerts.note && <p className="text-[11px] text-muted-foreground mb-2">{perfAlerts.note}</p>}
            {perfAlerts.lastEvaluation?.outcomes?.length > 0 && (
              <div className="mb-2 space-y-1">
                {perfAlerts.lastEvaluation.outcomes.map((o: Any, i: number) => (
                  <p key={i} className="text-[11px] text-muted-foreground">
                    {o.kpi}: {o.outcome}{o.value != null ? ` — ${o.value}%` : ''}{o.reason ? ` — ${o.reason}` : ''}
                  </p>
                ))}
              </div>
            )}
            {perfAlerts.alerts.map((a: Any) => (
              <div key={a.id} className="border border-border/60 rounded-lg p-3 bg-background mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-[12px]">
                  <strong>{a.seller_name ?? a.seller_id}</strong> · {a.kpi_key} — {a.metric_value}% vs threshold {a.threshold}%
                  <span className="text-muted-foreground"> · {a.status} · {a.created_at ? String(a.created_at).slice(0, 10) : ''} · source: {a.detail?.attribution_source ?? 'recorded'}</span>
                </div>
                {a.status === 'open' && (
                  <button onClick={() => acknowledgeAlert(a.id)}
                    className="border border-border px-2.5 py-1 text-[11px] font-semibold rounded-lg cursor-pointer hover:bg-muted/40">Acknowledge</button>
                )}
              </div>
            ))}
          </>
        )}
      </Section>

      {/* ── I3 · Customer Analytics ───────────────────────────────────── */}
      <Section icon={<Users className="w-4 h-4" />} title="I3 · Customer Analytics">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="border border-border/60 rounded-lg p-3 bg-background">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Cohorts (by first-record month)</div>
            {customers.cohorts.map((c: Any) => (
              <div key={c.cohort} className="text-[12px] flex justify-between py-0.5">
                <span>{c.cohort}</span>
                <span>{c.customers} customers · {c.withAppointments} w/ appointments · {c.withOrders} w/ orders</span>
              </div>
            ))}
          </div>
          <div className="border border-border/60 rounded-lg p-3 bg-background">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Lifetime value</div>
            <div className="text-[12px]">Recorded on CRM records: {money(customers.lifetimeValue.recordedSum)} total
              ({customers.lifetimeValue.recordedPositiveCustomers} of {customers.lifetimeValue.customers} customers above $0)</div>
            <div className="text-[12px] mt-1">Computed from linked orders: {customers.lifetimeValue.ordersLinked} of {customers.lifetimeValue.ordersTotal} orders carry a CRM customer link</div>
            {customers.lifetimeValue.computedFromLinkedOrders.map((r: Any) => (
              <div key={r.customerId} className="text-[12px] flex justify-between py-0.5"><span>{r.name || r.customerId}</span><span>{money(r.spend)} · {r.orders} order(s)</span></div>
            ))}
          </div>
          <div className="border border-border/60 rounded-lg p-3 bg-background">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Churn (90-day)</div>
            <div className="text-[12px]">Ever active: {customers.churn.everActive} · Active in last 90d: {customers.churn.activeLast90d}</div>
            <div className="text-[12px]">Churned: {customers.churn.churned90d} · Never active: {customers.churn.neverActive}</div>
          </div>
        </div>
        <Note>Lifetime value — {customers.lifetimeValue.derivation}</Note>
        <Note>Churn — {customers.churn.derivation}</Note>
        <Note><Search className="w-3 h-3 inline" /> Search behavior — {customers.searchBehavior.derivation}</Note>
      </Section>

      <p className="text-[11px] text-muted-foreground">
        Below: the Master Tree B.9 salon reports (the analytics base that was already live) — unchanged.
      </p>
    </div>
  );
};
