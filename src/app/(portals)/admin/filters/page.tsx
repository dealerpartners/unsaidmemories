'use client';

import { useEffect, useState, useCallback } from 'react';

// ============================================================================
// Admin → Filters
//
// Two-column layout:
//   LEFT  — list of filter groups (Brand, Size, Color, …) with their values
//           inline. "Add Filter Group" button. Per group: rename, add/remove
//           values, map to categories (multi-select).
//   RIGHT — flat list of every category mapping for a quick audit / unmap.
//
// LIVE STORE: groups are taxonomy ATTRIBUTES, values are attribute values,
// mappings are node_filters assignments on the published taxonomy tree —
// the same rows the shop reads. A group reaches the storefront only where
// it is mapped; assignments inherit down the tree. There is no global
// mapping and no global on/off switch in the live store (see the notice
// on the page), so neither is offered here.
// ============================================================================

type FilterValue = {
  id: string;
  filter_id: string;
  value: string;
  slug: string;
  display_order: number;
};

type Filter = {
  id: string;
  name: string;
  slug: string;
  display_order: number;
  is_active: boolean;
  scope: string;
  values: FilterValue[];
};

type Mapping = {
  id: string;
  filter_id: string;
  category_id: string | null;
  display_order: number;
};

type Category = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
};

type ApiResponse = {
  filters: Filter[];
  mappings: Mapping[];
  categories: Category[];
};

