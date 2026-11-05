"use client";

/**
 * Edit controls for the joined admin catalog (owner order 2026-10-30):
 * editing is a first-class action, in her words, from the row and from
 * the tree — no supplier jargon.
 *
 * ListingEditor edits ONE front-end listing (name, description, price,
 * shelf). It writes to /api/admin/catalog-listing/[id], which stores the
 * edit in catalog_listing_overrides — never on the supplier mirror row —
 * so a supplier re-sync cannot erase it, and the joined read (storefront
 * feed + this catalog) shows her values.
 *
 * CategoryEditor edits ONE category (name, description, parent shelf,
 * sort order, on/off) against the same `categories` table the storefront
 * reads, via the existing PATCH /api/admin/categories/[id].
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

async function send(url: string, method: string, body?: unknown): Promise<any> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const run = async (fn: () => Promise<any>, okMsg = "Saved.") => {
    setBusy(true); setError(null); setOk(null);
    try {
      await fn();
      setOk(okMsg);
      router.refresh();
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, ok, run };
}

function Feedback({ error, ok }: { error: string | null; ok: string | null }) {
  return (
    <>
      {error && <div className="adm-alert adm-alert-error">{error}</div>}
      {ok && <div className="adm-alert adm-alert-ok">{ok}</div>}
    </>
  );
}

export type CategoryOption = { id: string; label: string };

export function ListingEditor({
  productId,
  name,
  supplierName,
  description,
  price,
  categoryId,
  categories,
  edited,
}: {
  productId: string;
  /** Her current name for the listing (override already applied). */
  name: string;
  /** The supplier's own name, when it differs from hers. */
  supplierName: string | null;
  description: string | null;
  /** Her set price, when she has set one. */
  price: number | null;
  /** The listing's current shelf (effective category). */
  categoryId: string | null;
  categories: CategoryOption[];
  edited: boolean;
}) {
  const { busy, error, ok, run } = useAction();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({
    name,
    description: description ?? "",
    price: price != null ? String(price) : "",
    categoryId: categoryId ?? "",
  });

  if (!open) {
    return (
      <button
        className="adm-btn adm-btn-sm adm-btn-ghost"
        disabled={busy}
        data-tip="Change this listing — its name, the words shoppers read, its price, or which shelf it sits on. Your changes are what shoppers see, and they stay yours even when the supplier updates their catalog."
        onClick={() => setOpen(true)}
      >
        Edit listing
      </button>
    );
  }

  return (
    <div style={{ minWidth: 320, maxWidth: 460, display: "grid", gap: 8, textAlign: "left" }}>
      <label className="adm-label">
        Listing name
        <input
          className="adm-input"
          value={v.name}
          onChange={(e) => setV({ ...v, name: e.target.value })}
          aria-label="Listing name"
        />
      </label>
      {supplierName && (
        <div style={{ fontSize: 12, color: "#55565e" }}>
          The supplier calls it: {supplierName}
        </div>
      )}
      <label className="adm-label">
        Description shoppers read
        <textarea
          className="adm-input"
          rows={4}
          value={v.description}
          onChange={(e) => setV({ ...v, description: e.target.value })}
          placeholder="Write what makes this one special…"
          aria-label="Description shoppers read"
        />
      </label>
      <label className="adm-label">
        Your price ($)
        <input
          className="adm-input"
          type="number"
          min="0"
          step="0.01"
          value={v.price}
          onChange={(e) => setV({ ...v, price: e.target.value })}
          placeholder="Leave blank to use the supplier price"
          aria-label="Your price in dollars"
        />
      </label>
      <label className="adm-label">
        Shelf (category)
        <select
          className="adm-select"
          value={v.categoryId}
          onChange={(e) => setV({ ...v, categoryId: e.target.value })}
          aria-label="Shelf (category)"
          data-tip="The shelf this listing sits on in your shop. Moving it changes where shoppers find it."
        >
          {!v.categoryId && <option value="">No shelf yet — pick one</option>}
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </label>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button
          className="adm-btn adm-btn-sm"
          style={{ background: "#0a6400", borderColor: "#0a6400", color: "#fff" }}
          disabled={busy || !v.name.trim()}
          onClick={() =>
            run(
              () =>
                send(`/api/admin/catalog-listing/${productId}`, "PATCH", {
                  name: v.name.trim(),
                  description: v.description.trim() ? v.description.trim() : null,
                  price: v.price.trim() ? Number(v.price) : null,
                  categoryId: v.categoryId ? v.categoryId : null,
                }),
              "Listing saved — shoppers now see your version.",
            )
          }
        >
          Save listing
        </button>
        <button className="adm-btn adm-btn-sm adm-btn-ghost" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
        {edited && (
          <button
            className="adm-btn adm-btn-sm adm-btn-ghost"
            disabled={busy}
            data-tip="Throw away your edits and go back to exactly what the supplier sends for this listing."
            onClick={() =>
              run(
                () => send(`/api/admin/catalog-listing/${productId}`, "DELETE"),
                "Back to the supplier's version.",
              )
            }
          >
            Use supplier values again
          </button>
        )}
      </div>
      <Feedback error={error} ok={ok} />
    </div>
  );
}

