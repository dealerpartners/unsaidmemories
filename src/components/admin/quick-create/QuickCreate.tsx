'use client';

import { useEffect, useRef, useState } from 'react';
import { Zap, ChevronDown, User, Building2, Package, Contact } from 'lucide-react';
import InvoiceEditor from '@/components/admin/InvoiceEditor';
import { OverlayShell } from './surfaces';
import BillOverlay from './BillOverlay';
import { DepositDrawer, ProductDrawer } from './FinanceDrawers';
import { RetailCustomerDrawer, VendorDrawer, SupplierDrawer, ContactDrawer } from './PartyDrawers';

// ============================================================================
// The ⚡ "Create actions:" rail from the owner's QUICK_ACTIONS.html,
// mounted on /admin under the domain pills (his placement: the home
// page's create actions, placeable globally). Every button opens its
// dedicated surface — his two-tier system: full-screen overlays for
// Invoice and Bill, 580px right drawers for Deposit, Product Design,
// and the four party types behind the + Customer split button.
//
//   + Invoice        → overlay reusing the InvoiceEditor (the same
//                      component the /admin/invoices page mounts —
//                      framed mode + the × his overlay header draws;
//                      the editor is not forked)
//   + Bill           → overlay, wired to POST
//                      /api/admin/accounting/ap-bills (create_bill)
//   + Deposit        → Bank Deposit drawer (Save is an honest gap —
//                      no bank-deposit create endpoint exists)
//   + Product Design → drawer; creates via POST /api/admin/products,
//                      then routes to /admin/studio
//   + Customer ▾     → Retail Customer drawer; the dropdown adds
//                      Vendor (Supplier), Blank Supplier, and General
//                      Contact drawers (real creates; see
//                      PartyDrawers.tsx for the per-field wiring and
//                      the gap-noted fields)
//
// The dropdown closes on outside click and Esc, per his script.
// ============================================================================

type Surface =
  | 'invoice' | 'bill' | 'deposit' | 'product'
  | 'customer' | 'vendor' | 'supplier' | 'contact'
  | null;

const pillCls =
  'px-3 py-1 bg-white border border-[#dad9dd] rounded-full text-[12px] font-medium text-[#3f4a3a] shadow-sm hover:bg-[#f9fafb] whitespace-nowrap';

const DD_ITEMS: Array<{ key: Exclude<Surface, null>; label: string; icon: typeof User }> = [
  { key: 'customer', label: 'Retail Customer', icon: User },
  { key: 'vendor', label: 'Vendor (Supplier)', icon: Building2 },
  { key: 'supplier', label: 'Blank Supplier', icon: Package },
  { key: 'contact', label: 'General Contact', icon: Contact },
];

export default function QuickCreateRail() {
  const [surface, setSurface] = useState<Surface>(null);
  const [ddOpen, setDdOpen] = useState(false);
  const ddRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ddOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (ddRef.current && !ddRef.current.contains(e.target as Node)) setDdOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDdOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [ddOpen]);

  const open = (s: Surface) => {
    setDdOpen(false);
    setSurface(s);
  };
  const close = () => setSurface(null);

  return (
    <>
      <div className="flex items-center bg-[#f4f3f7] rounded-xl p-2.5 border border-[#dad9dd] overflow-x-auto">
        <div className="flex items-center pr-3 shrink-0">
          <Zap size={16} style={{ color: '#31a376' }} className="mr-1" />
          <span className="text-[11px] font-bold text-[#6f7a69] uppercase tracking-wider">Create actions:</span>
        </div>
        <div className="flex items-center gap-2 border-l border-[#dad9dd] pl-3">
          <button type="button" className={pillCls} onClick={() => open('invoice')}>+ Invoice</button>
          <button type="button" className={pillCls} onClick={() => open('bill')}>+ Bill</button>
          <button type="button" className={pillCls} onClick={() => open('deposit')}>+ Deposit</button>
          <button type="button" className={pillCls} onClick={() => open('product')}>+ Product Design</button>

          {/* + Customer split button */}
          <div className="relative" ref={ddRef}>
            <div className="flex items-center">
              <button
                type="button"
                className="px-3 py-1 bg-white border border-[#dad9dd] border-r-0 rounded-l-full text-[12px] font-medium text-[#3f4a3a] shadow-sm hover:bg-[#f9fafb] whitespace-nowrap"
                onClick={() => open('customer')}
              >
                + Customer
              </button>
              <button
                type="button"
                aria-label="More customer types"
                aria-expanded={ddOpen}
                className="px-2 py-1 bg-white border border-[#dad9dd] rounded-r-full text-[#3f4a3a] shadow-sm hover:bg-[#f9fafb]"
                onClick={() => setDdOpen((o) => !o)}
              >
                <ChevronDown size={14} />
              </button>
            </div>
            {ddOpen ? (
              <div className="absolute top-full left-0 mt-1 w-[220px] bg-white border border-[#e5e7eb] rounded-lg shadow-lg z-50 flex flex-col overflow-hidden">
                {DD_ITEMS.map((it, i) => (
                  <button
                    key={it.key}
                    type="button"
                    onClick={() => open(it.key)}
                    className={`flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-[#374151] text-left hover:bg-[#f9fafb] hover:text-[#0a6400] ${i < DD_ITEMS.length - 1 ? 'border-b border-[#f3f4f6]' : ''}`}
                  >
                    <it.icon size={18} className="text-[#9ca3af]" /> {it.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Surfaces */}
      <OverlayShell open={surface === 'invoice'} onClose={close} label="Invoice">
        <InvoiceEditor framed onClose={close} />
      </OverlayShell>
      <BillOverlay open={surface === 'bill'} onClose={close} />
      <DepositDrawer open={surface === 'deposit'} onClose={close} />
      <ProductDrawer open={surface === 'product'} onClose={close} />
      <RetailCustomerDrawer open={surface === 'customer'} onClose={close} />
      <VendorDrawer open={surface === 'vendor'} onClose={close} />
      <SupplierDrawer open={surface === 'supplier'} onClose={close} />
      <ContactDrawer open={surface === 'contact'} onClose={close} />
    </>
  );
}
