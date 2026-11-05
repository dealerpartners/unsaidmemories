'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface ScreenProps {
  systemSettings?: any;
  saveSettingsToDb?: (updates: any) => void;
  onNavigateScreen?: (screenId: string) => void;
  selectedLocation?: string;
  onSelectLocation?: (loc: string) => void;
}

// ---------------------------------------------------------------------------
// Service Master Catalog & Add-On Editor — wired to the REAL catalog.
//   Read:  GET  /api/admin/crm/services (crm_services)
//   Add:   sys_add_service / cms_add_addon / cms_add_package
//   Edit:  cms_edit_service
// Every card below is a live crm_services row — no sample data.
// ---------------------------------------------------------------------------

interface CatalogItem {
  id: string;
  code: string | null;
  name: string;
  price: number;
  duration: number;
  description: string;
  category: string;
  isAddOn: boolean;
}

async function postAction(endpoint: string, action: string, payload: Record<string, unknown>) {
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || `Action failed (${r.status})`);
  return j as Record<string, any>;
}

export const ServicesAddonCatalogScreen: React.FC<ScreenProps> = ({
  onNavigateScreen,
}) => {
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastError, setToastError] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [busy, setBusy] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fName, setFName] = useState('');
  const [fKind, setFKind] = useState<'service' | 'addon' | 'package'>('service');
  const [fPrice, setFPrice] = useState('');
  const [fDuration, setFDuration] = useState('');
  const [fDesc, setFDesc] = useState('');

  const showToast = (msg: string, isError = false) => {
    setToastMsg(msg);
    setToastError(isError);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/crm/services?limit=500');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      const rows: any[] = d.services || [];
      setItems(rows.map((s) => ({
        id: String(s.id),
        code: s.code ?? null,
        name: s.name ?? '—',
        price: Number(s.defaultPrice ?? 0),
        duration: Number(s.defaultDurationMinutes ?? 0),
        description: s.description ?? '',
        category: (s.serviceCategory || s.category || (s.isAddOn ? 'add_on' : 'general')).toUpperCase(),
        isAddOn: !!s.isAddOn,
      })));
    } catch (e) {
      setItems([]);
      showToast(`CATALOG LOAD FAILED — ${e instanceof Error ? e.message : 'unknown'}`, true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Service families (§4.1 — Full Groom / Bath & Brush / A La Carte
  // existed only as service NAMES and a sparse category column: 15 of
  // 18 live services carry category NULL, so data-derived chips could
  // never surface the families). Each family is a real filter surface
  // classified from the service's name + category + add-on flag — the
  // data that actually exists.
  const familyOf = (i: CatalogItem): string => {
    if (i.category === 'PACKAGE' || /package/i.test(i.name)) return 'PACKAGES';
    if (i.isAddOn || i.category === 'ADD_ON') return 'ADD-ONS';
    if (/^full groom/i.test(i.name) || i.category === 'GROOMING') return 'FULL GROOM';
    if (/^bath/i.test(i.name)) return 'BATH & BRUSH';
    return 'A LA CARTE';
  };
  const FAMILIES = ['ALL', 'FULL GROOM', 'BATH & BRUSH', 'A LA CARTE', 'ADD-ONS', 'PACKAGES'];
  const categories = FAMILIES;
  const filteredItems = (items ?? []).filter((i) => selectedCategory === 'ALL' || familyOf(i) === selectedCategory);

  const openCreate = () => {
    setEditingId(null);
    setFName(''); setFKind('service'); setFPrice(''); setFDuration(''); setFDesc('');
    setShowForm(true);
  };
  const openEdit = (item: CatalogItem) => {
    setEditingId(item.id);
    setFName(item.name);
    setFKind(item.isAddOn ? 'addon' : item.category === 'PACKAGE' ? 'package' : 'service');
    setFPrice(String(item.price)); setFDuration(String(item.duration)); setFDesc(item.description);
    setShowForm(true);
  };

  const submit = async () => {
    if (!fName.trim() || !fPrice) return;
    setBusy(true);
    try {
      if (editingId) {
        await postAction('/api/admin/cms/actions', 'cms_edit_service', {
          service_id: editingId, name: fName.trim(),
          default_price: Number(fPrice), default_duration_minutes: Number(fDuration) || 60,
          description: fDesc,
        });
        showToast(`UPDATED IN CRM_SERVICES // ${fName.trim().toUpperCase()}`);
      } else if (fKind === 'addon') {
        await postAction('/api/admin/cms/actions', 'cms_add_addon', {
          name: fName.trim(), default_price: Number(fPrice),
          default_duration_minutes: Number(fDuration) || 15, description: fDesc || undefined,
        });
        showToast(`ADD-ON CREATED IN CRM_SERVICES // ${fName.trim().toUpperCase()}`);
      } else if (fKind === 'package') {
        await postAction('/api/admin/cms/actions', 'cms_add_package', {
          name: fName.trim(), default_price: Number(fPrice),
          default_duration_minutes: Number(fDuration) || 60, description: fDesc || undefined,
        });
        showToast(`PACKAGE CREATED IN CRM_SERVICES // ${fName.trim().toUpperCase()}`);
      } else {
        await postAction('/api/admin/system/actions', 'sys_add_service', {
          name: fName.trim(), default_price: Number(fPrice),
          default_duration_minutes: Number(fDuration) || 60, description: fDesc || undefined,
        });
        showToast(`SERVICE CREATED IN CRM_SERVICES // ${fName.trim().toUpperCase()}`);
      }
      setShowForm(false);
      await load();
    } catch (e) {
      showToast(`SAVE FAILED — ${e instanceof Error ? e.message : 'unknown'}`, true);
    } finally { setBusy(false); }
  };

  const typeLabel = (item: CatalogItem) =>
    item.isAddOn ? 'ADD-ON' : item.category === 'PACKAGE' ? 'PACKAGE' : 'CORE SERVICE';

  return (
    <div className="w-full bg-card text-foreground font-sans antialiased text-[13px]">
      {/* Toast */}
      {toastMsg && (
        <div className={`fixed bottom-4 right-4 ${toastError ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground'} px-4 py-3 border border-white z-50 flex items-center gap-3 tabular-nums text-[13px] shadow-2xl`}>
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
            <span className="tabular-nums text-[11px] uppercase tracking-wider text-foreground font-semibold">MODULE // CATALOG &amp; ADD-ONS</span>
          </div>
          <nav className="flex items-center text-[13px] tabular-nums">
            {[
              { label: 'Overview', id: 'overview' },
              { label: 'Pricing Matrix', id: 'services-pricing' },
              { label: '■ Catalog & Add-On Editor', id: 'services-catalog', active: true },
              { label: 'Booking Operations', id: 'booking-ops' },
              { label: 'Inventory SKU', id: 'oms-add-product' },
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
                SEC:14 // SERVICE MASTER DEFINITION
              </span>
              <span className="text-[10px] tabular-nums text-muted-foreground uppercase">
                TREATMENTS // ADD-ON SKUS // TIME DURATION OFFSETS
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-semibold uppercase tracking-tight font-sans text-foreground mt-1">
              Service Master Catalog &amp; Add-On Treatment Editor
            </h1>
            <p className="text-[13px] tabular-nums text-muted-foreground">
              The live crm_services catalog — create and manage grooming services, spa add-ons, and packages. Every change writes to the same catalog the booking wizard and register sell from.
            </p>
          </div>

          <div className="flex items-center gap-2 tabular-nums text-[13px]">
            <button
              onClick={openCreate}
              className="h-8 px-4 bg-primary text-primary-foreground border border-border uppercase font-semibold hover:bg-muted cursor-pointer"
            >
              + Create Service / Add-On
            </button>
          </div>
        </div>
      </div>

      {/* CREATE / EDIT FORM */}
      {showForm && (
        <div className="p-4 lg:p-6 border-b border-border bg-muted/20 space-y-3 tabular-nums">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-foreground">{editingId ? 'Edit catalog entry' : 'New catalog entry'}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input type="text" value={fName} onChange={(e) => setFName(e.target.value)} placeholder="Name *" className="h-9 border border-border bg-card px-3 text-[13px] focus:outline-none" />
            <select value={fKind} onChange={(e) => setFKind(e.target.value as typeof fKind)} disabled={!!editingId} className="h-9 border border-border bg-card px-3 text-[13px] cursor-pointer focus:outline-none">
              <option value="service">Core service</option>
              <option value="addon">Add-on</option>
              <option value="package">Package</option>
            </select>
            <input type="text" value={fDesc} onChange={(e) => setFDesc(e.target.value)} placeholder="Description" className="h-9 border border-border bg-card px-3 text-[13px] focus:outline-none" />
            <input type="number" step="0.01" min="0" value={fPrice} onChange={(e) => setFPrice(e.target.value)} placeholder="Price ($) *" className="h-9 border border-border bg-card px-3 text-[13px] focus:outline-none" />
            <input type="number" min="0" value={fDuration} onChange={(e) => setFDuration(e.target.value)} placeholder="Duration (minutes)" className="h-9 border border-border bg-card px-3 text-[13px] focus:outline-none" />
            <div className="flex items-center gap-2">
              <button onClick={submit} disabled={busy || !fName.trim() || !fPrice} className="h-9 px-4 bg-primary text-primary-foreground uppercase font-semibold text-[12px] hover:bg-muted cursor-pointer disabled:opacity-50">
                {editingId ? 'Save' : 'Create'}
              </button>
              <button onClick={() => setShowForm(false)} className="h-9 px-4 border border-border bg-card uppercase font-semibold text-[12px] hover:bg-muted/40 cursor-pointer">Cancel</button>
            </div>
          </div>
          {editingId && <p className="text-[11px] text-muted-foreground">Kind is fixed for existing entries — editing updates name, price, duration, and description on the live row.</p>}
        </div>
      )}

      {/* FILTER BAR */}
      <div className="p-3 bg-muted/30 border-b border-border flex flex-wrap items-center justify-between gap-2 tabular-nums text-[13px] select-none">
        <div className="flex items-center gap-1 overflow-x-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 border border-border uppercase font-semibold text-[10px] cursor-pointer ${
                selectedCategory === cat ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground hover:bg-muted'
              }`}
            >
              {cat.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
        <div className="text-[10px] text-muted-foreground">SHOWING {filteredItems.length} ITEMS</div>
      </div>

      {/* CATALOG GRID */}
      {items === null ? (
        <div className="p-10 text-center text-muted-foreground tabular-nums text-[13px]">LOADING LIVE CATALOG…</div>
      ) : filteredItems.length === 0 ? (
        <div className="p-10 text-center text-muted-foreground tabular-nums text-[13px]">NO CATALOG ENTRIES IN THIS CATEGORY — CREATE THE FIRST ONE ABOVE.</div>
      ) : (
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 tabular-nums text-[13px]">
          {filteredItems.map((item) => (
            <div key={item.id} className="border-2-black bg-card p-4 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-[10px]">{item.code || item.category}</span>
                  <span className="bg-primary text-primary-foreground text-[9px] px-1.5 py-0.2 font-semibold uppercase">{typeLabel(item)}</span>
                </div>
                <div className="font-sans font-semibold text-sm text-foreground mt-2 leading-tight">{item.name}</div>
                {item.description && <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{item.description}</p>}
              </div>

              <div className="pt-3 border-t border-border flex items-center justify-between">
                <div className="flex items-baseline gap-2">
                  <span className="font-sans font-semibold text-base">${item.price.toFixed(2)}</span>
                  <span className="text-[10px] text-muted-foreground">{item.duration}m</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(item)}
                    className="px-2 py-1 border border-border text-[9px] uppercase font-semibold hover:border-brand-teal/60 hover:bg-brand-teal/5 hover:text-brand-teal cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => onNavigateScreen?.('services-pricing')}
                    className="px-2 py-1 border border-border text-[9px] uppercase font-semibold hover:border-brand-teal/60 hover:bg-brand-teal/5 hover:text-brand-teal cursor-pointer"
                  >
                    Matrix
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SERVICES PAGE — GIFT CARDS & CREDITS BLOCK (§4.1: the block did
          not exist in the CMS at all). Content persists to
          cms_global_content 'services_gift_cards_block'; program facts
          are the live gift-card ledger. */}
      <GiftCardsBlockPanel showToast={showToast} />
    </div>
  );
};

type GiftBlock = { enabled: boolean; headline: string; body: string; ctaLabel: string; ctaUrl: string };

const GiftCardsBlockPanel: React.FC<{ showToast: (msg: string, isError?: boolean) => void }> = ({ showToast }) => {
  const [block, setBlock] = useState<GiftBlock | null>(null);
  const [program, setProgram] = useState<{ activeCards: number; outstandingLiability: number } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    postAction('/api/admin/cms/actions', 'cms_gift_cards_block', {})
      .then((d) => {
        const b = (d.block || {}) as Record<string, any>;
        setBlock({
          enabled: !!b.enabled,
          headline: String(b.headline || 'Gift Cards & Store Credit'),
          body: String(b.body || ''),
          ctaLabel: String(b.ctaLabel || 'Buy a Gift Card'),
          ctaUrl: String(b.ctaUrl || '/gift-cards'),
        });
        setProgram(d.program || null);
      })
      .catch(() => setBlock(null));
  }, []);

  const save = async () => {
    if (!block) return;
    setSaving(true);
    try {
      await postAction('/api/admin/cms/actions', 'cms_edit_gift_cards_block', {
        enabled: block.enabled, headline: block.headline, body: block.body,
        cta_label: block.ctaLabel, cta_url: block.ctaUrl,
      });
      showToast('GIFT CARDS & CREDITS BLOCK SAVED');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed', true);
    } finally { setSaving(false); }
  };

  const inputCls = 'w-full bg-card border border-border px-3 py-2 text-[13px] focus:outline-none rounded-lg';
  return (
    <div className="border border-border bg-card p-5 mt-6 space-y-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div>
          <h3 className="font-display text-md font-semibold tracking-tight">Services Page — Gift Cards &amp; Credits Block</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {program
              ? `Live program: ${program.activeCards} active cards · $${program.outstandingLiability.toFixed(2)} outstanding liability (commerce_gift_cards).`
              : 'Loading the live gift-card program…'}
          </p>
        </div>
        <label className="flex items-center gap-2 text-[12px] font-medium cursor-pointer">
          <input type="checkbox" checked={!!block?.enabled} disabled={!block}
            onChange={(e) => block && setBlock({ ...block, enabled: e.target.checked })} className="w-4 h-4 accent-black" />
          Block enabled
        </label>
      </div>
      {!block ? (
        <p className="text-[12px] text-muted-foreground">Block settings unavailable.</p>
      ) : (
        <>
          <div>
            <label className="block text-[10px] text-muted-foreground mb-1 uppercase">Headline</label>
            <input value={block.headline} onChange={(e) => setBlock({ ...block, headline: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block text-[10px] text-muted-foreground mb-1 uppercase">Body</label>
            <textarea value={block.body} onChange={(e) => setBlock({ ...block, body: e.target.value })} className={inputCls} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-muted-foreground mb-1 uppercase">Button label</label>
              <input value={block.ctaLabel} onChange={(e) => setBlock({ ...block, ctaLabel: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-[10px] text-muted-foreground mb-1 uppercase">Button URL</label>
              <input value={block.ctaUrl} onChange={(e) => setBlock({ ...block, ctaUrl: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={save} disabled={saving}
              className="border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 px-4 py-2 text-[12px] uppercase font-semibold rounded-lg disabled:opacity-50 cursor-pointer">
              {saving ? 'Saving…' : 'Save Block'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};
