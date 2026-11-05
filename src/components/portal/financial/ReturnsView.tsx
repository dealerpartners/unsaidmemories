'use client';

import React, { useEffect, useState } from 'react';
import {
  RotateCcw,
  Search,
  Download,
  Plus,
  Truck,
  CheckCircle2,
  AlertTriangle,
  Gift,
  CreditCard,
  Layers,
  ArrowRight,
  Eye,
  MapPin,
  ClipboardCheck,
} from 'lucide-react';
import { DawgNavSection } from '@/lib/types';
import {
  useListReturns,
  useReviewReturn,
  useTrackReturn,
  useViewReturn,
} from '@/hooks/admin/useActions';

interface ReturnsViewProps {
  onNavigateSection?: (section: DawgNavSection) => void;
}

type Rma = {
  id: string; rmaNumber: string | null; status: string;
  orderId: string | null; orderNumber: string | null;
  customerId: string | null; customerName: string | null;
  reasonCode: string | null; requestedAt: string | null;
  approvedAt: string | null; receivedAt: string | null;
  completedAt: string | null; notes: string | null;
};

// Real statuses from erp_return_status enum
const ACTION_STATUSES = ['requested', 'inspection'];
const TRANSIT_STATUSES = ['approved', 'awaiting_package', 'in_transit', 'received'];
const DONE_STATUSES = ['approved_for_refund', 'rejected', 'restocked', 'refunded', 'exchanged', 'completed', 'cancelled'];

