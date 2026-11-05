'use client';

import React, { useState } from 'react';

interface ScreenProps {
  systemSettings?: any;
  saveSettingsToDb?: (updates: any) => void;
  onNavigateScreen?: (screenId: string) => void;
  selectedLocation?: string;
  onSelectLocation?: (loc: string) => void;
}

export const OmsAddProductScreen: React.FC<ScreenProps> = ({
  onNavigateScreen,
}) => {
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [sku, setSku] = useState('RET-BTM-049');
  const [barcode, setBarcode] = useState('084920194821');
  const [productName, setProductName] = useState('Botanical Oatmeal Hydration Shampoo (16 fl oz)');
  const [category, setCategory] = useState('SHAMPOO_WELLNESS');
  const [supplier, setSupplier] = useState('VetOrganics Texas Lab');
  const [costPrice, setCostPrice] = useState('11.50');
  const [retailPrice, setRetailPrice] = useState('24.00');
  const [stockOnHand, setStockOnHand] = useState('38');
  const [reorderThreshold, setReorderThreshold] = useState('10');
  const [trackInventory, setTrackInventory] = useState(true);
  const [isTaxable, setIsTaxable] = useState(true);
  const [saving, setSaving] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      showToast(`PRODUCT ${sku} PERSISTED TO RETAIL INVENTORY LEDGER // 200 OK`);
    }, 600);
  };

  return (
    <div className="w-full bg-card text-foreground font-sans antialiased text-[13px]">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-4 right-4 bg-primary text-primary-foreground px-4 py-3 border border-white z-50 flex items-center gap-3 tabular-nums text-[13px] shadow-2xl">
          <span className="w-2 h-2 bg-card animate-pulse"></span>
          <span className="uppercase font-semibold tracking-wider">{toastMsg}</span>
          <button onClick={() => setToastMsg(null)} className="ml-2 text-white hover:opacity-70 cursor-pointer">✕</button>
        </div>
      )}

      {/* SUB-NAV STRIP */}
      <div className="w-full bg-card border-b border-border overflow-x-auto select-none">
        <div className="flex items-center min-w-max">
          <div className="px-3 py-2 bg-muted/40 border-r border-border flex items-center gap-2">
            <span className="w-2 h-2 bg-black"></span>
            <span className="tabular-nums text-[11px] uppercase tracking-wider text-foreground font-semibold">MODULE // INVENTORY OMS</span>
          </div>
          <nav className="flex items-center text-[13px] tabular-nums">
            {[
              { label: 'Overview', id: 'overview' },
              { label: 'Catalog & Add-Ons', id: 'services-catalog' },
              { label: '■ Add / Edit Product SKU', id: 'oms-add-product', active: true },
              { label: 'Invoices & Reports', id: 'invoices-aging' },
              { label: 'Revenue & Stripe', id: 'revenue-stripe' },
            ].map((tab) => (
              <button
                key={tab.label}
                onClick={() => onNavigateScreen?.(tab.id)}
                className={`px-3 py-2 border-r border-border/30 tabular-nums text-[13px] cursor-pointer transition-none flex items-center gap-1.5 ${
                  tab.active ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:bg-brand-teal/5 hover:text-brand-teal'
                }`}
              >
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* HEADER SECTION */}
      <div className="p-4 lg:p-6 border-b border-border">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[9px] tabular-nums uppercase tracking-wider px-2 py-0.5 border border-border bg-primary text-primary-foreground font-semibold">
                SEC:15 // INVENTORY SKU MANAGEMENT
              </span>
              <span className="text-[10px] tabular-nums text-muted-foreground uppercase">
                RETAIL MERCHANDISE // BARCODE SCANNER // VENDOR SOURCING
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-semibold uppercase tracking-tight font-sans text-foreground mt-1">
              Add / Edit Retail Inventory SKU &amp; Barcode
            </h1>
            <p className="text-[13px] tabular-nums text-muted-foreground">
              Manage retail salon boutique stock, UPC/EAN barcodes, supplier costs, margin targets, and automated reorder alerts.
            </p>
          </div>

          <div className="flex items-center gap-2 tabular-nums text-[13px]">
            <button
              onClick={() => showToast('BARCODE SCANNER READY // LISTEN FOR USB HID')}
              className="h-8 px-3 border border-border bg-card uppercase font-semibold hover:bg-muted/40 cursor-pointer"
            >
              📷 Scan Barcode
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="h-8 px-4 bg-primary text-primary-foreground border border-border uppercase font-semibold hover:bg-muted cursor-pointer"
            >
              {saving ? 'SAVING SKU...' : '[SAVE INVENTORY PRODUCT]'}
            </button>
          </div>
        </div>
      </div>

      {/* FORM WORKSPACE */}
      <div className="p-5 max-w-4xl space-y-5 tabular-nums text-[13px]">
        <div className="border-2-black bg-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="font-semibold uppercase text-foreground">PRODUCT IDENTIFIERS &amp; MERCHANDISE DETAILS</span>
            <span className="text-[10px] text-muted-foreground">POS CODEC</span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-muted-foreground uppercase text-[10px] block mb-1">PRODUCT DISPLAY TITLE</label>
              <input
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                className="w-full border border-border p-2 font-semibold bg-muted/30 focus:bg-card focus:outline-none text-[13px]"
                type="text"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-muted-foreground uppercase text-[10px] block mb-1">SKU CODE</label>
                <input
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  className="w-full border border-border p-2 font-semibold bg-muted/30 focus:bg-card focus:outline-none text-[13px]"
                  type="text"
                />
              </div>

              <div>
                <label className="text-muted-foreground uppercase text-[10px] block mb-1">UPC / EAN BARCODE</label>
                <input
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  className="w-full border border-border p-2 font-semibold bg-muted/30 focus:bg-card focus:outline-none text-[13px]"
                  type="text"
                />
              </div>

              <div>
                <label className="text-muted-foreground uppercase text-[10px] block mb-1">RETAIL CATEGORY</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full border border-border p-2 font-semibold bg-muted/30 focus:bg-card focus:outline-none text-[13px]"
                >
                  <option value="SHAMPOO_WELLNESS">SHAMPOOS &amp; HYDRATION</option>
                  <option value="COLLARS_LEASHES">COLLARS, LEASHES &amp; HARNESSES</option>
                  <option value="TREATS_CHEWS">ARTISAN TREATS &amp; CHEWS</option>
                  <option value="GROOMING_TOOLS">BRUSHES &amp; AT-HOME TOOLS</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* PRICING & INVENTORY */}
        <div className="border-2-black bg-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="font-semibold uppercase text-foreground">PRICING, COST &amp; INVENTORY AUDITING</span>
            <span className="text-[9px] bg-primary text-primary-foreground px-1.5 py-0.2 font-semibold">GROSS MARGIN: 52.1%</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-muted-foreground uppercase text-[10px] block mb-1">WHOLESALE COST ($)</label>
              <input
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                className="w-full border border-border p-2 font-semibold bg-muted/30 focus:bg-card focus:outline-none text-[13px]"
                type="number"
                step="0.01"
              />
            </div>

            <div>
              <label className="text-muted-foreground uppercase text-[10px] block mb-1">RETAIL PRICE ($)</label>
              <input
                value={retailPrice}
                onChange={(e) => setRetailPrice(e.target.value)}
                className="w-full border border-border p-2 font-semibold bg-muted/30 focus:bg-card focus:outline-none text-[13px]"
                type="number"
                step="0.01"
              />
            </div>

            <div>
              <label className="text-muted-foreground uppercase text-[10px] block mb-1">STOCK ON HAND</label>
              <input
                value={stockOnHand}
                onChange={(e) => setStockOnHand(e.target.value)}
                className="w-full border border-border p-2 font-semibold bg-muted/30 focus:bg-card focus:outline-none text-[13px]"
                type="number"
              />
            </div>

            <div>
              <label className="text-muted-foreground uppercase text-[10px] block mb-1">REORDER THRESHOLD</label>
              <input
                value={reorderThreshold}
                onChange={(e) => setReorderThreshold(e.target.value)}
                className="w-full border border-border p-2 font-semibold bg-muted/30 focus:bg-card focus:outline-none text-[13px]"
                type="number"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-border space-y-2">
            <label className="flex items-center justify-between p-2 border border-border cursor-pointer bg-card">
              <div>
                <div className="font-semibold">Track Perpetual Stock Ledger</div>
                <div className="text-[10px] text-muted-foreground">Auto-decrement stock on POS register sales and prompt low stock warning</div>
              </div>
              <input
                type="checkbox"
                checked={trackInventory}
                onChange={(e) => setTrackInventory(e.target.checked)}
                className="w-4 h-4 rounded-lg accent-black cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between p-2 border border-border cursor-pointer bg-card">
              <div>
                <div className="font-semibold">Taxable Retail Merchandise</div>
                <div className="text-[10px] text-muted-foreground">Apply standard Texas 8.25% sales tax on checkout</div>
              </div>
              <input
                type="checkbox"
                checked={isTaxable}
                onChange={(e) => setIsTaxable(e.target.checked)}
                className="w-4 h-4 rounded-lg accent-black cursor-pointer"
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
