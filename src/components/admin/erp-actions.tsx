"use client";

// Client-side action controls for the ERP Orders module. Every control posts
// to a gated /api/admin/erp/* route and reloads on success so the server
// component re-reads the truth from the database. Errors render inline —
// nothing fails silently.

import { useState } from "react";
import { useRouter } from "next/navigation";

async function post(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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

// ── Order detail controls ────────────────────────────────────────────────────

export function OrderTransition({ orderId, current, allowed }: { orderId: string; current: string; allowed: string[] }) {
  const { busy, error, ok, run } = useAction();
  const [to, setTo] = useState(allowed[0] || "");
  if (!allowed.length) return null;
  return (
    <div>
      <label className="adm-label">Move order from {current}</label>
      <div style={{ display: "flex", gap: 8 }}>
        <select className="adm-select" value={to} onChange={(e) => setTo(e.target.value)} data-tip="Pick the order's next stage — for example, from “confirmed” to “in production” when the printer starts work.">
          {allowed.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
        <button className="adm-btn" style={{ background: "#0a6400", borderColor: "#0a6400", color: "#fff" }} disabled={busy || !to} data-tip="Move this order to the stage you picked. The order's history keeps a record of every move."
          onClick={() => run(() => post(`/api/admin/erp/orders/${orderId}`, { action: "transition", to }), `Order moved to ${to}.`)}>
          Apply
        </button>
      </div>
      <Feedback error={error} ok={ok} />
    </div>
  );
}

export function OrderNoteForm({ orderId }: { orderId: string }) {
  const { busy, error, ok, run } = useAction();
  const [body, setBody] = useState("");
  return (
    <div>
      <label className="adm-label">Add note</label>
      <textarea className="adm-textarea" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Internal note…" data-tip="Notes are private — only staff see them. Customers never see order notes." />
      <div style={{ marginTop: 8 }}>
        <button className="adm-btn adm-btn-ghost" disabled={busy || !body.trim()} data-tip="Save this note on the order's record, with today's date."
          onClick={() => run(async () => { await post(`/api/admin/erp/orders/${orderId}`, { action: "note", body }); setBody(""); }, "Note added.")}>
          Add note
        </button>
      </div>
      <Feedback error={error} ok={ok} />
    </div>
  );
}

export function SupplierPush({ orderId, fulfillments }: { orderId: string; fulfillments: { id: string; status: string; supplier_order_external_id: string | null }[] }) {
  const { busy, error, ok, run } = useAction();
  const [detail, setDetail] = useState<string | null>(null);
  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="adm-btn" style={{ background: "#0a6400", borderColor: "#0a6400", color: "#fff" }} disabled={busy} data-tip="Send this order to the printing suppliers. Printful orders start as drafts — nothing is printed and nothing is charged until you press Confirm."
          onClick={() => run(async () => {
            const r = await post(`/api/admin/erp/orders/${orderId}/push`, { action: "push" });
            setDetail(JSON.stringify(r, null, 2));
          }, "Push completed — see detail below.")}>
          Push to suppliers
        </button>
        <button className="adm-btn adm-btn-ghost" disabled={busy} data-tip="Ask the suppliers for the newest tracking numbers and delivery news for this order."
          onClick={() => run(async () => {
            const r = await post(`/api/admin/erp/orders/${orderId}/push`, { action: "sync" });
            setDetail(JSON.stringify(r, null, 2));
          }, "Tracking synced.")}>
          Sync tracking
        </button>
        {fulfillments.filter((f) => f.status === "submitted" && f.supplier_order_external_id).map((f) => (
          <button key={f.id} className="adm-btn adm-btn-ghost" disabled={busy} data-tip="Tell the supplier to start printing for real. This is the point of no return — after this, the item gets made and your account is charged."
            onClick={() => run(() => post(`/api/admin/erp/orders/${orderId}/push`, { action: "confirm", fulfillmentOrderId: f.id }), "Sent to production.")}>
            Confirm #{f.supplier_order_external_id} to production
          </button>
        ))}
      </div>
      <Feedback error={error} ok={ok} />
      {detail && <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, background: "#f7f7fa", padding: 10, borderRadius: 10, marginTop: 10 }}>{detail}</pre>}
    </div>
  );
}

// ── Fulfillment ──────────────────────────────────────────────────────────────

