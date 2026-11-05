'use client';

/* Admin → Settings → Locations: real location management.
 * Replaces the mock INITIAL_LOCATIONS (Frisco TX) previously held in the zustand store.
 * Lists tenant_locations with tenant type badges (internal | franchise),
 * create / edit / delete, primary-location handling.
 */

import { useEffect, useMemo, useState } from 'react';

type LocationRow = {
  id: string;
  tenant_id: string;
  name: string;
  address: {
    line1?: string; line2?: string; city?: string; state?: string;
    postal_code?: string; phone?: string; email?: string;
  } | null;
  timezone: string;
  is_primary: boolean;
  is_active: boolean;
  created_at: string;
  tenant_name: string | null;
  tenant_slug: string | null;
  tenant_type: string;
  franchise_business_name: string | null;
  franchise_slug: string | null;
};

type TenantOpt = { id: string; name: string; slug: string; tenant_type: string };

const TYPE_BADGES: Record<string, string> = {
  internal: 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200',
  franchise: 'bg-brand-teal/10 text-brand-teal dark:bg-brand-teal/20 dark:text-brand-teal',
  master: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
};

const emptyForm = {
  tenant_id: '',
  name: '',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  postal_code: '',
  phone: '',
  email: '',
  timezone: 'America/Chicago',
  is_primary: false,
  is_active: true,
};

export default function LocationsPage() {
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [tenants, setTenants] = useState<TenantOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'internal' | 'franchise'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<LocationRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [locRes, tenRes] = await Promise.all([
        fetch('/api/admin/locations', { cache: 'no-store' }),
        fetch('/api/admin/tenants/switchable', { cache: 'no-store' }),
      ]);
      const locJson = await locRes.json().catch(() => ({}));
      const tenJson = await tenRes.json().catch(() => ({}));
      if (!locRes.ok) throw new Error(locJson?.error || 'Failed to load locations');
      setLocations(locJson.data || []);
      setTenants((tenJson.data || []).map((t: any) => ({
        id: t.id, name: t.name, slug: t.slug, tenant_type: t.tenant_type || 'internal',
      })));
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return locations.filter((l) => {
      if (typeFilter !== 'all' && l.tenant_type !== typeFilter && !(typeFilter === 'internal' && l.tenant_type === 'master')) return false;
      if (!q) return true;
      const hay = `${l.name} ${l.tenant_name || ''} ${l.franchise_business_name || ''} ${l.address?.city || ''} ${l.address?.state || ''}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    });
  }, [locations, q, typeFilter]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(loc: LocationRow) {
    setEditing(loc);
    setForm({
      tenant_id: loc.tenant_id,
      name: loc.name,
      address_line1: loc.address?.line1 || '',
      address_line2: loc.address?.line2 || '',
      city: loc.address?.city || '',
      state: loc.address?.state || '',
      postal_code: loc.address?.postal_code || '',
      phone: loc.address?.phone || '',
      email: loc.address?.email || '',
      timezone: loc.timezone || 'America/Chicago',
      is_primary: loc.is_primary,
      is_active: loc.is_active,
    });
    setModalOpen(true);
  }

  async function save() {
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError(null);
    try {
      const url = editing ? `/api/admin/locations/${editing.id}` : '/api/admin/locations';
      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, tenant_id: form.tenant_id || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Save failed');
      setModalOpen(false);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function remove(loc: LocationRow) {
    if (!confirm(`Delete location "${loc.name}"?`)) return;
    try {
      const res = await fetch(`/api/admin/locations/${loc.id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Delete failed');
      await load();
    } catch (e: any) {
      setError(e?.message || 'Delete failed');
    }
  }

  const set = (k: keyof typeof emptyForm, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const addr = (l: LocationRow) => {
    const a = l.address || {};
    return [a.line1, a.city && a.state ? `${a.city}, ${a.state} ${a.postal_code || ''}`.trim() : a.city].filter(Boolean).join(' — ');
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Locations</h1>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
        >
          + New Location
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg adm-badge adm-badge-red text-sm dark:bg-red-950 dark:text-red-200">{error}</div>
      )}

      <div className="flex gap-3 mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, tenant, city…"
          className="flex-1 max-w-sm px-3 py-2 rounded-lg border border-border bg-background text-sm"
        />
        <div className="flex gap-1 p-1 rounded-lg border border-border">
          {(['all', 'internal', 'franchise'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1 rounded-lg text-xs font-medium capitalize ${typeFilter === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-12 text-center">Loading locations…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground py-12 text-center border border-dashed border-border rounded-xl">
          No locations yet. Create the first one — or run franchise signup to onboard a franchise shop.
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead>
              <tr className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Tenant</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="font-medium flex items-center gap-2">
                      {l.name}
                      {l.is_primary && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded adm-badge adm-badge-amber dark:bg-amber-900 dark:text-amber-200 font-semibold">PRIMARY</span>
                      )}
                    </div>
                    {l.address?.phone && <div className="text-xs text-muted-foreground">{l.address.phone}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs">{l.tenant_name || <span className="text-muted-foreground">—</span>}</div>
                    {l.franchise_business_name && <div className="text-xs text-muted-foreground">{l.franchise_business_name}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium capitalize ${TYPE_BADGES[l.tenant_type] || TYPE_BADGES.internal}`}>
                      {l.tenant_type === 'master' ? 'internal' : l.tenant_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{addr(l) || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${l.is_active ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800'}`}>
                      {l.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => openEdit(l)} className="text-xs font-medium text-primary hover:underline mr-3">Edit</button>
                    <button onClick={() => remove(l)} className="text-xs font-medium text-red-600 hover:underline">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setModalOpen(false)}>
          <div className="bg-background border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">{editing ? 'Edit Location' : 'New Location'}</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Tenant (shop)</label>
                <select value={form.tenant_id} onChange={(e) => set('tenant_id', e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm">
                  <option value="">— Master tenant (UnSaid Memories) —</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.tenant_type})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Location name *</label>
                <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="UnSaid Memories — Main" className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Address line 1</label>
                  <input value={form.address_line1} onChange={(e) => set('address_line1', e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Address line 2</label>
                  <input value={form.address_line2} onChange={(e) => set('address_line2', e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">City</label>
                  <input value={form.city} onChange={(e) => set('city', e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">State</label>
                    <input value={form.state} onChange={(e) => set('state', e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">ZIP</label>
                    <input value={form.postal_code} onChange={(e) => set('postal_code', e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Phone</label>
                  <input value={form.phone} onChange={(e) => set('phone', e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Email</label>
                  <input value={form.email} onChange={(e) => set('email', e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm" />
                </div>
              </div>
              <div className="flex items-center gap-6 pt-1">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.is_primary} onChange={(e) => set('is_primary', e.target.checked)} className="rounded" />
                  Primary location
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} className="rounded" />
                  Active
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg border border-border text-sm">Cancel</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Location'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
