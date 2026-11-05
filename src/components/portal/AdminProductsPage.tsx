'use client';

import { useEffect, useState, useCallback } from 'react';
import { PromotionDealForm } from '@/components/portal/PromotionDealForm';

// ============================================================================
// Admin → Products
//
// Refactored to use the admin-gated REST endpoints in /api/admin/products
// (no direct browser Supabase calls — the anon key is never touched).
// Auto-revalidates the storefront server-side after every save/delete.
//
// Adds: brand selector, sale_price, visible toggle, category_id, stock.
// ============================================================================

type Brand = { id: string; name: string; slug: string };

type Product = {
  id: string;
  name: string;
  slug: string;
  description: string;
  short_description: string | null;
  base_price: string;
  sale_price: string | null;
  compare_at_price: string | null;
  image: string | null;
  alt: string | null;
  badge: string | null;
  category: string | null;
  category_id: number | null;
  brand_id: string | null;
  brand_name: string | null;
  brand_slug: string | null;
  featured: boolean;
  is_hidden: boolean;
  visible: boolean;
  inventory_count: number;
  stock: number | null;
  specs: string | null;
  materials: string | null;
  ingredients: string | null;
  directions: string | null;
  warranty: string | null;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  sort_order: number;
  cjPid?: string | null;
};

type Category = {
  // taxonomy_nodes ids (BL-13: /api/admin/categories serves the one
  // category store now — uuid ids, not the retired pet tree's numbers).
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
};

type TaxNode = { id: string; name: string; slug: string; path: string };

type FilterSection = {
  query_param: string;
  display_name: string;
  sort_order: number;
  value_source: string;
  display_type: string;
  is_required: boolean;
  allow_new_values: boolean;
  selectable: boolean;
  allowed_values: { value: string; slug: string }[];
  inherited: boolean;
  defined_on_node_id: string | null;
};

type FilterExtras = {
  filters: Record<string, string[]>;
  manufacturer: string;
  country_of_origin: string;
  supplier_name: string;
  supplier_sku: string;
  supplier_reorder_url: string;
};

