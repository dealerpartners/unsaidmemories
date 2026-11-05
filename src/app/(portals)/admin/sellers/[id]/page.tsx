'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Store, ShieldCheck, Package, ShoppingBag, Wallet, AlertTriangle } from 'lucide-react';
import { SellerStatusBadge } from '../seller-status-badge';

type Seller = {
  id: string;
  seller_type: string | null;
  legal_name: string | null;
  display_name: string;
  slug: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  tax_id_last4: string | null;
  commission_rate: number | null;
  status: string;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-[13px] mt-0.5">{value || '—'}</div>
    </div>
  );
}

type SellerActivity = {
  listings: Array<{ id: string; sku: string | null; title: string | null; price: number | null; stock: number | null; status: string | null; created_at: string }>;
  orders: Array<{ id: string; order_number: string; customer_name: string | null; status: string | null; total: number | null; created_at: string }>;
  payouts: Array<{ id: string; amount: number | null; status: string | null; scheduled_at: string | null; paid_at: string | null; created_at: string }>;
  bankMethod: { id: string; method_type: string | null; brand: string | null; last4: string | null; is_default: boolean; status: string | null; created_at: string } | null;
  counts: { listings: number; orders: number; payouts: number };
};

function fmtMoney(n: number | null): string {
  return n == null ? '—' : `$${Number(n).toFixed(2)}`;
}

// Real activity section: renders the latest rows from the seller's own
// listings/orders/payouts tables (via /api/admin/sellers/activity) and only
// shows the empty message when the count is actually zero.
function ActivitySection({ icon: Icon, title, count, emptyMessage, children }: {
  icon: React.ElementType; title: string; count: number; emptyMessage: string; children?: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-xl">
      <h3 className="text-[14px] font-semibold flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" /> {title}
        {count > 0 && <span className="ml-auto text-[12px] font-normal text-muted-foreground">{count} total · latest {Math.min(count, 5)}</span>}
      </h3>
      {count === 0 ? (
        <div className="mt-3 text-center py-6">
          <Icon className="size-8 mx-auto text-muted-foreground/30" />
          <p className="text-[13px] text-muted-foreground mt-2">{emptyMessage}</p>
        </div>
      ) : (
        <ul className="mt-3 space-y-2">{children}</ul>
      )}
    </div>
  );
}

function ActivityRow({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <li className="border border-border rounded-lg p-3 text-[13px] flex items-center justify-between gap-3">
      <span className="min-w-0">{left}</span>
      <span className="text-muted-foreground whitespace-nowrap">{right}</span>
    </li>
  );
}

