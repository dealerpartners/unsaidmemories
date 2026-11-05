'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AlertTriangle, Plus, Check, Search, Package, X, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

type StatusFilter = 'all' | 'instock' | 'lowstock';
type Tab = 'instore' | 'dropship';

const PAGE_SIZE = 50;

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'instock', label: 'In Stock' },
  { value: 'lowstock', label: 'Low Stock' },
];

interface InventoryItem {
  id: string;
  product_id: string;
  sku_id?: string;
  sku: string;
  name: string;
  brand?: string;
  category: string;
  price: number;
  cost?: number;
  currentStock: number;
  minStock: number;
  reserved?: number;
  supplier?: string;
  isLow: boolean;
}

interface PickerProduct {
  id: string;
  productId: string;
  skuId: string;
  name: string;
  sku: string;
  stock: number;
  priceCents: number | null;
}

async function postInventory(body: Record<string, unknown>): Promise<{ ok?: boolean; error?: string }> {
  const res = await fetch('/api/admin/inventory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: data.error || `HTTP ${res.status}` };
  return data;
}

export const InventoryView: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [tab, setTab] = useState<Tab>('instore');
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState({ instore: 0, dropship: 0 });
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  // Restock / set-count modal (in-store rows)
  const [restock, setRestock] = useState<null | {
    item: InventoryItem;
    mode: 'add' | 'set';
    qty: string;
    reorder: string;
    saving: boolean;
    err: string | null;
  }>(null);

  // Add Inventory modal (stock any catalog product)
  const [adder, setAdder] = useState<null | {
    q: string;
    results: PickerProduct[];
    searching: boolean;
    picked: PickerProduct | null;
    qty: string;
    reorder: string;
    saving: boolean;
    err: string | null;
  }>(null);
  const adderSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchInventory = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        tab,
        q: searchQuery,
        page: String(page),
      });
      const res = await fetch(`/api/admin/inventory?${params}`, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.error) {
        throw new Error(data.error);
      }

      setCounts(data.counts || { instore: 0, dropship: 0 });
      setTotal(typeof data.total === 'number' ? data.total : (data.rows || []).length);

      const mapped: InventoryItem[] = (data.rows || []).map((r: any) => {
        if (tab === 'instore') {
          const stock = Number(r.on_hand || 0);
          const min = Number(r.reorder_point || 5);
          return {
            id: r.sku_id || r.product_id,
            product_id: r.product_id,
            sku_id: r.sku_id,
            sku: r.sku || '',
            name: r.name || '',
            brand: r.brand,
            category: 'In-Store',
            price: Number(r.unit_price || 0),
            currentStock: stock,
            minStock: min,
            reserved: Number(r.reserved || 0),
            isLow: stock <= min,
          };
        } else {
          // Dropship: no physical stock, supplier fulfills
          return {
            id: r.product_id,
            product_id: r.product_id,
            sku: r.sku || '',
            name: r.name || '',
            brand: r.brand,
            category: r.type || 'Dropship',
            price: Number(r.unit_price || 0),
            cost: Number(r.cost || 0),
            currentStock: -1, // N/A for dropship
            minStock: 0,
            supplier: r.supplier,
            isLow: false,
          };
        }
      });

      setItems(mapped);
      setHasLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load inventory');
    } finally {
      setRefreshing(false);
    }
  }, [tab, searchQuery, page]);

  useEffect(() => {
    const t = setTimeout(fetchInventory, 300); // debounce search
    return () => clearTimeout(t);
  }, [fetchInventory]);

  // Changing tab or search starts back at the first page.
  useEffect(() => {
    setPage(0);
  }, [tab, searchQuery]);

  const filtered = items.filter((item) => {
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'instock' && !item.isLow) ||
      (statusFilter === 'lowstock' && item.isLow);
    return matchesStatus;
  });

  const totalItems = tab === 'instore' ? counts.instore : counts.dropship;
  const lowStockCount = items.filter((i) => i.isLow).length;
  const inStockCount = items.length - lowStockCount;
  const totalValue = items.reduce((sum, i) => sum + (i.currentStock > 0 ? i.currentStock * i.price : 0), 0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeFrom = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeTo = Math.min(total, page * PAGE_SIZE + items.length);

  const flashSaved = (msg: string) => {
    setSavedFlash(msg);
    setTimeout(() => setSavedFlash(null), 3200);
  };

  const saveRestock = async () => {
    if (!restock || !restock.item.sku_id) return;
    const qty = Number(restock.qty);
    if (!Number.isFinite(qty) || qty < 0 || (restock.mode === 'add' && qty === 0)) {
      setRestock({ ...restock, err: 'Enter a quantity above 0.' });
      return;
    }
    const onHand = restock.mode === 'add' ? restock.item.currentStock + qty : qty;
    const reorderRaw = restock.reorder.trim();
    const reorder = reorderRaw === '' ? NaN : Number(reorderRaw);
    const hasReorder = Number.isFinite(reorder) && reorder >= 0;
    setRestock({ ...restock, saving: true, err: null });
    const res = await postInventory({
      action: 'set_stock',
      skuId: restock.item.sku_id,
      onHand,
      ...(hasReorder ? { reorderPoint: reorder } : {}),
    });
    if (res.error) {
      setRestock({ ...restock, saving: false, err: res.error });
      return;
    }
    const minStock = hasReorder ? reorder : restock.item.minStock;
    setItems((prev) =>
      prev.map((i) =>
        i.id === restock.item.id
          ? { ...i, currentStock: onHand, minStock, isLow: onHand <= minStock }
          : i,
      ),
    );
    setRestock(null);
    flashSaved(`Stock updated — ${restock.item.name} now has ${onHand} on hand.`);
  };

  const stockInStore = async (item: InventoryItem) => {
    const res = await postInventory({ action: 'add_in_store', productId: item.product_id });
    if (res.error) {
      setError(res.error);
      return;
    }
    flashSaved(`${item.name} is now stocked in store — set its count from the In-Store tab.`);
    fetchInventory();
  };

  const searchPicker = (q: string) => {
    setAdder((a) => (a ? { ...a, q, searching: true } : a));
    if (adderSearchRef.current) clearTimeout(adderSearchRef.current);
    adderSearchRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/admin/products?page=1&limit=20&source=all&q=${encodeURIComponent(q)}`,
          { cache: 'no-store' },
        );
        const data = await res.json();
        const results: PickerProduct[] = (data.products || []).map((p: any) => ({
          id: p.id,
          productId: p.productId,
          skuId: p.skuId,
          name: p.name,
          sku: p.sku || '',
          stock: Number(p.stock || 0),
          priceCents: p.priceCents ?? null,
        }));
        setAdder((a) => (a ? { ...a, results, searching: false } : a));
      } catch {
        setAdder((a) => (a ? { ...a, results: [], searching: false } : a));
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
    const res = await postInventory({ action: 'set_stock', skuId: adder.picked.skuId, onHand });
    if (res.error) {
      setAdder({ ...adder, saving: false, err: res.error });
      return;
    }
    const flag = await postInventory({ action: 'add_in_store', productId: adder.picked.productId });
    if (flag.error) {
      setAdder({ ...adder, saving: false, err: `Stock saved, but flagging in-store failed: ${flag.error}` });
      return;
    }
    const name = adder.picked.name;
    setAdder(null);
    setTab('instore');
    setPage(0);
    flashSaved(`Added ${qty} × ${name} — now ${onHand} on hand in store.`);
    fetchInventory();
  };

  return (
    <div className="flex flex-col w-full bg-background text-foreground min-h-full">
      {/* STATUS STRIP */}
      <div className="w-full bg-muted/60 border-b border-border px-4 py-2 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className={cn("size-2 rounded-full shrink-0", error ? "bg-destructive" : "bg-success animate-pulse")}></span>
          <span className="font-medium text-[11px] text-muted-foreground">
            {tab === 'instore' ? 'In-Store Inventory' : 'Dropship Catalog'}
          </span>
          {refreshing && hasLoaded && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Updating…
            </span>
          )}
          {savedFlash && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success">
              <Check className="size-3" /> {savedFlash}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="font-medium">
            Items: <span className="text-foreground font-semibold">{totalItems}</span>
          </span>
          {tab === 'instore' && (
            <>
              <span className="font-medium">
                Low Stock: <span className={cn('font-semibold', lowStockCount > 0 ? 'text-warning' : 'text-success')}>{lowStockCount}</span>
              </span>
              <span className="font-medium">
                Value: <span className="text-primary font-semibold tabular-nums">${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </span>
            </>
          )}
        </div>
      </div>

      {/* PAGE HEADER */}
      <div className="p-6 border-b border-border bg-background flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              {tab === 'instore' ? 'In-Store Inventory' : 'Dropship Products'}
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-muted text-muted-foreground border border-border">
              {totalItems} Items
            </span>
          </div>
          <p className="text-[13px] text-muted-foreground mt-1 max-w-2xl leading-relaxed">
            {tab === 'instore'
              ? 'Physical stock on your shelves. Click a stock count — or Restock — to correct it; counts write to the same ledger the register sells from.'
              : 'Supplier-fulfilled products. No physical stock held — the supplier ships directly. Bring any of them onto your shelves with Stock In-Store.'}
          </p>
          {/* Tab switcher */}
          <div className="mt-3 inline-flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setTab('instore')}
              className={cn(
                "px-4 py-1.5 text-[12px] font-medium transition-colors cursor-pointer",
                tab === 'instore' ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
              )}
            >
              In-Store ({counts.instore})
            </button>
            <button
              onClick={() => setTab('dropship')}
              className={cn(
                "px-4 py-1.5 text-[12px] font-medium transition-colors cursor-pointer",
                tab === 'dropship' ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
              )}
            >
              Dropship ({counts.dropship})
            </button>
          </div>
        </div>
        <button
          onClick={() =>
            setAdder({ q: '', results: [], searching: false, picked: null, qty: '', reorder: '', saving: false, err: null })
          }
          className="inline-flex items-center gap-2 self-start rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-[13px] font-semibold cursor-pointer hover:opacity-90 transition-opacity"
        >
          <Plus className="size-4" /> Add Inventory
        </button>
      </div>

      {/* CONTENT */}
      <div className="p-6 space-y-6">
        {!hasLoaded && !error ? (
          <div className="space-y-3" aria-label="Loading inventory">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 rounded-xl border border-border bg-card animate-pulse" />
              ))}
            </div>
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-12 border-b border-border animate-pulse bg-muted/20" />
              ))}
            </div>
          </div>
        ) : error && !hasLoaded ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <AlertTriangle className="size-8 text-destructive mb-2" />
            <p className="text-[14px] font-medium">Failed to load inventory</p>
            <p className="text-[12px] text-muted-foreground mt-1">{error}</p>
            <button
              onClick={fetchInventory}
              className="mt-4 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-[12px] font-medium cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* KPI TILES */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-4 rounded-xl border border-border bg-card shadow-card flex flex-col">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Total Items</span>
                <div className="text-2xl font-display font-semibold tabular-nums text-foreground mt-2">{totalItems}</div>
                <span className="text-[11px] text-muted-foreground mt-1">{tab === 'instore' ? 'SKUs stocked or flagged in store' : 'Products'}</span>
              </div>
              {tab === 'instore' ? (
                <>
                  <div className="p-4 rounded-xl border border-border bg-card shadow-card flex flex-col">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">In Stock (this page)</span>
                    <div className="text-2xl font-display font-semibold tabular-nums text-success mt-2">{inStockCount}</div>
                    <span className="text-[11px] text-muted-foreground mt-1">Healthy stock levels</span>
                  </div>
                  <div className="p-4 rounded-xl border border-border bg-card shadow-card flex flex-col">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Low Stock (this page)</span>
                    <div className={cn('text-2xl font-display font-semibold tabular-nums mt-2', lowStockCount > 0 ? 'text-warning' : 'text-success')}>
                      {lowStockCount}
                    </div>
                    <span className="text-[11px] text-muted-foreground mt-1">{lowStockCount > 0 ? 'Needs reorder' : 'All good'}</span>
                  </div>
                  <div className="p-4 rounded-xl border border-border bg-card shadow-card flex flex-col">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Total Value (this page)</span>
                    <div className="text-2xl font-display font-semibold tabular-nums text-primary mt-2">
                      ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <span className="text-[11px] text-muted-foreground mt-1">At current stock × price</span>
                  </div>
                </>
              ) : (
                <div className="p-4 rounded-xl border border-border bg-card shadow-card flex flex-col col-span-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Fulfillment</span>
                  <div className="text-2xl font-display font-semibold text-foreground mt-2">Supplier Direct</div>
                  <span className="text-[11px] text-muted-foreground mt-1">No warehouse stock — supplier ships to customer</span>
                </div>
              )}
            </div>

            {/* FILTERS ROW */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-card border border-border rounded-xl shadow-card p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name or SKU..."
                    className="bg-background border border-input rounded-lg pl-8 pr-3 h-8 text-[12px] text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring transition-colors w-64 max-w-full"
                  />
                </div>
                {tab === 'instore' && (
                  <div className="relative inline-flex">
                    <select
                      aria-label="Filter by stock status"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                      className="appearance-none bg-background border border-input hover:border-primary/40 rounded-lg pl-3 pr-8 h-8 text-[12px] font-medium text-foreground cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {(searchQuery || statusFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setStatusFilter('all');
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-muted hover:bg-accent text-muted-foreground hover:text-accent-foreground h-8 px-2.5 text-[12px] font-medium transition-colors cursor-pointer"
                  >
                    <X className="size-3.5" />
                    Reset
                  </button>
                )}
              </div>
              <span className="text-[12px] font-medium text-muted-foreground">
                {filtered.length} items on this page
              </span>
            </div>

            {error && hasLoaded && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
                <AlertTriangle className="size-3.5 shrink-0" /> {error}
              </div>
            )}

            {/* TABLE */}
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="size-12 rounded-full bg-muted flex items-center justify-center mb-3">
                  <Package className="size-6 text-muted-foreground" />
                </div>
                <p className="text-[14px] font-medium text-foreground">No items found</p>
                <p className="text-[12px] text-muted-foreground mt-1">
                  Try adjusting your search or filter.
                </p>
              </div>
            ) : (
              <div className={cn("bg-card border border-border rounded-xl shadow-card overflow-hidden overflow-x-auto transition-opacity", refreshing ? "opacity-70" : "opacity-100")}>
                <table className="w-full text-left text-[13px] text-foreground">
                  <thead className="bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground">
                    <tr>
                      <th className="py-3 px-4 border-r border-border font-semibold">Item Name &amp; SKU</th>
                      {tab === 'instore' ? (
                        <>
                          <th className="py-3 px-4 border-r border-border font-semibold">Stock</th>
                          <th className="py-3 px-4 border-r border-border font-semibold">Reorder At</th>
                          <th className="py-3 px-4 border-r border-border font-semibold">Price</th>
                          <th className="py-3 px-4 border-r border-border font-semibold">Status</th>
                        </>
                      ) : (
                        <>
                          <th className="py-3 px-4 border-r border-border font-semibold">Supplier</th>
                          <th className="py-3 px-4 border-r border-border font-semibold">Price</th>
                          <th className="py-3 px-4 border-r border-border font-semibold">Cost</th>
                        </>
                      )}
                      <th className="py-3 px-4 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filtered.map((item) => (
                      <tr key={item.id} className="hover:bg-accent/50 transition-colors">
                        <td className="py-3.5 px-4 border-r border-border">
                          <p className="font-medium text-foreground">{item.name}</p>
                          <p className="text-[10px] text-muted-foreground tabular-nums">{item.sku}</p>
                        </td>
                        {tab === 'instore' ? (
                          <>
                            <td className="py-3.5 px-4 border-r border-border">
                              <button
                                onClick={() =>
                                  setRestock({ item, mode: 'set', qty: String(item.currentStock), reorder: String(item.minStock), saving: false, err: null })
                                }
                                title="Click to correct the count"
                                className="font-semibold tabular-nums underline-offset-4 decoration-dotted decoration-muted-foreground hover:underline cursor-pointer"
                              >
                                <span className={cn(item.isLow ? 'text-warning' : 'text-foreground')}>
                                  {item.currentStock}
                                </span>
                              </button>
                              <span className="text-[11px] text-muted-foreground ml-1">units</span>
                              {item.reserved ? (
                                <span className="text-[11px] text-muted-foreground ml-1">({item.reserved} reserved)</span>
                              ) : null}
                            </td>
                            <td className="py-3.5 px-4 border-r border-border text-muted-foreground tabular-nums">
                              Min {item.minStock}
                            </td>
                            <td className="py-3.5 px-4 border-r border-border font-semibold tabular-nums">
                              ${item.price.toFixed(2)}
                            </td>
                            <td className="py-3.5 px-4 border-r border-border">
                              {item.currentStock <= 0 ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-destructive/10 text-destructive border-destructive/20">
                                  <AlertTriangle className="size-3" />
                                  Out of Stock
                                </span>
                              ) : item.isLow ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-warning/10 text-warning border-warning/20">
                                  <AlertTriangle className="size-3" />
                                  Low Stock
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-success/10 text-success border-success/20">
                                  <Check className="size-3" />
                                  In Stock
                                </span>
                              )}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-3.5 px-4 border-r border-border text-muted-foreground">
                              {item.supplier || '—'}
                            </td>
                            <td className="py-3.5 px-4 border-r border-border font-semibold tabular-nums">
                              ${item.price.toFixed(2)}
                            </td>
                            <td className="py-3.5 px-4 border-r border-border tabular-nums text-muted-foreground">
                              {item.cost ? `$${item.cost.toFixed(2)}` : '—'}
                            </td>
                          </>
                        )}
                        <td className="py-3.5 px-4 text-right">
                          {tab === 'instore' ? (
                            <button
                              onClick={() =>
                                setRestock({ item, mode: 'add', qty: '', reorder: String(item.minStock), saving: false, err: null })
                              }
                              className="inline-flex items-center gap-1 rounded-lg h-7 px-2.5 text-[11px] font-medium border border-border bg-background hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
                            >
                              <Plus className="size-3.5" />
                              Restock
                            </button>
                          ) : (
                            <button
                              onClick={() => stockInStore(item)}
                              className="inline-flex items-center gap-1 rounded-lg h-7 px-2.5 text-[11px] font-medium border border-border bg-background hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
                            >
                              <Plus className="size-3.5" />
                              Stock In-Store
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* PAGINATION */}
            {total > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-[12px] text-muted-foreground tabular-nums">
                  Showing {rangeFrom}–{rangeTo} of {total}
                  {searchQuery ? ' matching your search' : ''}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0 || refreshing}
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-[12px] font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent transition-colors"
                  >
                    <ChevronLeft className="size-3.5" /> Prev
                  </button>
                  <span className="text-[12px] text-muted-foreground tabular-nums">
                    Page {page + 1} of {pageCount}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                    disabled={page >= pageCount - 1 || refreshing}
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-[12px] font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent transition-colors"
                  >
                    Next <ChevronRight className="size-3.5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* RESTOCK MODAL */}
      {restock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Restock item">
          <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-start justify-between border-b border-border p-5">
              <div>
                <h2 className="font-display text-lg font-semibold text-foreground">Restock</h2>
                <p className="text-[12px] text-muted-foreground mt-0.5">{restock.item.name}</p>
                <p className="text-[11px] text-muted-foreground tabular-nums">{restock.item.sku} · On hand now: {restock.item.currentStock}</p>
              </div>
              <button onClick={() => setRestock(null)} className="rounded-lg p-1 hover:bg-accent cursor-pointer" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div className="inline-flex rounded-lg border border-border overflow-hidden">
                <button
                  onClick={() => setRestock({ ...restock, mode: 'add', qty: '' })}
                  className={cn("px-3 py-1.5 text-[12px] font-medium cursor-pointer", restock.mode === 'add' ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}
                >
                  Add units
                </button>
                <button
                  onClick={() => setRestock({ ...restock, mode: 'set', qty: String(restock.item.currentStock) })}
                  className={cn("px-3 py-1.5 text-[12px] font-medium cursor-pointer", restock.mode === 'set' ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}
                >
                  Set exact count
                </button>
              </div>
              <label className="block">
                <span className="text-[12px] font-medium text-foreground">
                  {restock.mode === 'add' ? 'Units received' : 'Counted on hand'}
                </span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  autoFocus
                  value={restock.qty}
                  onChange={(e) => setRestock({ ...restock, qty: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-[14px] tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                {restock.mode === 'add' && restock.qty !== '' && Number.isFinite(Number(restock.qty)) && (
                  <span className="mt-1 block text-[11px] text-muted-foreground tabular-nums">
                    New on hand: {restock.item.currentStock + Number(restock.qty)}
                  </span>
                )}
              </label>
              <label className="block">
                <span className="text-[12px] font-medium text-foreground">Reorder at (low-stock threshold)</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={restock.reorder}
                  onChange={(e) => setRestock({ ...restock, reorder: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-[14px] tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              {restock.err && (
                <p className="flex items-center gap-1.5 text-[12px] text-destructive">
                  <AlertTriangle className="size-3.5" /> {restock.err}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-border p-4">
              <button
                onClick={() => setRestock(null)}
                className="rounded-lg border border-border bg-background px-4 py-2 text-[12px] font-medium cursor-pointer hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={saveRestock}
                disabled={restock.saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-[12px] font-semibold cursor-pointer disabled:opacity-50 hover:opacity-90"
              >
                {restock.saving && <Loader2 className="size-3.5 animate-spin" />}
                Save stock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD INVENTORY MODAL */}
      {adder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Add inventory">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-start justify-between border-b border-border p-5">
              <div>
                <h2 className="font-display text-lg font-semibold text-foreground">Add Inventory</h2>
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  Find any product in the catalog, enter how many you have, and it goes on your shelves — in the register and the shop, from the same count.
                </p>
              </div>
              <button onClick={() => setAdder(null)} className="rounded-lg p-1 hover:bg-accent cursor-pointer" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div className="relative">
                <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  autoFocus
                  value={adder.q}
                  onChange={(e) => searchPicker(e.target.value)}
                  placeholder="Search the catalog by name or SKU…"
                  className="w-full rounded-lg border border-input bg-background pl-8 pr-3 py-2 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              {adder.searching && (
                <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> Searching…
                </p>
              )}
              {!adder.picked && adder.results.length > 0 && (
                <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                  {adder.results.map((p) => (
                    <li key={p.id}>
                      <button
                        onClick={() => setAdder({ ...adder, picked: p, results: [] })}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-accent cursor-pointer"
                      >
                        <span>
                          <span className="block text-[13px] font-medium text-foreground">{p.name}</span>
                          <span className="block text-[11px] text-muted-foreground tabular-nums">{p.sku}</span>
                        </span>
                        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                          {p.stock > 0 ? `${p.stock} on hand` : 'not stocked'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {adder.picked && (
                <div className="space-y-4">
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                    <p className="text-[13px] font-medium text-foreground">{adder.picked.name}</p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      {adder.picked.sku} · On hand now: {adder.picked.stock}
                    </p>
                  </div>
                  <label className="block">
                    <span className="text-[12px] font-medium text-foreground">Units you have / received</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      autoFocus
                      value={adder.qty}
                      onChange={(e) => setAdder({ ...adder, qty: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-[14px] tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    {adder.qty !== '' && Number.isFinite(Number(adder.qty)) && Number(adder.qty) > 0 && (
                      <span className="mt-1 block text-[11px] text-muted-foreground tabular-nums">
                        New on hand: {adder.picked.stock + Number(adder.qty)}
                      </span>
                    )}
                  </label>
                </div>
              )}
              {adder.err && (
                <p className="flex items-center gap-1.5 text-[12px] text-destructive">
                  <AlertTriangle className="size-3.5" /> {adder.err}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-border p-4">
              <button
                onClick={() => setAdder(null)}
                className="rounded-lg border border-border bg-background px-4 py-2 text-[12px] font-medium cursor-pointer hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={saveAdder}
                disabled={!adder.picked || adder.saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-[12px] font-semibold cursor-pointer disabled:opacity-50 hover:opacity-90"
              >
                {adder.saving && <Loader2 className="size-3.5 animate-spin" />}
                Add to in-store stock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
