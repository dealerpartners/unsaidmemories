'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Search, Store, Truck, Plus, Barcode, PackagePlus, ArrowRightLeft, AlertTriangle,
  Download, FileText, X, Loader2, ImagePlus, Package, RefreshCw, Flag, Ban, Rss,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useRestockInventory,
  useAddInventory,
  useExportInventoryCsv,
  useExportInventoryLedger,
  useCommerceAction,
} from '@/hooks/admin/useActions';

type MediaItem = {
  id?: string;
  url: string;
  altText?: string | null;
  sortOrder?: number | null;
  isPrimary?: boolean;
};

type Row = {
  product_id: string;
  sku_id?: string;
  catalog_item_id?: string | null;
  slug?: string | null;
  image?: string | null;
  media?: MediaItem[];
  sku: string;
  name: string;
  brand: string | null;
  unit_price: number | string;
  on_hand?: number;
  reserved?: number;
  reorder_point?: number;
  cost?: number | null;
  supplier?: string | null;
  type?: string | null;
  bin_locations?: string | null;
  seller_id?: string | null;
  seller_name?: string | null;
};

// Marketplace Feed rows — seller_listings via GET /api/admin/listings
// (§2.4.1/§2.4.4: the feed is monitored and acted on from this surface).
type FeedRow = {
  id: string;
  sellerId: string;
  seller: string;
  productId: string | null;
  name: string;
  sku: string;
  brand: string | null;
  price: number | null;
  status: string;
  suppressionReason: string | null;
  healthScore: number | null;
  mediaCount: number;
  submittedAt: string;
};

// The listings POST suppression causes (lib/sellers/listings-review).
const SUPPRESSION_CATEGORIES = ['Policy violation', 'IP complaint', 'Safety recall', 'Restricted product', 'Counterfeit flag'];
// Trust-center investigation types (lib/trust-safety INVESTIGATION_TYPES).
const INVESTIGATION_TYPES = [
  { id: 'counterfeit', label: 'Counterfeit' },
  { id: 'stolen_property', label: 'Stolen property' },
  { id: 'ip_infringement', label: 'IP infringement' },
  { id: 'fraud_patterns', label: 'Fraud patterns' },
  { id: 'safety_incidents', label: 'Safety incidents' },
];

type Data = {
  counts: { instore: number; dropship: number };
  rows: Row[];
  page: number;
  pageSize: number;
  total: number;
};

type PickerProduct = {
  id: string;
  productId: string;
  skuId: string;
  name: string;
  sku: string;
  stock: number;
  priceCents: number | null;
  image: string | null;
};

const money = (n: number | string | null | undefined) => (n == null ? '—' : `$${Number(n).toFixed(2)}`);
const SNAPSHOT_PREFIX = 'unsaid:inventory-snapshot:v1:';

