'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Package,
  Search,
  Download,
  Plus,
  Truck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Store,
  Check,
  X,
  Pencil,
  Trash2,
} from 'lucide-react';
import { DawgNavSection } from '@/lib/types';
import {
  useCreatePurchaseOrder,
  useReceivePurchaseOrder,
  useEditVendor,
  useCommerceAction,
} from '@/hooks/admin/useActions';

interface PurchaseOrdersViewProps {
  onNavigateSection?: (section: DawgNavSection) => void;
}

type PO = {
  id: string; po_number: string; vendor_name: string | null; vendor_code: string | null;
  status: string; order_date: string | null; expected_date: string | null;
  total: number; currency: string; notes: string | null;
};

type POLine = {
  id: string; sku_id: string; description: string | null;
  quantity_ordered: number; quantity_received: number;
  unit_cost: number; tax_amount: number; line_total: number;
  sku_code: string | null; barcode: string | null;
};

type Vendor = { id: string; name: string; vendor_number: string | null };
type Sku = { sku_id: string; sku_code: string; barcode: string | null; product_name: string | null; standard_cost: number; unit_price: number };

const EDITABLE_STATUSES = ['draft', 'pending_approval'];

export const PurchaseOrdersView: React.FC<PurchaseOrdersViewProps> = ({ onNavigateSection }) => {
  const [activeTab, setActiveTab] = useState<'all' | 'ordered' | 'transit' | 'received'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [msg, setMsg] = useState('');

  const createPo = useCreatePurchaseOrder();
  const receivePo = useReceivePurchaseOrder();
  const editVendor = useEditVendor();
  const commerce = useCommerceAction();

  const [pos, setPos] = useState<PO[]>([]);
  const [posLoading, setPosLoading] = useState(true);

  // Detail modal state
  const [detailPo, setDetailPo] = useState<any | null>(null);
  const [detailLines, setDetailLines] = useState<POLine[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Create modal state
  const [showCreate, setShowCreate] = useState(false);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [createVendorId, setCreateVendorId] = useState('');
  const [createExpectedDate, setCreateExpectedDate] = useState('');
  const [createNotes, setCreateNotes] = useState('');
  const [createLines, setCreateLines] = useState<Array<{ sku_id: string; sku_code: string; description: string; quantity: number; unit_cost: number }>>([]);

  // SKU picker state (shared by create + detail add-line)
  const [skuQuery, setSkuQuery] = useState('');
  const [skuResults, setSkuResults] = useState<Sku[]>([]);
  const [skuPickerFor, setSkuPickerFor] = useState<'create' | 'detail' | null>(null);

  // Edit header state (in detail modal)
  const [editingHeader, setEditingHeader] = useState(false);
  const [editExpectedDate, setEditExpectedDate] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Receive state (in detail modal): map lineId -> qty to receive
  const [receiveQtys, setReceiveQtys] = useState<Record<string, number>>({});

  // Add-line state (in detail modal)
  const [addingLine, setAddingLine] = useState(false);

  const loadPos = useCallback(() => {
    setPosLoading(true);
    fetch(`/api/admin/purchase-orders?tab=${activeTab}`)
      .then((r) => (r.ok ? r.json() : { purchaseOrders: [] }))
      .then((j) => setPos((j.purchaseOrders || []) as PO[]))
      .catch(() => setPos([]))
      .finally(() => setPosLoading(false));
  }, [activeTab]);

  useEffect(() => { loadPos(); }, [loadPos]);

  useEffect(() => {
    if (showCreate) {
      fetch('/api/admin/vendors?limit=200')
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          const list = j?.data || j?.vendors || [];
          setVendors(list.map((v: any) => ({ id: v.id, name: v.name, vendor_number: v.vendor_number })));
        })
        .catch(() => setVendors([]));
    }
  }, [showCreate]);

  // SKU search (debounced-ish)
  useEffect(() => {
    if (!skuPickerFor || skuQuery.trim().length < 2) { setSkuResults([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/admin/purchase-orders/skus?q=${encodeURIComponent(skuQuery.trim())}`)
        .then((r) => (r.ok ? r.json() : { skus: [] }))
        .then((j) => setSkuResults(j.skus || []))
        .catch(() => setSkuResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [skuQuery, skuPickerFor]);

  const openDetail = async (poId: string) => {
    setDetailLoading(true);
    setDetailPo(null);
    setDetailLines([]);
    setReceiveQtys({});
    setEditingHeader(false);
    setAddingLine(false);
    try {
      const r = await fetch(`/api/admin/purchase-orders/${poId}`);
      const j = await r.json();
      if (j.purchaseOrder) {
        setDetailPo(j.purchaseOrder);
        setDetailLines((j.lines || []).map((l: any) => ({
          ...l,
          quantity_ordered: Number(l.quantity_ordered || 0),
          quantity_received: Number(l.quantity_received || 0),
          unit_cost: Number(l.unit_cost || 0),
          line_total: Number(l.line_total || 0),
        })));
        setEditExpectedDate(j.purchaseOrder.expected_date ? j.purchaseOrder.expected_date.slice(0, 10) : '');
        setEditNotes(j.purchaseOrder.notes || '');
        // Default receive qty = remaining
        const qtys: Record<string, number> = {};
        for (const l of (j.lines || [])) {
          const remaining = Number(l.quantity_ordered || 0) - Number(l.quantity_received || 0);
          if (remaining > 0) qtys[l.id] = remaining;
        }
        setReceiveQtys(qtys);
      } else {
        setMsg('PO not found.');
      }
    } catch { setMsg('Failed to load PO detail.'); }
    finally { setDetailLoading(false); }
  };

  const closeDetail = () => {
    setDetailPo(null);
    setDetailLines([]);
    loadPos();
  };

  const doStatusChange = async (poId: string, status: string) => {
    try {
      const r = await fetch('/api/admin/commerce/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'com_create_po_status', payload: { po_id: poId, status } }),
      });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || 'Status change failed');
      setMsg(`PO ${status}.`);
      await openDetail(poId);
    } catch (e: any) { setMsg(e.message); }
  };

  const doSaveHeader = async () => {
    if (!detailPo) return;
    try {
      const r = await fetch(`/api/admin/purchase-orders/${detailPo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expected_date: editExpectedDate || null, notes: editNotes }),
      });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || 'Update failed');
      setMsg('PO updated.');
      setEditingHeader(false);
      await openDetail(detailPo.id);
    } catch (e: any) { setMsg(e.message); }
  };

  const doAddLine = async (sku: Sku, quantity: number, unitCost: number) => {
    if (!detailPo) return;
    try {
      const r = await fetch(`/api/admin/purchase-orders/${detailPo.id}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku_id: sku.sku_id,
          description: sku.product_name || sku.sku_code,
          quantity, unit_cost: unitCost,
        }),
      });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || 'Add line failed');
      setMsg('Line added.');
      setAddingLine(false);
      setSkuPickerFor(null);
      setSkuQuery('');
      await openDetail(detailPo.id);
    } catch (e: any) { setMsg(e.message); }
  };

  const doRemoveLine = async (lineId: string) => {
    if (!detailPo || !confirm('Remove this line?')) return;
    try {
      const r = await fetch(`/api/admin/purchase-orders/${detailPo.id}/lines?line_id=${lineId}`, { method: 'DELETE' });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || 'Remove failed');
      setMsg('Line removed.');
      await openDetail(detailPo.id);
    } catch (e: any) { setMsg(e.message); }
  };

  const doReceive = async () => {
    if (!detailPo) return;
    const items = detailLines
      .filter((l) => (receiveQtys[l.id] || 0) > 0)
      .map((l) => ({
        line_id: l.id,
        sku_id: l.sku_id,
        quantity: receiveQtys[l.id],
        unit_cost: l.unit_cost,
      }));
    if (!items.length) { setMsg('Enter a received quantity for at least one line.'); return; }
    receivePo.mutate({ po_id: detailPo.id, received_items: items }, {
      onSuccess: (res: any) => {
        setMsg(`Received: ${res?.movementCount || 0} inventory movements. Status: ${res?.status}.`);
        openDetail(detailPo.id);
      },
      onError: (e) => setMsg(e.message),
    });
  };

  const doCreatePoSubmit = () => {
    if (!createVendorId) { setMsg('Select a vendor.'); return; }
    if (!createLines.length) { setMsg('Add at least one line item.'); return; }
    createPo.mutate({
      vendor_id: createVendorId,
      expected_date: createExpectedDate || undefined,
      notes: createNotes || undefined,
      line_items: createLines.map((l) => ({
        sku_id: l.sku_id,
        description: l.description,
        quantity: l.quantity,
        unit_cost: l.unit_cost,
      })),
    } as any, {
      onSuccess: (res: any) => {
        setMsg(`PO created: ${res?.poNumber || ''} (${res?.lineCount || 0} lines) — pending approval.`);
        setShowCreate(false);
        setCreateVendorId(''); setCreateExpectedDate(''); setCreateNotes(''); setCreateLines([]);
        loadPos();
      },
      onError: (e) => setMsg(e.message),
    });
  };

  const addCreateLine = (sku: Sku) => {
    setCreateLines((prev) => [...prev, {
      sku_id: sku.sku_id, sku_code: sku.sku_code,
      description: sku.product_name || sku.sku_code,
      quantity: 1, unit_cost: Number(sku.standard_cost || sku.unit_price || 0),
    }]);
    setSkuPickerFor(null);
    setSkuQuery('');
  };

  const doViewVendor = () => {
    const vendorId = prompt('Vendor ID to view:');
    if (!vendorId) return;
    commerce.mutate({ action: 'com_view_vendor', payload: { vendor_id: vendorId } }, {
      onSuccess: (res: any) => {
        const d = res?.data || res;
        setMsg(d?.name ? `Vendor: ${d.name}` : 'Vendor loaded.');
      },
      onError: (e) => setMsg(e.message),
    });
  };

  const doExportLedger = () => {
    commerce.mutate({ action: 'com_export_ledger', payload: {} }, {
      onSuccess: (res: any) => {
        // The action returns the general ledger as CSV — download it.
        // (It used to announce "export started" and deliver nothing.)
        const csv = res?.csv;
        const lineCount = res?.ledgerData?.lineCount ?? 0;
        if (csv) {
          const blob = new Blob([csv], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'general-ledger.csv';
          a.click();
          URL.revokeObjectURL(url);
          setMsg(`General ledger downloaded — ${lineCount} journal line${lineCount === 1 ? '' : 's'}.`);
        } else {
          setMsg('Ledger export returned no data.');
        }
      },
      onError: (e) => setMsg(e.message),
    });
  };

  const filteredPos = pos.filter((po) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (po.po_number || '').toLowerCase().includes(q) || (po.vendor_name || '').toLowerCase().includes(q);
    }
    return true;
  });

  const canEdit = detailPo && EDITABLE_STATUSES.includes(detailPo.status);
  const canApprove = detailPo && detailPo.status === 'pending_approval';

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto text-foreground bg-card min-h-full">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2 text-[10px] tabular-nums uppercase tracking-wider text-muted-foreground mb-1">
            <span className="bg-primary text-primary-foreground px-1.5 py-0.5 font-semibold">LOGISTICS // OMS</span>
            <span>/</span>
            <span className="text-foreground font-semibold">PO-RECV-STATION-01</span>
          </div>
          <h1 className="text-2xl font-semibold uppercase tracking-tight text-foreground">
            Purchase Orders &amp; Receiving
          </h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Create vendor purchase orders, receive supplier shipments, and update inventory counts in bulk.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={doViewVendor}
            className="h-9 px-3 border border-border bg-card hover:bg-accent/50 text-foreground font-semibold text-[13px] uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Store className="w-3.5 h-3.5" />
            <span>Vendors</span>
          </button>
          <button
            onClick={doExportLedger}
            className="h-9 px-3 border border-border bg-card hover:bg-accent/50 text-foreground font-semibold text-[13px] uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Ledger</span>
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="h-9 px-4 bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 font-semibold text-[13px] uppercase tracking-wider flex items-center gap-1.5 border border-border cursor-pointer transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Create PO</span>
          </button>
        </div>
      </div>

      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <div className="border border-border p-4 bg-card flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Open Orders</span>
          </div>
          <p className="text-2xl font-semibold tabular-nums mt-2 tracking-tight text-foreground">
            {pos.filter((p) => ['draft', 'pending_approval'].includes(p.status)).length}
          </p>
          <p className="text-[10px] text-muted-foreground tabular-nums mt-0.5">draft / pending approval</p>
        </div>

        <div className="border border-border p-4 bg-card flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Pending Approval</span>
            <Clock className="w-3.5 h-3.5 text-foreground" />
          </div>
          <p className="text-2xl font-semibold tabular-nums mt-2 tracking-tight text-foreground">
            {pos.filter((p) => p.status === 'pending_approval').length}
          </p>
          <p className="text-[10px] text-muted-foreground tabular-nums mt-0.5">awaiting approval</p>
        </div>

        <div className="border border-border p-4 bg-card flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <span>In-Transit</span>
            <Truck className="w-3.5 h-3.5 text-foreground" />
          </div>
          <p className="text-2xl font-semibold tabular-nums mt-2 tracking-tight text-foreground">
            {pos.filter((p) => ['sent', 'partially_received'].includes(p.status)).length}
          </p>
          <p className="text-[10px] text-muted-foreground tabular-nums mt-0.5">sent / partial</p>
        </div>

        <div className="border border-border p-4 bg-card flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Received</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-foreground" />
          </div>
          <p className="text-2xl font-semibold tabular-nums mt-2 tracking-tight text-foreground">
            {pos.filter((p) => ['received', 'closed'].includes(p.status)).length}
          </p>
          <p className="text-[10px] text-muted-foreground tabular-nums mt-0.5">received / closed</p>
        </div>

        <div className="border border-border p-4 bg-card flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Total PO Value</span>
          </div>
          <p className="text-2xl font-semibold tabular-nums mt-2 tracking-tight text-foreground">
            ${pos.reduce((s, p) => s + Number(p.total || 0), 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
          <p className="text-[10px] text-muted-foreground tabular-nums mt-0.5">{pos.length} purchase orders</p>
        </div>

        <div className="border border-border p-4 bg-card flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Open Value</span>
            <AlertTriangle className="w-3.5 h-3.5 text-foreground" />
          </div>
          <p className="text-2xl font-semibold tabular-nums mt-2 tracking-tight text-foreground">
            ${pos.filter((p) => !['received', 'closed', 'cancelled'].includes(p.status)).reduce((s, p) => s + Number(p.total || 0), 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
          <p className="text-[10px] text-muted-foreground tabular-nums mt-0.5">committed, not received</p>
        </div>
      </div>

      {/* Main Table */}
      <div className="border border-border bg-card">
        <div className="flex items-center overflow-x-auto border-b border-border">
          {[
            { id: 'all', label: 'All Orders' },
            { id: 'ordered', label: 'Open / Ordered' },
            { id: 'transit', label: 'In-Transit' },
            { id: 'received', label: 'Received / Closed' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2.5 text-[13px] font-semibold uppercase tracking-wider border-r border-border whitespace-nowrap cursor-pointer transition-colors ${
                activeTab === tab.id ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground hover:bg-accent/50'
              }`}
            >
              {tab.label}{activeTab === tab.id ? ` (${pos.length})` : ''}
            </button>
          ))}
        </div>

        <div className="p-3 bg-muted/30 border-b border-border">
          <div className="relative max-w-md">
            <span className="absolute left-2.5 top-2.5 text-muted-foreground pointer-events-none">
              <Search className="w-3.5 h-3.5" />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter PO #, vendor..."
              className="w-full h-8 pl-8 pr-3 text-[13px] bg-card border border-border text-foreground placeholder-neutral-400 focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px] text-foreground border-collapse tabular-nums">
            <thead>
              <tr className="bg-muted/30 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-foreground">
                <th className="py-2.5 px-3 border-r border-border">PO Number</th>
                <th className="py-2.5 px-3 border-r border-border">Vendor Name</th>
                <th className="py-2.5 px-3 border-r border-border">Expected Delivery</th>
                <th className="py-2.5 px-3 border-r border-border text-right">Total Cost</th>
                <th className="py-2.5 px-3 border-r border-border">Status</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {posLoading ? (
                <tr><td colSpan={6} className="py-8 text-center text-[13px] text-muted-foreground">Loading purchase orders…</td></tr>
              ) : filteredPos.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-[13px] text-muted-foreground">No purchase orders found.</td></tr>
              ) : filteredPos.map((po) => (
                <tr key={po.id} className="hover:bg-accent/50 transition-colors cursor-pointer" onClick={() => openDetail(po.id)}>
                  <td className="py-3 px-3 font-semibold text-foreground border-r border-border">{po.po_number}</td>
                  <td className="py-3 px-3 border-r border-border">
                    <p className="font-semibold text-foreground">{po.vendor_name || '—'}</p>
                    <p className="text-[10px] text-muted-foreground tabular-nums">{po.vendor_code || ''}</p>
                  </td>
                  <td className="py-3 px-3 border-r border-border">
                    <p className="font-semibold text-foreground">{po.expected_date ? new Date(po.expected_date).toLocaleDateString() : '—'}</p>
                    <p className="text-[10px] text-muted-foreground">Ordered {po.order_date ? new Date(po.order_date).toLocaleDateString() : '—'}</p>
                  </td>
                  <td className="py-3 px-3 border-r border-border text-right font-semibold">${Number(po.total || 0).toFixed(2)}</td>
                  <td className="py-3 px-3 border-r border-border">
                    <span className={`inline-block px-2 py-0.5 border border-border text-[10px] font-semibold uppercase ${
                      po.status === 'pending_approval' ? 'bg-amber-100 text-amber-800'
                      : po.status === 'sent' || po.status === 'partially_received' ? 'bg-primary text-primary-foreground'
                      : po.status === 'received' || po.status === 'closed' ? 'bg-muted/40 text-foreground'
                      : po.status === 'cancelled' ? 'bg-red-100 text-red-700'
                      : 'bg-card text-foreground'
                    }`}>{po.status.replace(/_/g, ' ')}</span>
                  </td>
                  <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => openDetail(po.id)}
                      className="px-2.5 py-1 border border-border hover:bg-accent/50 text-[10px] font-semibold uppercase transition-colors cursor-pointer"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-3 bg-muted/30 border-t border-border text-[13px] tabular-nums">
          <p className="text-muted-foreground text-[11px] uppercase">Showing {filteredPos.length} of {pos.length} purchase orders</p>
        </div>
      </div>

      {/* ============ CREATE PO MODAL ============ */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-card border border-border w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-lg font-semibold uppercase tracking-tight">Create Purchase Order</h2>
              <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-accent/50 cursor-pointer"><X className="w-5 h-5" /></button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Vendor *</label>
                <select
                  value={createVendorId}
                  onChange={(e) => setCreateVendorId(e.target.value)}
                  className="mt-1 w-full h-9 px-2 bg-card border border-border text-[13px] focus:outline-none"
                >
                  <option value="">Select vendor…</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}{v.vendor_number ? ` (${v.vendor_number})` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Expected Date</label>
                <input
                  type="date"
                  value={createExpectedDate}
                  onChange={(e) => setCreateExpectedDate(e.target.value)}
                  className="mt-1 w-full h-9 px-2 bg-card border border-border text-[13px] focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</label>
              <textarea
                value={createNotes}
                onChange={(e) => setCreateNotes(e.target.value)}
                rows={2}
                className="mt-1 w-full px-2 py-1.5 bg-card border border-border text-[13px] focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[13px] font-semibold uppercase tracking-wider">Line Items ({createLines.length})</h3>
                <button
                  onClick={() => setSkuPickerFor('create')}
                  className="h-8 px-3 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 text-[12px] font-semibold uppercase flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Line
                </button>
              </div>
              {skuPickerFor === 'create' && (
                <div className="border border-border p-3 mb-3 space-y-2 bg-muted/20">
                  <input
                    type="text"
                    value={skuQuery}
                    onChange={(e) => setSkuQuery(e.target.value)}
                    placeholder="Search SKU, barcode, or product name (min 2 chars)…"
                    className="w-full h-9 px-2 bg-card border border-border text-[13px] focus:outline-none"
                    autoFocus
                  />
                  {skuResults.map((s) => (
                    <button
                      key={s.sku_id}
                      onClick={() => addCreateLine(s)}
                      className="w-full text-left px-2 py-1.5 hover:bg-accent/50 border-b border-border/50 text-[13px] cursor-pointer"
                    >
                      <span className="font-semibold">{s.sku_code}</span>
                      <span className="text-muted-foreground"> — {s.product_name || '—'}</span>
                      <span className="text-muted-foreground tabular-nums"> (${Number(s.standard_cost || 0).toFixed(2)})</span>
                    </button>
                  ))}
                  <button onClick={() => { setSkuPickerFor(null); setSkuQuery(''); }} className="text-[12px] text-muted-foreground underline cursor-pointer">Cancel</button>
                </div>
              )}
              {createLines.length === 0 ? (
                <p className="text-[13px] text-muted-foreground py-4 text-center border border-dashed border-border">No line items. Click “Add Line” to add products.</p>
              ) : (
                <table className="w-full text-[13px] border border-border">
                  <thead>
                    <tr className="bg-muted/30 text-[11px] uppercase tracking-wider">
                      <th className="text-left p-2 border-r border-border">SKU</th>
                      <th className="text-left p-2 border-r border-border">Description</th>
                      <th className="text-right p-2 border-r border-border w-20">Qty</th>
                      <th className="text-right p-2 border-r border-border w-28">Unit Cost</th>
                      <th className="text-right p-2 border-r border-border w-28">Line Total</th>
                      <th className="p-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {createLines.map((l, idx) => (
                      <tr key={idx} className="border-t border-border">
                        <td className="p-2 border-r border-border font-mono text-[12px]">{l.sku_code}</td>
                        <td className="p-2 border-r border-border">
                          <input
                            value={l.description}
                            onChange={(e) => setCreateLines((prev) => prev.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))}
                            className="w-full bg-transparent text-[13px] focus:outline-none"
                          />
                        </td>
                        <td className="p-2 border-r border-border">
                          <input
                            type="number" min={1} value={l.quantity}
                            onChange={(e) => setCreateLines((prev) => prev.map((x, i) => i === idx ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x))}
                            className="w-full text-right bg-transparent tabular-nums focus:outline-none"
                          />
                        </td>
                        <td className="p-2 border-r border-border">
                          <input
                            type="number" min={0} step="0.01" value={l.unit_cost}
                            onChange={(e) => setCreateLines((prev) => prev.map((x, i) => i === idx ? { ...x, unit_cost: Math.max(0, Number(e.target.value) || 0) } : x))}
                            className="w-full text-right bg-transparent tabular-nums focus:outline-none"
                          />
                        </td>
                        <td className="p-2 border-r border-border text-right tabular-nums">${(l.quantity * l.unit_cost).toFixed(2)}</td>
                        <td className="p-2 text-center">
                          <button onClick={() => setCreateLines((prev) => prev.filter((_, i) => i !== idx))} className="text-red-600 hover:text-red-800 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {createLines.length > 0 && (
                <p className="text-right text-[14px] font-semibold tabular-nums mt-2">
                  Subtotal: ${createLines.reduce((s, l) => s + l.quantity * l.unit_cost, 0).toFixed(2)}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button onClick={() => setShowCreate(false)} className="h-9 px-4 border border-border text-[13px] font-semibold uppercase cursor-pointer hover:bg-accent/50">Cancel</button>
              <button
                onClick={doCreatePoSubmit}
                disabled={createPo.isPending}
                className="h-9 px-4 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 text-[13px] font-semibold uppercase cursor-pointer disabled:opacity-50"
              >
                {createPo.isPending ? 'Creating…' : 'Create PO (Pending Approval)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ PO DETAIL MODAL ============ */}
      {detailPo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={closeDetail}>
          <div className="bg-card border border-border w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            {detailLoading ? (
              <p className="text-center text-muted-foreground py-8">Loading…</p>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div>
                    <h2 className="text-lg font-semibold uppercase tracking-tight">{detailPo.po_number}</h2>
                    <p className="text-[12px] text-muted-foreground">
                      {detailPo.vendor_name || '—'} {detailPo.vendor_code ? `(${detailPo.vendor_code})` : ''} ·{' '}
                      <span className="uppercase font-semibold">{detailPo.status.replace(/_/g, ' ')}</span>
                    </p>
                  </div>
                  <button onClick={closeDetail} className="p-1 hover:bg-accent/50 cursor-pointer"><X className="w-5 h-5" /></button>
                </div>

                {/* Approval actions */}
                {canApprove && (
                  <div className="flex gap-2 p-3 bg-amber-50 border border-amber-200">
                    <span className="text-[13px] font-semibold text-amber-800 self-center">This PO needs approval:</span>
                    <button
                      onClick={() => doStatusChange(detailPo.id, 'approved')}
                      className="h-8 px-3 bg-green-700 text-white text-[12px] font-semibold uppercase cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5 inline mr-1" /> Approve
                    </button>
                    <button
                      onClick={() => doStatusChange(detailPo.id, 'cancelled')}
                      className="h-8 px-3 bg-red-700 text-white text-[12px] font-semibold uppercase cursor-pointer"
                    >
                      Reject
                    </button>
                  </div>
                )}
                {detailPo.status === 'approved' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => doStatusChange(detailPo.id, 'sent')}
                      className="h-8 px-3 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 text-[12px] font-semibold uppercase cursor-pointer"
                    >
                      <Truck className="w-3.5 h-3.5 inline mr-1" /> Send to Vendor
                    </button>
                  </div>
                )}

                {/* Header info / edit */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[13px]">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Order Date</p>
                    <p className="font-semibold">{detailPo.order_date ? new Date(detailPo.order_date).toLocaleDateString() : '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Expected Date</p>
                    {editingHeader ? (
                      <input type="date" value={editExpectedDate} onChange={(e) => setEditExpectedDate(e.target.value)} className="h-8 px-1 border border-border bg-card text-[13px] w-full" />
                    ) : (
                      <p className="font-semibold">{detailPo.expected_date ? new Date(detailPo.expected_date).toLocaleDateString() : '—'}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Total</p>
                    <p className="font-semibold tabular-nums">${Number(detailPo.total || 0).toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Vendor Contact</p>
                    <p className="font-semibold">{detailPo.vendor_email || '—'}</p>
                    <p className="text-muted-foreground">{detailPo.vendor_phone || ''}</p>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Notes</p>
                  {editingHeader ? (
                    <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={2} className="w-full px-2 py-1 border border-border bg-card text-[13px]" />
                  ) : (
                    <p className="text-[13px]">{detailPo.notes || '—'}</p>
                  )}
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    {editingHeader ? (
                      <>
                        <button onClick={doSaveHeader} className="h-8 px-3 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 text-[12px] font-semibold uppercase cursor-pointer">Save</button>
                        <button onClick={() => setEditingHeader(false)} className="h-8 px-3 border border-border text-[12px] font-semibold uppercase cursor-pointer">Cancel</button>
                      </>
                    ) : (
                      <button onClick={() => setEditingHeader(true)} className="h-8 px-3 border border-border text-[12px] font-semibold uppercase cursor-pointer flex items-center gap-1">
                        <Pencil className="w-3.5 h-3.5" /> Edit PO
                      </button>
                    )}
                  </div>
                )}

                {/* Lines */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-[13px] font-semibold uppercase tracking-wider">Line Items ({detailLines.length})</h3>
                    {canEdit && !addingLine && (
                      <button onClick={() => setAddingLine(true)} className="h-8 px-3 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 text-[12px] font-semibold uppercase cursor-pointer flex items-center gap-1">
                        <Plus className="w-3.5 h-3.5" /> Add Line
                      </button>
                    )}
                  </div>
                  {addingLine && (
                    <div className="border border-border p-3 mb-3 space-y-2 bg-muted/20">
                      <input
                        type="text" value={skuQuery} onChange={(e) => setSkuQuery(e.target.value)}
                        placeholder="Search SKU, barcode, or product name (min 2 chars)…"
                        className="w-full h-9 px-2 bg-card border border-border text-[13px] focus:outline-none" autoFocus
                      />
                      {skuResults.map((s) => (
                        <AddLineRow key={s.sku_id} sku={s} onAdd={(qty, cost) => doAddLine(s, qty, cost)} />
                      ))}
                      <button onClick={() => { setAddingLine(false); setSkuQuery(''); }} className="text-[12px] text-muted-foreground underline cursor-pointer">Cancel</button>
                    </div>
                  )}
                  {detailLines.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground py-4 text-center border border-dashed border-border">No line items on this PO.</p>
                  ) : (
                    <table className="w-full text-[13px] border border-border">
                      <thead>
                        <tr className="bg-muted/30 text-[11px] uppercase tracking-wider">
                          <th className="text-left p-2 border-r border-border">SKU</th>
                          <th className="text-left p-2 border-r border-border">Description</th>
                          <th className="text-right p-2 border-r border-border">Ordered</th>
                          <th className="text-right p-2 border-r border-border">Received</th>
                          <th className="text-right p-2 border-r border-border">Unit Cost</th>
                          <th className="text-right p-2 border-r border-border">Line Total</th>
                          {(canEdit || detailPo.status === 'sent' || detailPo.status === 'partially_received') && <th className="p-2">Receive Qty</th>}
                          {canEdit && <th className="p-2 w-10"></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {detailLines.map((l) => {
                          const remaining = l.quantity_ordered - l.quantity_received;
                          return (
                            <tr key={l.id} className="border-t border-border">
                              <td className="p-2 border-r border-border font-mono text-[12px]">{l.sku_code || '—'}</td>
                              <td className="p-2 border-r border-border">{l.description || '—'}</td>
                              <td className="p-2 border-r border-border text-right tabular-nums">{l.quantity_ordered}</td>
                              <td className="p-2 border-r border-border text-right tabular-nums">{l.quantity_received}</td>
                              <td className="p-2 border-r border-border text-right tabular-nums">${l.unit_cost.toFixed(2)}</td>
                              <td className="p-2 border-r border-border text-right tabular-nums">${l.line_total.toFixed(2)}</td>
                              {(canEdit || detailPo.status === 'sent' || detailPo.status === 'partially_received') && (
                                <td className="p-2">
                                  <input
                                    type="number" min={0} max={remaining} step="1"
                                    value={receiveQtys[l.id] ?? ''}
                                    onChange={(e) => setReceiveQtys((prev) => ({ ...prev, [l.id]: Math.max(0, Math.min(remaining, Number(e.target.value) || 0)) }))}
                                    placeholder="0"
                                    className="w-20 h-8 px-1 text-right border border-border bg-card tabular-nums text-[13px]"
                                  />
                                </td>
                              )}
                              {canEdit && (
                                <td className="p-2 text-center">
                                  <button onClick={() => doRemoveLine(l.id)} className="text-red-600 hover:text-red-800 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Receive action */}
                {(detailPo.status === 'sent' || detailPo.status === 'partially_received' || detailPo.status === 'approved') && detailLines.length > 0 && (
                  <div className="flex justify-end gap-2 pt-2 border-t border-border">
                    <button
                      onClick={doReceive}
                      disabled={receivePo.isPending}
                      className="h-9 px-4 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 text-[13px] font-semibold uppercase cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Package className="w-4 h-4" />
                      {receivePo.isPending ? 'Receiving…' : 'Receive Selected Quantities'}
                    </button>
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

// Inline row for adding a line: qty + cost inputs then Add button
function AddLineRow({ sku, onAdd }: { sku: Sku; onAdd: (qty: number, cost: number) => void }) {
  const [qty, setQty] = useState(1);
  const [cost, setCost] = useState(Number(sku.standard_cost || sku.unit_price || 0));
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border/50 text-[13px]">
      <div className="flex-1">
        <span className="font-semibold">{sku.sku_code}</span>
        <span className="text-muted-foreground"> — {sku.product_name || '—'}</span>
      </div>
      <input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} className="w-16 h-8 px-1 text-right border border-border bg-card tabular-nums" placeholder="Qty" />
      <input type="number" min={0} step="0.01" value={cost} onChange={(e) => setCost(Math.max(0, Number(e.target.value) || 0))} className="w-24 h-8 px-1 text-right border border-border bg-card tabular-nums" placeholder="Cost" />
      <button onClick={() => onAdd(qty, cost)} className="h-8 px-3 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 text-[12px] font-semibold uppercase cursor-pointer">Add</button>
    </div>
  );
}
