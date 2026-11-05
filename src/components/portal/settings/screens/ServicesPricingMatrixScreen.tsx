'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { DollarSign, Tag, Clock, Plus, CheckCircle2, Pencil, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SystemSettings } from '@/lib/settings-types';

interface ScreenProps {
  onNavigateScreen?: (screenId: string) => void;
  selectedLocation?: string;
  onSelectLocation?: (loc: string) => void;
  systemSettings?: SystemSettings;
  saveSettingsToDb?: (updates: Partial<SystemSettings>) => void;
}

// ---------------------------------------------------------------------------
// Services & Pricing Matrix — wired to the REAL service catalog.
//   Services:   GET  /api/admin/crm/services (crm_services, active only)
//   Add:        POST /api/admin/system/actions  sys_add_service
//   Edit:       POST /api/admin/cms/actions     cms_edit_service
//   Surcharges: read via cms_services_catalog_view; edit via
//               cms_edit_pricing_rules; create via sys_add_surcharge
//               (all backed by crm_surcharges — the same rows the booking
//               engine charges). Nothing on this screen is sample data.
// ---------------------------------------------------------------------------

interface ServiceItem {
  id: string;
  name: string;
  code: string | null;
  category: string;
  price: number;
  duration: number;
  description: string;
  isAddOn: boolean;
}

interface Surcharge {
  id: string;
  name: string;
  code: string | null;
  amount: number | null;
  percent: number | null;
  surchargeType: string | null;
  autoApply: boolean;
  isActive: boolean;
}

const SURCHARGE_TYPES = [
  'weekend', 'holiday', 'severe_matting', 'senior_pet', 'aggressive_pet',
  'late_pickup', 'no_show', 'express', 'de_shedding', 'flea_treatment',
  'special_handling', 'travel', 'other',
];

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