export function InventoryTabs() {
  const [tab, setTab] = useState<'instore' | 'dropship' | 'feed'>('instore');
  // Marketplace Feed state (§2.4.1/§2.4.4/§2.4.6)
  const [feed, setFeed] = useState<{ rows: FeedRow[]; counts: Record<string, number>; suppressedCount: number } | null>(null);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedMsg, setFeedMsg] = useState('');
  const [suspendFor, setSuspendFor] = useState<string | null>(null);
  const [suspendCategory, setSuspendCategory] = useState(SUPPRESSION_CATEGORIES[0]);
  const [suspendDetail, setSuspendDetail] = useState('');
  const [flagFor, setFlagFor] = useState<string | null>(null);
  const [flagType, setFlagType] = useState('counterfeit');
  const [flagReason, setFlagReason] = useState('');
  const [feedBusy, setFeedBusy] = useState(false);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Data | null>(null);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [staleAt, setStaleAt] = useState<number | null>(null);
  const dataKeyRef = useRef('');

  // Quick action hooks — tree §4 inventory actions
  const restock = useRestockInventory();
  const addInventory = useAddInventory();
  const exportCsv = useExportInventoryCsv();
  const exportLedger = useExportInventoryLedger();
  const commerce = useCommerceAction();

  const viewKey = `${tab}:${q}:${page}`;
  const readOnly = staleAt !== null;

  const load = useCallback(async () => {
    if (tab === 'feed') return;
    const key = `${tab}:${q}:${page}`;
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/inventory?tab=${tab}&q=${encodeURIComponent(q)}&page=${page}`, { cache: 'no-store' });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || j.error) throw new Error(j?.error || `HTTP ${r.status}`);
      setData(j as Data);
      dataKeyRef.current = key;
      setStaleAt(null);
      setError('');
      try {
        localStorage.setItem(`${SNAPSHOT_PREFIX}${key}`, JSON.stringify({ savedAt: Date.now(), data: j }));
      } catch { /* storage full/blocked — the live data is already on screen */ }
    } catch (e) {
      let snap: { savedAt?: number; data?: Data } | null = null;
      try {
        const raw = localStorage.getItem(`${SNAPSHOT_PREFIX}${key}`);
        if (raw) snap = JSON.parse(raw);
      } catch { snap = null; }
      if (snap?.data) {
        setData(snap.data);
        dataKeyRef.current = key;
        setStaleAt(snap.savedAt || Date.now());
        setError('Live inventory is unavailable. Showing the last saved copy from this browser — editing is paused until the connection returns.');
      } else if (dataKeyRef.current === key) {
        setStaleAt((prev) => prev ?? Date.now());
        setError('Live inventory refresh failed. Showing the rows already on screen — editing is paused until the connection returns.');
      } else {
        setData(null);
        setError(e instanceof Error ? e.message : 'Inventory could not be loaded.');
      }
    } finally {
      setLoading(false);
    }
  }, [tab, q, page]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  // Marketplace Feed — seller_listings through GET /api/admin/listings;
  // the search box searches title / SKU / seller there (its own contract).
  const loadFeed = useCallback(async () => {
    setFeedLoading(true);
    try {
      const r = await fetch(`/api/admin/listings?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j) throw new Error(j?.error || `HTTP ${r.status}`);
      setFeed({ rows: j.rows || [], counts: j.counts || {}, suppressedCount: j.suppressedCount || 0 });
    } catch (e) {
      setFeedMsg(e instanceof Error ? e.message : 'The marketplace feed could not be loaded.');
    } finally {
      setFeedLoading(false);
    }
  }, [q]);

  useEffect(() => {
    if (tab !== 'feed') return;
    const t = setTimeout(loadFeed, 250);
    return () => clearTimeout(t);
  }, [tab, loadFeed]);

  const feedPost = async (body: Record<string, unknown>, okMsg: string) => {
    setFeedBusy(true);
    setFeedMsg('');
    try {
      const r = await fetch('/api/admin/listings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setFeedMsg(j.error || 'The action could not be saved.'); return; }
      setFeedMsg(okMsg);
      setSuspendFor(null);
      await loadFeed();
    } catch {
      setFeedMsg('The action could not be saved — network error.');
    } finally {
      setFeedBusy(false);
    }
  };

  // §2.4.6 — flag a listing into the Trust Center: opens a
  // seller_investigations case against the listing's seller.
  const flagListing = async (row: FeedRow) => {
    if (!flagReason.trim()) { setFeedMsg('Add why this listing is being flagged — it goes on the trust case.'); return; }
    setFeedBusy(true);
    setFeedMsg('');
    try {
      const r = await fetch('/api/admin/trust-safety/investigations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          seller_id: row.sellerId,
          investigation_type: flagType,
          priority: 'medium',
          notes: `Flagged from Inventory → Marketplace Feed. Listing ${row.id} "${row.name}" (SKU ${row.sku}): ${flagReason.trim()}`,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setFeedMsg(j.error || 'The trust case could not be opened.'); return; }
      setFeedMsg(`Trust case opened for ${row.seller} — the listing flag is with the Trust Center.`);
      setFlagFor(null);
      setFlagReason('');
    } catch {
      setFeedMsg('The trust case could not be opened — network error.');
    } finally {
      setFeedBusy(false);
    }
  };

  async function act(body: object) {
    if (readOnly) { setMsg('Editing is paused while live inventory is unavailable.'); return; }
    setMsg('');
    const r = await fetch('/api/admin/inventory', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setMsg(j.error || 'Failed');
    else await load();
  }

  const doRestock = () => openAdder();

  const doBarcodeLookup = () => {
    if (readOnly) { setMsg('Barcode lookup needs the live connection.'); return; }
    const code = prompt('Scan or enter barcode:');
    if (!code) return;
    commerce.mutate({ action: 'com_barcode_lookup', payload: { barcode: code } }, {
      onSuccess: (res: any) => {
        const d = res?.data || res;
        setMsg(d?.name ? `Found: ${d.name} (SKU ${d.sku || '—'})` : 'No product found for that barcode.');
      },
      onError: (e) => setMsg(e.message),
    });
  };

  const doReceiveShipment = async () => {
    if (readOnly) { setMsg('Receiving needs the live connection.'); return; }
    const poId = prompt('Purchase order ID to receive:');
    if (!poId) return;
    // Receive = receive the PO's OUTSTANDING lines in full. The commerce
    // receive action refuses an empty item list on purpose (an empty
    // receive used to flip PO status without moving stock), so fetch the
    // lines, show exactly what will land, and submit explicit quantities
    // (each capped server-side at what was ordered). Partial receipts
    // belong on the Purchase Orders screen, which edits per line.
    try {
      const r = await fetch(`/api/admin/purchase-orders/${encodeURIComponent(poId.trim())}/lines`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j.error || 'Could not load that purchase order.'); return; }
      const lines = (j.lines || []) as { sku_id: string; sku_code?: string; description?: string; quantity_ordered: number; quantity_received: number; unit_cost: number }[];
      const outstanding = lines
        .map((l) => ({ ...l, remaining: Number(l.quantity_ordered || 0) - Number(l.quantity_received || 0) }))
        .filter((l) => l.sku_id && l.remaining > 0);
      if (!outstanding.length) {
        setMsg(lines.length ? 'That purchase order has nothing outstanding to receive.' : 'That purchase order has no lines.');
        return;
      }
      const summary = outstanding.map((l) => `${l.remaining} × ${l.sku_code || l.description || 'item'}`).join('\n');
      if (!window.confirm(`Receive the full outstanding shipment?\n\n${summary}`)) return;
      commerce.mutate({
        action: 'com_receive_po',
        payload: {
          po_id: poId.trim(),
          received_items: outstanding.map((l) => ({ sku_id: l.sku_id, quantity: l.remaining, unit_cost: Number(l.unit_cost || 0) })),
        },
      }, {
        onSuccess: () => { setMsg('Shipment received.'); load(); },
        onError: (e) => setMsg(e.message),
      });
    } catch {
      setMsg('Could not load that purchase order.');
    }
  };

  const doTransfer = () => {
    if (readOnly) { setMsg('Transfers need the live connection.'); return; }
    const productId = prompt('Product ID to transfer:');
    if (!productId) return;
    const fromWh = prompt('From warehouse ID:');
    const toWh = prompt('To warehouse ID:');
    const qty = Number(prompt('Quantity:', '1') || '0');
    if (!fromWh || !toWh || !qty) return;
    commerce.mutate({ action: 'com_transfer_stock', payload: { product_id: productId, from_warehouse_id: fromWh, to_warehouse_id: toWh, quantity: qty } }, {
      onSuccess: () => { setMsg('Transfer recorded.'); load(); },
      onError: (e) => setMsg(e.message),
    });
  };

  const doLowStockReport = () => {
    if (readOnly) { setMsg('Reports need the live connection.'); return; }
    commerce.mutate({ action: 'com_low_stock_report', payload: {} }, {
      onSuccess: (res: any) => {
        const rows = res?.data || res?.rows || [];
        setMsg(Array.isArray(rows) ? `${rows.length} low-stock items found.` : 'Report generated.');
      },
      onError: (e) => setMsg(e.message),
    });
  };

  const doExport = (kind: 'csv' | 'ledger') => {
    if (readOnly) { setMsg('Exports need the live connection.'); return; }
    const hook = kind === 'csv' ? exportCsv : exportLedger;
    hook.mutate({} as any, {
      onSuccess: (res: any) => {
        // Both exports return a real CSV payload — download it. (The old
        // handler announced "Export started" and delivered nothing.)
        const csv = res?.csv;
        if (csv) {
          const blob = new Blob([csv], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = kind === 'csv' ? 'inventory-stock.csv' : 'inventory-movements.csv';
          a.click();
          URL.revokeObjectURL(url);
          const n = kind === 'csv' ? (res?.csvData?.totalSkus ?? 0) : (res?.ledgerData?.totalMovements ?? 0);
          setMsg(`Downloaded ${kind === 'csv' ? 'stock levels' : 'movement ledger'} — ${n} row${n === 1 ? '' : 's'}.`);
        } else {
          setMsg('Export returned no data.');
        }
      },
      onError: (e) => setMsg(e.message),
    });
  };

  // ---- Add Inventory / Restock modal -------------------------------------
  const [adder, setAdder] = useState<null | {
    q: string;
    results: PickerProduct[];
    searching: boolean;
    picked: PickerProduct | null;
    qty: string;
    saving: boolean;
    err: string | null;
  }>(null);
  const adderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function openAdder() {
    if (readOnly) { setMsg('Adding inventory needs the live connection.'); return; }
    setAdder({ q: '', results: [], searching: false, picked: null, qty: '', saving: false, err: null });
  }

  const searchPicker = (value: string) => {
    setAdder((a) => (a ? { ...a, q: value, searching: true, err: null } : a));
    if (adderTimer.current) clearTimeout(adderTimer.current);
    adderTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/products?page=1&limit=20&source=all&q=${encodeURIComponent(value)}`, { cache: 'no-store' });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
        const results: PickerProduct[] = (j.products || []).map((p: any) => ({
          id: p.id,
          productId: p.productId,
          skuId: p.skuId,
          name: p.name,
          sku: p.sku || '',
          stock: Number(p.stock || 0),
          priceCents: p.priceCents ?? null,
          image: p.image || null,
        }));
        setAdder((a) => (a && a.q === value ? { ...a, results, searching: false } : a));
      } catch {
        setAdder((a) => (a && a.q === value ? { ...a, results: [], searching: false, err: 'Catalog search failed. Try again.' } : a));
      }
    }, 250);
  };

  const saveAdder = async () => {
    if (!adder?.picked) return;
    const qty = Number(adder.qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      setAdder({ ...adder, err: 'Enter how many units you received (above 0).' });
      return;
    }
    setAdder({ ...adder, saving: true, err: null });
    const onHand = adder.picked.stock + qty;
    const r1 = await fetch('/api/admin/inventory', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'set_stock', skuId: adder.picked.skuId, onHand }),
    });
    const j1 = await r1.json().catch(() => ({}));
    if (!r1.ok) { setAdder({ ...adder, saving: false, err: j1.error || 'Saving the count failed.' }); return; }
    const r2 = await fetch('/api/admin/inventory', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'add_in_store', productId: adder.picked.productId }),
    });
    const j2 = await r2.json().catch(() => ({}));
    if (!r2.ok) { setAdder({ ...adder, saving: false, err: `Stock saved, but flagging it in-store failed: ${j2.error || 'unknown error'}` }); return; }
    const name = adder.picked.name;
    setAdder(null);
    setTab('instore');
    setPage(0);
    setQ('');
    setMsg(`Added ${qty} × ${name} — now ${onHand} on hand in store.`);
    if (tab === 'instore' && page === 0 && q === '') load();
  };

  // ---- Product image editor ----------------------------------------------
  const [imageEd, setImageEd] = useState<null | {
    row: Row;
    url: string;
    file: File | null;
    saving: boolean;
    err: string | null;
  }>(null);

  const openImageEditor = (row: Row) => {
    if (readOnly) { setMsg('Image editing needs the live connection.'); return; }
    if (!row.catalog_item_id) { setMsg('This row has no catalog listing yet, so it has nowhere to store an image.'); return; }
    setImageEd({ row, url: row.image || '', file: null, saving: false, err: null });
  };

  const saveImage = async () => {
    if (!imageEd) return;
    const { row } = imageEd;
    setImageEd({ ...imageEd, saving: true, err: null });
    try {
      let finalUrl = imageEd.url.trim();
      if (imageEd.file) {
        const fd = new FormData();
        fd.append('file', imageEd.file);
        const up = await fetch('/api/admin/products?upload=image', { method: 'POST', body: fd });
        const uj = await up.json().catch(() => ({}));
        if (!up.ok || !uj.url) throw new Error(uj.error || 'Image upload failed.');
        finalUrl = uj.url;
      }
      if (!finalUrl) throw new Error('Choose an image file or paste an image URL.');
      // PATCH replaces the media list wholesale — send the full existing
      // list back with the chosen image promoted to primary, so no other
      // product photos are lost.
      const media = (row.media || []).map((m) => ({ url: m.url, altText: m.altText || row.name, isPrimary: false }));
      const idx = media.findIndex((m) => m.url === finalUrl);
      if (idx >= 0) {
        const [m] = media.splice(idx, 1);
        media.unshift({ ...m, isPrimary: true });
      } else {
        media.unshift({ url: finalUrl, altText: row.name, isPrimary: true });
      }
      const res = await fetch(`/api/admin/products/${encodeURIComponent(row.catalog_item_id!)}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ media }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Saving the image failed.');
      setImageEd(null);
      setMsg(`Image updated for ${row.name}.`);
      await load();
    } catch (e) {
      setImageEd({ ...imageEd, saving: false, err: e instanceof Error ? e.message : 'Saving the image failed.' });
    }
  };

  const tabBtn = (id: 'instore' | 'dropship' | 'feed', label: string, Icon: any, n?: number) => (
    <button
      onClick={() => { setTab(id); setPage(0); setQ(''); }}
      className={cn('flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold', tab === id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
    >
      <Icon className="size-4" /> {label}{n != null && <span className="rounded-full bg-muted px-2 text-xs">{n.toLocaleString()}</span>}
    </button>
  );

  const total = data?.total ?? 0;
  const pageSize = data?.pageSize || 50;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const rangeFrom = total === 0 ? 0 : page * pageSize + 1;
  const rangeTo = Math.min(total, page * pageSize + (data?.rows.length || 0));
  const qaBtn = 'inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className="flex w-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4">
        <div className="flex">
          {tabBtn('instore', 'In Store', Store, data?.counts.instore)}
          {tabBtn('dropship', 'Dropship', Truck, data?.counts.dropship)}
          {tabBtn('feed', 'Marketplace Feed', Rss, feed ? Object.values(feed.counts).reduce((a, b) => a + b, 0) : undefined)}
        </div>
        <div className="my-2 flex flex-wrap items-center gap-2">
          {loading && data && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Updating…
            </span>
          )}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder={tab === 'feed' ? 'Search listings, SKU, or seller' : 'Search name, SKU, brand, or seller'}
              className="h-9 w-64 max-w-full rounded-lg border border-border bg-background pl-8 pr-3 text-sm" />
          </div>
          {tab !== 'feed' && (
            <button onClick={openAdder} disabled={readOnly}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
              <Plus className="size-4" /> Add Inventory
            </button>
          )}
        </div>
      </div>

      <p className="px-4 pt-3 text-xs text-muted-foreground">
        {tab === 'feed'
          ? 'The marketplace feed: every seller listing, its review state, and its suppression state — monitored and acted on here. Suspending a listing hides it from the storefront and the PDP; the seller sees the reason.'
          : tab === 'instore'
          ? 'Products on our shelves. Counts come off as POS and in-store pickups sell. Click a product photo to change its image.'
          : 'Supplier-shipped products. We hold no stock — the supplier ships when an order is paid. Click a product photo to change its image.'}
      </p>

      {/* Quick actions — tree §4 inventory */}
      {tab !== 'feed' && (
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
        <button onClick={doRestock} disabled={readOnly} className={qaBtn}>
          <PackagePlus className="size-3.5" /> Restock
        </button>
        <button onClick={doBarcodeLookup} disabled={readOnly} className={qaBtn}>
          <Barcode className="size-3.5" /> Barcode Lookup
        </button>
        <button onClick={doReceiveShipment} disabled={readOnly} className={qaBtn}>
          <Truck className="size-3.5" /> Receive Shipment
        </button>
        <button onClick={doTransfer} disabled={readOnly} className={qaBtn}>
          <ArrowRightLeft className="size-3.5" /> Transfer
        </button>
        <button onClick={doLowStockReport} disabled={readOnly} className={qaBtn}>
          <AlertTriangle className="size-3.5" /> Low Stock Report
        </button>
        <button onClick={() => doExport('csv')} disabled={readOnly} className={qaBtn}>
          <Download className="size-3.5" /> Export CSV
        </button>
        <button onClick={() => doExport('ledger')} disabled={readOnly} className={qaBtn}>
          <FileText className="size-3.5" /> Export Ledger
        </button>
      </div>
      )}
      {msg && <p className="mx-4 mt-3 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground">{msg}</p>}
      {staleAt !== null && (
        <div className="mx-4 mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
          <AlertTriangle className="size-4 shrink-0 text-warning" />
          <span>
            {error} Last saved copy: {new Date(staleAt).toLocaleString()}.
          </span>
          <button onClick={load} className="ml-auto inline-flex items-center gap-1 rounded border border-border bg-background px-2.5 py-1 text-xs font-semibold hover:bg-muted">
            <RefreshCw className="size-3.5" /> Retry
          </button>
        </div>
      )}
      {error && staleAt === null && data && (
        <p className="mx-4 mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {/* Marketplace Feed (§2.4.1/§2.4.4) — seller_listings monitored and
          acted on from this surface: approve/reject review, suspend
          (suppress) with a cause, unsuspend, and flag → trust case. */}
      {tab === 'feed' && (
        <div className="p-4">
          {feedMsg && <p className="mb-3 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground">{feedMsg}</p>}
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-muted px-2.5 py-1">Listings: {feed ? Object.values(feed.counts).reduce((a, b) => a + b, 0) : '—'}</span>
            <span className="rounded-full bg-muted px-2.5 py-1">Pending review: {feed?.counts['pending_review'] ?? 0}</span>
            <span className="rounded-full bg-muted px-2.5 py-1">Approved: {feed?.counts['approved'] ?? 0}</span>
            <span className="rounded-full bg-muted px-2.5 py-1">Suspended (suppressed): {feed?.suppressedCount ?? 0}</span>
          </div>
          {feedLoading && !feed ? (
            <div className="space-y-3" aria-label="Loading marketplace feed">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg border border-border bg-muted/30" />
              ))}
            </div>
          ) : !feed || feed.rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No seller listings match. Listings sellers publish appear here for monitoring, suspension, and trust flags.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="pr-3 pb-2">Listing</th>
                    <th className="pr-3 pb-2">Seller</th>
                    <th className="pr-3 pb-2">Price</th>
                    <th className="pr-3 pb-2">Status</th>
                    <th className="pr-3 pb-2">Suppression</th>
                    <th className="pb-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {feed.rows.map((r) => (
                    <tr key={r.id} className="border-t border-border align-top">
                      <td className="pr-3 py-2.5">
                        <span className="font-medium text-foreground">{r.name}</span>
                        <span className="block text-xs text-muted-foreground">{r.sku}{r.brand ? ` · ${r.brand}` : ''} · {r.mediaCount} photo(s)</span>
                      </td>
                      <td className="pr-3 py-2.5">{r.seller}</td>
                      <td className="pr-3 py-2.5 tabular-nums">{money(r.price)}</td>
                      <td className="pr-3 py-2.5">
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium uppercase">{r.status.replace(/_/g, ' ')}</span>
                      </td>
                      <td className="pr-3 py-2.5 text-xs text-muted-foreground">{r.suppressionReason || '—'}</td>
                      <td className="py-2.5">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {(r.status === 'pending_review' || r.status === 'draft') && (
                            <>
                              <button disabled={feedBusy} onClick={() => void feedPost({ action: 'approve', listingId: r.id }, `Listing "${r.name}" approved.`)}
                                className="rounded border border-border px-2 py-1 text-xs font-semibold hover:bg-muted disabled:opacity-40">Approve</button>
                              <button disabled={feedBusy} onClick={() => {
                                const reason = window.prompt('Rejection reason — the seller sees it:');
                                if (reason) void feedPost({ action: 'reject', listingId: r.id, reason }, `Listing "${r.name}" rejected.`);
                              }} className="rounded border border-border px-2 py-1 text-xs font-semibold hover:bg-muted disabled:opacity-40">Reject</button>
                            </>
                          )}
                          {r.suppressionReason ? (
                            <button disabled={feedBusy} onClick={() => void feedPost({ action: 'unsuppress', listingId: r.id }, `Listing "${r.name}" unsuspended — visible on the storefront again.`)}
                              className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs font-semibold hover:bg-muted disabled:opacity-40">
                              <Ban className="size-3" /> Unsuspend
                            </button>
                          ) : (
                            <button disabled={feedBusy} onClick={() => { setSuspendFor(r.id); setFlagFor(null); }}
                              className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs font-semibold hover:bg-muted disabled:opacity-40">
                              <Ban className="size-3" /> Suspend
                            </button>
                          )}
                          <button disabled={feedBusy} onClick={() => { setFlagFor(r.id); setSuspendFor(null); }}
                            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs font-semibold hover:bg-muted disabled:opacity-40">
                            <Flag className="size-3" /> Flag
                          </button>
                        </div>
                        {suspendFor === r.id && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 justify-end">
                            <select value={suspendCategory} onChange={(e) => setSuspendCategory(e.target.value)} className="h-7 rounded border border-border bg-background px-1.5 text-xs">
                              {SUPPRESSION_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <input value={suspendDetail} onChange={(e) => setSuspendDetail(e.target.value)} placeholder="Detail (seller sees it)" className="h-7 rounded border border-border bg-background px-2 text-xs w-44" />
                            <button disabled={feedBusy} onClick={() => void feedPost({ action: 'suppress', listingId: r.id, category: suspendCategory, reason: suspendDetail }, `Listing "${r.name}" suspended (${suspendCategory}) — hidden from the storefront.`)}
                              className="rounded bg-destructive px-2 py-1 text-xs font-semibold text-destructive-foreground disabled:opacity-40">Confirm suspend</button>
                            <button onClick={() => setSuspendFor(null)} className="rounded border border-border px-2 py-1 text-xs">Cancel</button>
                          </div>
                        )}
                        {flagFor === r.id && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 justify-end">
                            <select value={flagType} onChange={(e) => setFlagType(e.target.value)} className="h-7 rounded border border-border bg-background px-1.5 text-xs">
                              {INVESTIGATION_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                            </select>
                            <input value={flagReason} onChange={(e) => setFlagReason(e.target.value)} placeholder="Why is this flagged?" className="h-7 rounded border border-border bg-background px-2 text-xs w-44" />
                            <button disabled={feedBusy} onClick={() => void flagListing(r)}
                              className="rounded bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-40">Open trust case</button>
                            <button onClick={() => setFlagFor(null)} className="rounded border border-border px-2 py-1 text-xs">Cancel</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab !== 'feed' && (!data && loading ? (
        <div className="space-y-3 p-4" aria-label="Loading inventory">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg border border-border bg-muted/30" />
          ))}
        </div>
      ) : !data && error ? (
        <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
          <AlertTriangle className="mb-2 size-8 text-destructive" />
          <p className="text-sm font-medium">Inventory could not be loaded</p>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            {error} No saved copy exists in this browser yet — once inventory loads here once, a saved copy will be kept for outages.
          </p>
          <button onClick={load} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">
            <RefreshCw className="size-3.5" /> Retry
          </button>
        </div>
      ) : (
        <div className={cn('overflow-x-auto p-4 transition-opacity', loading ? 'opacity-70' : 'opacity-100')}>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">Product</th><th className="pr-3">SKU</th><th className="pr-3">Category</th>
                {tab === 'instore' ? (<><th className="pr-3">On hand</th><th className="pr-3">Reserved</th><th className="pr-3">Reorder at</th><th className="pr-3">Bin</th><th className="pr-3">Price</th><th /></>)
                  : (<><th className="pr-3">Fulfillment</th><th className="pr-3">Cost</th><th className="pr-3">Price</th><th className="pr-3">Margin</th><th /></>)}
              </tr>
            </thead>
            <tbody>
              {(data?.rows || []).map((r) => {
                const margin = r.cost ? Math.round(((Number(r.unit_price) - r.cost) / Number(r.unit_price)) * 100) : null;
                return (
                  <tr key={r.sku + r.product_id} className="border-t border-border">
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-3">
                        <button type="button" onClick={() => openImageEditor(r)} disabled={readOnly || !r.catalog_item_id}
                          title={r.catalog_item_id ? 'Change product image' : 'No catalog listing for this row'}
                          className="shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50">
                          {r.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.image} alt={r.name} className="size-11 rounded-lg border border-border object-cover" loading="lazy" />
                          ) : (
                            <span className="flex size-11 items-center justify-center rounded-lg border border-border bg-muted">
                              <Package className="size-5 text-muted-foreground" />
                            </span>
                          )}
                        </button>
                        <div>
                          <div className="font-medium">{r.name}</div>
                          <div className="text-xs text-muted-foreground">{r.brand}{r.seller_name ? ` · Seller: ${r.seller_name}` : ''}</div>
                        </div>
                      </div>
                    </td>
                    <td className="pr-3 font-mono text-xs">{r.sku}</td>
                    <td className="pr-3 text-xs">{r.type || (tab === 'instore' ? 'In-Store' : 'Dropship')}</td>
                    {tab === 'instore' ? (
                      <>
                        <StockCell value={r.on_hand || 0} disabled={readOnly} onSave={(v) => act({ action: 'set_stock', skuId: r.sku_id, onHand: v })} low={(r.on_hand || 0) <= (r.reorder_point || 0)} />
                        <td className="pr-3">{r.reserved}</td>
                        <StockCell value={r.reorder_point || 0} disabled={readOnly} onSave={(v) => act({ action: 'set_stock', skuId: r.sku_id, onHand: r.on_hand || 0, reorderPoint: v })} />
                        <td className="pr-3 font-mono text-xs">{r.bin_locations || '—'}</td>
                        <td className="pr-3">{money(r.unit_price)}</td>
                        <td>
                          <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                            <button className="inline-flex items-center gap-1 text-xs underline disabled:opacity-40" disabled={readOnly || !r.catalog_item_id} onClick={() => openImageEditor(r)}>
                              <ImagePlus className="size-3.5" /> Image
                            </button>
                            <button className="text-xs underline disabled:opacity-40" disabled={readOnly} onClick={() => act({ action: 'make_dropship', productId: r.product_id })}>Make dropship</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="pr-3">{r.supplier || 'Supplier direct'}</td><td className="pr-3">{money(r.cost)}</td>
                        <td className="pr-3">{money(r.unit_price)}</td><td className="pr-3">{margin == null ? '—' : `${margin}%`}</td>
                        <td>
                          <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                            <button className="inline-flex items-center gap-1 text-xs underline disabled:opacity-40" disabled={readOnly || !r.catalog_item_id} onClick={() => openImageEditor(r)}>
                              <ImagePlus className="size-3.5" /> Image
                            </button>
                            <button className="inline-flex items-center gap-1 text-xs font-semibold underline disabled:opacity-40" disabled={readOnly} onClick={() => act({ action: 'add_in_store', productId: r.product_id })}><Plus className="size-3" />Stock in store</button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
              {data && data.rows.length === 0 && (
                <tr><td colSpan={9} className="py-10 text-center text-muted-foreground">
                  {tab === 'instore' ? 'Nothing stocked in store yet. Use Add Inventory above, or open the Dropship tab and choose “Stock in store” on any product you keep on the shelf.' : 'No dropship products match.'}
                </td></tr>
              )}
            </tbody>
          </table>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">
              {total === 0 ? 'No items' : `Showing ${rangeFrom}–${rangeTo} of ${total.toLocaleString()}${q ? ' matching your search' : ''}`}
            </span>
            <div className="flex items-center gap-2">
              <button disabled={page === 0 || loading} onClick={() => setPage(page - 1)} className="rounded border border-border px-3 py-1 disabled:opacity-40">Prev</button>
              <span className="text-muted-foreground">Page {page + 1} of {pageCount.toLocaleString()}</span>
              <button disabled={loading || page + 1 >= pageCount} onClick={() => setPage(page + 1)} className="rounded border border-border px-3 py-1 disabled:opacity-40">Next</button>
            </div>
          </div>
        </div>
      ))}

      {/* ADD INVENTORY MODAL */}
      {adder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Add inventory">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-start justify-between border-b border-border p-5">
              <div>
                <h2 className="font-display text-lg font-semibold text-foreground">Add Inventory</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Find any product in the catalog, enter how many you have, and it goes on your shelves — in the register and the shop, from the same count.
                </p>
              </div>
              <button onClick={() => setAdder(null)} className="cursor-pointer rounded-lg p-1 hover:bg-accent" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  autoFocus
                  value={adder.q}
                  onChange={(e) => searchPicker(e.target.value)}
                  placeholder="Search the catalog by name or SKU…"
                  className="w-full rounded-lg border border-input bg-background py-2 pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              {adder.searching && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> Searching…
                </p>
              )}
              {!adder.picked && adder.results.length > 0 && (
                <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                  {adder.results.map((p) => (
                    <li key={p.id}>
                      <button
                        onClick={() => setAdder({ ...adder, picked: p, results: [] })}
                        className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left hover:bg-accent"
                      >
                        {p.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image} alt={p.name} className="size-10 shrink-0 rounded border border-border object-cover" loading="lazy" />
                        ) : (
                          <span className="flex size-10 shrink-0 items-center justify-center rounded border border-border bg-muted">
                            <Package className="size-4 text-muted-foreground" />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">{p.name}</span>
                          <span className="block text-xs tabular-nums text-muted-foreground">{p.sku}</span>
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {p.stock > 0 ? `${p.stock} on hand` : 'not stocked'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {adder.picked && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                    {adder.picked.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={adder.picked.image} alt={adder.picked.name} className="size-11 shrink-0 rounded border border-border object-cover" />
                    ) : (
                      <span className="flex size-11 shrink-0 items-center justify-center rounded border border-border bg-muted">
                        <Package className="size-5 text-muted-foreground" />
                      </span>
                    )}
                    <div>
                      <p className="text-sm font-medium text-foreground">{adder.picked.name}</p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {adder.picked.sku} · On hand now: {adder.picked.stock}
                      </p>
                    </div>
                  </div>
                  <label className="block">
                    <span className="text-xs font-medium text-foreground">Units you have / received</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      autoFocus
                      value={adder.qty}
                      onChange={(e) => setAdder({ ...adder, qty: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    {adder.qty !== '' && Number.isFinite(Number(adder.qty)) && Number(adder.qty) > 0 && (
                      <span className="mt-1 block text-xs tabular-nums text-muted-foreground">
                        New on hand: {adder.picked.stock + Number(adder.qty)}
                      </span>
                    )}
                  </label>
                </div>
              )}
              {adder.err && (
                <p className="flex items-center gap-1.5 text-xs text-destructive">
                  <AlertTriangle className="size-3.5" /> {adder.err}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-border p-4">
              <button
                onClick={() => setAdder(null)}
                className="cursor-pointer rounded-lg border border-border bg-background px-4 py-2 text-xs font-medium hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={saveAdder}
                disabled={!adder.picked || adder.saving}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {adder.saving && <Loader2 className="size-3.5 animate-spin" />}
                Add to in-store stock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IMAGE EDITOR MODAL */}
      {imageEd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Change product image">
          <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-start justify-between border-b border-border p-5">
              <div>
                <h2 className="font-display text-lg font-semibold text-foreground">Product Image</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{imageEd.row.name}</p>
                <p className="text-xs tabular-nums text-muted-foreground">{imageEd.row.sku}</p>
              </div>
              <button onClick={() => setImageEd(null)} className="cursor-pointer rounded-lg p-1 hover:bg-accent" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              {(imageEd.file || imageEd.url) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageEd.file ? URL.createObjectURL(imageEd.file) : imageEd.url}
                  alt={imageEd.row.name}
                  className="h-48 w-full rounded-lg border border-border object-cover"
                />
              ) : (
                <div className="flex h-48 w-full items-center justify-center rounded-lg border border-border bg-muted">
                  <Package className="size-8 text-muted-foreground" />
                </div>
              )}
              <label className="block">
                <span className="text-xs font-medium text-foreground">Upload a new image</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setImageEd({ ...imageEd, file: e.target.files?.[0] || null })}
                  className="mt-1 w-full text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-foreground">…or use an image URL</span>
                <input
                  type="url"
                  value={imageEd.url}
                  onChange={(e) => setImageEd({ ...imageEd, url: e.target.value, file: null })}
                  placeholder="https://…"
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              <p className="text-xs text-muted-foreground">
                The chosen image becomes the main product photo. The product&apos;s other photos are kept.
              </p>
              {imageEd.err && (
                <p className="flex items-center gap-1.5 text-xs text-destructive">
                  <AlertTriangle className="size-3.5" /> {imageEd.err}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-border p-4">
              <button
                onClick={() => setImageEd(null)}
                className="cursor-pointer rounded-lg border border-border bg-background px-4 py-2 text-xs font-medium hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={saveImage}
                disabled={imageEd.saving}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {imageEd.saving && <Loader2 className="size-3.5 animate-spin" />}
                Save image
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StockCell({ value, onSave, low, disabled }: { value: number; onSave: (v: number) => void; low?: boolean; disabled?: boolean }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  return (
    <td className="pr-3">
      <input type="number" min={0} value={v} disabled={disabled} onChange={(e) => setV(e.target.value)}
        onBlur={() => Number(v) !== value && Number(v) >= 0 && onSave(Number(v))}
        className={cn('h-8 w-20 rounded border border-border bg-background px-2 disabled:cursor-not-allowed disabled:opacity-50', low && 'border-warning text-warning')} />
    </td>
  );
}