export const ReturnsView: React.FC<ReturnsViewProps> = ({ onNavigateSection }) => {
  const [activeTab, setActiveTab] = useState<'all' | 'action' | 'transit' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [rmas, setRmas] = useState<Rma[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  // Review / Track / View modals — tree §2.2 Return Actions
  const [reviewRma, setReviewRma] = useState<Rma | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [trackRma, setTrackRma] = useState<Rma | null>(null);
  const [trackInfo, setTrackInfo] = useState<any>(null);
  const [viewRma, setViewRma] = useState<Rma | null>(null);
  const [viewDetail, setViewDetail] = useState<any>(null);

  const listReturns = useListReturns();
  const reviewReturn = useReviewReturn();
  const trackReturn = useTrackReturn();
  const viewReturn = useViewReturn();

  const load = () => {
    listReturns.mutate({ limit: 200 } as any, {
      onSuccess: (res: any) => {
        const rows = res?.data || [];
        setRmas(Array.isArray(rows) ? rows : []);
        setLoading(false);
      },
      onError: () => setLoading(false),
    });
  };

  useEffect(() => { load(); }, []);

  const doReview = (decision: 'approve' | 'reject') => {
    if (!reviewRma) return;
    // §2.2.7a — rejection requires the reason (the review notes, recorded
    // on the RMA); the API enforces it too.
    if (decision === 'reject' && !reviewNotes.trim()) {
      setMsg('A reason is required to reject a return — add it in the review notes; it is recorded on the return.');
      return;
    }
    reviewReturn.mutate({ return_id: reviewRma.id, decision, notes: reviewNotes || undefined } as any, {
      onSuccess: (res: any) => {
        setMsg(res?.message || `Return ${decision === 'approve' ? 'approved for inspection' : 'rejected'}.`);
        setReviewRma(null); setReviewNotes(''); load();
      },
      onError: (e) => setMsg(e.message),
    });
  };

  const doTrack = (rma: Rma) => {
    setTrackRma(rma); setTrackInfo(null);
    trackReturn.mutate({ return_id: rma.id } as any, {
      onSuccess: (res: any) => setTrackInfo(res?.returnTracking || null),
      onError: (e) => setMsg(e.message),
    });
  };

  const doView = (rma: Rma) => {
    setViewRma(rma); setViewDetail(null);
    viewReturn.mutate({ return_id: rma.id } as any, {
      onSuccess: (res: any) => setViewDetail(res || null),
      onError: (e) => setMsg(e.message),
    });
  };

  const filteredRmas = rmas.filter((rma) => {
    const st = (rma.status || '').toLowerCase();
    if (activeTab === 'action' && !ACTION_STATUSES.includes(st)) return false;
    if (activeTab === 'transit' && !TRANSIT_STATUSES.includes(st)) return false;
    if (activeTab === 'completed' && !DONE_STATUSES.includes(st)) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const hay = [rma.rmaNumber, rma.orderNumber, rma.customerName, rma.reasonCode, rma.id].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const countFor = (tab: string) => {
    if (tab === 'all') return rmas.length;
    return rmas.filter(r => {
      const st = (r.status || '').toLowerCase();
      if (tab === 'action') return ACTION_STATUSES.includes(st);
      if (tab === 'transit') return TRANSIT_STATUSES.includes(st);
      return DONE_STATUSES.includes(st);
    }).length;
  };

  const openCount = rmas.filter(r => !DONE_STATUSES.includes((r.status || '').toLowerCase())).length;
  const transitCount = rmas.filter(r => TRANSIT_STATUSES.includes((r.status || '').toLowerCase())).length;
  const inspectCount = rmas.filter(r => ['requested', 'inspection'].includes((r.status || '').toLowerCase())).length;
  const doneCount = rmas.filter(r => DONE_STATUSES.includes((r.status || '').toLowerCase())).length;

  const statusBadge = (st: string) => {
    const s = (st || '').toLowerCase();
    const cls = DONE_STATUSES.includes(s) ? 'bg-green-100 text-green-700'
      : ACTION_STATUSES.includes(s) ? 'bg-amber-100 text-amber-700'
      : 'bg-muted text-foreground';
    return <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold uppercase ${cls}`}>{st || '—'}</span>;
  };

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString() : '—';

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto text-foreground bg-card min-h-full">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
            <span>Operations</span><span>/</span><span>OMS</span><span>/</span>
            <span className="text-foreground font-semibold">Reverse Logistics &amp; RMA</span>
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Returns &amp; Exchanges (RMA)</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Inspect incoming retail returns, issue replacements, and synchronize refunds or store credits.
          </p>
        </div>
      </div>
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}

      {/* KPI Tiles — computed from real RMA data */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="border border-border p-4 bg-card">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Open RMA Requests</p>
          <p className="text-2xl font-semibold tabular-nums mt-2">{loading ? '…' : openCount}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Active cases</p>
        </div>
        <div className="border border-border p-4 bg-card">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">In-Transit to Salon</p>
          <p className="text-2xl font-semibold tabular-nums mt-2">{loading ? '…' : transitCount}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Awaiting package</p>
        </div>
        <div className="border border-border p-4 bg-card">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Awaiting Inspection</p>
          <p className="text-2xl font-semibold tabular-nums mt-2">{loading ? '…' : inspectCount}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Needs action</p>
        </div>
        <div className="border border-border p-4 bg-card">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Completed</p>
          <p className="text-2xl font-semibold tabular-nums mt-2">{loading ? '…' : doneCount}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Resolved</p>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="border border-border bg-card">
        <div className="flex items-center overflow-x-auto border-b border-border">
          {[
            { id: 'all', label: 'All Returns' },
            { id: 'action', label: 'Action Required' },
            { id: 'transit', label: 'Awaiting Package' },
            { id: 'completed', label: 'Completed' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2.5 text-[13px] font-semibold uppercase tracking-wider border-r border-border whitespace-nowrap cursor-pointer transition-colors ${
                activeTab === tab.id ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground hover:bg-accent/50'
              }`}
            >
              {tab.label} ({countFor(tab.id)})
            </button>
          ))}
        </div>

        <div className="p-3 bg-muted/30 border-b border-border">
          <div className="relative max-w-md">
            <span className="absolute left-2.5 top-2.5 text-muted-foreground pointer-events-none">
              <Search className="w-3.5 h-3.5" />
            </span>
            <input
              type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search RMA #, order #, customer..."
              className="w-full h-8 pl-8 pr-3 text-[13px] bg-card border border-border text-foreground placeholder-neutral-400 focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px] text-foreground border-collapse tabular-nums">
            <thead>
              <tr className="bg-muted/30 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-foreground">
                <th className="py-2.5 px-3 border-r border-border">RMA</th>
                <th className="py-2.5 px-3 border-r border-border">Order</th>
                <th className="py-2.5 px-3 border-r border-border">Customer</th>
                <th className="py-2.5 px-3 border-r border-border">Reason</th>
                <th className="py-2.5 px-3 border-r border-border">Requested</th>
                <th className="py-2.5 px-3 border-r border-border text-center">Status</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredRmas.map((rma) => (
                <tr key={rma.id} className="hover:bg-accent/50 transition-colors">
                  <td className="py-3 px-3 font-semibold border-r border-border">
                    <p className="font-mono text-xs">{rma.rmaNumber || rma.id.slice(0, 8)}</p>
                    <p className="text-[10px] text-muted-foreground font-normal">{fmtDate(rma.requestedAt)}</p>
                  </td>
                  <td className="py-3 px-3 border-r border-border">
                    <span className="font-semibold">{rma.orderNumber || (rma.orderId ? `#${rma.orderId.slice(0, 8)}` : '—')}</span>
                  </td>
                  <td className="py-3 px-3 border-r border-border">
                    <p className="font-semibold">{rma.customerName || '—'}</p>
                  </td>
                  <td className="py-3 px-3 border-r border-border">
                    <span className="px-1.5 py-0.5 border border-border bg-muted/40 text-[10px] font-semibold">{rma.reasonCode || '—'}</span>
                  </td>
                  <td className="py-3 px-3 border-r border-border text-xs text-muted-foreground">{fmtDate(rma.requestedAt)}</td>
                  <td className="py-3 px-3 border-r border-border text-center">{statusBadge(rma.status)}</td>
                  <td className="py-3 px-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => doView(rma)} title="View details"
                        className="p-1.5 border border-border rounded hover:bg-muted cursor-pointer"><Eye className="w-3.5 h-3.5" /></button>
                      <button onClick={() => doTrack(rma)} title="Track return"
                        className="p-1.5 border border-border rounded hover:bg-muted cursor-pointer"><MapPin className="w-3.5 h-3.5" /></button>
                      <button onClick={() => { setReviewRma(rma); setReviewNotes(''); }} title="Review return"
                        className="px-2.5 py-1 border border-border bg-primary text-primary-foreground hover:bg-primary/90 text-[10px] font-semibold uppercase cursor-pointer">
                        Review
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filteredRmas.length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {rmas.length === 0 ? 'No return authorizations yet.' : 'No returns match this filter.'}
            </p>
          )}
          {loading && <p className="p-8 text-center text-sm text-muted-foreground">Loading returns…</p>}
        </div>

        <div className="p-3 bg-muted/30 border-t border-border text-[11px] uppercase text-muted-foreground tabular-nums">
          Showing {filteredRmas.length} of {rmas.length} RMA requests
        </div>
      </div>

      {/* Review modal — tree §2.2 Review */}
      {reviewRma && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setReviewRma(null)}>
          <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-1">Review Return</h3>
            <p className="text-sm text-muted-foreground mb-4 font-mono">{reviewRma.rmaNumber || reviewRma.id.slice(0, 8)} — {reviewRma.status}</p>
            <label className="text-xs font-semibold uppercase tracking-wider">Notes</label>
            <textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} rows={3}
              placeholder="Inspection notes…" className="w-full mt-1 mb-4 border border-border rounded p-2 text-sm bg-background" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setReviewRma(null)} className="px-4 py-2 text-sm border border-border rounded hover:bg-muted">Cancel</button>
              <button onClick={() => doReview('reject')} disabled={reviewReturn.isPending}
                className="px-4 py-2 text-sm border border-red-300 text-red-600 rounded hover:bg-red-50 disabled:opacity-50">Reject</button>
              <button onClick={() => doReview('approve')} disabled={reviewReturn.isPending}
                className="px-4 py-2 text-sm border border-border bg-card text-brand-teal rounded hover:border-brand-teal/60 hover:bg-brand-teal/5 disabled:opacity-50">Approve</button>
            </div>
          </div>
        </div>
      )}

      {/* Track modal — tree §2.2 Track */}
      {trackRma && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { setTrackRma(null); setTrackInfo(null); }}>
          <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Track Return</h3>
            {!trackInfo ? <p className="text-sm text-muted-foreground">Loading…</p> : (
              <ol className="space-y-3 text-sm">
                {[
                  ['Requested', trackInfo.requestedAt],
                  ['Approved', trackInfo.approvedAt],
                  ['Received', trackInfo.receivedAt],
                  ['Completed', trackInfo.completedAt],
                ].map(([label, d]) => (
                  <li key={label as string} className="flex items-center gap-3">
                    <span className={`size-3 rounded-full ${d ? 'bg-green-500' : 'bg-muted'}`} />
                    <span className="font-medium w-24">{label}</span>
                    <span className="text-muted-foreground">{d ? new Date(d as string).toLocaleString() : '—'}</span>
                  </li>
                ))}
                <li className="pt-2 border-t border-border">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">Current status: </span>
                  <span className="font-semibold">{trackInfo.status}</span>
                </li>
                {/* §2.2.7b — inbound tracking recorded on the return */}
                <li className="pt-2 border-t border-border">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">Inbound tracking: </span>
                  {trackInfo.trackingNumber ? (
                    <span className="font-semibold">
                      {trackInfo.carrier} · {trackInfo.trackingNumber}
                      {trackInfo.carrierStatus ? <span className="font-normal text-muted-foreground"> · {trackInfo.carrierStatus}</span> : null}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">None recorded — record it from Returns Oversight on this RMA.</span>
                  )}
                </li>
              </ol>
            )}
            <div className="flex justify-end mt-4">
              <button onClick={() => { setTrackRma(null); setTrackInfo(null); }} className="px-4 py-2 text-sm border border-border rounded hover:bg-muted">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* View modal — tree §2.2 View */}
      {viewRma && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { setViewRma(null); setViewDetail(null); }}>
          <div className="bg-card border border-border rounded-lg p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Return Details</h3>
            {!viewDetail ? <p className="text-sm text-muted-foreground">Loading…</p> : (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div><p className="text-xs uppercase text-muted-foreground">RMA</p><p className="font-mono">{viewDetail?.returnDetail?.rmaNumber || viewRma.rmaNumber}</p></div>
                  <div><p className="text-xs uppercase text-muted-foreground">Status</p><p className="font-semibold">{viewDetail?.returnDetail?.status || viewRma.status}</p></div>
                  <div><p className="text-xs uppercase text-muted-foreground">Reason</p><p>{viewDetail?.returnDetail?.reasonCode || viewRma.reasonCode || '—'}</p></div>
                  <div><p className="text-xs uppercase text-muted-foreground">Customer</p><p>{viewDetail?.returnDetail?.customerName || viewRma.customerName || '—'}</p></div>
                </div>
                {viewDetail?.returnDetail?.notes && (
                  <div><p className="text-xs uppercase text-muted-foreground">Notes</p><p>{viewDetail.returnDetail.notes}</p></div>
                )}
                {Array.isArray(viewDetail?.lines) && viewDetail.lines.length > 0 && (
                  <div>
                    <p className="text-xs uppercase text-muted-foreground mb-1">Line items</p>
                    <table className="w-full text-xs border border-border">
                      <thead><tr className="bg-muted"><th className="p-2 text-left">SKU</th><th className="p-2 text-right">Requested</th><th className="p-2 text-right">Received</th><th className="p-2 text-right">Approved</th></tr></thead>
                      <tbody>
                        {viewDetail.lines.map((l: any) => (
                          <tr key={l.lineId} className="border-t border-border">
                            <td className="p-2 font-mono">{l.skuId?.slice(0, 8) || '—'}</td>
                            <td className="p-2 text-right">{l.quantityRequested}</td>
                            <td className="p-2 text-right">{l.quantityReceived}</td>
                            <td className="p-2 text-right">{l.quantityApproved}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-end mt-4">
              <button onClick={() => { setViewRma(null); setViewDetail(null); }} className="px-4 py-2 text-sm border border-border rounded hover:bg-muted">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
