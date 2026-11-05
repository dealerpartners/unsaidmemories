'use client';

import { useCallback, useEffect, useState } from 'react';
import { PromotionDealForm, type DealTarget } from '@/components/portal/PromotionDealForm';

// ============================================================================
// Admin → Categories — the CANONICAL category tree manager.
//
// This page previously edited pet_product_categories through
// /api/admin/categories — a parallel category universe the storefront
// never reads, so an operator could change categories here and change
// nothing on the storefront (route-tree /admin/categories · PARTIAL;
// G2 · Category tree lifecycle). It now manages the store the storefront
// and the seller catalog actually read — public.taxonomy_nodes — through
// /api/admin/catalog/categories: create / rename / slug (path prefixes
// rewritten subtree-wide server-side) / reparent / publish-archive /
// gated toggle / guarded delete, plus the B3 gating desk (pending
// seller_category_approvals decided in place). The parallel stores are
// reported by that API's duplicate census and are never written here.
//
// The promotions deal door stays: a node's Deal button opens the deal
// generator preset to that taxonomy node (previously the node was
// matched by slug from the parallel store; the preset is now the node
// itself).
// ============================================================================

type NodeCounts = { items: number; product_links: number; product_links_primary: number; listings: number };
type TaxNode = {
  id: string;
  parent_id: string | null;
  node_type: string;
  name: string;
  display_name: string | null;
  slug: string;
  path: string;
  depth: number;
  sort_order: number;
  status: string;
  is_gated: boolean;
  is_featured: boolean;
  counts: NodeCounts;
};
type Approval = {
  seller_id: string;
  seller_name: string | null;
  node_id: string;
  node_name: string;
  node_path: string;
  status: string;
};

const inputCls =
  'w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none';
const labelCls = 'mb-1 block text-xs font-semibold tracking-wide text-neutral-500 uppercase';

const EMPTY_FORM = { name: '', display_name: '', slug: '', parent_id: '', node_type: 'category', sort_order: '0', is_featured: false };

