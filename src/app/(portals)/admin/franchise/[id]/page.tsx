'use client';

// Franchise detail — one franchise in the Franchise Management Portal.
// Identity, domain, branding, and template save through
// PATCH /api/admin/franchise/[id] (master-only). Module entitlements
// save through the ONE grant writer, PUT /api/admin/users/permissions
// (scope-filtered, audited, mirrored into the platform grant store) —
// this page sends the owner's full current record back with the new
// module set, exactly as Settings → Users does.

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Store, ArrowLeft } from 'lucide-react';

type Detail = {
  tenant: any;
  owner: any | null;
  grants: Record<string, string>;
  locations: any[];
  agreement: any | null;
  staffCount: number;
  wordpress: any | null;
};

type PermModule = { code: string; label: string; group: string; scopes: string[] };
const LEVELS = ['none', 'read', 'write', 'all'] as const;

const inputCls = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px]';
const labelCls = 'block text-[11px] font-medium uppercase tracking-wide text-muted-foreground';

export default function FranchiseDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [data, setData] = useState<Detail | null>(null);
  const [templates, setTemplates] = useState<{ key: string; name: string }[]>([]);
  const [modules, setModules] = useState<PermModule[]>([]);
  const [permUser, setPermUser] = useState<any | null>(null);
  const [grants, setGrants] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');

  const [form, setForm] = useState<any>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/franchise/${id}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
      const d: Detail = j.data;
      setData(d);
      setForm({
        name: d.tenant.name || '',
        slug: d.tenant.slug || '',
        status: d.tenant.status || 'onboarding',
        customDomain: d.tenant.custom_domain || '',
        primaryDomain: d.tenant.primary_domain || '',
        templateKey: d.tenant.template_key || '',
        logoUrl: d.tenant.logo_url || '',
        logoDarkUrl: d.tenant.logo_dark_url || '',
        faviconUrl: d.tenant.favicon_url || '',
        primaryColor: d.tenant.primary_color || '',
        secondaryColor: d.tenant.secondary_color || '',
        accentColor: d.tenant.accent_color || '',
        brandFont: d.tenant.brand_font || '',
        supportEmail: d.tenant.support_email || '',
        supportPhone: d.tenant.support_phone || '',
        websiteUrl: d.tenant.website_url || '',
      });
      const tr = await fetch('/api/admin/website/templates');
      const tj = await tr.json().catch(() => ({}));
      if (tr.ok) setTemplates((tj.templates || []).map((t: any) => ({ key: t.key, name: t.name })));
      if (d.owner) {
        const pr = await fetch(`/api/admin/users/permissions?portalUserId=${d.owner.id}`);
        const pj = await pr.json().catch(() => ({}));
        if (pr.ok) {
          setModules((pj.modules || []).filter((m: PermModule) => m.scopes.includes('franchise')));
          setPermUser(pj.detail || null);
          setGrants(pj.detail?.modulePermissions || d.grants || {});
        }
      }
      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to load the franchise');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const flash = (msg: string) => { setNotice(msg); setError(''); };

  const saveTenant = async () => {
    setBusy('tenant');
    try {
      const r = await fetch(`/api/admin/franchise/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          slug: form.slug,
          status: form.status,
          customDomain: form.customDomain || null,
          primaryDomain: form.primaryDomain || null,
          templateKey: form.templateKey || null,
          brand: {
            logoUrl: form.logoUrl, logoDarkUrl: form.logoDarkUrl, faviconUrl: form.faviconUrl,
            primaryColor: form.primaryColor, secondaryColor: form.secondaryColor,
            accentColor: form.accentColor, brandFont: form.brandFont,
            supportEmail: form.supportEmail, supportPhone: form.supportPhone,
            websiteUrl: form.websiteUrl,
          },
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Save failed (${r.status})`);
      flash('Franchise saved.');
      await load();
    } catch (e: any) {
      setError(e.message || 'Save failed');
    } finally {
      setBusy('');
    }
  };

  const saveGrants = async () => {
    if (!data?.owner || !permUser) return;
    setBusy('grants');
    try {
      const modulePermissions: Record<string, string> = {};
      for (const m of modules) modulePermissions[m.code] = grants[m.code] || 'none';
      const r = await fetch('/api/admin/users/permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portalUserId: data.owner.id,
          userId: permUser.user_id || undefined,
          displayName: permUser.display_name,
          email: permUser.email,
          phone: permUser.phone,
          roleType: 'franchise_owner',
          tenantId: permUser.tenant_id,
          parentId: permUser.parent_id || undefined,
          isOwner: permUser.is_owner,
          isActive: permUser.is_active,
          modulePermissions,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Save failed (${r.status})`);
      flash('Module entitlements saved.');
      await load();
    } catch (e: any) {
      setError(e.message || 'Save failed');
    } finally {
      setBusy('');
    }
  };

  if (loading) return <div className=""><p className="text-[13px] text-muted-foreground">Loading franchise…</p></div>;
  if (error && !data) throw new Error(error);
  if (!data) return null;
  const t = data.tenant;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/franchise" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> All franchises
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
          <Store className="size-6" /> {t.name}
        </h1>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</div>}
      {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-700">{notice}</div>}

      <section className="rounded-xl border border-border bg-card space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Identity, domain &amp; branding</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div><label className={labelCls}>Name</label><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className={labelCls}>Slug</label><input className={inputCls} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></div>
          <div>
            <label className={labelCls}>Status</label>
            <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="onboarding">Onboarding</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div><label className={labelCls}>Custom domain</label><input className={inputCls} placeholder="shop.example.com" value={form.customDomain} onChange={(e) => setForm({ ...form, customDomain: e.target.value })} /></div>
          <div><label className={labelCls}>Primary domain</label><input className={inputCls} placeholder="example.com" value={form.primaryDomain} onChange={(e) => setForm({ ...form, primaryDomain: e.target.value })} /></div>
          <div>
            <label className={labelCls}>Website template</label>
            <select className={inputCls} value={form.templateKey} onChange={(e) => setForm({ ...form, templateKey: e.target.value })}>
              <option value="">House (default)</option>
              {templates.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
            </select>
          </div>
          <div><label className={labelCls}>Primary color</label><input className={inputCls} placeholder="#F2C500" value={form.primaryColor} onChange={(e) => setForm({ ...form, primaryColor: e.target.value })} /></div>
          <div><label className={labelCls}>Secondary color</label><input className={inputCls} value={form.secondaryColor} onChange={(e) => setForm({ ...form, secondaryColor: e.target.value })} /></div>
          <div><label className={labelCls}>Accent color</label><input className={inputCls} value={form.accentColor} onChange={(e) => setForm({ ...form, accentColor: e.target.value })} /></div>
          <div><label className={labelCls}>Logo URL</label><input className={inputCls} value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} /></div>
          <div><label className={labelCls}>Brand font</label><input className={inputCls} value={form.brandFont} onChange={(e) => setForm({ ...form, brandFont: e.target.value })} /></div>
          <div><label className={labelCls}>Support email</label><input className={inputCls} value={form.supportEmail} onChange={(e) => setForm({ ...form, supportEmail: e.target.value })} /></div>
          <div><label className={labelCls}>Support phone</label><input className={inputCls} value={form.supportPhone} onChange={(e) => setForm({ ...form, supportPhone: e.target.value })} /></div>
        </div>
        <button type="button" disabled={busy === 'tenant'} onClick={saveTenant}
          className="rounded-lg bg-primary px-3 py-2 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {busy === 'tenant' ? 'Saving…' : 'Save franchise'}
        </button>
      </section>

      <section className="rounded-xl border border-border bg-card space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Owner</h2>
        {data.owner ? (
          <div className="text-[13px] text-muted-foreground space-y-1">
            <p><span className="text-foreground font-medium">{data.owner.display_name || '—'}</span> · {data.owner.email || '—'}{data.owner.phone ? ` · ${data.owner.phone}` : ''}</p>
            <p>
              {data.owner.is_active ? 'Active' : 'Inactive'} ·{' '}
              {data.owner.auth_linked
                ? 'Sign-in linked — the owner reaches this tenant’s admin panel with their account.'
                : 'Sign-in NOT linked yet — the owner’s row was provisioned by email; it links automatically the first time they sign in with that email.'}
            </p>
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">No franchise owner is recorded for this tenant.</p>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Website</h2>
        <div className="text-[13px] text-muted-foreground space-y-1">
          <p>
            Mode: <span className="text-foreground font-medium">{t.website_mode === 'wordpress' ? 'WordPress' : 'Platform template'}</span>
            {t.website_mode !== 'wordpress' && (
              <> · template <span className="text-foreground">{form.templateKey || 'House (default)'}</span> (change above and save)</>
            )}
          </p>
          {data.wordpress ? (
            <p>
              WordPress: <span className="text-foreground">{data.wordpress.site_name || data.wordpress.site_url}</span>
              {' '}· {data.wordpress.site_url} · status {data.wordpress.status}
              {data.wordpress.wp_user_name ? ` · connected as ${data.wordpress.wp_user_name}` : ''}
              {data.wordpress.last_verified_at ? ` · last verified ${new Date(data.wordpress.last_verified_at).toLocaleString()}` : ''}
              {data.wordpress.last_error ? ` · last error: ${data.wordpress.last_error}` : ''}
            </p>
          ) : (
            <p>No WordPress connection. The owner can connect one from their My Website page — a franchise site is its template or its WordPress; the marketplace is never part of the offering.</p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Module entitlements</h2>
          <p className="text-[12px] text-muted-foreground mt-1">
            What this franchise&rsquo;s owner holds in their tenant panel. Saving replaces the set and
            mirrors it into the platform grant store the panels enforce.
            <span className="text-foreground"> Manage Website</span> is not a grant — it comes with the
            tenant (the owner manages their own site from My Website).
            <span className="text-foreground"> AI Tools</span> are master-only by platform rule and can
            never be granted to a franchise tenant. The marketplace is not part of a franchise
            offering at any level.
          </p>
        </div>
        {modules.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">The entitlement editor is unavailable for this owner right now.</p>
        ) : (
          <>
            <div className="grid gap-x-6 gap-y-2 md:grid-cols-2">
              {modules.map((m) => (
                <div key={m.code} className="flex items-center justify-between gap-3">
                  <span className="text-[13px] text-foreground">{m.label}</span>
                  <select
                    className="rounded-lg border border-border bg-background px-2 py-1.5 text-[13px]"
                    value={grants[m.code] || 'none'}
                    onChange={(e) => setGrants({ ...grants, [m.code]: e.target.value })}
                  >
                    {LEVELS.map((l) => <option key={l} value={l}>{l === 'none' ? 'None' : l[0].toUpperCase() + l.slice(1)}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <button type="button" disabled={busy === 'grants'} onClick={saveGrants}
              className="rounded-lg bg-primary px-3 py-2 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {busy === 'grants' ? 'Saving…' : 'Save entitlements'}
            </button>
          </>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Locations ({data.locations.length})</h2>
        {data.locations.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No locations recorded.</p>
        ) : (
          <ul className="space-y-1.5 text-[13px] text-muted-foreground">
            {data.locations.map((l: any) => (
              <li key={l.id}>
                <span className="text-foreground">{l.location_name}</span>
                {l.city || l.state ? ` — ${[l.city, l.state].filter(Boolean).join(', ')}` : ''}
                {l.wordpress_url ? ` · WordPress: ${l.wordpress_url}` : ''}
                {l.status ? ` · ${l.status}` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
