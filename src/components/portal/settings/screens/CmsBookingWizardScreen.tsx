'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Image as ImageIcon, LayoutPanelTop, ListTree, Search, FileText, Palette, ExternalLink, CheckCircle2, AlertCircle, Plus } from 'lucide-react';
import type { SystemSettings } from '@/lib/settings-types';

interface ScreenProps {
  onNavigateScreen?: (screenId: string) => void;
  selectedLocation?: string;
  onSelectLocation?: (loc: string) => void;
  systemSettings?: SystemSettings;
  saveSettingsToDb?: (updates: Partial<SystemSettings>) => void;
}

// ---------------------------------------------------------------------------
// CMS Management — the marketing-site control surface, wired to the
// canonical stores the public site reads (proven in Section A.9):
//   Pages          cms_pages            via cms_update_page
//   Banners        cms_banners          via cms_add_banner
//                  (public PromoBannerBar renders promo_bar rows)
//   Gallery        gallery_photos       via cms_update_gallery
//                  (public GalleryGrid reads this table)
//   Navigation     cms_navigation       via cms_edit_navigation
//                  (public footer renders these rows)
//   Global Content cms_global_content   via cms_edit_global_content
//                  (locale en-US — the only locale readers use)
//   SEO            cms_seo               via cms_update_seo
//                  (site layout renders scope=site_default + page rows)
//   Branding       org_primary_color / org_logo_url settings keys
// Reads come from the cms_overview action. The old screen was fiction:
// invented wizard stages, a fake subdomain, and toasts claiming state
// was committed while nothing was saved. All of that is gone.
// ---------------------------------------------------------------------------

interface Overview {
  pages: Array<{ id: string; slug: string; title: string; pageType: string | null; status: string; isPublished: boolean; updatedAt: string }>;
  banners: Array<{ id: string; bannerType: string; placement: string; title: string; subtitle: string | null; ctaText: string | null; ctaUrl: string | null; imageUrl: string | null; isActive: boolean; sortOrder: number }>;
  navigation: Array<{ id: string; menuType: string; label: string; url: string; parentId: string | null; sortOrder: number; isActive: boolean }>;
  seo: Array<{ id: string; pageSlug: string; scope: string; metaTitle: string | null; metaDescription: string | null; ogTitle: string | null; ogDescription: string | null; canonicalUrl: string | null }>;
  globalContent: Array<{ id: string; contentKey: string; contentType: string; valueText: string | null }>;
  gallery: Array<{ id: string; imageUrl: string; title: string | null; petName: string | null; sortOrder: number }>;
  paymentMethods: Array<{ id: string; code: string; name: string | null; isActive: boolean }>;
}

