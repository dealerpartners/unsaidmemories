'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// ============================================================================
// BillsView — 3.9 Purchases (accounting views, NOT duplicate tables)
//
//   Bills              → accounting VIEW over erp_purchase_orders (+ vendors).
//                        Read-only here; POs are managed in 2.x / purchase-orders.
//   Products & Services → accounting VIEW over the catalog (commerce_catalog_items
//                        via /api/admin/products). Read-only price reference.
//   Suppliers           → links to the existing /admin/vendors page (same data).
// ============================================================================

type Bill = {
  id: string; po_number: string; status: string; order_date: string | null;
  expected_date: string | null; subtotal: number; tax_total: number;
  shipping_total: number; total: number; currency: string;
  vendor_name: string | null; vendor_code: string | null; created_at: string;
};

type Product = {
  id: string; name: string; sku?: string | null;
  base_price?: string | null; sale_price?: string | null;
  stock?: number | null; active?: boolean;
};

const money = (n: any) => `$${(Number(n) || 0).toFixed(2)}`;

export const BillsView: React.FC = () => {
  const router = useRouter();
  const [tab, setTab] = useState<'bills' | 'products'>('bills');
  const [bills, setBills] = useState<Bill[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // §3.9 pay leg: payments recorded against bills live in
  // acct_ap_payments (reference = PO number) via
  // POST /api/admin/accounting/bills/[id]/pay; the paid map comes from
  // GET /api/admin/accounting/bills.
  const [paidByPo, setPaidByPo] = useState<Record<string, { paid: number; paymentCount: number }>>({});
  const [payFor, setPayFor] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('bank_transfer');
  const [payBusy, setPayBusy] = useState(false);
  const [payMsg, setPayMsg] = useState<string | null>(null);

  const loadPaid = async () => {
    try {
      const r = await fetch('/api/admin/accounting/bills', { cache: 'no-store' });
      if (r.ok) { const d = await r.json(); setPaidByPo(d.paidByPo || {}); }
    } catch { /* the list still renders without payment state */ }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [poRes, prodRes] = await Promise.all([
          fetch('/api/admin/purchase-orders?tab=all', { cache: 'no-store' }),
          fetch('/api/admin/products', { cache: 'no-store' }),
        ]);
        if (!alive) return;
        if (poRes.ok) {
          const d = await poRes.json();
          setBills(d.purchaseOrders || []);
        }
        if (prodRes.ok) {
          const d = await prodRes.json();
          setProducts(d.products || []);
        }
        loadPaid();
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const paidOf = (b: Bill) => paidByPo[b.id]?.paid ?? 0;
  const remainingOf = (b: Bill) => Math.max(0, Number(b.total || 0) - paidOf(b));

  const submitPayment = async (b: Bill) => {
    setPayBusy(true); setPayMsg(null);
    try {
      const res = await fetch(`/api/admin/accounting/bills/${b.id}/pay`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: payAmount ? Number(payAmount) : undefined, method: payMethod }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || 'Payment failed');
      setPayMsg(`Recorded ${d.paymentNumber} — ${money(payAmount ? Number(payAmount) : remainingOf(b))} against ${b.po_number}. Remaining: ${money(d.remaining)}${d.poStatus === 'closed' ? ' · Bill closed.' : ''}`);
      setPayFor(null); setPayAmount('');
      await loadPaid();
      const poRes = await fetch('/api/admin/purchase-orders?tab=all', { cache: 'no-store' });
      if (poRes.ok) { const dd = await poRes.json(); setBills(dd.purchaseOrders || []); }
    } catch (e) {
      setPayMsg(e instanceof Error ? e.message : 'Payment failed');
    } finally { setPayBusy(false); }
  };

  const q = search.toLowerCase();
  const filteredBills = bills.filter((b) =>
    !q || b.po_number.toLowerCase().includes(q) || (b.vendor_name || '').toLowerCase().includes(q));
  const filteredProducts = products.filter((p) =>
    !q || p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q));

  const totalPayable = filteredBills
    .filter((b) => b.status !== 'cancelled' && b.status !== 'closed')
    .reduce((s, b) => s + remainingOf(b), 0);

  if (loading) return <div className="p-6 text-muted-foreground">Loading purchases…</div>;

  return (
    <div className="flex flex-col w-full text-foreground bg-card">
      <div className="p-6 border-b border-border">
        <h1 className="font-display text-xl font-semibold tracking-tight">Purchases — Bills & Payables</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5 max-w-3xl">
          Accounting view over purchase orders and the catalog. Purchase orders are created and managed
          under Orders → Purchase Orders; this is the read-only payables picture for accounting.
        </p>
      </div>

      {/* Tabs */}
      <div className="px-6 pt-4 flex items-center gap-2 border-b border-border">
        {(['bills', 'products'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-[13px] font-medium border-b-2 -mb-px cursor-pointer ${
              tab === t ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            {t === 'bills' ? `Bills (${filteredBills.length})` : `Products & Services (${filteredProducts.length})`}
          </button>
        ))}
        <div className="ml-auto pb-2 flex items-center gap-2">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === 'bills' ? 'Search PO # or vendor…' : 'Search name or SKU…'}
            className="border border-border rounded-lg px-3 py-1.5 text-[12px] w-56 focus:outline-none focus:border-foreground" />
          <button onClick={() => router.push('/admin/vendors')}
            className="px-3 py-1.5 border border-border rounded-lg text-[12px] font-medium hover:bg-muted cursor-pointer">
            Suppliers →
          </button>
        </div>
      </div>

      {error && <p className="px-6 pt-4 text-[12px] text-destructive">{error}</p>}

      {tab === 'bills' ? (
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="border border-border rounded-lg p-4">
              <p className="text-[10px] uppercase text-muted-foreground font-semibold">Open Payables</p>
              <p className="text-[20px] font-bold tabular-nums mt-1">{money(totalPayable)}</p>
            </div>
            <div className="border border-border rounded-lg p-4">
              <p className="text-[10px] uppercase text-muted-foreground font-semibold">Open Bills</p>
              <p className="text-[20px] font-bold tabular-nums mt-1">
                {filteredBills.filter((b) => b.status !== 'cancelled' && b.status !== 'closed' && remainingOf(b) > 0.005).length}
              </p>
            </div>
            <div className="border border-border rounded-lg p-4">
              <p className="text-[10px] uppercase text-muted-foreground font-semibold">Total Bills</p>
              <p className="text-[20px] font-bold tabular-nums mt-1">{filteredBills.length}</p>
            </div>
          </div>

          {filteredBills.length === 0 ? (
            <div className="border border-border rounded-lg p-12 text-center text-muted-foreground text-[13px]">
              No purchase orders found. Create one under Orders → Purchase Orders.
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-[11px] uppercase">
                    <th className="p-3">PO #</th>
                    <th className="p-3">Vendor</th>
                    <th className="p-3">Order Date</th>
                    <th className="p-3">Expected</th>
                    <th className="p-3 text-right">Total</th>
                    <th className="p-3 text-right">Paid</th>
                    <th className="p-3 text-right">Remaining</th>
                    <th className="p-3">Status</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredBills.map((b) => (
                    <React.Fragment key={b.id}>
                    <tr className="hover:bg-muted/30">
                      <td className="p-3 font-medium">{b.po_number}</td>
                      <td className="p-3">{b.vendor_name || '—'}</td>
                      <td className="p-3 text-muted-foreground">{b.order_date ? new Date(b.order_date).toLocaleDateString() : '—'}</td>
                      <td className="p-3 text-muted-foreground">{b.expected_date ? new Date(b.expected_date).toLocaleDateString() : '—'}</td>
                      <td className="p-3 text-right font-semibold tabular-nums">{money(b.total)}</td>
                      <td className="p-3 text-right tabular-nums">{money(paidOf(b))}</td>
                      <td className="p-3 text-right tabular-nums">{money(remainingOf(b))}</td>
                      <td className="p-3"><span className="text-[11px] px-2 py-0.5 rounded-full bg-muted">{b.status}</span></td>
                      <td className="p-3 text-right">
                        {b.status === 'cancelled' ? null : remainingOf(b) <= 0.005 ? (
                          <span className="text-[11px] font-semibold text-success">Paid in full</span>
                        ) : (
                          <button onClick={() => { setPayFor(payFor === b.id ? null : b.id); setPayAmount(remainingOf(b).toFixed(2)); setPayMsg(null); }}
                            className="px-2.5 py-1 border border-border rounded-lg text-[11px] font-medium hover:bg-muted cursor-pointer">
                            Record Payment
                          </button>
                        )}
                      </td>
                    </tr>
                    {payFor === b.id && (
                      <tr className="bg-muted/20">
                        <td colSpan={9} className="p-3">
                          <div className="flex flex-wrap items-end gap-3">
                            <div>
                              <label className="block text-[10px] uppercase text-muted-foreground mb-1">Amount ($)</label>
                              <input value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
                                className="border border-border rounded-lg px-2 py-1.5 text-[12px] w-28" type="text" inputMode="decimal" />
                            </div>
                            <div>
                              <label className="block text-[10px] uppercase text-muted-foreground mb-1">Method</label>
                              <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}
                                className="border border-border rounded-lg px-2 py-1.5 text-[12px]">
                                <option value="bank_transfer">Bank transfer</option>
                                <option value="card">Card</option>
                                <option value="check">Check</option>
                                <option value="cash">Cash</option>
                              </select>
                            </div>
                            <button onClick={() => submitPayment(b)} disabled={payBusy}
                              className="bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-[12px] font-semibold disabled:opacity-50 cursor-pointer">
                              {payBusy ? 'Recording…' : 'Record Payment'}
                            </button>
                            <span className="text-[11px] text-muted-foreground">Posts to acct_ap_payments as AP-##### · settles {b.po_number} when the balance reaches $0.</span>
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
              {payMsg && <p className="mt-3 text-[12px]">{payMsg}</p>}
            </div>
          )}
        </div>
      ) : (
        <div className="p-6">
          {filteredProducts.length === 0 ? (
            <div className="border border-border rounded-lg p-12 text-center text-muted-foreground text-[13px]">
              No products found.
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-[11px] uppercase">
                    <th className="p-3">Name</th>
                    <th className="p-3">SKU</th>
                    <th className="p-3 text-right">Price</th>
                    <th className="p-3 text-right">Sale</th>
                    <th className="p-3 text-right">Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredProducts.slice(0, 200).map((p) => (
                    <tr key={p.id} className="hover:bg-muted/30">
                      <td className="p-3 font-medium">{p.name}</td>
                      <td className="p-3 text-muted-foreground">{p.sku || '—'}</td>
                      <td className="p-3 text-right tabular-nums">{p.base_price || '—'}</td>
                      <td className="p-3 text-right tabular-nums">{p.sale_price || '—'}</td>
                      <td className="p-3 text-right tabular-nums">{p.stock ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredProducts.length > 200 && (
                <p className="p-3 text-[11px] text-muted-foreground text-center">Showing 200 of {filteredProducts.length} — use search to narrow.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