export const ServicesPricingMatrixScreen: React.FC<ScreenProps> = () => {
  const [services, setServices] = useState<ServiceItem[] | null>(null);
  const [surcharges, setSurcharges] = useState<Surcharge[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [busy, setBusy] = useState(false);

  // Service form (add + edit share it)
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fName, setFName] = useState('');
  const [fCategory, setFCategory] = useState('');
  const [fPrice, setFPrice] = useState('');
  const [fDuration, setFDuration] = useState('');
  const [fDesc, setFDesc] = useState('');

  // Surcharge create form
  const [showSurchargeForm, setShowSurchargeForm] = useState(false);
  const [sName, setSName] = useState('');
  const [sType, setSType] = useState('weekend');
  const [sCalc, setSCalc] = useState('flat_amount');
  const [sAmount, setSAmount] = useState('');
  const [sPercent, setSPercent] = useState('');
  const [sAuto, setSAuto] = useState(false);
  // Surcharge row edits: id -> { amount, percent, autoApply, isActive }
  const [sEdits, setSEdits] = useState<Record<string, { amount: string; percent: string; autoApply: boolean; isActive: boolean }>>({});

  const load = useCallback(async () => {
    try {
      const [svcRes, catRes] = await Promise.all([
        fetch('/api/admin/crm/services?limit=500').then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))),
        postAction('/api/admin/cms/actions', 'cms_services_catalog_view', {}),
      ]);
      const rows: any[] = svcRes.services || [];
      setServices(rows.map((s) => ({
        id: String(s.id),
        name: s.name ?? '—',
        code: s.code ?? null,
        category: s.serviceCategory || s.category || (s.isAddOn ? 'add_on' : 'general'),
        price: Number(s.defaultPrice ?? 0),
        duration: Number(s.defaultDurationMinutes ?? 0),
        description: s.description ?? '',
        isAddOn: !!s.isAddOn,
      })));
      const sur: any[] = catRes?.catalog?.surcharges || [];
      setSurcharges(sur.map((x) => ({
        id: String(x.id), name: x.name, code: x.code ?? null,
        amount: x.amount !== null && x.amount !== undefined ? Number(x.amount) : null,
        percent: x.percent !== null && x.percent !== undefined ? Number(x.percent) : null,
        surchargeType: x.surchargeType ?? null,
        autoApply: !!x.autoApply, isActive: !!x.isActive,
      })));
      setSEdits(Object.fromEntries(sur.map((x) => [String(x.id), {
        amount: x.amount !== null && x.amount !== undefined ? String(x.amount) : '',
        percent: x.percent !== null && x.percent !== undefined ? String(x.percent) : '',
        autoApply: !!x.autoApply, isActive: !!x.isActive,
      }])));
      setLoadError(null);
    } catch (e) {
      setServices([]);
      setLoadError(e instanceof Error ? e.message : 'load failed');
    }
  }, []);

  useEffect(() => { load(); }, [load ]);

  const flash = (msg: string) => { setActionError(null); setActionMsg(msg); };
  const fail = (e: unknown) => { setActionMsg(null); setActionError(e instanceof Error ? e.message : 'action failed'); };

  const openAdd = () => {
    setEditingId(null);
    setFName(''); setFCategory(''); setFPrice(''); setFDuration(''); setFDesc('');
    setShowServiceForm(true);
  };
  const openEdit = (svc: ServiceItem) => {
    setEditingId(svc.id);
    setFName(svc.name); setFCategory(svc.category === 'general' ? '' : svc.category);
    setFPrice(String(svc.price)); setFDuration(String(svc.duration)); setFDesc(svc.description);
    setShowServiceForm(true);
  };

  const submitService = async () => {
    if (!fName.trim() || !fPrice) return;
    setBusy(true);
    try {
      if (editingId) {
        await postAction('/api/admin/cms/actions', 'cms_edit_service', {
          service_id: editingId, name: fName.trim(), category: fCategory.trim() || undefined,
          default_price: Number(fPrice), default_duration_minutes: Number(fDuration) || 60,
          description: fDesc,
        });
        flash(`Service "${fName.trim()}" updated in crm_services.`);
      } else {
        await postAction('/api/admin/system/actions', 'sys_add_service', {
          name: fName.trim(), category: fCategory.trim() || 'grooming',
          default_price: Number(fPrice), default_duration_minutes: Number(fDuration) || 60,
          description: fDesc || undefined,
        });
        flash(`Service "${fName.trim()}" added to the live catalog.`);
      }
      setShowServiceForm(false);
      await load();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const saveSurcharge = async (s: Surcharge) => {
    const ed = sEdits[s.id];
    if (!ed) return;
    setBusy(true);
    try {
      await postAction('/api/admin/cms/actions', 'cms_edit_pricing_rules', {
        rules: [{
          surcharge_id: s.id,
          amount: ed.amount === '' ? undefined : Number(ed.amount),
          percent: ed.percent === '' ? undefined : Number(ed.percent),
          auto_apply: ed.autoApply, is_active: ed.isActive,
        }],
      });
      flash(`Pricing rule "${s.name}" saved to crm_surcharges.`);
      await load();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const submitSurcharge = async () => {
    if (!sName.trim()) return;
    setBusy(true);
    try {
      await postAction('/api/admin/system/actions', 'sys_add_surcharge', {
        name: sName.trim(), surcharge_type: sType, calc_method: sCalc,
        amount: sAmount === '' ? 0 : Number(sAmount),
        percent: sPercent === '' ? 0 : Number(sPercent),
        auto_apply: sAuto,
      });
      flash(`Surcharge "${sName.trim()}" created in crm_surcharges.`);
      setShowSurchargeForm(false);
      setSName(''); setSAmount(''); setSPercent(''); setSAuto(false);
      await load();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const categories = ['all', ...Array.from(new Set((services ?? []).map((s) => s.category)))];
  const filtered = (services ?? []).filter((s) => activeCategory === 'all' || s.category === activeCategory);
  const knownCategories = Array.from(new Set((services ?? []).map((s) => s.category)));

  if (services === null) return <div className="p-8 text-center text-muted-foreground text-[13px]">Loading services & pricing...</div>;

  return (
    <div className="p-6 space-y-6 font-bar">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Services & Pricing Matrix</h2>
          <p className="text-[13px] text-muted-foreground mt-1">The live service catalog (crm_services) and the surcharge rules the booking engine charges (crm_surcharges).</p>
        </div>
        <button onClick={openAdd} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background hover:bg-accent h-9 px-3.5 text-[13px] font-medium cursor-pointer">
          <Plus className="size-4" /> Add New Service
        </button>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">
          <AlertCircle className="size-4" /> Catalog failed to load ({loadError}). Showing what could be read.
        </div>
      )}
      {actionMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-[13px] text-foreground">
          <CheckCircle2 className="size-4 text-success" /> {actionMsg}
        </div>
      )}
      {actionError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">
          <AlertCircle className="size-4" /> {actionError}
        </div>
      )}

      {/* Add / Edit Service Form */}
      {showServiceForm && (
        <div className="bg-card border border-border rounded-xl shadow-card p-5 space-y-4">
          <h3 className="text-[15px] font-semibold text-foreground">{editingId ? 'Edit Service' : 'Add New Service'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">Service Name *</label>
              <div className="relative">
                <Tag className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input type="text" value={fName} onChange={(e) => setFName(e.target.value)} placeholder="Full Groom — Extra Large" className="w-full pl-9 pr-3 h-9 bg-background border border-input rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">Category</label>
              <input type="text" list="svc-categories" value={fCategory} onChange={(e) => setFCategory(e.target.value)} placeholder="grooming" className="w-full h-9 bg-background border border-input rounded-lg px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-ring" />
              <datalist id="svc-categories">
                {knownCategories.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">Price ($) *</label>
              <div className="relative">
                <DollarSign className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input type="number" step="0.01" min="0" value={fPrice} onChange={(e) => setFPrice(e.target.value)} placeholder="125.00" className="w-full pl-7 pr-3 h-9 bg-background border border-input rounded-lg text-[13px] tabular-nums focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">Duration (minutes)</label>
              <div className="relative">
                <Clock className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input type="number" min="0" value={fDuration} onChange={(e) => setFDuration(e.target.value)} placeholder="120" className="w-full pl-9 pr-3 h-9 bg-background border border-input rounded-lg text-[13px] tabular-nums focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">Description</label>
              <input type="text" value={fDesc} onChange={(e) => setFDesc(e.target.value)} placeholder="Bath, blow dry, trim, nails, ears" className="w-full h-9 bg-background border border-input rounded-lg px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowServiceForm(false)} className="inline-flex items-center h-9 px-3.5 rounded-lg border border-border bg-background hover:bg-accent text-foreground text-[13px] font-medium cursor-pointer">Cancel</button>
            <button onClick={submitService} disabled={busy || !fName.trim() || !fPrice} className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-[13px] font-medium shadow-card cursor-pointer disabled:opacity-50">
              <Plus className="size-4" /> {editingId ? 'Save Service' : 'Add Service'}
            </button>
          </div>
        </div>
      )}

      {/* Category filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {categories.map((cat) => (
          <button key={cat} onClick={() => setActiveCategory(cat)} className={cn('rounded-full px-3 py-1.5 text-[12px] font-medium border cursor-pointer transition-colors capitalize', activeCategory === cat ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border text-muted-foreground hover:bg-accent')}>{cat === 'all' ? 'All' : cat.replace(/_/g, ' ')}</button>
        ))}
      </div>

      {/* Services table */}
      <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
        <table className="w-full text-left text-[13px] text-foreground">
          <thead>
            <tr className="bg-muted/40 border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="p-3 font-semibold">Service</th>
              <th className="p-3 font-semibold">Category</th>
              <th className="p-3 text-right font-semibold">Price</th>
              <th className="p-3 font-semibold">Duration</th>
              <th className="p-3 font-semibold">Description</th>
              <th className="p-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((svc) => (
              <tr key={svc.id} className="hover:bg-accent/50 transition-colors">
                <td className="p-3 font-medium text-foreground">{svc.name}</td>
                <td className="p-3"><span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border capitalize">{svc.category.replace(/_/g, ' ')}</span></td>
                <td className="p-3 text-right font-semibold tabular-nums text-primary">${svc.price.toFixed(2)}</td>
                <td className="p-3 text-muted-foreground tabular-nums">{svc.duration} min</td>
                <td className="p-3 text-muted-foreground text-[12px]">{svc.description || '—'}</td>
                <td className="p-3 text-right">
                  <button onClick={() => openEdit(svc)} className="inline-flex items-center gap-1 px-2.5 h-7 rounded-lg border border-border bg-background hover:bg-accent text-foreground text-[11px] font-medium cursor-pointer">
                    <Pencil className="size-3.5" /> Edit
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No services in this category yet. Use Add New Service to create the first one.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pricing Rules — real crm_surcharges */}
      <div className="bg-card border border-border rounded-xl shadow-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-semibold text-foreground">Pricing Rules & Surcharges</h3>
          <button onClick={() => setShowSurchargeForm(!showSurchargeForm)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background hover:bg-accent h-8 px-3 text-[12px] font-medium cursor-pointer">
            <Plus className="size-3.5" /> Add Surcharge
          </button>
        </div>

        {showSurchargeForm && (
          <div className="border border-border rounded-lg p-4 mb-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">Name *</label>
                <input type="text" value={sName} onChange={(e) => setSName(e.target.value)} placeholder="Weekend Surcharge" className="w-full h-9 bg-background border border-input rounded-lg px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">Applies When</label>
                <select value={sType} onChange={(e) => setSType(e.target.value)} className="w-full h-9 bg-background border border-input rounded-lg px-3 text-[13px] cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring">
                  {SURCHARGE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">Calculation</label>
                <select value={sCalc} onChange={(e) => setSCalc(e.target.value)} className="w-full h-9 bg-background border border-input rounded-lg px-3 text-[13px] cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="flat_amount">Flat amount</option>
                  <option value="percent_of_service">Percent of service</option>
                  <option value="per_minute">Per minute</option>
                </select>
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">Amount ($)</label>
                <input type="number" step="0.01" min="0" value={sAmount} onChange={(e) => setSAmount(e.target.value)} placeholder="10.00" className="w-full h-9 bg-background border border-input rounded-lg px-3 text-[13px] tabular-nums focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">Percent (%)</label>
                <input type="number" step="0.1" min="0" value={sPercent} onChange={(e) => setSPercent(e.target.value)} placeholder="10" className="w-full h-9 bg-background border border-input rounded-lg px-3 text-[13px] tabular-nums focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <label className="flex items-end gap-2 pb-2 cursor-pointer">
                <input type="checkbox" checked={sAuto} onChange={(e) => setSAuto(e.target.checked)} className="size-4 accent-primary" />
                <span className="text-[13px] text-foreground">Auto-apply</span>
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowSurchargeForm(false)} className="h-9 px-3.5 rounded-lg border border-border bg-background hover:bg-accent text-[13px] font-medium cursor-pointer">Cancel</button>
              <button onClick={submitSurcharge} disabled={busy || !sName.trim()} className="h-9 px-3.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-[13px] font-medium cursor-pointer disabled:opacity-50">Create Surcharge</button>
            </div>
          </div>
        )}

        {surcharges.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No surcharge rules configured for this shop yet. Add one above — it lands in crm_surcharges, where the booking engine reads it.</p>
        ) : (
          <div className="divide-y divide-border">
            {surcharges.map((s) => {
              const ed = sEdits[s.id] || { amount: '', percent: '', autoApply: s.autoApply, isActive: s.isActive };
              const setEd = (patch: Partial<typeof ed>) => setSEdits((prev) => ({ ...prev, [s.id]: { ...ed, ...patch } }));
              return (
                <div key={s.id} className="py-3 flex flex-wrap items-center gap-3">
                  <div className="min-w-44 flex-1">
                    <p className="text-[13px] font-medium text-foreground">{s.name}</p>
                    <p className="text-[11px] text-muted-foreground capitalize">{(s.surchargeType || 'other').replace(/_/g, ' ')}{s.code ? ` · ${s.code}` : ''}</p>
                  </div>
                  <label className="text-[11px] text-muted-foreground">Amount $
                    <input type="number" step="0.01" min="0" value={ed.amount} onChange={(e) => setEd({ amount: e.target.value })} className="ml-1.5 w-24 h-8 bg-background border border-input rounded-lg px-2 text-[13px] tabular-nums focus:outline-none focus:ring-2 focus:ring-ring" />
                  </label>
                  <label className="text-[11px] text-muted-foreground">Percent %
                    <input type="number" step="0.1" min="0" value={ed.percent} onChange={(e) => setEd({ percent: e.target.value })} className="ml-1.5 w-20 h-8 bg-background border border-input rounded-lg px-2 text-[13px] tabular-nums focus:outline-none focus:ring-2 focus:ring-ring" />
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-[12px] text-foreground">
                    <input type="checkbox" checked={ed.autoApply} onChange={(e) => setEd({ autoApply: e.target.checked })} className="size-4 accent-primary" /> Auto-apply
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-[12px] text-foreground">
                    <input type="checkbox" checked={ed.isActive} onChange={(e) => setEd({ isActive: e.target.checked })} className="size-4 accent-primary" /> Active
                  </label>
                  <button onClick={() => saveSurcharge(s)} disabled={busy} className="h-8 px-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-[12px] font-medium cursor-pointer disabled:opacity-50">Save Rule</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
