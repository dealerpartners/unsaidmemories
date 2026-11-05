'use client';

import { useEffect, useState, useCallback } from 'react';

// ============================================================================
// Admin → Brands
//
// Manages commerce_brands. List view shows logo thumbnail, name, slug,
// description, is_active toggle, sort_order, edit/delete actions. Form
// supports logo upload (via /api/admin/media) or a direct logo_url string.
// ============================================================================

type Brand = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  description: string | null;
  is_active: boolean;
  sort_order: number;
};

type FormState = {
  name: string;
  slug: string;
  logo_url: string;
  description: string;
  is_active: boolean;
  sort_order: number;
};

const EMPTY_FORM: FormState = {
  name: '',
  slug: '',
  logo_url: '',
  description: '',
  is_active: true,
  sort_order: 0,
};

export default function BrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editBrand, setEditBrand] = useState<Brand | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const loadBrands = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/brands', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        setBrands(Array.isArray(json.brands) ? json.brands : []);
      }
    } catch (e) {
      console.error('Failed to load brands', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBrands();
  }, [loadBrands]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  function openNew() {
    setEditBrand(null);
    setForm(EMPTY_FORM);
    setLogoFile(null);
    setShowForm(true);
  }

  function openEdit(b: Brand) {
    setEditBrand(b);
    setForm({
      name: b.name || '',
      slug: b.slug || '',
      logo_url: b.logo_url || '',
      description: b.description || '',
      is_active: b.is_active !== false,
      sort_order: Number(b.sort_order ?? 0),
    });
    setLogoFile(null);
    setShowForm(true);
  }

  async function uploadLogo(): Promise<string | null> {
    if (!logoFile) return null;
    const fd = new FormData();
    fd.append('file', logoFile);
    fd.append('path', 'brands');
    const res = await fetch('/api/admin/media', { method: 'POST', body: fd });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || res.statusText);
    }
    const json = await res.json();
    return json.url as string;
  }

  async function saveBrand() {
    if (!form.name.trim()) {
      flash('Name is required');
      return;
    }
    setBusy(true);
    try {
      let logoUrl = form.logo_url;
      if (logoFile) {
        const uploaded = await uploadLogo();
        if (uploaded) logoUrl = uploaded;
      }

      if (editBrand) {
        // PATCH — JSON body (slug is immutable on update; the API strips it).
        const res = await fetch(`/api/admin/brands/${editBrand.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            logo_url: logoUrl || null,
            description: form.description || null,
            is_active: form.is_active,
            sort_order: Number(form.sort_order ?? 0),
          }),
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          flash(`Save failed: ${e.error || res.statusText}`);
          return;
        }
        flash('Brand saved');
      } else {
        // POST — multipart if we have a new file, else JSON.
        let res: Response;
        if (logoFile) {
          const fd = new FormData();
          fd.append('name', form.name);
          fd.append('slug', form.slug);
          fd.append('description', form.description);
          fd.append('is_active', String(form.is_active));
          fd.append('sort_order', String(form.sort_order));
          fd.append('file', logoFile);
          res = await fetch('/api/admin/brands', { method: 'POST', body: fd });
        } else {
          res = await fetch('/api/admin/brands', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: form.name,
              slug: form.slug || undefined,
              logo_url: logoUrl || null,
              description: form.description || null,
              is_active: form.is_active,
              sort_order: Number(form.sort_order ?? 0),
            }),
          });
        }
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          flash(`Create failed: ${e.error || res.statusText}`);
          return;
        }
        flash('Brand created');
      }

      setShowForm(false);
      setEditBrand(null);
      setForm(EMPTY_FORM);
      setLogoFile(null);
      await loadBrands();
    } catch (e) {
      flash(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(b: Brand) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/brands/${b.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !b.is_active }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        flash(`Update failed: ${e.error || res.statusText}`);
        return;
      }
      setBrands((prev) =>
        prev.map((x) => (x.id === b.id ? { ...x, is_active: !x.is_active } : x)),
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteBrand(b: Brand) {
    if (!confirm(`Delete ${b.name}?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/brands/${b.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        flash(`Delete failed: ${e.error || res.statusText}`);
        return;
      }
      flash('Brand deleted');
      await loadBrands();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="">Loading brands...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Brands</h1>
        </div>
        <button
          onClick={openNew}
          className="px-4 py-2 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 rounded-lg text-sm font-semibold"
        >
          + Add Brand
        </button>
      </div>

      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-ink text-white px-4 py-2 rounded-lg shadow-lg text-sm">
          {toast}
        </div>
      )}

      <div className="border border-border rounded-lg overflow-hidden overflow-x-auto">
        <div className="adm-table-wrap"><table className="adm-table">
          <thead>
            <tr>
              <th className="p-3 text-left">Logo</th>
              <th className="p-3 text-left">Name</th>
              <th className="p-3 text-left">Slug</th>
              <th className="p-3 text-left">Description</th>
              <th className="p-3 text-left">Sort</th>
              <th className="p-3 text-left">Active</th>
              <th className="p-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {brands.map((b) => (
              <tr key={b.id} className="border-t border-border hover:bg-muted/50">
                <td className="p-3">
                  {b.logo_url ? (
                    <img
                      src={b.logo_url}
                      alt={b.name}
                      className="w-12 h-12 object-contain rounded bg-muted p-1"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">
                      —
                    </div>
                  )}
                </td>
                <td className="p-3 font-medium">{b.name}</td>
                <td className="p-3 text-muted-foreground">/{b.slug}</td>
                <td className="p-3 text-muted-foreground max-w-md truncate">
                  {b.description || '—'}
                </td>
                <td className="p-3">{b.sort_order ?? 0}</td>
                <td className="p-3">
                  <button
                    onClick={() => toggleActive(b)}
                    disabled={busy}
                    className={`px-2 py-1 rounded text-xs font-semibold ${ b.is_active ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground' }`}
                  >
                    {b.is_active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="p-3 flex gap-2">
                  <button
                    onClick={() => openEdit(b)}
                    disabled={busy}
                    className="text-brand-teal hover:underline text-xs"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteBrand(b)}
                    disabled={busy}
                    className="text-red-600 hover:underline text-xs"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {brands.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-muted-foreground">
                  No brands yet.
                </td>
              </tr>
            )}
          </tbody>
        </table></div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">{editBrand ? 'Edit Brand' : 'New Brand'}</h2>
              <button
                onClick={() => setShowForm(false)}
                className="text-muted-foreground"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold uppercase text-muted-foreground">Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-border rounded-lg p-2 mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-muted-foreground">Slug</label>
                <input
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  className="w-full border border-border rounded-lg p-2 mt-1"
                  placeholder="auto-generated"
                  disabled={!!editBrand}
                />
                {editBrand && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Slug is immutable after creation.
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold uppercase text-muted-foreground">Logo</label>
              {form.logo_url && (
                <img
                  src={form.logo_url}
                  alt=""
                  className="w-20 h-20 object-contain rounded mt-1 mb-2 bg-muted p-1"
                />
              )}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                className="w-full border border-border rounded-lg p-2 mt-1"
              />
              <input
                value={form.logo_url}
                onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
                className="w-full border border-border rounded-lg p-2 mt-1 text-xs"
                placeholder="…or paste a logo URL"
              />
            </div>

            <div>
              <label className="text-xs font-bold uppercase text-muted-foreground">
                Description
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                className="w-full border border-border rounded-lg p-2 mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold uppercase text-muted-foreground">
                  Sort Order
                </label>
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) =>
                    setForm({ ...form, sort_order: Number(e.target.value) })
                  }
                  className="w-full border border-border rounded-lg p-2 mt-1"
                />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  />
                  Active
                </label>
              </div>
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <button
                onClick={saveBrand}
                disabled={busy}
                className="px-6 py-2 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                {editBrand ? 'Save' : 'Create'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-6 py-2 border border-border rounded-lg text-sm font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