export default function CategoriesPage() {
  const [nodes, setNodes] = useState<TaxNode[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [totals, setTotals] = useState<{ nodes: number; published: number; gated: number } | null>(null);
  const [duplicates, setDuplicates] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [dealNode, setDealNode] = useState<TaxNode | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/catalog/categories', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load categories');
      setNodes(data.nodes || []);
      setApprovals(data.approvals || []);
      setTotals(data.totals || null);
      setDuplicates(data.sources?.duplicates || null);
    } catch (e: any) {
      setError(e.message || 'Failed to load categories');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const post = async (payload: Record<string, unknown>) => {
    const res = await fetch('/api/admin/catalog/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  };

  const act = async (payload: Record<string, unknown>, okMsg: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await post(payload);
      setNotice(okMsg);
      await load();
    } catch (e: any) {
      setError(e.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const startCreate = (parentId = '') => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, parent_id: parentId });
    setShowForm(true);
  };

  const startEdit = (n: TaxNode) => {
    setEditingId(n.id);
    setForm({
      name: n.name,
      display_name: n.display_name || '',
      slug: n.slug,
      parent_id: n.parent_id || '',
      node_type: n.node_type,
      sort_order: String(n.sort_order ?? 0),
      is_featured: n.is_featured,
    });
    setShowForm(true);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (editingId) {
        const node = nodes.find((n) => n.id === editingId);
        await post({
          action: 'update_node',
          node_id: editingId,
          name: form.name,
          display_name: form.display_name,
          slug: form.slug,
          sort_order: Number(form.sort_order),
          is_featured: form.is_featured,
        });
        if (node && (node.parent_id || '') !== form.parent_id) {
          await post({ action: 'reparent_node', node_id: editingId, new_parent_id: form.parent_id || null });
        }
        setNotice('Category updated.');
      } else {
        await post({
          action: 'create_node',
          name: form.name,
          display_name: form.display_name || undefined,
          slug: form.slug || undefined,
          parent_id: form.parent_id || null,
          node_type: form.node_type,
          sort_order: Number(form.sort_order),
        });
        setNotice('Category created as a draft. Publish it when it should appear on the storefront.');
      }
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      await load();
    } catch (e: any) {
      setError(e.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const parentOptions = nodes.filter((n) => n.id !== editingId);
  const dealPreset: DealTarget[] = dealNode ? [{ kind: 'taxonomy', id: dealNode.id, label: dealNode.name }] : [];

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Categories</h1>
        </div>
        <button onClick={() => startCreate('')} className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5">
          + New category
        </button>
      </div>
      {totals ? (
        <p className="mb-4 text-xs text-neutral-500">
          {totals.nodes} nodes · {totals.published} published · {totals.gated} gated
          {duplicates
            ? ` · parallel stores (never written here): pet_product_categories ${duplicates.pet_product_categories}, categories ${duplicates.categories}, seller_catalog_categories ${duplicates.seller_catalog_categories}, commerce_categories ${duplicates.commerce_categories}`
            : ''}
        </p>
      ) : null}

      {error ? <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}
      {notice ? <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</div> : null}

      {showForm ? (
        <div className="mb-6 rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-neutral-900">{editingId ? 'Edit category' : 'New category'}</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className={labelCls}>Name</label>
              <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Display name</label>
              <input className={inputCls} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Slug</label>
              <input className={inputCls} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="Derived from name when blank" />
              {editingId ? <p className="mt-1 text-xs text-amber-600">Changing the slug rewrites this subtree's storefront paths.</p> : null}
            </div>
            <div>
              <label className={labelCls}>Parent</label>
              <select className={inputCls} value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })}>
                <option value="">— Top level —</option>
                {parentOptions.map((n) => (
                  <option key={n.id} value={n.id}>{`${'  '.repeat(Math.min(n.depth, 6))}${n.name} (${n.path})`}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Node type</label>
              <select className={inputCls} value={form.node_type} onChange={(e) => setForm({ ...form, node_type: e.target.value })} disabled={!!editingId}>
                <option value="animal">animal</option>
                <option value="category">category</option>
                <option value="subcategory">subcategory</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Sort order</label>
              <input type="number" className={inputCls} value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={form.is_featured} onChange={(e) => setForm({ ...form, is_featured: e.target.checked })} disabled={!editingId} />
              Featured
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={save} disabled={busy || !form.name.trim()} className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 disabled:opacity-50">
              {editingId ? 'Save category' : 'Create category'}
            </button>
            <button onClick={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); }} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm">
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {dealNode ? (
        <div className="mb-6 rounded-xl border border-neutral-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-900">Create a Deal — {dealNode.name}</h2>
            <button onClick={() => setDealNode(null)} className="rounded-lg border border-neutral-300 px-2 py-1 text-xs">Close</button>
          </div>
          <PromotionDealForm presetTargets={dealPreset} onCreated={() => setNotice('Deal published')} />
        </div>
      ) : null}

      <div className="rounded-xl border border-neutral-200 bg-white">
        {loading ? (
          <p className="p-5 text-sm text-neutral-400">Loading taxonomy…</p>
        ) : nodes.length === 0 ? (
          <p className="p-5 text-sm text-neutral-500">No taxonomy nodes found for this tenant.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {nodes.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5" style={{ paddingLeft: `${1 + Math.min(n.depth, 8) * 1.25}rem` }}>
                <div className="min-w-[220px] flex-1">
                  <span className="text-sm font-medium text-neutral-900">{n.display_name || n.name}</span>
                  <span className="block text-xs text-neutral-400">{n.path} · {n.node_type}</span>
                </div>
                <span className="text-xs text-neutral-500">
                  {n.counts.items} items · {n.counts.product_links} products · {n.counts.listings} listings
                </span>
                <select
                  className="rounded-lg border border-neutral-300 px-2 py-1 text-xs"
                  value={n.status}
                  disabled={busy}
                  onChange={(e) => act({ action: 'set_node_status', node_id: n.id, status: e.target.value }, `Status set to ${e.target.value}.`)}
                >
                  <option value="draft">draft</option>
                  <option value="published">published</option>
                  <option value="archived">archived</option>
                </select>
                <button
                  onClick={() => act({ action: 'set_gated', node_id: n.id, is_gated: !n.is_gated }, n.is_gated ? 'Category ungated.' : 'Category gated — sellers now need approval to list here.')}
                  disabled={busy}
                  className={`rounded-lg border px-2 py-1 text-xs ${n.is_gated ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-neutral-300 text-neutral-600'}`}
                >
                  {n.is_gated ? 'Gated' : 'Open'}
                </button>
                <button onClick={() => startEdit(n)} className="rounded-lg border border-neutral-300 px-2 py-1 text-xs">Edit</button>
                <button onClick={() => startCreate(n.id)} className="rounded-lg border border-neutral-300 px-2 py-1 text-xs">+ Child</button>
                <button onClick={() => setDealNode(n)} className="rounded-lg border border-neutral-300 px-2 py-1 text-xs">Deal</button>
                <button
                  onClick={() => {
                    if (window.confirm(`Delete "${n.name}"? Only an unused leaf can be deleted; the server refuses nodes with children or attachments.`)) {
                      act({ action: 'delete_node', node_id: n.id }, 'Category deleted.');
                    }
                  }}
                  disabled={busy}
                  className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-700"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">Gated-category approvals (B3)</h2>
        {approvals.length === 0 ? (
          <p className="text-sm text-neutral-500">No seller category approvals are waiting.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {approvals.map((a) => (
              <li key={`${a.seller_id}-${a.node_id}`} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="flex-1 text-sm text-neutral-800">
                  {a.seller_name || a.seller_id} → <span className="font-medium">{a.node_name}</span>
                  <span className="block text-xs text-neutral-400">{a.node_path}</span>
                </span>
                <button
                  onClick={() => act({ action: 'decide_category_approval', seller_id: a.seller_id, node_id: a.node_id, decision: 'approve' }, 'Category approval granted.')}
                  disabled={busy}
                  className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  onClick={() => act({ action: 'decide_category_approval', seller_id: a.seller_id, node_id: a.node_id, decision: 'reject' }, 'Category approval rejected.')}
                  disabled={busy}
                  className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs disabled:opacity-50"
                >
                  Reject
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