export function CategoryEditor({
  category,
  categories,
}: {
  category: {
    id: string;
    name: string;
    description: string | null;
    parent_id: string | null;
    sort_order: number;
    is_active: boolean;
  };
  categories: CategoryOption[];
}) {
  const { busy, error, ok, run } = useAction();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({
    name: category.name,
    description: category.description ?? "",
    parentId: category.parent_id ?? "",
    sortOrder: String(category.sort_order ?? 0),
    isActive: category.is_active,
  });

  if (!open) {
    return (
      <button
        className="cursor-pointer text-xs font-semibold text-[#0077c5] underline"
        disabled={busy}
        data-tip={`Change “${category.name}” — its name, its words, where it sits, or turn it off so shoppers stop seeing it.`}
        onClick={() => setOpen(true)}
      >
        Edit
      </button>
    );
  }

  return (
    <div style={{ display: "grid", gap: 8, margin: "8px 0", textAlign: "left" }}>
      <label className="adm-label">
        Category name
        <input
          className="adm-input"
          value={v.name}
          onChange={(e) => setV({ ...v, name: e.target.value })}
          aria-label="Category name"
        />
      </label>
      <div style={{ fontSize: 12, color: "#55565e" }}>Renaming does not change its web address.</div>
      <label className="adm-label">
        Description
        <textarea
          className="adm-input"
          rows={3}
          value={v.description}
          onChange={(e) => setV({ ...v, description: e.target.value })}
          placeholder="The words at the top of this shelf's page…"
          aria-label="Category description"
        />
      </label>
      <label className="adm-label">
        Sits under
        <select
          className="adm-select"
          value={v.parentId}
          onChange={(e) => setV({ ...v, parentId: e.target.value })}
          aria-label="Parent category"
        >
          <option value="">Top level (a main department)</option>
          {categories
            .filter((c) => c.id !== category.id)
            .map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
        </select>
      </label>
      <label className="adm-label">
        Sort order (lower shows first)
        <input
          className="adm-input"
          type="number"
          value={v.sortOrder}
          onChange={(e) => setV({ ...v, sortOrder: e.target.value })}
          aria-label="Sort order"
        />
      </label>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
        <input
          type="checkbox"
          checked={v.isActive}
          onChange={(e) => setV({ ...v, isActive: e.target.checked })}
        />
        Shoppers can see this category
      </label>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          className="adm-btn adm-btn-sm"
          style={{ background: "#0a6400", borderColor: "#0a6400", color: "#fff" }}
          disabled={busy || !v.name.trim()}
          onClick={() =>
            run(
              () =>
                send(`/api/admin/categories/${category.id}`, "PATCH", {
                  name: v.name.trim(),
                  description: v.description.trim() ? v.description.trim() : null,
                  parent_id: v.parentId ? v.parentId : null,
                  sortOrder: Number(v.sortOrder) || 0,
                  is_active: v.isActive,
                }),
              "Category saved.",
            )
          }
        >
          Save category
        </button>
        <button className="adm-btn adm-btn-sm adm-btn-ghost" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <Feedback error={error} ok={ok} />
    </div>
  );
}