export default function ProductsPage({
  initialShowForm = false,
}: { initialShowForm?: boolean } = {}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Product | null>(null);
  const [dealProduct, setDealProduct] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(initialShowForm);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<'all' | 'dropship' | 'instore'>('all');
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ all: 0, dropship: 0, instore: 0 });

  const isDropship = (p: Product) => !!p.cjPid;
  // The server filters by source and returns one page; the list below is
  // exactly that page (no client-side slicing of an 11k-row payload).
  const filteredProducts = products;
  const dropshipCount = counts.dropship;
  const instoreCount = counts.instore;

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/products?page=${page}&limit=${PAGE_SIZE}&source=${sourceFilter}`,
        { cache: 'no-store' },
      );
      if (res.ok) {
        const json = await res.json();
        setProducts(Array.isArray(json.products) ? json.products : []);
        setTotal(typeof json.total === 'number' ? json.total : 0);
        if (json.counts) setCounts(json.counts);
      }
    } catch (e) {
      console.error('Failed to load products', e);
    } finally {
      setLoading(false);
    }
  }, [page, sourceFilter]);

  const loadBrands = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/brands', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        setBrands(Array.isArray(json.brands) ? json.brands : []);
      }
    } catch (e) {
      console.error('Failed to load brands', e);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/categories', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        setCategories(Array.isArray(json.categories) ? json.categories : []);
      }
    } catch (e) {
      console.error('Failed to load categories', e);
    }
  }, []);

  useEffect(() => {
    loadProducts();
    loadBrands();
    loadCategories();
  }, [loadProducts, loadBrands, loadCategories]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function patchProduct(p: Product, patch: Partial<Product>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/products/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        flash(`Update failed: ${e.error || res.statusText}`);
        return;
      }
      setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...patch } : x)));
    } finally {
      setBusy(false);
    }
  }

  async function toggleHidden(p: Product) {
    await patchProduct(p, { is_hidden: !p.is_hidden });
  }

  async function toggleVisible(p: Product) {
    await patchProduct(p, { visible: !p.visible });
  }

  async function toggleFeatured(p: Product) {
    await patchProduct(p, { featured: !p.featured });
  }

  async function deleteProduct(p: Product) {
    if (!confirm(`Delete ${p.name}?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/products/${p.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        flash(`Delete failed: ${e.error || res.statusText}`);
        return;
      }
      setProducts((prev) => prev.filter((x) => x.id !== p.id));
      setTotal((t) => Math.max(0, t - 1));
      flash('Product deleted');
    } finally {
      setBusy(false);
    }
  }

  async function saveProduct(data: Partial<Product>, imageFile: File | null, extras?: FilterExtras) {
    setBusy(true);
    try {
      let imageUrl = data.image ?? null;
      if (imageFile) {
        const fd = new FormData();
        fd.append('file', imageFile);
        const upRes = await fetch('/api/admin/products?upload=image', { method: 'POST', body: fd });
        if (!upRes.ok) {
          const e = await upRes.json().catch(() => ({}));
          flash(`Image upload failed: ${e.error || upRes.statusText}`);
          return;
        }
        const upJson = await upRes.json();
        imageUrl = upJson.url;
      }

      const payload: Partial<Product> = { ...data, image: imageUrl };
      delete (payload as any).brand_name;
      delete (payload as any).brand_slug;
      delete (payload as any).id;
      delete (payload as any).created_at;

      let savedId: string | null = editing?.id ?? null;
      if (editing) {
        const res = await fetch(`/api/admin/products/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          flash(`Save failed: ${e.error || res.statusText}`);
          return;
        }
        flash('Product saved');
      } else {
        const res = await fetch('/api/admin/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          flash(`Create failed: ${e.error || res.statusText}`);
          return;
        }
        const json = await res.json().catch(() => ({}));
        savedId = json?.product?.id ?? null;
        flash('Product created');
      }

      // --- Filters & manufacturing: separate POST after the product saves ----
      if (savedId && extras) {
        try {
          const fRes = await fetch(
            `/api/admin/products/${encodeURIComponent(savedId)}/filters`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                filters: extras.filters || {},
                manufacturer: extras.manufacturer || '',
                country_of_origin: extras.country_of_origin || '',
                supplier_name: extras.supplier_name || '',
                supplier_sku: extras.supplier_sku || '',
                supplier_reorder_url: extras.supplier_reorder_url || '',
              }),
            }
          );
          if (!fRes.ok) {
            const e = await fRes.json().catch(() => ({}));
            flash(`Product saved, but filters failed: ${e.error || fRes.statusText}`);
          }
        } catch (e) {
          flash(`Product saved, but filters failed: ${e instanceof Error ? e.message : 'network error'}`);
        }
      }

      setShowForm(false);
      setEditing(null);
      await loadProducts();
    } finally {
      setBusy(false);
    }
  }

  if (loading && products.length === 0) return <div className="p-6">Loading products...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {products.length} products · {brands.length} brands · {categories.length} categories
          </p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="px-4 py-2 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 rounded-lg text-sm font-semibold"
        >
          + Add Product
        </button>
      </div>

      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-ink text-white px-4 py-2 rounded-lg shadow-lg text-sm">
          {toast}
        </div>
      )}

      <div className="flex items-center gap-1 border border-border rounded-lg p-1 bg-card w-fit">
        {(
          [
            { id: 'all', label: `All (${counts.all})` },
            { id: 'dropship', label: `Dropship (${dropshipCount})` },
            { id: 'instore', label: `In-Store (${instoreCount})` },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            onClick={() => {
              setSourceFilter(f.id);
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium cursor-pointer ${
              sourceFilter === f.id ? 'bg-brand-teal/10 text-brand-teal' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="border border-border rounded-lg overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-3 text-left">Image</th>
              <th className="p-3 text-left">Name</th>
              <th className="p-3 text-left">Brand</th>
              <th className="p-3 text-left">Source</th>
              <th className="p-3 text-left">Price</th>
              <th className="p-3 text-left">Stock</th>
              <th className="p-3 text-left">Category</th>
              <th className="p-3 text-left">Visible</th>
              <th className="p-3 text-left">Featured</th>
              <th className="p-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((p) => (
              <tr key={p.id} className="border-t border-border hover:bg-muted/50">
                <td className="p-3">
                  {p.image ? (
                    <img
                      src={p.image}
                      alt={p.alt || p.name}
                      className="w-12 h-12 object-cover rounded"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-muted rounded" />
                  )}
                </td>
                <td className="p-3 font-medium">{p.name}</td>
                <td className="p-3 text-muted-foreground">{p.brand_name || '—'}</td>
                <td className="p-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      isDropship(p)
                        ? 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300'
                        : 'bg-brand-teal/10 text-brand-teal dark:bg-brand-teal/20 dark:text-brand-teal'
                    }`}
                  >
                    {isDropship(p) ? 'Dropship' : 'In-Store'}
                  </span>
                </td>
                <td className="p-3">
                  {p.sale_price || p.base_price}
                  {p.compare_at_price ? (
                    <span className="text-muted-foreground line-through ml-1">
                      {p.compare_at_price}
                    </span>
                  ) : null}
                </td>
                <td className="p-3">{p.stock ?? p.inventory_count ?? 0}</td>
                <td className="p-3">{p.category || '—'}</td>
                <td className="p-3">
                  <button
                    onClick={() => toggleVisible(p)}
                    disabled={busy}
                    className={`px-2 py-1 rounded text-xs font-semibold ${
                      p.visible
                        ? 'bg-green-100 text-green-700'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {p.visible ? 'Visible' : 'Hidden'}
                  </button>
                </td>
                <td className="p-3">
                  <button
                    onClick={() => toggleFeatured(p)}
                    disabled={busy}
                    className={`px-2 py-1 rounded text-xs ${
                      p.featured ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {p.featured ? '★' : '☆'}
                  </button>
                </td>
                <td className="p-3 flex gap-2">
                  <button
                    onClick={() => {
                      setEditing(p);
                      setShowForm(true);
                    }}
                    className="text-brand-teal hover:underline text-xs"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDealProduct(p)}
                    className="text-foreground hover:underline text-xs font-semibold"
                  >
                    Deal
                  </button>
                  <button
                    onClick={() => deleteProduct(p)}
                    disabled={busy}
                    className="text-red-600 hover:underline text-xs"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {filteredProducts.length === 0 && (
              <tr>
                <td colSpan={10} className="p-6 text-center text-muted-foreground">
                  {sourceFilter === 'all'
                    ? 'No products yet. Click “+ Add Product” to create your first.'
                    : `No ${sourceFilter === 'dropship' ? 'dropship' : 'in-store'} products found.`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-3 text-sm">
        <span className="text-muted-foreground">
          {total === 0
            ? 'No products'
            : `Showing ${(page - 1) * PAGE_SIZE + 1}–${(page - 1) * PAGE_SIZE + products.length} of ${total}`}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            className="px-3 py-1.5 rounded-lg border border-border text-[12px] font-medium disabled:opacity-40 cursor-pointer"
          >
            ← Prev
          </button>
          <span className="text-[12px] text-muted-foreground">
            Page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={loading || page >= Math.ceil(total / PAGE_SIZE)}
            className="px-3 py-1.5 rounded-lg border border-border text-[12px] font-medium disabled:opacity-40 cursor-pointer"
          >
            Next →
          </button>
        </div>
      </div>

      {showForm && (
        <ProductForm
          product={editing}
          brands={brands}
          categories={categories}
          onSave={saveProduct}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
        />
      )}

      {/* Deal generator — pre-scoped to this product (same generator as
          the catalog workflow, Settings, and /admin/promotions). */}
      {dealProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Create a Deal</h2>
              <button onClick={() => setDealProduct(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <PromotionDealForm
              heading={`Scoped to: ${dealProduct.name}`}
              presetTargets={[{ kind: 'product', id: String(dealProduct.id), label: dealProduct.name }]}
              onCreated={() => flash('Deal published')}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ProductForm({
  product,
  brands,
  categories,
  onSave,
  onClose,
}: {
  product: Product | null;
  brands: Brand[];
  categories: Category[];
  onSave: (data: any, imageFile: File | null, extras?: FilterExtras) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: product?.name || '',
    slug: product?.slug || '',
    description: product?.description || '',
    short_description: product?.short_description || '',
    base_price: product?.base_price || '$0.00',
    sale_price: product?.sale_price || '',
    compare_at_price: product?.compare_at_price || '',
    badge: product?.badge || '',
    category: product?.category || '',
    category_id: product?.category_id ?? '',
    brand_id: product?.brand_id || '',
    inventory_count: product?.inventory_count ?? 0,
    stock: product?.stock ?? '',
    specs: product?.specs || '',
    materials: product?.materials || '',
    ingredients: product?.ingredients || '',
    directions: product?.directions || '',
    warranty: product?.warranty || '',
    stripe_product_id: product?.stripe_product_id || '',
    stripe_price_id: product?.stripe_price_id || '',
    sort_order: product?.sort_order ?? 0,
    featured: product?.featured ?? false,
    is_hidden: product?.is_hidden ?? false,
    visible: product?.visible ?? true,
    manufacturer: '',
    country_of_origin: '',
    supplier_name: '',
    supplier_sku: '',
    supplier_reorder_url: '',
  });
  const [imageFile, setImageFile] = useState<File | null>(null);

  // --- Product tags ----------------------------------------------------------
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [tagsLoading, setTagsLoading] = useState(false);

  const loadTags = useCallback(async () => {
    if (!product?.id) { setTags([]); return; }
    setTagsLoading(true);
    try {
      const res = await fetch(`/api/admin/products/${encodeURIComponent(product.id)}/tags`, { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        setTags((json.tags || []).map((t: any) => t.tag));
      }
    } catch { /* leave empty on error */ }
    finally { setTagsLoading(false); }
  }, [product?.id]);

  const addTag = useCallback(async () => {
    const t = tagInput.trim().toLowerCase();
    if (!t || !product?.id || tags.includes(t)) return;
    setTagInput('');
    try {
      const res = await fetch(`/api/admin/products/${encodeURIComponent(product.id)}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: t }),
      });
      if (res.ok) setTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
    } catch { /* ignore */ }
  }, [tagInput, product?.id, tags]);

  const removeTag = useCallback(async (t: string) => {
    if (!product?.id) return;
    setTags((prev) => prev.filter((x) => x !== t));
    try {
      await fetch(`/api/admin/products/${encodeURIComponent(product.id)}/tags?tag=${encodeURIComponent(t)}`, {
        method: 'DELETE',
      });
    } catch { /* ignore */ }
  }, [product?.id]);

  useEffect(() => { loadTags(); }, [loadTags]);

  // --- Filters & Facets ------------------------------------------------------
  const [filterNodes, setFilterNodes] = useState<TaxNode[]>([]);
  const [filterNodeId, setFilterNodeId] = useState('');
  const [filterSections, setFilterSections] = useState<FilterSection[]>([]);
  const [filterSelections, setFilterSelections] = useState<Record<string, string[]>>({});
  const [filtersLoading, setFiltersLoading] = useState(false);
  const [filtersError, setFiltersError] = useState<string | null>(null);
  const [nodesLoading, setNodesLoading] = useState(true);

  const loadFiltersForNode = useCallback(
    async (nodeId: string, prodId?: string) => {
      setFiltersLoading(true);
      setFiltersError(null);
      try {
        const qs = new URLSearchParams({ node_id: nodeId });
        if (prodId) qs.set('product_id', prodId);
        const res = await fetch(`/api/admin/products/filters?${qs.toString()}`, {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setFilterSections(json.filters || []);
        if (json.selections) setFilterSelections(json.selections);
        if (json.manufacturing) {
          setForm((f) => ({
            ...f,
            manufacturer: json.manufacturing.manufacturer || f.manufacturer,
            country_of_origin: json.manufacturing.country_of_origin || f.country_of_origin,
            supplier_name: json.supplier?.supplier_name || f.supplier_name,
            supplier_sku: json.supplier?.supplier_sku || f.supplier_sku,
            supplier_reorder_url: json.supplier?.supplier_reorder_url || f.supplier_reorder_url,
          }));
        }
      } catch (e) {
        setFiltersError(e instanceof Error ? e.message : 'Failed to load filters');
        setFilterSections([]);
      } finally {
        setFiltersLoading(false);
      }
    },
    []
  );

  // Mount: load node picker options; in edit mode also resolve the product's
  // own node + existing selections + manufacturing.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (product?.id) {
          const res = await fetch(
            `/api/admin/products/filters?product_id=${encodeURIComponent(product.id)}`,
            { cache: 'no-store' }
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = await res.json();
          if (cancelled) return;
          if (json.node_id) {
            setFilterNodeId(json.node_id);
            setFilterSections(json.filters || []);
            setFilterSelections(json.selections || {});
            if (json.manufacturing) {
              setForm((f) => ({
                ...f,
                manufacturer: json.manufacturing.manufacturer || '',
                country_of_origin: json.manufacturing.country_of_origin || '',
                supplier_name: json.supplier?.supplier_name || '',
                supplier_sku: json.supplier?.supplier_sku || '',
                supplier_reorder_url: json.supplier?.supplier_reorder_url || '',
              }));
            }
          }
        }
        const nRes = await fetch('/api/admin/products/filters', { cache: 'no-store' });
        if (cancelled) return;
        if (nRes.ok) {
          const nJson = await nRes.json();
          setFilterNodes(nJson.nodes || []);
        }
      } catch (e) {
        if (!cancelled) setFiltersError(e instanceof Error ? e.message : 'Failed to load filters');
      } finally {
        if (!cancelled) setNodesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [product?.id]);

  const handleNodeChange = (nodeId: string) => {
    setFilterNodeId(nodeId);
    setFilterSelections({});
    if (nodeId) {
      loadFiltersForNode(nodeId, product?.id || undefined);
    } else {
      setFilterSections([]);
    }
  };

  const toggleFilterValue = (queryParam: string, slug: string) => {
    setFilterSelections((prev) => {
      const current = prev[queryParam] || [];
      const next = current.includes(slug)
        ? current.filter((s) => s !== slug)
        : [...current, slug];
      return { ...prev, [queryParam]: next };
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">{product ? 'Edit Product' : 'New Product'}</h2>
          <button onClick={onClose} className="text-muted-foreground">
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
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-bold uppercase text-muted-foreground">
            Short Description
          </label>
          <input
            value={form.short_description}
            onChange={(e) => setForm({ ...form, short_description: e.target.value })}
            className="w-full border border-border rounded-lg p-2 mt-1"
          />
        </div>

        <div>
          <label className="text-xs font-bold uppercase text-muted-foreground">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            className="w-full border border-border rounded-lg p-2 mt-1"
          />
        </div>

        {/* ------------------------- Product Tags ------------------------- */}
        {product?.id && (
          <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/30">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Product Tags</h3>
              <span className="text-xs text-muted-foreground">Used for search and merchandising</span>
            </div>
            {tagsLoading ? (
              <p className="text-sm text-muted-foreground">Loading tags…</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-full bg-brand-teal/10 text-brand-teal px-2.5 py-1 text-xs font-medium"
                  >
                    {t}
                    <button
                      type="button"
                      onClick={() => removeTag(t)}
                      className="ml-1 hover:text-red-600 cursor-pointer"
                      aria-label={`Remove tag ${t}`}
                    >
                      ✕
                    </button>
                  </span>
                ))}
                {tags.length === 0 && (
                  <p className="text-sm text-muted-foreground">No tags yet.</p>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                placeholder="Add a tag…"
                className="flex-1 border border-border rounded-lg p-2 bg-white"
              />
              <button
                type="button"
                onClick={addTag}
                className="px-4 py-2 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 rounded-lg text-sm font-semibold cursor-pointer"
              >
                Add
              </button>
            </div>
          </div>
        )}

        {/* ------------------------- Filters & Facets ------------------------- */}
        <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/30">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">Filters & Facets</h3>
            <span className="text-xs text-muted-foreground">
              Appear as shop filters for this category
            </span>
          </div>

          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground">
              Taxonomy Category
            </label>
            <select
              value={filterNodeId}
              onChange={(e) => handleNodeChange(e.target.value)}
              className="w-full border border-border rounded-lg p-2 mt-1 bg-white"
              disabled={nodesLoading}
            >
              <option value="">— Select a category —</option>
              {filterNodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.path}
                </option>
              ))}
            </select>
          </div>

          {!filterNodeId && !filtersLoading && (
            <p className="text-sm text-muted-foreground">
              Select a category to see applicable filters.
            </p>
          )}

          {filtersLoading && (
            <p className="text-sm text-muted-foreground">Loading filters…</p>
          )}

          {filtersError && (
            <p className="text-sm text-red-600">Couldn&apos;t load filters: {filtersError}</p>
          )}

          {!filtersLoading && !filtersError && filterNodeId && filterSections.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No filters defined for this category.
            </p>
          )}

          {filterSections
            .filter((s) => s.selectable)
            .map((section) => (
              <div key={section.query_param}>
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-bold uppercase text-muted-foreground">
                    {section.display_name}
                  </span>
                  {section.is_required && (
                    <span className="text-xs text-red-600 font-semibold">required</span>
                  )}
                </div>
                {section.allowed_values.length === 0 ? (
                  <p className="text-xs text-muted-foreground mt-1">
                    No values defined for this filter yet.
                  </p>
                ) : (
                  <div
                    className="flex flex-wrap gap-2 mt-1"
                    role="group"
                    aria-label={section.display_name}
                  >
                    {section.allowed_values.map((v) => {
                      const active = (filterSelections[section.query_param] || []).includes(
                        v.slug
                      );
                      return (
                        <button
                          key={v.slug}
                          type="button"
                          aria-pressed={active}
                          onClick={() => toggleFilterValue(section.query_param, v.slug)}
                          className={`px-3 py-1.5 rounded-full text-sm border transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-black ${
                            active
                              ? 'bg-brand-teal/10 text-brand-teal border-brand-teal/40 font-semibold'
                              : 'bg-white text-foreground border-border hover:border-black'
                          }`}
                        >
                          {v.value}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
        </div>

        {/* ------------------------- Manufacturing ------------------------- */}
        <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/30">
          <h3 className="text-sm font-bold">Manufacturing</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold uppercase text-muted-foreground">
                Manufacturer
              </label>
              <input
                value={form.manufacturer}
                onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
                className="w-full border border-border rounded-lg p-2 mt-1 bg-white"
                placeholder="Real manufacturer (not supplier)"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-muted-foreground">
                Country of Origin
              </label>
              <input
                value={form.country_of_origin}
                onChange={(e) => setForm({ ...form, country_of_origin: e.target.value })}
                className="w-full border border-border rounded-lg p-2 mt-1 bg-white"
                placeholder="USA"
              />
            </div>
          </div>
        </div>

        {/* ------------------------- Supplier (Internal Only) ------------------------- */}
        <div className="border border-amber-200 rounded-lg p-4 space-y-3 bg-amber-50/50">
          <h3 className="text-sm font-bold flex items-center gap-2">
            Supplier
            <span className="text-[10px] font-bold uppercase bg-amber-200 text-amber-800 px-2 py-0.5 rounded">
              Internal only — never public
            </span>
          </h3>
          <p className="text-xs text-muted-foreground">
            Where this product comes from and how to reorder. Never shown on the storefront or in search.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold uppercase text-muted-foreground">
                Supplier Name
              </label>
              <input
                value={form.supplier_name}
                onChange={(e) => setForm({ ...form, supplier_name: e.target.value })}
                className="w-full border border-border rounded-lg p-2 mt-1 bg-white"
                placeholder="CJ Dropshipping"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-muted-foreground">
                Supplier SKU / Product ID
              </label>
              <input
                value={form.supplier_sku}
                onChange={(e) => setForm({ ...form, supplier_sku: e.target.value })}
                className="w-full border border-border rounded-lg p-2 mt-1 bg-white"
                placeholder="CJ-12345"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground">
              Reorder URL
            </label>
            <input
              value={form.supplier_reorder_url}
              onChange={(e) => setForm({ ...form, supplier_reorder_url: e.target.value })}
              className="w-full border border-border rounded-lg p-2 mt-1 bg-white"
              placeholder="https://…"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground">
              Base Price
            </label>
            <input
              value={form.base_price}
              onChange={(e) => setForm({ ...form, base_price: e.target.value })}
              className="w-full border border-border rounded-lg p-2 mt-1"
              placeholder="$26.00"
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground">
              Sale Price
            </label>
            <input
              value={form.sale_price}
              onChange={(e) => setForm({ ...form, sale_price: e.target.value })}
              className="w-full border border-border rounded-lg p-2 mt-1"
              placeholder="$22.00"
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground">
              Compare At
            </label>
            <input
              value={form.compare_at_price}
              onChange={(e) => setForm({ ...form, compare_at_price: e.target.value })}
              className="w-full border border-border rounded-lg p-2 mt-1"
              placeholder="$32.00"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground">Brand</label>
            <select
              value={form.brand_id}
              onChange={(e) => setForm({ ...form, brand_id: e.target.value })}
              className="w-full border border-border rounded-lg p-2 mt-1 bg-white"
            >
              <option value="">— No brand —</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground">Category</label>
            <input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full border border-border rounded-lg p-2 mt-1"
              placeholder="Category / …"
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground">
              Category (link)
            </label>
            <select
              value={form.category_id}
              onChange={(e) =>
                setForm({ ...form, category_id: e.target.value })
              }
              className="w-full border border-border rounded-lg p-2 mt-1 bg-white"
            >
              <option value="">— None —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground">Badge</label>
            <input
              value={form.badge}
              onChange={(e) => setForm({ ...form, badge: e.target.value })}
              className="w-full border border-border rounded-lg p-2 mt-1"
              placeholder="New / Sale"
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground">
              Inventory Count
            </label>
            <input
              type="number"
              value={form.inventory_count}
              onChange={(e) =>
                setForm({ ...form, inventory_count: Number(e.target.value) })
              }
              className="w-full border border-border rounded-lg p-2 mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground">Stock</label>
            <input
              type="number"
              value={form.stock}
              onChange={(e) =>
                setForm({ ...form, stock: e.target.value ? Number(e.target.value) : '' })
              }
              className="w-full border border-border rounded-lg p-2 mt-1"
              placeholder="optional"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-bold uppercase text-muted-foreground">Image</label>
          {product?.image && (
            <img
              src={product.image}
              alt=""
              className="w-20 h-20 object-cover rounded mt-1 mb-2"
            />
          )}
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setImageFile(e.target.files?.[0] || null)}
            className="w-full border border-border rounded-lg p-2 mt-1"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground">Specs</label>
            <textarea
              value={form.specs}
              onChange={(e) => setForm({ ...form, specs: e.target.value })}
              rows={2}
              className="w-full border border-border rounded-lg p-2 mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground">Materials</label>
            <textarea
              value={form.materials}
              onChange={(e) => setForm({ ...form, materials: e.target.value })}
              rows={2}
              className="w-full border border-border rounded-lg p-2 mt-1"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground">
              Ingredients
            </label>
            <textarea
              value={form.ingredients}
              onChange={(e) => setForm({ ...form, ingredients: e.target.value })}
              rows={2}
              className="w-full border border-border rounded-lg p-2 mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground">Directions</label>
            <textarea
              value={form.directions}
              onChange={(e) => setForm({ ...form, directions: e.target.value })}
              rows={2}
              className="w-full border border-border rounded-lg p-2 mt-1"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground">Warranty</label>
            <input
              value={form.warranty}
              onChange={(e) => setForm({ ...form, warranty: e.target.value })}
              className="w-full border border-border rounded-lg p-2 mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground">
              Stripe Product ID
            </label>
            <input
              value={form.stripe_product_id}
              onChange={(e) => setForm({ ...form, stripe_product_id: e.target.value })}
              className="w-full border border-border rounded-lg p-2 mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground">
              Stripe Price ID
            </label>
            <input
              value={form.stripe_price_id}
              onChange={(e) => setForm({ ...form, stripe_price_id: e.target.value })}
              className="w-full border border-border rounded-lg p-2 mt-1"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground">Sort Order</label>
            <input
              type="number"
              value={form.sort_order}
              onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
              className="w-full border border-border rounded-lg p-2 mt-1"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.featured}
              onChange={(e) => setForm({ ...form, featured: e.target.checked })}
            />
            Featured
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.visible}
              onChange={(e) => setForm({ ...form, visible: e.target.checked })}
            />
            Visible
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_hidden}
              onChange={(e) => setForm({ ...form, is_hidden: e.target.checked })}
            />
            Hidden (legacy)
          </label>
        </div>

        {/* Deals — create a promotion for this product in-flow, without
            leaving the editor (the publish-flow door Sunny asked for). */}
        <div className="border-t pt-4">
          {product?.id ? (
            <PromotionDealForm
              heading={`Create a deal for ${product.name}`}
              presetTargets={[{ kind: 'product', id: String(product.id), label: product.name }]}
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              Save this product first — then you can attach a deal to it right here, in this editor.
            </p>
          )}
        </div>

        <div className="flex gap-3 pt-4 border-t">
          <button
            onClick={() =>
              onSave(form, imageFile, {
                filters: filterSelections,
                manufacturer: form.manufacturer,
                country_of_origin: form.country_of_origin,
                supplier_name: form.supplier_name,
                supplier_sku: form.supplier_sku,
                supplier_reorder_url: form.supplier_reorder_url,
              })
            }
            className="px-6 py-2 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 rounded-lg text-sm font-semibold"
          >
            {product ? 'Save Changes' : 'Create Product'}
          </button>
          <button
            onClick={onClose}
            className="px-6 py-2 border border-border rounded-lg text-sm font-semibold"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