const FLOW = ["pending", "released", "picked", "packed", "staged", "dispatched", "completed"];
export function FulfillmentAdvance({ fulfillmentId, status }: { fulfillmentId: string; status: string }) {
  const { busy, error, ok, run } = useAction();
  const idx = FLOW.indexOf(status);
  const next = idx >= 0 && idx < FLOW.length - 1 ? FLOW[idx + 1] : null;
  return (
    <span>
      {next ? (
        <button className="adm-btn adm-btn-sm" disabled={busy} data-tip={`Move this packing job one step forward, to “${next}”.`}
          onClick={() => run(() => post(`/api/admin/erp/fulfillment`, { fulfillmentId, to: next }), `Moved to ${next}.`)}>
          → {next}
        </button>
      ) : <span style={{ color: "#7c7e89", fontSize: 12 }}>{status}</span>}
      <Feedback error={error} ok={ok} />
    </span>
  );
}

// ── Returns ──────────────────────────────────────────────────────────────────

const RETURN_TIPS: Record<string, string> = {
  approve: "Approve this return — the customer may send the item back.",
  receive: "Mark the returned item as arrived back with you.",
  complete: "Finish this return. Any refund is given from Accounting or the customer's page.",
};

export function ReturnActions({ rmaId, status }: { rmaId: string; status: string }) {
  const { busy, error, ok, run } = useAction();
  const actions: { key: "approve" | "receive" | "complete"; label: string }[] = [];
  if (["requested", "action_required"].includes(status)) actions.push({ key: "approve", label: "Approve" });
  if (["approved", "awaiting_package"].includes(status)) actions.push({ key: "receive", label: "Mark received" });
  if (status === "received") actions.push({ key: "complete", label: "Complete" });
  return (
    <span style={{ display: "inline-flex", gap: 6 }}>
      {actions.map((a) => (
        <button key={a.key} className="adm-btn adm-btn-sm" disabled={busy} data-tip={RETURN_TIPS[a.key]}
          onClick={() => run(() => post(`/api/admin/erp/returns`, { rmaId, action: a.key }), `${a.label} done.`)}>
          {a.label}
        </button>
      ))}
      <Feedback error={error} ok={ok} />
    </span>
  );
}

// ── Inventory ────────────────────────────────────────────────────────────────

