'use client';

// ============================================================================
// AnalyticsDashboard — the Analytics & Reports landing page (Dashboard, the
// module's first tree child), rebuilt 2026-10-31 for the design unification
// (owner ruling 2026-10-30 21:32: the imported Orders + Accounting design is
// THE admin design system).
//
// Every number here comes from GET /api/admin/analytics, computed at read
// from real rows: orders + revenue from erp_orders (the ledger the Orders
// module and customer accounts run on), customers from crm_customers,
// accounts from Supabase auth, carts from carts, products from products,
// catalog size from supplier_catalog_products, stock from
// erp_inventory_balances, tickets from support_tickets. There is no visit
// tracking in this database, so there is no Website Visits card — a card
// with no real source does not ship. Full census: ANALYTICS-CENSUS.md.
//
// This component replaces the two faces previously stacked on this page —
// the commerce-spine PlatformAnalyticsView (wrong ledger, "DB unavailable"
// 503 path) and the analytics report runner AnalyticsView (concepts that
// do not exist in Unsaid). Both component files are untouched on disk per
// the component-preservation law; they are simply no longer mounted here.
// ============================================================================

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BarChart3, Compass, RefreshCw } from 'lucide-react';

type Kpis = {
  revenueToday: number;
  revenue30: number;
  ordersTotal: number;
  orders30: number;
  newCustomers30: number;
  totalCustomers: number;
  accountsCreated30: number;
  totalAccounts: number;
  carts30: number;
  checkoutConversion30: number | null;
  productsPublished: number;
  productsTotal: number;
  catalogProducts: number;
  lowStockCount: number;
  openTickets: number;
};

type RecentOrder = {
  id: string;
  order_number: string | null;
  total: number;
  status: string | null;
  created_at: string;
};

const money = (v: number) => `$${Number(v ?? 0).toFixed(2)}`;
const num = (v: number) => Number(v ?? 0).toLocaleString('en-US');
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function KpiTile({ label, value, foot }: { label: string; value: string; foot?: string }) {
  return (
    <div className="border border-border rounded-lg p-3 bg-background">
      <div className="text-[11px] uppercase tracking-wide font-semibold text-foreground">{label}</div>
      <div className="text-lg font-bold mt-0.5 text-foreground">{value}</div>
      {foot && <div className="text-[11px] text-muted-foreground mt-0.5">{foot}</div>}
    </div>
  );
}

export default function AnalyticsDashboard() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [recent, setRecent] = useState<RecentOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/analytics');
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'The numbers could not be loaded.');
      setKpis(json.kpis as Kpis);
      setRecent((json.recentOrders ?? []) as RecentOrder[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The numbers could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col w-full bg-background text-foreground p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          <div>
            <h1 className="text-lg font-bold leading-tight">Analytics &amp; Reports</h1>
            <p className="text-[12px] text-foreground">
              The store&apos;s numbers from live records — orders, customers, accounts, carts, products and support.
            </p>
          </div>
        </div>
        <Link
          href="/admin/analytics/explorer"
          className="bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1.5 text-[12px] font-semibold rounded-lg flex items-center gap-1.5"
        >
          <Compass className="w-3.5 h-3.5" /> Reports Explorer
        </Link>
      </div>

      {loading && <p className="text-[13px] text-foreground">Loading the latest numbers…</p>}

      {error && (
        <div className="border border-border rounded-lg p-4 bg-card">
          <p className="text-[13px] text-foreground font-semibold">The numbers could not be loaded.</p>
          <p className="text-[12px] text-foreground mt-1">{error}</p>
          <button
            onClick={load}
            className="mt-3 bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1.5 text-[12px] font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Try again
          </button>
        </div>
      )}

      {kpis && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
            <KpiTile label="Revenue today" value={money(kpis.revenueToday)} foot="From today's orders" />
            <KpiTile label="Revenue (30 days)" value={money(kpis.revenue30)} foot="From the orders ledger" />
            <KpiTile label="Orders (30 days)" value={num(kpis.orders30)} foot={`${num(kpis.ordersTotal)} orders in total`} />
            <KpiTile label="New customers (30 days)" value={num(kpis.newCustomers30)} foot={`${num(kpis.totalCustomers)} customers in total`} />
            <KpiTile label="Accounts created (30 days)" value={num(kpis.accountsCreated30)} foot={`${num(kpis.totalAccounts)} accounts in total`} />
            <KpiTile
              label="Carts started (30 days)"
              value={num(kpis.carts30)}
              foot={kpis.checkoutConversion30 == null ? 'Checkout funnel entry' : `${kpis.checkoutConversion30}% reached an order`}
            />
            <KpiTile label="Published products" value={num(kpis.productsPublished)} foot={`of ${num(kpis.productsTotal)} products`} />
            <KpiTile label="Catalog products" value={num(kpis.catalogProducts)} foot="Supplier catalog, all sources" />
            <KpiTile label="Low stock" value={num(kpis.lowStockCount)} foot="Items at 5 or fewer on hand" />
            <KpiTile label="Open support tickets" value={num(kpis.openTickets)} foot="Waiting on the support desk" />
          </div>

          <div className="border border-border rounded-lg bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background">
              <h2 className="font-semibold text-sm text-foreground">Recent orders</h2>
              <span className="text-[11px] font-semibold text-foreground">From the orders ledger</span>
            </div>
            {recent.length === 0 ? (
              <p className="px-4 py-3 text-[13px] text-foreground">No orders yet.</p>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-4 py-2 font-semibold text-foreground">Order</th>
                    <th className="px-4 py-2 font-semibold text-foreground">Date</th>
                    <th className="px-4 py-2 font-semibold text-foreground">Status</th>
                    <th className="px-4 py-2 font-semibold text-foreground text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((o) => (
                    <tr key={o.id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2 font-semibold text-foreground">{o.order_number || o.id.slice(0, 8)}</td>
                      <td className="px-4 py-2 text-foreground">{fmtDate(o.created_at)}</td>
                      <td className="px-4 py-2 text-foreground">{o.status || '—'}</td>
                      <td className="px-4 py-2 text-foreground text-right">{money(o.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