async function cmsAction(action: string, payload: Record<string, unknown>) {
  const r = await fetch('/api/admin/cms/actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || `Action failed (${r.status})`);
  return j as Record<string, any>;
}

const inputCls = 'w-full h-9 bg-background border border-input rounded-lg px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-ring';
const labelCls = 'text-[12px] font-medium text-muted-foreground block mb-1';

export const CmsBookingWizardScreen: React.FC<ScreenProps> = ({ systemSettings, saveSettingsToDb }) => {
  const [ov, setOv] = useState<Overview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Branding (real org_* settings keys)
  const [brandColor, setBrandColor] = useState(systemSettings?.org_primary_color || '#ea580c');
  const [logoUrl, setLogoUrl] = useState(systemSettings?.org_logo_url || '');

  // Page edit
  const [pageEdits, setPageEdits] = useState<Record<string, { title: string; status: string }>>({});
  // Banner form
  const [bTitle, setBTitle] = useState('');
  const [bSubtitle, setBSubtitle] = useState('');
  const [bCtaText, setBCtaText] = useState('');
  const [bCtaUrl, setBCtaUrl] = useState('');
  const [bType, setBType] = useState('promo_bar');
  const [bPlacement, setBPlacement] = useState('top');
  // Gallery form
  const [gUrl, setGUrl] = useState('');
  const [gTitle, setGTitle] = useState('');
  const [gPet, setGPet] = useState('');
  // Navigation
  const [navEdits, setNavEdits] = useState<Record<string, { label: string; url: string }>>({});
  const [nMenu, setNMenu] = useState('header');
  const [nLabel, setNLabel] = useState('');
  const [nUrl, setNUrl] = useState('');
  // Global content
  const [gcEdits, setGcEdits] = useState<Record<string, string>>({});
  // SEO form (site default or a page row)
  const [seoSlug, setSeoSlug] = useState('');
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDesc, setSeoDesc] = useState('');
  const [seoOgTitle, setSeoOgTitle] = useState('');
  const [seoOgDesc, setSeoOgDesc] = useState('');
  const [seoCanonical, setSeoCanonical] = useState('');

  const load = useCallback(async () => {
    try {
      const j = await cmsAction('cms_overview', {});
      const o = j.overview as Overview;
      setOv(o);
      setPageEdits(Object.fromEntries(o.pages.map((p) => [p.id, { title: p.title, status: p.status }])));
      setNavEdits(Object.fromEntries(o.navigation.map((n) => [n.id, { label: n.label, url: n.url }])));
      setGcEdits(Object.fromEntries(o.globalContent.map((g) => [g.id, g.valueText ?? ''])));
      const site = o.seo.find((s) => s.scope === 'site_default');
      if (site) {
        setSeoSlug(site.pageSlug || '');
        setSeoTitle(site.metaTitle || ''); setSeoDesc(site.metaDescription || '');
        setSeoOgTitle(site.ogTitle || ''); setSeoOgDesc(site.ogDescription || ''); setSeoCanonical(site.canonicalUrl || '');
      }
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'load failed');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (m: string) => { setErr(null); setMsg(m); };
  const fail = (e: unknown) => { setMsg(null); setErr(e instanceof Error ? e.message : 'action failed'); };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); await load(); } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const savePage = (id: string, slug: string) => run(async () => {
    const ed = pageEdits[id];
    if (!ed) return;
    await cmsAction('cms_update_page', { page_id: id, title: ed.title, status: ed.status });
    flash(`Page "${slug}" saved to cms_pages — the public site reads this row.`);
  });

  const addBanner = () => run(async () => {
    if (!bTitle.trim()) throw new Error('Banner title is required');
    await cmsAction('cms_add_banner', {
      title: bTitle.trim(), subtitle: bSubtitle || undefined,
      cta_text: bCtaText || undefined, cta_url: bCtaUrl || undefined,
      banner_type: bType, placement: bPlacement, is_active: true,
    });
    setBTitle(''); setBSubtitle(''); setBCtaText(''); setBCtaUrl('');
    flash('Banner published to cms_banners. promo_bar banners render in the public PromoBannerBar.');
  });

  const addGalleryPhoto = () => run(async () => {
    if (!gUrl.trim()) throw new Error('Image URL is required');
    const nextSort = (ov?.gallery.reduce((m, g) => Math.max(m, g.sortOrder), 0) ?? 0) + 1;
    await cmsAction('cms_update_gallery', {
      items: [{ image_url: gUrl.trim(), title: gTitle || undefined, pet_name: gPet || undefined, alt_text: gTitle || gPet || undefined, sort_order: nextSort }],
    });
    setGUrl(''); setGTitle(''); setGPet('');
    flash('Photo added to gallery_photos — the public gallery reads this table.');
  });

  const addNavItem = () => run(async () => {
    if (!nLabel.trim() || !nUrl.trim()) throw new Error('Label and URL are required');
    await cmsAction('cms_edit_navigation', { items: [{ menu_type: nMenu, label: nLabel.trim(), url: nUrl.trim(), sort_order: (ov?.navigation.length ?? 0) + 1 }] });
    setNLabel(''); setNUrl('');
    flash('Navigation item saved to cms_navigation — the public footer renders these rows.');
  });

  const saveNavItem = (id: string) => run(async () => {
    const item = ov?.navigation.find((n) => n.id === id);
    const ed = navEdits[id];
    if (!item || !ed) return;
    await cmsAction('cms_edit_navigation', { items: [{ id, menu_type: item.menuType, label: ed.label, url: ed.url, sort_order: item.sortOrder, is_active: item.isActive }] });
    flash('Navigation item updated.');
  });

  const saveGlobalContent = (id: string) => run(async () => {
    const item = ov?.globalContent.find((g) => g.id === id);
    if (!item) return;
    await cmsAction('cms_edit_global_content', { items: [{ content_key: item.contentKey, content_type: item.contentType, value_text: gcEdits[id] ?? '' }] });
    flash(`Global content "${item.contentKey}" saved — public components read this key.`);
  });

  const saveSeo = () => run(async () => {
    await cmsAction('cms_update_seo', {
      page_slug: seoSlug || undefined,
      meta_title: seoTitle || undefined, meta_description: seoDesc || undefined,
      og_title: seoOgTitle || undefined, og_description: seoOgDesc || undefined,
      canonical_url: seoCanonical || undefined,
    });
    flash(seoSlug ? `SEO for "${seoSlug}" saved to cms_seo.` : 'Site-default SEO saved to cms_seo — the root layout renders it.');
  });

  const loadSeoRow = (s: Overview['seo'][number]) => {
    setSeoSlug(s.pageSlug || '');
    setSeoTitle(s.metaTitle || ''); setSeoDesc(s.metaDescription || '');
    setSeoOgTitle(s.ogTitle || ''); setSeoOgDesc(s.ogDescription || ''); setSeoCanonical(s.canonicalUrl || '');
  };

  const saveBranding = () => {
    saveSettingsToDb?.({ org_primary_color: brandColor, org_logo_url: logoUrl });
    flash('Branding saved — org_primary_color / org_logo_url settings keys.');
  };

  if (ov === null && !loadError) return <div className="p-8 text-center text-muted-foreground text-[13px]">Loading CMS…</div>;

  return (
    <div className="p-6 space-y-6 font-bar">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">CMS Management</h2>
          <p className="text-[13px] text-muted-foreground mt-1">Pages, banners, gallery, navigation, global content, and SEO — every control writes the exact store the public website reads.</p>
        </div>
        <button onClick={() => window.open('/', '_blank')} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background hover:bg-accent h-9 px-3.5 text-[13px] font-medium cursor-pointer">
          <ExternalLink className="size-4" /> View Public Website
        </button>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">
          <AlertCircle className="size-4" /> CMS data failed to load ({loadError}).
        </div>
      )}
      {msg && (
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-[13px] text-foreground">
          <CheckCircle2 className="size-4 text-success" /> {msg}
        </div>
      )}
      {err && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">
          <AlertCircle className="size-4" /> {err}
        </div>
      )}

      {/* BRANDING */}
      <section className="bg-card border border-border rounded-xl shadow-card p-5 space-y-4">
        <h3 className="text-[15px] font-semibold text-foreground flex items-center gap-2"><Palette className="size-4 text-primary" /> Branding</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Primary Brand Color</label>
            <div className="flex items-center gap-2">
              <input type="color" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className="h-9 w-12 rounded border border-input cursor-pointer bg-background" />
              <input type="text" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Logo URL (header + email footer)</label>
            <input type="text" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…/logo.png" className={inputCls} />
          </div>
        </div>
        <div className="flex justify-end">
          <button onClick={saveBranding} className="h-9 px-4 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-[13px] font-medium cursor-pointer">Save Branding</button>
        </div>
      </section>

      {/* PAGES */}
      <section className="bg-card border border-border rounded-xl shadow-card p-5 space-y-3">
        <h3 className="text-[15px] font-semibold text-foreground flex items-center gap-2"><FileText className="size-4 text-primary" /> Pages (cms_pages)</h3>
        {(ov?.pages.length ?? 0) === 0 ? (
          <p className="text-[13px] text-muted-foreground">No CMS pages exist for this shop yet. Public pages are code routes; cms_pages holds managed content pages when they are created.</p>
        ) : (
          <div className="divide-y divide-border">
            {ov!.pages.map((p) => {
              const ed = pageEdits[p.id] || { title: p.title, status: p.status };
              const setEd = (patch: Partial<typeof ed>) => setPageEdits((prev) => ({ ...prev, [p.id]: { ...ed, ...patch } }));
              return (
                <div key={p.id} className="py-3 flex flex-wrap items-center gap-3">
                  <div className="min-w-40 flex-1">
                    <input type="text" value={ed.title} onChange={(e) => setEd({ title: e.target.value })} className={inputCls} />
                    <p className="text-[11px] text-muted-foreground mt-1">/{p.slug}{p.pageType ? ` · ${p.pageType}` : ''} · updated {new Date(p.updatedAt).toLocaleDateString()}</p>
                  </div>
                  <select value={ed.status} onChange={(e) => setEd({ status: e.target.value })} className="h-9 bg-background border border-input rounded-lg px-2 text-[13px] cursor-pointer">
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                  </select>
                  <button onClick={() => savePage(p.id, p.slug)} disabled={busy} className="h-9 px-3.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-[13px] font-medium cursor-pointer disabled:opacity-50">Save Page</button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* BANNERS */}
      <section className="bg-card border border-border rounded-xl shadow-card p-5 space-y-4">
        <h3 className="text-[15px] font-semibold text-foreground flex items-center gap-2"><LayoutPanelTop className="size-4 text-primary" /> Banners (cms_banners)</h3>
        {(ov?.banners.length ?? 0) === 0 ? (
          <p className="text-[13px] text-muted-foreground">No banners yet. Add one below — a promo_bar banner appears in the public PromoBannerBar on the storefront.</p>
        ) : (
          <ul className="divide-y divide-border">
            {ov!.banners.map((b) => (
              <li key={b.id} className="py-2.5 flex items-center gap-3 text-[13px]">
                <span className={`size-2 rounded-full ${b.isActive ? 'bg-success' : 'bg-muted-foreground/40'}`} />
                <span className="font-medium text-foreground">{b.title}</span>
                <span className="text-muted-foreground">{b.bannerType} · {b.placement}</span>
                {b.ctaText && <span className="text-muted-foreground">→ {b.ctaText}</span>}
                <span className="ml-auto text-[11px] text-muted-foreground">{b.isActive ? 'Active' : 'Inactive'}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 border-t border-border pt-4">
          <div><label className={labelCls}>Title *</label><input type="text" value={bTitle} onChange={(e) => setBTitle(e.target.value)} placeholder="Free nail trim with any full groom" className={inputCls} /></div>
          <div><label className={labelCls}>Subtitle</label><input type="text" value={bSubtitle} onChange={(e) => setBSubtitle(e.target.value)} className={inputCls} /></div>
          <div><label className={labelCls}>Type</label>
            <select value={bType} onChange={(e) => setBType(e.target.value)} className={inputCls + ' cursor-pointer'}>
              <option value="promo_bar">Promo bar</option>
              <option value="hero">Hero</option>
              <option value="announcement">Announcement</option>
              <option value="sale">Sale</option>
              <option value="seasonal">Seasonal</option>
            </select>
          </div>
          <div><label className={labelCls}>Placement</label>
            <select value={bPlacement} onChange={(e) => setBPlacement(e.target.value)} className={inputCls + ' cursor-pointer'}>
              <option value="top">Top</option>
              <option value="header">Header</option>
              <option value="hero">Hero</option>
              <option value="sidebar">Sidebar</option>
              <option value="footer">Footer</option>
              <option value="popup">Popup</option>
            </select>
          </div>
          <div><label className={labelCls}>Button Text</label><input type="text" value={bCtaText} onChange={(e) => setBCtaText(e.target.value)} placeholder="Book now" className={inputCls} /></div>
          <div><label className={labelCls}>Button URL</label><input type="text" value={bCtaUrl} onChange={(e) => setBCtaUrl(e.target.value)} placeholder="/book" className={inputCls} /></div>
        </div>
        <div className="flex justify-end">
          <button onClick={addBanner} disabled={busy || !bTitle.trim()} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-[13px] font-medium cursor-pointer disabled:opacity-50"><Plus className="size-4" /> Publish Banner</button>
        </div>
      </section>

      {/* GALLERY */}
      <section className="bg-card border border-border rounded-xl shadow-card p-5 space-y-4">
        <h3 className="text-[15px] font-semibold text-foreground flex items-center gap-2"><ImageIcon className="size-4 text-primary" /> Gallery (gallery_photos)</h3>
        {(ov?.gallery.length ?? 0) === 0 ? (
          <p className="text-[13px] text-muted-foreground">No gallery photos yet.</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {ov!.gallery.map((g) => (
              <figure key={g.id} className="relative aspect-square rounded-lg overflow-hidden border border-border bg-muted/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.imageUrl} alt={g.title || g.petName || 'Gallery photo'} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                {(g.title || g.petName) && <figcaption className="absolute inset-x-0 bottom-0 bg-black/55 text-white text-[10px] px-1.5 py-1 truncate">{g.title || g.petName}</figcaption>}
              </figure>
            ))}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 border-t border-border pt-4">
          <div><label className={labelCls}>Image URL *</label><input type="text" value={gUrl} onChange={(e) => setGUrl(e.target.value)} placeholder="https://…" className={inputCls} /></div>
          <div><label className={labelCls}>Title</label><input type="text" value={gTitle} onChange={(e) => setGTitle(e.target.value)} className={inputCls} /></div>
          <div><label className={labelCls}>Pet Name</label><input type="text" value={gPet} onChange={(e) => setGPet(e.target.value)} className={inputCls} /></div>
        </div>
        <div className="flex justify-end">
          <button onClick={addGalleryPhoto} disabled={busy || !gUrl.trim()} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-[13px] font-medium cursor-pointer disabled:opacity-50"><Plus className="size-4" /> Add Photo</button>
        </div>
      </section>

      {/* NAVIGATION */}
      <section className="bg-card border border-border rounded-xl shadow-card p-5 space-y-4">
        <h3 className="text-[15px] font-semibold text-foreground flex items-center gap-2"><ListTree className="size-4 text-primary" /> Navigation (cms_navigation)</h3>
        {(ov?.navigation.length ?? 0) === 0 ? (
          <p className="text-[13px] text-muted-foreground">No navigation rows yet — the public footer falls back to its built-in links until rows are added here.</p>
        ) : (
          <div className="divide-y divide-border">
            {ov!.navigation.map((n) => {
              const ed = navEdits[n.id] || { label: n.label, url: n.url };
              const setEd = (patch: Partial<typeof ed>) => setNavEdits((prev) => ({ ...prev, [n.id]: { ...ed, ...patch } }));
              return (
                <div key={n.id} className="py-2.5 flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted border border-border text-muted-foreground w-20 text-center">{n.menuType}</span>
                  <input type="text" value={ed.label} onChange={(e) => setEd({ label: e.target.value })} className="h-9 flex-1 min-w-32 bg-background border border-input rounded-lg px-3 text-[13px]" />
                  <input type="text" value={ed.url} onChange={(e) => setEd({ url: e.target.value })} className="h-9 flex-1 min-w-32 bg-background border border-input rounded-lg px-3 text-[13px]" />
                  <button onClick={() => saveNavItem(n.id)} disabled={busy} className="h-9 px-3 rounded-lg border border-border bg-background hover:bg-accent text-[12px] font-medium cursor-pointer disabled:opacity-50">Save</button>
                </div>
              );
            })}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 border-t border-border pt-4">
          <div><label className={labelCls}>Menu</label>
            <select value={nMenu} onChange={(e) => setNMenu(e.target.value)} className={inputCls + ' cursor-pointer'}>
              <option value="header">Header</option>
              <option value="footer">Footer</option>
              <option value="sidebar">Sidebar</option>
              <option value="mobile">Mobile</option>
            </select>
          </div>
          <div><label className={labelCls}>Label *</label><input type="text" value={nLabel} onChange={(e) => setNLabel(e.target.value)} className={inputCls} /></div>
          <div><label className={labelCls}>URL *</label><input type="text" value={nUrl} onChange={(e) => setNUrl(e.target.value)} placeholder="/shop" className={inputCls} /></div>
          <div className="flex items-end">
            <button onClick={addNavItem} disabled={busy || !nLabel.trim() || !nUrl.trim()} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-[13px] font-medium cursor-pointer disabled:opacity-50"><Plus className="size-4" /> Add Item</button>
          </div>
        </div>
      </section>

      {/* GLOBAL CONTENT */}
      <section className="bg-card border border-border rounded-xl shadow-card p-5 space-y-3">
        <h3 className="text-[15px] font-semibold text-foreground flex items-center gap-2"><FileText className="size-4 text-primary" /> Global Content (cms_global_content)</h3>
        {(ov?.globalContent.length ?? 0) === 0 ? (
          <p className="text-[13px] text-muted-foreground">No global content keys for this shop yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {ov!.globalContent.map((g) => (
              <div key={g.id} className="py-3 flex flex-wrap items-start gap-3">
                <div className="min-w-44">
                  <p className="text-[13px] font-medium text-foreground">{g.contentKey}</p>
                  <p className="text-[11px] text-muted-foreground">{g.contentType}</p>
                </div>
                <textarea value={gcEdits[g.id] ?? ''} onChange={(e) => setGcEdits((prev) => ({ ...prev, [g.id]: e.target.value }))} rows={2} className="flex-1 min-w-56 bg-background border border-input rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-ring" />
                <button onClick={() => saveGlobalContent(g.id)} disabled={busy} className="h-9 px-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-[12px] font-medium cursor-pointer disabled:opacity-50">Save</button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* SEO */}
      <section className="bg-card border border-border rounded-xl shadow-card p-5 space-y-4">
        <h3 className="text-[15px] font-semibold text-foreground flex items-center gap-2"><Search className="size-4 text-primary" /> SEO (cms_seo)</h3>
        {(ov?.seo.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-2">
            {ov!.seo.map((s) => (
              <button key={s.id} onClick={() => loadSeoRow(s)} className="px-2.5 py-1 rounded-full border border-border bg-background hover:bg-accent text-[11px] font-medium cursor-pointer">
                {s.scope === 'site_default' ? 'Site default' : s.pageSlug}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label className={labelCls}>Page Slug (blank = site default)</label><input type="text" value={seoSlug} onChange={(e) => setSeoSlug(e.target.value)} placeholder="home" className={inputCls} /></div>
          <div><label className={labelCls}>Canonical URL</label><input type="text" value={seoCanonical} onChange={(e) => setSeoCanonical(e.target.value)} placeholder="https://unsaid.com/" className={inputCls} /></div>
          <div><label className={labelCls}>Meta Title</label><input type="text" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} className={inputCls} /></div>
          <div><label className={labelCls}>OG Title</label><input type="text" value={seoOgTitle} onChange={(e) => setSeoOgTitle(e.target.value)} className={inputCls} /></div>
          <div className="md:col-span-2"><label className={labelCls}>Meta Description</label><textarea value={seoDesc} onChange={(e) => setSeoDesc(e.target.value)} rows={2} className="w-full bg-background border border-input rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-ring" /></div>
          <div className="md:col-span-2"><label className={labelCls}>OG Description</label><textarea value={seoOgDesc} onChange={(e) => setSeoOgDesc(e.target.value)} rows={2} className="w-full bg-background border border-input rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-ring" /></div>
        </div>
        <div className="flex justify-end">
          <button onClick={saveSeo} disabled={busy} className="h-9 px-4 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-[13px] font-medium cursor-pointer disabled:opacity-50">Save SEO</button>
        </div>
      </section>
    </div>
  );
};