export function InventoryRowActions({ skuId, warehouseId, skuLabel }: { skuId: string; warehouseId: string; skuLabel: string }) {
  const { busy, error, ok, run } = useAction();
  const [qty, setQty] = useState("");
  const [mode, setMode] = useState<"adjust" | "count" | "damage">("adjust");
  return (
    <div style={{ minWidth: 220 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <select className="adm-select" value={mode} onChange={(e) => setMode(e.target.value as any)} style={{ maxWidth: 105 }} data-tip="“Adjust” adds or takes away a number (use a minus, like −2). “Count” sets the exact number you physically counted. “Damaged” writes off broken stock.">
          <option value="adjust">Adjust ±</option>
          <option value="count">Count =</option>
          <option value="damage">Damaged</option>
        </select>
        <input className="adm-input" type="number" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qty" style={{ maxWidth: 80 }} />
        <button className="adm-btn adm-btn-sm" disabled={busy || qty === ""} data-tip="Save this stock change for this item. The count updates right away."
          onClick={() => run(() => post(`/api/admin/erp/inventory`, {
            action: mode === "damage" ? "damage" : mode, skuId, warehouseId, quantity: Number(qty),
            reason: `${mode} via inventory list (${skuLabel})`,
          }), "Stock updated.")}>
          Apply
        </button>
      </div>
      <Feedback error={error} ok={ok} />
    </div>
  );
}

export function ReceiveStockForm({ variants, warehouses }: {
  variants: { id: string; label: string }[]; warehouses: { id: string; label: string }[];
}) {
  const { busy, error, ok, run } = useAction();
  const [skuId, setSkuId] = useState(variants[0]?.id || "");
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || "");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [bin, setBin] = useState("");
  return (
    <div>
      <div className="adm-grid">
        <div>
          <label className="adm-label">Variant (SKU)</label>
          <select className="adm-select" value={skuId} onChange={(e) => setSkuId(e.target.value)}>
            {variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <label className="adm-label">Warehouse</label>
          <select className="adm-select" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
          </select>
        </div>
        <div>
          <label className="adm-label">Quantity</label>
          <input className="adm-input" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>
        <div>
          <label className="adm-label">Unit cost ($)</label>
          <input className="adm-input" type="number" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
        </div>
        <div>
          <label className="adm-label">Bin location</label>
          <input className="adm-input" value={bin} onChange={(e) => setBin(e.target.value)} placeholder="A1-B03" />
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <button className="adm-btn" disabled={busy || !skuId || !warehouseId || !quantity} data-tip="Add this delivery to the warehouse count. Use it when new stock arrives."
          onClick={() => run(() => post(`/api/admin/erp/inventory`, {
            action: "receive", skuId, warehouseId, quantity: Number(quantity),
            unitCost: unitCost ? Number(unitCost) : undefined, binLocation: bin || undefined,
            reason: "Restock / add inventory",
          }), "Stock received.")}>
          Receive stock
        </button>
      </div>
      <Feedback error={error} ok={ok} />
    </div>
  );
}

export function TransferForm({ variants, warehouses }: {
  variants: { id: string; label: string }[]; warehouses: { id: string; label: string }[];
}) {
  const { busy, error, ok, run } = useAction();
  const [skuId, setSkuId] = useState(variants[0]?.id || "");
  const [from, setFrom] = useState(warehouses[0]?.id || "");
  const [to, setTo] = useState(warehouses[1]?.id || warehouses[0]?.id || "");
  const [quantity, setQuantity] = useState("");
  return (
    <div>
      <div className="adm-grid">
        <div>
          <label className="adm-label">Variant (SKU)</label>
          <select className="adm-select" value={skuId} onChange={(e) => setSkuId(e.target.value)}>
            {variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <label className="adm-label">From warehouse</label>
          <select className="adm-select" value={from} onChange={(e) => setFrom(e.target.value)}>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
          </select>
        </div>
        <div>
          <label className="adm-label">To warehouse</label>
          <select className="adm-select" value={to} onChange={(e) => setTo(e.target.value)}>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
          </select>
        </div>
        <div>
          <label className="adm-label">Quantity</label>
          <input className="adm-input" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <button className="adm-btn adm-btn-ghost" disabled={busy || !quantity || from === to} data-tip="Move stock from one warehouse to the other. The total you own stays the same — only the location changes."
          onClick={() => run(() => post(`/api/admin/erp/inventory`, {
            action: "transfer", skuId, warehouseId: from, toWarehouseId: to, quantity: Number(quantity),
            reason: "Warehouse transfer",
          }), "Transfer complete.")}>
          Transfer stock
        </button>
      </div>
      <Feedback error={error} ok={ok} />
    </div>
  );
}

// ── Catalog ──────────────────────────────────────────────────────────────────

export function CatalogStatusToggle({ productId, status }: { productId: string; status: string }) {
  const { busy, error, ok, run } = useAction();
  const next = status === "published" ? "draft" : "published";
  return (
    <span>
      <button className="adm-btn adm-btn-sm adm-btn-ghost" disabled={busy}
        data-tip={status === "published" ? "Hide this product from the shop. It stays in your list — nothing is deleted, and you can publish it again any time." : "Publish this product so shoppers can see it and buy it."}
        onClick={() => run(() => post(`/api/admin/erp/catalog`, { productId, status: next }), `Product ${next === "published" ? "published" : "hidden (draft)"}.`)}>
        {status === "published" ? "Hide" : "Publish"}
      </button>
      <Feedback error={error} ok={ok} />
    </span>
  );
}

/** Inline rename for a supplier-catalog product (name + brand). */
export function CatalogNameEditor({ productId, name, brand }: { productId: string; name: string; brand: string | null }) {
  const { busy, error, ok, run } = useAction();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name, brand: brand ?? "" });
  if (!open) {
    return (
      <button className="adm-btn adm-btn-sm adm-btn-ghost" disabled={busy}
        data-tip="Rename this product — the new name is what shoppers see in the shop."
        onClick={() => setOpen(true)}>
        Edit
      </button>
    );
  }
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <input className="adm-input" style={{ width: 220 }} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} aria-label="Product name" />
      <input className="adm-input" style={{ width: 120 }} value={v.brand} onChange={(e) => setV({ ...v, brand: e.target.value })} placeholder="Brand" aria-label="Brand" />
      <button className="adm-btn adm-btn-sm" style={{ background: "#0a6400", borderColor: "#0a6400", color: "#fff" }} disabled={busy || !v.name.trim()}
        onClick={() => run(async () => {
          const res = await fetch(`/api/admin/erp/catalog/${productId}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: v.name.trim(), brand_name: v.brand }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
          setOpen(false);
        }, "Product updated.")}>
        Save
      </button>
      <button className="adm-btn adm-btn-sm adm-btn-ghost" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
      <Feedback error={error} ok={ok} />
    </span>
  );
}

/** Assign / unassign a supplier-catalog product to a collection. */
export function CatalogCollectionAssign({ productId, collections, assigned }: {
  productId: string;
  collections: { id: string; name: string }[];
  assigned: string[];
}) {
  const { busy, error, ok, run } = useAction();
  const [collectionId, setCollectionId] = useState("");
  const inCollection = collectionId ? assigned.includes(collectionId) : false;
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <select className="adm-select" value={collectionId} onChange={(e) => setCollectionId(e.target.value)} aria-label="Collection"
        data-tip="Collections are themed shelves — like “Kin Keeper Month”. Adding a product here puts it on that collection's page in the shop.">
        <option value="">Collection…</option>
        {collections.map((c) => (
          <option key={c.id} value={c.id}>{c.name}{assigned.includes(c.id) ? " ✓" : ""}</option>
        ))}
      </select>
      <button className="adm-btn adm-btn-sm adm-btn-ghost" disabled={busy || !collectionId}
        onClick={() => run(async () => {
          const res = await fetch("/api/admin/erp/catalog/collection", {
            method: inCollection ? "DELETE" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ catalogProductId: productId, collectionId }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
        }, inCollection ? "Removed from the collection." : "Added to the collection.")}>
        {inCollection ? "Remove" : "Add"}
      </button>
      <Feedback error={error} ok={ok} />
    </span>
  );
}

export function CreateCategoryForm({ parents }: { parents: { id: string; label: string }[] }) {
  const { busy, error, ok, run } = useAction();
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  return (
    <div>
      <div style={{ display: "flex", gap: 8 }}>
        <input className="adm-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="New category name" />
        <select className="adm-select" value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">Top level</option>
          {parents.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <button className="adm-btn" style={{ background: "#0a6400", borderColor: "#0a6400", color: "#fff" }} disabled={busy || !name.trim()} data-tip="Create this category — a shelf in your shop that products sit on, like “Mugs” or “Wall Art”."
          onClick={() => run(async () => {
            const res = await fetch(`/api/admin/categories`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name, ...(parentId ? { parentId } : {}) }),
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(j.error || "Category create failed");
            setName("");
          }, "Category created.")}>
          Create
        </button>
      </div>
      <Feedback error={error} ok={ok} />
    </div>
  );
}

// ── Shipping ─────────────────────────────────────────────────────────────────

export function LabelForm({ fulfillments }: { fulfillments: { id: string; label: string }[] }) {
  const { busy, error, ok, run } = useAction();
  const [fulfillmentId, setFulfillmentId] = useState(fulfillments[0]?.id || "");
  const [carrier, setCarrier] = useState("USPS");
  const [tracking, setTracking] = useState("");
  return (
    <div>
      <div className="adm-grid">
        <div>
          <label className="adm-label">Fulfillment</label>
          <select className="adm-select" value={fulfillmentId} onChange={(e) => setFulfillmentId(e.target.value)}>
            {fulfillments.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </div>
        <div>
          <label className="adm-label">Carrier</label>
          <select className="adm-select" value={carrier} onChange={(e) => setCarrier(e.target.value)}>
            <option>USPS</option><option>UPS</option><option>FedEx</option><option>DHL</option>
          </select>
        </div>
        <div>
          <label className="adm-label">Tracking number</label>
          <input className="adm-input" value={tracking} onChange={(e) => setTracking(e.target.value)} />
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <button className="adm-btn" disabled={busy || !fulfillmentId || !tracking} data-tip="Record this parcel's label and tracking number, so the customer can follow their delivery."
          onClick={() => run(() => post(`/api/admin/erp/shipping`, { fulfillmentId, carrier, trackingNumber: tracking }), "Label recorded.")}>
          Print postage label (record)
        </button>
      </div>
      <Feedback error={error} ok={ok} />
    </div>
  );
}

// ── Purchasing ───────────────────────────────────────────────────────────────

export function VendorForm() {
  const { busy, error, ok, run } = useAction();
  const [legalName, setLegalName] = useState("");
  const [email, setEmail] = useState("");
  return (
    <div>
      <div style={{ display: "flex", gap: 8 }}>
        <input className="adm-input" value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Vendor legal name" />
        <input className="adm-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
        <button className="adm-btn" disabled={busy || !legalName.trim()} data-tip="Add this company as a vendor — a business you buy stock or supplies from."
          onClick={() => run(() => post(`/api/admin/erp/purchasing`, { action: "create_vendor", legalName, email: email || undefined }), "Vendor created.")}>
          Add vendor
        </button>
      </div>
      <Feedback error={error} ok={ok} />
    </div>
  );
}

export function PurchaseOrderForm({ vendors, variants }: {
  vendors: { id: string; label: string }[]; variants: { id: string; label: string }[];
}) {
  const { busy, error, ok, run } = useAction();
  const [vendorId, setVendorId] = useState(vendors[0]?.id || "");
  const [description, setDescription] = useState("");
  const [skuId, setSkuId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  return (
    <div>
      <div className="adm-grid">
        <div>
          <label className="adm-label">Vendor</label>
          <select className="adm-select" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <label className="adm-label">Description</label>
          <input className="adm-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Blank tees restock" />
        </div>
        <div>
          <label className="adm-label">Linked SKU (for receiving)</label>
          <select className="adm-select" value={skuId} onChange={(e) => setSkuId(e.target.value)}>
            <option value="">— none —</option>
            {variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <label className="adm-label">Quantity</label>
          <input className="adm-input" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>
        <div>
          <label className="adm-label">Unit cost ($)</label>
          <input className="adm-input" type="number" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <button className="adm-btn" disabled={busy || !vendorId || !description || !quantity || !unitCost} data-tip="Create a purchase order — your written promise to buy these items from this vendor. It becomes a bill when the goods arrive."
          onClick={() => run(() => post(`/api/admin/erp/purchasing`, {
            action: "create_po", vendorId,
            lines: [{ description, quantity: Number(quantity), unitCost: Number(unitCost), skuId: skuId || undefined }],
          }), "Purchase order created.")}>
          Create purchase order
        </button>
      </div>
      <Feedback error={error} ok={ok} />
    </div>
  );
}

export function ReceivePoButton({ billId, warehouses }: { billId: string; warehouses: { id: string; label: string }[] }) {
  const { busy, error, ok, run } = useAction();
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || "");
  return (
    <span style={{ display: "inline-flex", gap: 6 }}>
      <select className="adm-select" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} style={{ maxWidth: 160 }}>
        {warehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
      </select>
      <button className="adm-btn adm-btn-sm" disabled={busy || !warehouseId} data-tip="Mark this delivery as arrived, and add its items to stock in the warehouse you picked."
        onClick={() => run(() => post(`/api/admin/erp/purchasing`, { action: "receive_po", billId, warehouseId }), "Received into stock.")}>
        Receive
      </button>
      <Feedback error={error} ok={ok} />
    </span>
  );
}

// ── Create order ─────────────────────────────────────────────────────────────

export function CreateOrderForm({ variants }: { variants: { id: string; label: string; price: number }[] }) {
  const router = useRouter();
  const { busy, error, ok, run } = useAction();
  const [email, setEmail] = useState("");
  const [method, setMethod] = useState("ship");
  const [skuId, setSkuId] = useState(variants[0]?.id || "");
  const [quantity, setQuantity] = useState("1");
  return (
    <div>
      <div className="adm-grid">
        <div>
          <label className="adm-label">Customer email</label>
          <input className="adm-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@example.com" />
        </div>
        <div>
          <label className="adm-label">Fulfillment method</label>
          <select className="adm-select" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="ship">Ship</option>
            <option value="local_pickup">Local pickup</option>
          </select>
        </div>
        <div>
          <label className="adm-label">Variant (SKU)</label>
          <select className="adm-select" value={skuId} onChange={(e) => setSkuId(e.target.value)}>
            {variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <label className="adm-label">Quantity</label>
          <input className="adm-input" type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <button className="adm-btn" style={{ background: "#0a6400", borderColor: "#0a6400", color: "#fff" }} disabled={busy || !email || !skuId} data-tip="Create this order. It lands in the Orders list just like an order from the shop's website."
          onClick={() => run(async () => {
            const variant = variants.find((v) => v.id === skuId);
            const r = await post(`/api/admin/erp/orders`, {
              customerEmail: email, fulfillmentMethod: method,
              lines: [{ skuId, description: variant?.label || "Manual line", quantity: Number(quantity), unitPrice: variant?.price || 0 }],
            });
            router.push(`/admin/orders/${r.order.id}`);
          }, "Order created.")}>
          Create order
        </button>
      </div>
      <Feedback error={error} ok={ok} />
    </div>
  );
}

export function PrintButton() {
  return (
    <button className="adm-btn fabric-no-print" style={{ background: "#0a6400", borderColor: "#0a6400", color: "#fff" }} onClick={() => window.print()} data-tip="Print the packing slip — the paper that goes inside the parcel so the customer knows what's in the box.">
      Print packing slip
    </button>
  );
}