export default function SellerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [seller, setSeller] = useState<Seller | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [violations, setViolations] = useState<Array<{
    id: string; violation_type: string; severity: string; status: string;
    description: string | null; created_at: string;
  }>>([]);
  const [activity, setActivity] = useState<SellerActivity | null>(null);
  const [showViolationModal, setShowViolationModal] = useState(false);
  const [vType, setVType] = useState('policy');
  const [vSeverity, setVSeverity] = useState('medium');
  const [vDesc, setVDesc] = useState('');
  const [vSuspend, setVSuspend] = useState(false);

  const load = () => {
    setLoading(true);
    fetch(`/api/admin/sellers?id=${encodeURIComponent(id)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setSeller(d.seller);
      })
      .catch(() => setError('Failed to load seller.'))
      .finally(() => setLoading(false));
    fetch(`/api/admin/sellers/violations?seller_id=${encodeURIComponent(id)}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.rows)) setViolations(d.rows); })
      .catch(() => {});
    fetch(`/api/admin/sellers/activity?seller_id=${encodeURIComponent(id)}`)
      .then(r => r.json())
      .then(d => { if (d && d.counts) setActivity(d as SellerActivity); })
      .catch(() => {});
  };

  useEffect(() => { load(); }, [id]);

  const act = async (action: 'approve' | 'suspend' | 'reject') => {
    const label = action === 'approve' ? 'approve' : action === 'suspend' ? 'suspend' : 'reject';
    if (!window.confirm(`Are you sure you want to ${label} this seller?`)) return;
    setActing(true);
    setError(null);
    try {
      const r = await fetch('/api/admin/sellers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Action failed');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActing(false);
    }
  };

  const setType = async (sellerType: string) => {
    setActing(true);
    setError(null);
    try {
      const r = await fetch('/api/admin/sellers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_type', id, seller_type: sellerType }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Action failed');
      if (d.seller) setSeller((s) => (s ? { ...s, seller_type: d.seller.seller_type } : s));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActing(false);
    }
  };

  const flagViolation = async () => {
    if (!vType.trim()) return;
    setActing(true);
    setError(null);
    try {
      const r = await fetch('/api/admin/sellers/violations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seller_id: id,
          violation_type: vType,
          severity: vSeverity,
          description: vDesc,
          suspend: vSuspend,
        }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Action failed');
      setShowViolationModal(false);
      setVDesc('');
      setVSuspend(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="space-y-6">
      <button onClick={() => router.push('/admin/sellers')}
        className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground cursor-pointer">
        <ArrowLeft className="size-4" /> Back to sellers
      </button>

      {loading ? (
        <div className="text-muted-foreground text-[13px]">Loading…</div>
      ) : error && !seller ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <Store className="size-10 mx-auto text-muted-foreground/40" />
          <p className="text-[14px] font-medium text-foreground mt-3">{error}</p>
          <button onClick={() => router.push('/admin/sellers')}
            className="mt-4 px-4 py-2 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 rounded-lg text-[13px] font-semibold cursor-pointer">
            Back to Sellers
          </button>
        </div>
      ) : seller ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
                <Store className="size-6" /> {seller.display_name}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <SellerStatusBadge status={seller.status} />
              <button disabled={acting} onClick={() => setShowViolationModal(true)}
                className="px-3.5 py-2 border border-red-300 text-red-700 rounded-lg text-[13px] font-semibold hover:bg-red-50 cursor-pointer disabled:opacity-50 flex items-center gap-1.5">
                <AlertTriangle className="size-4" /> Flag Violation
              </button>
              {seller.status === 'applied' && (
                <>
                  <button disabled={acting} onClick={() => act('reject')}
                    className="px-3.5 py-2 border border-border rounded-lg text-[13px] font-semibold hover:bg-muted cursor-pointer disabled:opacity-50">
                    Reject
                  </button>
                  <button disabled={acting} onClick={() => act('approve')}
                    className="px-3.5 py-2 bg-emerald-600 text-white rounded-lg text-[13px] font-semibold hover:bg-emerald-700 cursor-pointer disabled:opacity-50">
                    Approve
                  </button>
                </>
              )}
              {seller.status === 'approved' && (
                <button disabled={acting} onClick={() => act('suspend')}
                  className="px-3.5 py-2 bg-red-600 text-white rounded-lg text-[13px] font-semibold hover:bg-red-700 cursor-pointer disabled:opacity-50">
                  Suspend
                </button>
              )}
              {seller.status === 'suspended' && (
                <button disabled={acting} onClick={() => act('approve')}
                  className="px-3.5 py-2 bg-emerald-600 text-white rounded-lg text-[13px] font-semibold hover:bg-emerald-700 cursor-pointer disabled:opacity-50">
                    Reinstate
                  </button>
              )}
            </div>
          </div>

          {error && <div className="text-[13px] text-red-600">{error}</div>}

          {/* Profile card */}
          <div className="bg-card border border-border rounded-xl">
            <h3 className="text-[14px] font-semibold mb-4">Seller Profile</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Field label="Display name" value={seller.display_name} />
              <Field label="Legal name" value={seller.legal_name} />
              <Field label="Seller type" value={(
                <select
                  value={seller.seller_type || ''}
                  disabled={acting}
                  onChange={(e) => setType(e.target.value)}
                  className="border border-border rounded-lg px-2 py-1 text-[13px] bg-card capitalize"
                >
                  <option value="first_party">First party (house account)</option>
                  <option value="manufacturer_brand">Manufacturer brand</option>
                  <option value="supplier">Supplier</option>
                  <option value="reseller">Reseller</option>
                  <option value="drop_shipper">Drop shipper</option>
                </select>
              )} />
              <Field label="Store slug" value={seller.slug} />
              <Field label="Email" value={seller.email} />
              <Field label="Phone" value={seller.phone} />
              <Field label="Website" value={seller.website && (
                <a href={seller.website.startsWith('http') ? seller.website : `https://${seller.website}`}
                  target="_blank" rel="noreferrer" className="text-primary hover:underline">{seller.website}</a>
              )} />
              <Field label="Tax ID" value={seller.tax_id_last4 ? `•••–${seller.tax_id_last4}` : null} />
              <Field label="Commission rate" value={seller.commission_rate != null ? `${Number(seller.commission_rate).toFixed(2)}%` : null} />
            </div>
          </div>

          {/* Verification status */}
          <div className="bg-card border border-border rounded-xl">
            <h3 className="text-[14px] font-semibold flex items-center gap-2 mb-4">
              <ShieldCheck className="size-4 text-muted-foreground" /> Verification
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Field label="Status" value={<SellerStatusBadge status={seller.status} />} />
              <Field label="Approved at" value={seller.approved_at ? new Date(seller.approved_at).toLocaleString() : null} />
              <Field label="Approved by" value={seller.approved_by} />
              <Field label="Last updated" value={seller.updated_at ? new Date(seller.updated_at).toLocaleString() : null} />
              <Field label="Bank account" value={activity?.bankMethod ? `••••${activity.bankMethod.last4 ?? ''}${activity.bankMethod.brand ? ` · ${activity.bankMethod.brand}` : ''} · ${activity.bankMethod.status ?? 'on file'}` : 'Not on file'} />
            </div>
          </div>

          {/* Sub-sections */}
          <div className="grid md:grid-cols-2 gap-4">
            <ActivitySection icon={Package} title="Listings" count={activity?.counts.listings ?? 0} emptyMessage="No listings yet. Product listings for this seller will appear here.">
              {(activity?.listings ?? []).map((l) => (
                <ActivityRow key={l.id}
                  left={<><span className="font-medium">{l.title || l.sku || 'Untitled listing'}</span>{l.status ? <span className="ml-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 capitalize">{l.status}</span> : null}</>}
                  right={`${fmtMoney(l.price)}${l.stock != null ? ` · ${l.stock} in stock` : ''}`} />
              ))}
            </ActivitySection>
            <ActivitySection icon={ShoppingBag} title="Orders" count={activity?.counts.orders ?? 0} emptyMessage="No orders yet. Orders placed with this seller will appear here.">
              {(activity?.orders ?? []).map((o) => (
                <ActivityRow key={o.id}
                  left={<><span className="font-medium">{o.order_number}</span>{o.customer_name ? <span className="text-muted-foreground"> · {o.customer_name}</span> : null}{o.status ? <span className="ml-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 capitalize">{o.status}</span> : null}</>}
                  right={fmtMoney(o.total)} />
              ))}
            </ActivitySection>
            <ActivitySection icon={Wallet} title="Payouts" count={activity?.counts.payouts ?? 0} emptyMessage="No payouts yet. Payout history for this seller will appear here.">
              {(activity?.payouts ?? []).map((p) => (
                <ActivityRow key={p.id}
                  left={<><span className="font-medium">{fmtMoney(p.amount)}</span>{p.status ? <span className="ml-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 capitalize">{p.status}</span> : null}</>}
                  right={p.paid_at ? `Paid ${new Date(p.paid_at).toLocaleDateString()}` : p.scheduled_at ? `Scheduled ${new Date(p.scheduled_at).toLocaleDateString()}` : new Date(p.created_at).toLocaleDateString()} />
              ))}
            </ActivitySection>
            <div className="bg-card border border-border rounded-xl">
              <h3 className="text-[14px] font-semibold flex items-center gap-2">
                <AlertTriangle className="size-4 text-muted-foreground" /> Violations
              </h3>
              {violations.length === 0 ? (
                <div className="mt-3 text-center py-6">
                  <AlertTriangle className="size-8 mx-auto text-muted-foreground/30" />
                  <p className="text-[13px] text-muted-foreground mt-2">No violations on record.</p>
                </div>
              ) : (
                <ul className="mt-3 space-y-2">
                  {violations.map((v) => (
                    <li key={v.id} className="border border-border rounded-lg p-3 text-[13px]">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold capitalize">{v.violation_type.replace(/_/g, ' ')}</span>
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${ v.severity === 'critical' ? 'adm-badge adm-badge-red' : v.severity === 'high' ? 'bg-orange-100 text-orange-800' : v.severity === 'low' ? 'bg-neutral-100 text-neutral-700' : 'adm-badge adm-badge-amber' }`}>{v.severity}</span>
                      </div>
                      {v.description && <p className="text-muted-foreground mt-1">{v.description}</p>}
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {v.status} · {v.created_at ? new Date(v.created_at).toLocaleString() : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Flag-violation modal (Trust Center quick action) */}
          {showViolationModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="bg-white dark:bg-card rounded-xl max-w-md w-full space-y-4">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <AlertTriangle className="size-5 text-red-600" /> Flag Violation
                </h2>
                <div>
                  <label className="text-xs font-bold uppercase text-muted-foreground">Violation type</label>
                  <select value={vType} onChange={(e) => setVType(e.target.value)}
                    className="w-full border border-border rounded-lg p-2 mt-1 bg-white dark:bg-card">
                    <option value="policy">Policy violation</option>
                    <option value="counterfeit">Counterfeit / IP</option>
                    <option value="late_shipment">Late shipment</option>
                    <option value="order_defect">Order defect</option>
                    <option value="listing_abuse">Listing abuse</option>
                    <option value="fraud">Fraud</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase text-muted-foreground">Severity</label>
                  <select value={vSeverity} onChange={(e) => setVSeverity(e.target.value)}
                    className="w-full border border-border rounded-lg p-2 mt-1 bg-white dark:bg-card">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase text-muted-foreground">Description</label>
                  <textarea value={vDesc} onChange={(e) => setVDesc(e.target.value)} rows={3}
                    placeholder="What happened?"
                    className="w-full border border-border rounded-lg p-2 mt-1" />
                </div>
                <label className="flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={vSuspend} onChange={(e) => setVSuspend(e.target.checked)} />
                  Also suspend this seller immediately
                </label>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowViolationModal(false)}
                    className="px-4 py-2 border border-border rounded-lg text-[13px] font-semibold cursor-pointer">
                    Cancel
                  </button>
                  <button disabled={acting} onClick={flagViolation}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg text-[13px] font-semibold hover:bg-red-700 cursor-pointer disabled:opacity-50">
                    Record Violation
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