export default function FiltersPage() {
  const [data, setData] = useState<ApiResponse>({ filters: [], mappings: [], categories: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // New-group form
  const [newName, setNewName] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);

  // Inline-edit per group (kept in a map: filterId → draft). Only the name
  // is editable — the live store has no scope or on/off column for a group.
  const [drafts, setDrafts] = useState<Record<string, { name: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/filters', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        setData({
          filters: Array.isArray(json.filters) ? json.filters : [],
          mappings: Array.isArray(json.mappings) ? json.mappings : [],
          categories: Array.isArray(json.categories) ? json.categories : [],
        });
      }
    } catch (e) {
      console.error('Failed to load filters', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  function draftFor(f: Filter) {
    return drafts[f.id] ?? { name: f.name };
  }

  function setDraft(id: string, patch: Partial<{ name: string }>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { name: '' }), ...patch } }));
  }

  async function createGroup() {
    if (!newName.trim()) {
      flash('Name is required');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        flash(`Create failed: ${e.error || res.statusText}`);
        return;
      }
      setNewName('');
      setShowNewForm(false);
      flash('Filter group created');
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function saveGroup(f: Filter) {
    const d = draftFor(f);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/filters/${f.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(d),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        flash(`Save failed: ${e.error || res.statusText}`);
        return;
      }
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[f.id];
        return next;
      });
      flash('Filter group saved');
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function deleteGroup(f: Filter) {
    if (!confirm(`Delete filter group "${f.name}" and all its values + mappings?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/filters/${f.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        flash(`Delete failed: ${e.error || res.statusText}`);
        return;
      }
      flash('Filter group deleted');
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function addValue(f: Filter, value: string) {
    if (!value.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/filters/${f.id}/values`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        flash(`Add failed: ${e.error || res.statusText}`);
        return;
      }
      flash('Value added');
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function removeValue(v: FilterValue) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/filters/values/${v.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        flash(`Remove failed: ${e.error || res.statusText}`);
        return;
      }
      flash('Value removed');
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function mapCategory(f: Filter, categoryId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/filters/${f.id}/map`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_id: categoryId }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        flash(`Map failed: ${e.error || res.statusText}`);
        return;
      }
      flash('Mapped to category');
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function unmap(m: Mapping) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/filters/${m.filter_id}/map/${m.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        flash(`Unmap failed: ${e.error || res.statusText}`);
        return;
      }
      flash('Mapping removed');
      await load();
    } finally {
      setBusy(false);
    }
  }

  const filterName = (id: string) => data.filters.find((f) => f.id === id)?.name || id;
  const categoryName = (id: string | null) =>
    id === null ? '—' : data.categories.find((c) => c.id === id)?.name || id;

  if (loading) return <div className="">Loading filters...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Filters</h1>
        </div>
        <button
          onClick={() => setShowNewForm((v) => !v)}
          className="px-4 py-2 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 rounded-lg text-sm font-semibold"
        >
          {showNewForm ? 'Cancel' : '+ Add Filter Group'}
        </button>
      </div>

      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-ink text-white px-4 py-2 rounded-lg shadow-lg text-sm">
          {toast}
        </div>
      )}

      <div className="border border-border rounded-lg bg-muted/30 text-sm space-y-1">
        <p className="font-semibold">This editor writes to the live taxonomy.</p>
        <p className="text-muted-foreground">
          Groups are attributes, values are attribute values, and mappings are assignments on the
          published category tree — the same rows the shop reads, so changes here reach the
          storefront. A group shows in the shop only on the categories it is mapped to, and a
          mapping inherits to that category&apos;s subcategories. There is no global mapping and
          no global on/off switch in the live store: to retire a group, unmap it from every
          category.
        </p>
      </div>

      {showNewForm && (
        <div className="border border-border rounded-lg bg-muted/30 grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <label className="text-xs font-bold uppercase text-muted-foreground">Name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full border border-border rounded-lg p-2 mt-1 bg-white"
              placeholder="e.g. Size, Color, Material"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={createGroup}
              disabled={busy}
              className="px-4 py-2 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              Create
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: filter groups + values */}
        <div className="lg:col-span-2 space-y-4">
          {data.filters.map((f) => {
            const d = draftFor(f);
            const mappingsForFilter = data.mappings.filter((m) => m.filter_id === f.id);
            const mappedCategoryIds = new Set(
              mappingsForFilter.map((m) => m.category_id).filter((x): x is string => !!x),
            );
            return (
              <div key={f.id} className="border border-border rounded-lg space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-3">
                    <label className="text-[10px] font-bold uppercase text-muted-foreground">
                      Name
                    </label>
                    <input
                      value={d.name}
                      onChange={(e) => setDraft(f.id, { name: e.target.value })}
                      className="w-full border border-border rounded-lg p-2 mt-1 bg-white"
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    {mappingsForFilter.length > 0 ? (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-green-700">
                        Live on {mappingsForFilter.length}{' '}
                        {mappingsForFilter.length === 1 ? 'category' : 'categories'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-neutral-600">
                        Not mapped — hidden in the shop
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => saveGroup(f)}
                    disabled={busy}
                    className="px-3 py-1.5 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 rounded-lg text-xs font-semibold disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => deleteGroup(f)}
                    disabled={busy}
                    className="px-3 py-1.5 border border-border rounded-lg text-xs font-semibold text-red-600"
                  >
                    Delete group
                  </button>
                </div>

                {/* Values */}
                <div>
                  <div className="text-[10px] font-bold uppercase text-muted-foreground mb-1">
                    Values
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {f.values.map((v) => (
                      <span
                        key={v.id}
                        className="inline-flex items-center gap-1.5 bg-muted px-2 py-1 rounded text-xs"
                      >
                        {v.value}
                        <button
                          onClick={() => removeValue(v)}
                          disabled={busy}
                          className="text-red-600 hover:underline"
                          aria-label={`Remove ${v.value}`}
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                    {f.values.length === 0 && (
                      <span className="text-xs text-muted-foreground">No values yet.</span>
                    )}
                  </div>
                  <AddValueInput onAdd={(val) => addValue(f, val)} disabled={busy} />
                </div>

                {/* Category mappings (multi-select) */}
                <div>
                  <div className="text-[10px] font-bold uppercase text-muted-foreground mb-1">
                    Mapped to categories
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-1.5">
                    Assignments inherit to subcategories — mapping a top-level category covers
                    its whole subtree.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {data.categories.map((c) => {
                      const selected = mappedCategoryIds.has(c.id);
                      return (
                        <button
                          key={c.id}
                          onClick={() => (selected ? null : mapCategory(f, c.id))}
                          disabled={busy || selected}
                          className={`px-2 py-1 rounded text-xs border ${ selected ? 'bg-brand-teal/10 text-brand-teal border-brand-teal/40' : 'bg-white border-border text-foreground hover:bg-muted' }`}
                        >
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
          {data.filters.length === 0 && (
            <div className="border border-border rounded-lg text-center text-muted-foreground text-sm">
              No filter groups yet. Click “+ Add Filter Group” to create one.
            </div>
          )}
        </div>

        {/* RIGHT: flat mapping audit */}
        <div className="space-y-3">
          <div className="border border-border rounded-lg bg-muted/30">
            <div className="text-xs font-bold uppercase text-muted-foreground mb-2">
              All mappings ({data.mappings.length})
            </div>
            {data.mappings.length === 0 ? (
              <div className="text-xs text-muted-foreground">No mappings yet.</div>
            ) : (
              <ul className="space-y-1.5 max-h-[480px] overflow-y-auto custom-scrollbar">
                {data.mappings.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-2 text-xs bg-white border border-border rounded p-2"
                  >
                    <span>
                      <span className="font-semibold">{filterName(m.filter_id)}</span>
                      <span className="text-muted-foreground"> → {categoryName(m.category_id)}</span>
                    </span>
                    <button
                      onClick={() => unmap(m)}
                      disabled={busy}
                      className="text-red-600 hover:underline"
                    >
                      Unmap
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AddValueInput({ onAdd, disabled }: { onAdd: (v: string) => void; disabled: boolean }) {
  const [val, setVal] = useState('');
  return (
    <div className="flex gap-2 mt-2">
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="Add a value…"
        className="flex-1 border border-border rounded-lg p-1.5 text-xs bg-white"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && val.trim()) {
            e.preventDefault();
            onAdd(val.trim());
            setVal('');
          }
        }}
      />
      <button
        type="button"
        disabled={disabled || !val.trim()}
        onClick={() => {
          if (val.trim()) {
            onAdd(val.trim());
            setVal('');
          }
        }}
        className="px-3 py-1.5 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 rounded-lg text-xs font-semibold disabled:opacity-50"
      >
        Add
      </button>
    </div>
  );
}
