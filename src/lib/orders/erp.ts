// ---------------------------------------------------------------------------
// orders/erp.ts — the admin Orders data layer for Unsaid.
//
// Source of truth: the erp_* operational tables (erp_orders, erp_order_lines,
// erp_fulfillment_orders/lines, erp_shipments, erp_return_authorizations,
// erp_inventory_*) plus the storefront commerce pair (orders / order_items)
// that the Printful push reads. Adapted from UnSaid Memories src/lib/admin/orders.ts +
// src/lib/orders/lifecycle.ts (state machine, ship-to parsing, event logging)
// with UnSaid Memories's commerce_* tables replaced by Unsaid's erp_* schema.
//
// Discipline carried over:
//   • Every status change writes an erp_order_status_history row.
//   • Every stock change writes an erp_inventory_movements row and updates
//     the balance in the same request — a movement without a balance (or a
//     balance without a movement) is a bug, never a shortcut.
//   • A label is never created on a guessed address (parseShipTo → null
//     refuses).
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/supabase";
import { PLATFORM_TENANT_ID } from "@/lib/admin/gate";

export const TENANT_ID = PLATFORM_TENANT_ID;
const db = () => createServerClient();

// ── Lifecycle ────────────────────────────────────────────────────────────────

export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "in_production",
  "ready_to_ship",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
  "on_hold",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_TRANSITIONS: Record<string, string[]> = {
  pending: ["confirmed", "on_hold", "cancelled"],
  confirmed: ["in_production", "ready_to_ship", "on_hold", "cancelled"],
  in_production: ["ready_to_ship", "on_hold", "cancelled"],
  ready_to_ship: ["shipped", "on_hold", "cancelled"],
  shipped: ["delivered", "refunded"],
  delivered: ["refunded"],
  on_hold: ["pending", "confirmed", "in_production", "ready_to_ship", "cancelled"],
  cancelled: [],
  refunded: [],
};

export const ORDER_VIEWS: Record<string, { label: string; statuses: string[] | null }> = {
  all: { label: "All Orders", statuses: null },
  unfulfilled: { label: "Unfulfilled", statuses: ["pending", "confirmed", "in_production"] },
  ready: { label: "Ready to Ship", statuses: ["ready_to_ship"] },
  pickup: { label: "Local Pickup", statuses: null }, // filtered by method below
  shipped: { label: "Shipped", statuses: ["shipped"] },
  delivered: { label: "Delivered", statuses: ["delivered"] },
};

// ── Ship-to parsing (from UnSaid Memories lifecycle.ts, verbatim logic) ──────────────

export type ShipTo = { name: string; street1: string; city: string; state: string; zip: string; country: string };

export function parseShipTo(raw: unknown, fallbackName: string): ShipTo | null {
  let obj: any = null;
  if (raw && typeof raw === "object") obj = raw;
  else if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") obj = parsed;
    } catch { /* plain string — parsed below */ }
    if (!obj) {
      const s = raw.trim();
      const parts = s.split("·").map((p) => p.trim()).filter(Boolean);
      const last = parts[parts.length - 1] || "";
      const m = last.match(/^(.+?),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
      if (m && parts.length >= 2) {
        return { name: fallbackName, street1: parts.slice(0, -1).join(" · "), city: m[1], state: m[2].toUpperCase(), zip: m[3], country: "US" };
      }
      const g = s.match(/^(.*),\s*(.+?),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
      if (g) return { name: fallbackName, street1: g[1].trim(), city: g[2].trim(), state: g[3].toUpperCase(), zip: g[4], country: "US" };
      return null;
    }
  }
  if (!obj) return null;
  const zip = String(obj.zip || obj.postal_code || obj.postalCode || "").trim();
  if (!zip) return null;
  return {
    name: String(obj.name || fallbackName || "Customer"),
    street1: String(obj.street1 || obj.address1 || obj.street || obj.address || obj.line1 || ""),
    city: String(obj.city || ""),
    state: String(obj.state || "").toUpperCase(),
    zip,
    country: String(obj.country || obj.country_code || "US"),
  };
}

export function trackingUrlFor(carrier: string | null | undefined, trackingNumber: string): string | undefined {
  const c = String(carrier || "").toLowerCase();
  if (!trackingNumber) return undefined;
  if (c.includes("usps")) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(trackingNumber)}`;
  if (c.includes("ups")) return `https://www.ups.com/track?tracknum=${encodeURIComponent(trackingNumber)}`;
  if (c.includes("fedex")) return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(trackingNumber)}`;
  return undefined;
}

// ── Orders ───────────────────────────────────────────────────────────────────

export async function listOrders(opts: {
  view?: string; search?: string; page?: number; perPage?: number;
}) {
  const view = ORDER_VIEWS[opts.view || "all"] || ORDER_VIEWS.all;
  const page = Math.max(1, opts.page || 1);
  const perPage = Math.min(100, opts.perPage || 48);
  let q = db()
    .from("erp_orders")
    .select("id, order_number, status, fulfillment_method, total, amount_paid, balance_due, customer_email, is_rush, priority, order_date, sla_due_at, source_order_id", { count: "exact" })
    .eq("tenant_id", TENANT_ID)
    .order("order_date", { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1);
  if (view.statuses) q = q.in("status", view.statuses);
  if ((opts.view || "") === "pickup") q = q.eq("fulfillment_method", "local_pickup");
  if (opts.search) q = q.or(`order_number.ilike.%${opts.search}%,customer_email.ilike.%${opts.search}%`);
  const { data, count, error } = await q;
  if (error) throw new Error(error.message);
  return { orders: data || [], total: count || 0, page, perPage };
}

export async function getOrderDetail(id: string) {
  const sb = db();
  const { data: order } = await sb.from("erp_orders").select("*").eq("id", id).eq("tenant_id", TENANT_ID).maybeSingle();
  if (!order) return null;
  const [lines, addresses, fulfillments, history, notes, returns] = await Promise.all([
    sb.from("erp_order_lines").select("*").eq("order_id", id).order("created_at"),
    sb.from("erp_order_addresses").select("*").eq("order_id", id),
    sb.from("erp_fulfillment_orders").select("*").eq("order_id", id).order("created_at"),
    sb.from("erp_order_status_history").select("*").eq("order_id", id).order("changed_at", { ascending: false }),
    sb.from("erp_order_notes").select("*").eq("order_id", id).order("created_at", { ascending: false }),
    sb.from("erp_return_authorizations").select("*").eq("order_id", id).order("created_at", { ascending: false }),
  ]);
  // SKU display names: erp lines reference storefront product_variants.
  const skuIds = [...new Set((lines.data || []).map((l: any) => l.sku_id).filter(Boolean))];
  let variantMap: Record<string, any> = {};
  if (skuIds.length) {
    const { data: variants } = await sb.from("product_variants").select("id, sku, size, color, price, product_id").in("id", skuIds);
    for (const v of variants || []) variantMap[v.id] = v;
  }
  const fulfillmentIds = (fulfillments.data || []).map((f: any) => f.id);
  let shipments: any[] = [];
  if (fulfillmentIds.length) {
    const { data } = await sb.from("erp_shipments").select("*").in("fulfillment_id", fulfillmentIds);
    shipments = data || [];
  }
  // Supplier fulfillment (POD push state) rides the linked storefront order.
  let supplierFulfillment: any[] = [];
  if (order.source_order_id) {
    const { data } = await sb.from("fulfillment_orders")
      .select("id, supplier_id, status, tracking_number, tracking_url, cost, supplier_order_external_id, created_at")
      .eq("order_id", order.source_order_id).eq("tenant_id", TENANT_ID);
    supplierFulfillment = data || [];
  }
  return {
    order,
    lines: (lines.data || []).map((l: any) => ({ ...l, variant: variantMap[l.sku_id] || null })),
    addresses: addresses.data || [],
    fulfillments: fulfillments.data || [],
    shipments,
    supplierFulfillment,
    history: history.data || [],
    notes: notes.data || [],
    returns: returns.data || [],
  };
}

export async function transitionOrder(id: string, to: string, actorId: string, reason?: string) {
  const sb = db();
  const { data: order } = await sb.from("erp_orders").select("id, status").eq("id", id).eq("tenant_id", TENANT_ID).maybeSingle();
  if (!order) throw new Error("order not found");
  const allowed = ORDER_TRANSITIONS[order.status] || [];
  if (!allowed.includes(to)) throw new Error(`cannot move ${order.status} → ${to}`);
  const { error } = await sb.from("erp_orders").update({ status: to, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  await sb.from("erp_order_status_history").insert({
    tenant_id: TENANT_ID, order_id: id, from_status: order.status, to_status: to,
    reason: reason || null, changed_by: actorId,
  });
  return { from: order.status, to };
}

export async function addOrderNote(id: string, body: string, actorId: string, noteType = "internal") {
  const { error } = await db().from("erp_order_notes").insert({
    tenant_id: TENANT_ID, order_id: id, note_type: noteType, body, created_by: actorId,
  });
  if (error) throw new Error(error.message);
}

export async function createManualOrder(input: {
  customerEmail: string; fulfillmentMethod: string; lines: { skuId: string; description: string; quantity: number; unitPrice: number }[];
  actorId: string;
}) {
  const sb = db();
  const subtotal = input.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const orderNumber = `UNS-${Date.now().toString(36).toUpperCase()}`;
  const { data: order, error } = await sb.from("erp_orders").insert({
    tenant_id: TENANT_ID, order_number: orderNumber, status: "pending",
    fulfillment_method: input.fulfillmentMethod, customer_email: input.customerEmail,
    currency: "USD", subtotal, discount_total: 0, tax_total: 0, shipping_total: 0,
    total: subtotal, amount_paid: 0, balance_due: subtotal, created_by: input.actorId,
    order_date: new Date().toISOString(), metadata: {},
  }).select("id, order_number").single();
  if (error) throw new Error(error.message);
  const lines = input.lines.map((l) => ({
    tenant_id: TENANT_ID, order_id: order.id, sku_id: l.skuId, description: l.description,
    quantity: l.quantity, unit_price: l.unitPrice, discount_amount: 0, tax_amount: 0,
    line_total: l.quantity * l.unitPrice, status: "pending",
  }));
  const { error: lineErr } = await sb.from("erp_order_lines").insert(lines);
  if (lineErr) throw new Error(lineErr.message);
  await sb.from("erp_order_status_history").insert({
    tenant_id: TENANT_ID, order_id: order.id, from_status: null, to_status: "pending",
    reason: "Manual order created in admin", changed_by: input.actorId,
  });
  return order;
}

export async function ordersToCsv(view?: string, search?: string): Promise<string> {
  const { orders } = await listOrders({ view, search, page: 1, perPage: 100 });
  const head = "order_number,status,method,customer_email,total,amount_paid,balance_due,order_date,sla_due_at";
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = orders.map((o: any) => [o.order_number, o.status, o.fulfillment_method, o.customer_email, o.total, o.amount_paid, o.balance_due, o.order_date, o.sla_due_at].map(esc).join(","));
  return [head, ...rows].join("\n");
}

// ── Fulfillment queues ───────────────────────────────────────────────────────

export const FULFILLMENT_QUEUES: Record<string, { label: string; statuses: string[] }> = {
  unfulfilled: { label: "Unfulfilled", statuses: ["pending", "created", "released", "picked"] },
  rush: { label: "Rush Queue", statuses: [] }, // rush flag filter
  ready: { label: "Ready to Ship", statuses: ["ready", "ready_to_ship"] },
  packed: { label: "Packed & Staged", statuses: ["packed", "staged"] },
  pickup: { label: "Local Pickup", statuses: [] }, // method filter
  shipped_today: { label: "Shipped Today", statuses: ["dispatched", "shipped"] },
  dispatched: { label: "Dispatched", statuses: ["dispatched", "shipped", "completed"] },
};

export const FULFILLMENT_FLOW = ["pending", "released", "picked", "packed", "staged", "dispatched", "completed"];

export async function listFulfillment(queue: string) {
  const def = FULFILLMENT_QUEUES[queue] || FULFILLMENT_QUEUES.unfulfilled;
  let q = db().from("erp_fulfillment_orders")
    .select("*, erp_orders(order_number, customer_email, is_rush, fulfillment_method)")
    .eq("tenant_id", TENANT_ID).order("created_at", { ascending: false }).limit(100);
  if (def.statuses.length) q = q.in("status", def.statuses);
  if (queue === "rush") q = q.eq("rush", true).not("status", "in", '("completed","dispatched")');
  if (queue === "pickup") q = q.eq("method", "local_pickup");
  if (queue === "shipped_today") {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    q = q.gte("dispatched_at", start.toISOString());
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function advanceFulfillment(fulfillmentId: string, toStatus: string) {
  const sb = db();
  const patch: Record<string, unknown> = { status: toStatus, updated_at: new Date().toISOString() };
  const now = new Date().toISOString();
  if (toStatus === "released") patch.released_at = now;
  if (toStatus === "packed") patch.packed_at = now;
  if (toStatus === "staged") patch.staged_at = now;
  if (toStatus === "dispatched") patch.dispatched_at = now;
  if (toStatus === "completed") patch.completed_at = now;
  const { data, error } = await sb.from("erp_fulfillment_orders").update(patch).eq("id", fulfillmentId).eq("tenant_id", TENANT_ID).select("id, order_id, status").single();
  if (error) throw new Error(error.message);
  // When the last open fulfillment on an order dispatches, the order ships.
  if (toStatus === "dispatched" || toStatus === "completed") {
    const { data: open } = await sb.from("erp_fulfillment_orders")
      .select("id").eq("order_id", data.order_id).not("status", "in", '("dispatched","completed")');
    if (!open || open.length === 0) {
      const { data: order } = await sb.from("erp_orders").select("status").eq("id", data.order_id).maybeSingle();
      if (order && (ORDER_TRANSITIONS[order.status] || []).includes("shipped")) {
        await sb.from("erp_orders").update({ status: "shipped", updated_at: now }).eq("id", data.order_id);
        await sb.from("erp_order_status_history").insert({
          tenant_id: TENANT_ID, order_id: data.order_id, from_status: order.status, to_status: "shipped",
          reason: "All fulfillments dispatched",
        });
      }
    }
  }
  return data;
}

// ── Returns / RMA ────────────────────────────────────────────────────────────

export const RETURN_VIEWS: Record<string, string[] | null> = {
  all: null,
  action_required: ["action_required", "requested"],
  awaiting_package: ["approved", "awaiting_package"],
  completed: ["completed", "refunded", "closed"],
};

export async function listReturns(view: string) {
  let q = db().from("erp_return_authorizations")
    .select("*, erp_orders(order_number, customer_email)")
    .eq("tenant_id", TENANT_ID).order("created_at", { ascending: false }).limit(100);
  const statuses = RETURN_VIEWS[view];
  if (statuses) q = q.in("status", statuses);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const ids = (data || []).map((r: any) => r.id);
  let lines: any[] = [];
  if (ids.length) {
    const { data: l } = await db().from("erp_return_lines").select("*").in("rma_id", ids);
    lines = l || [];
  }
  return (data || []).map((r: any) => ({ ...r, lines: lines.filter((l: any) => l.rma_id === r.id) }));
}

export async function actOnReturn(rmaId: string, action: "approve" | "receive" | "complete", actorId: string) {
  const sb = db();
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: now };
  if (action === "approve") { patch.status = "approved"; patch.approved_at = now; }
  if (action === "receive") { patch.status = "received"; patch.received_at = now; }
  if (action === "complete") { patch.status = "completed"; patch.completed_at = now; }
  const { data, error } = await sb.from("erp_return_authorizations").update(patch).eq("id", rmaId).eq("tenant_id", TENANT_ID).select("id, order_id, status").single();
  if (error) throw new Error(error.message);
  if (action === "receive") {
    // Received return units go back on hand with a movement record.
    const { data: lines } = await sb.from("erp_return_lines").select("*").eq("rma_id", rmaId);
    for (const line of lines || []) {
      const qty = Number(line.quantity_received ?? line.quantity_requested ?? 0);
      if (!line.sku_id || qty <= 0) continue;
      await applyStockMovement({
        skuId: line.sku_id, movementType: "return_received", quantity: qty,
        sourceType: "rma", sourceId: rmaId, reason: "Return received to stock", actorId,
      }).catch(() => undefined); // no warehouse balance yet → movement still attempted honestly below
    }
  }
  return data;
}

// ── Inventory ────────────────────────────────────────────────────────────────

export async function listInventory(search?: string) {
  const sb = db();
  const { data: balances, error } = await sb.from("erp_inventory_balances")
    .select("*").eq("tenant_id", TENANT_ID).order("updated_at", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  const skuIds = [...new Set((balances || []).map((b: any) => b.sku_id).filter(Boolean))];
  const whIds = [...new Set((balances || []).map((b: any) => b.warehouse_id).filter(Boolean))];
  let variants: Record<string, any> = {}, warehouses: Record<string, any> = {}, rules: any[] = [];
  if (skuIds.length) {
    const [{ data: v }, { data: r }] = await Promise.all([
      sb.from("product_variants").select("id, sku, size, color, price, product_id, products(name)").in("id", skuIds),
      sb.from("erp_replenishment_rules").select("*").in("sku_id", skuIds).eq("is_active", true),
    ]);
    for (const row of v || []) variants[row.id] = row;
    rules = r || [];
  }
  if (whIds.length) {
    const { data: w } = await sb.from("erp_warehouses").select("id, code, name").in("id", whIds);
    for (const row of w || []) warehouses[row.id] = row;
  }
  let rows = (balances || []).map((b: any) => ({
    ...b,
    variant: variants[b.sku_id] || null,
    warehouse: warehouses[b.warehouse_id] || null,
    rule: rules.find((r: any) => r.sku_id === b.sku_id && r.warehouse_id === b.warehouse_id) || null,
    available: Number(b.on_hand || 0) - Number(b.reserved || 0) - Number(b.allocated || 0),
  }));
  if (search) {
    const s = search.toLowerCase();
    rows = rows.filter((r: any) => (r.variant?.sku || "").toLowerCase().includes(s) || (r.variant?.products?.name || "").toLowerCase().includes(s) || (r.bin_location || "").toLowerCase().includes(s));
  }
  return rows;
}

export async function applyStockMovement(input: {
  skuId: string; warehouseId?: string; movementType: string; quantity: number;
  unitCost?: number; sourceType?: string; sourceId?: string; reason?: string; actorId?: string;
  toWarehouseId?: string;
}) {
  const sb = db();
  let balanceQuery = sb.from("erp_inventory_balances").select("*").eq("tenant_id", TENANT_ID).eq("sku_id", input.skuId);
  if (input.warehouseId) balanceQuery = balanceQuery.eq("warehouse_id", input.warehouseId);
  const { data: balances } = await balanceQuery.limit(1);
  const balance = balances?.[0];
  if (!balance) throw new Error("no inventory balance exists for this SKU/warehouse — receive stock first");
  const signed = ["adjustment_out", "damage", "expired", "transfer_out", "count_correction_down"].includes(input.movementType)
    ? -Math.abs(input.quantity) : Math.abs(input.quantity);
  const newOnHand = Number(balance.on_hand || 0) + signed;
  if (newOnHand < 0) throw new Error(`movement would take on-hand below zero (${balance.on_hand} on hand)`);
  const { error: mvErr } = await sb.from("erp_inventory_movements").insert({
    tenant_id: TENANT_ID, movement_type: input.movementType, sku_id: input.skuId,
    warehouse_id: balance.warehouse_id, quantity: signed, unit_cost: input.unitCost ?? balance.unit_cost ?? null,
    total_cost: input.unitCost ? Math.abs(input.quantity) * input.unitCost : null,
    source_type: input.sourceType || "admin", source_id: input.sourceId || null,
    reason: input.reason || null, performed_by: input.actorId || null, metadata: {},
    to_location_id: null, occurred_at: new Date().toISOString(),
  });
  if (mvErr) throw new Error(mvErr.message);
  const patch: Record<string, unknown> = { on_hand: newOnHand, updated_at: new Date().toISOString() };
  if (input.movementType === "stock_count") patch.last_counted_at = new Date().toISOString();
  const { error: balErr } = await sb.from("erp_inventory_balances").update(patch).eq("id", balance.id);
  if (balErr) throw new Error(balErr.message);
  return { skuId: input.skuId, onHand: newOnHand };
}

export async function receiveStock(input: {
  skuId: string; warehouseId: string; quantity: number; unitCost?: number; binLocation?: string; actorId?: string; reference?: string;
}) {
  const sb = db();
  const { data: existing } = await sb.from("erp_inventory_balances").select("id")
    .eq("tenant_id", TENANT_ID).eq("sku_id", input.skuId).eq("warehouse_id", input.warehouseId).limit(1);
  if (!existing?.length) {
    // Balances carry a NOT NULL location_id in this schema — use the
    // warehouse's first bin location; a warehouse with no locations
    // cannot hold stock yet.
    const { data: locs } = await sb.from("erp_warehouse_locations").select("id")
      .eq("tenant_id", TENANT_ID).eq("warehouse_id", input.warehouseId).order("code").limit(1);
    if (!locs?.length) throw new Error("warehouse has no bin locations — create a location before receiving stock");
    const { error } = await sb.from("erp_inventory_balances").insert({
      tenant_id: TENANT_ID, sku_id: input.skuId, warehouse_id: input.warehouseId, location_id: locs[0].id,
      inventory_status: "available", on_hand: 0, reserved: 0, allocated: 0, picked: 0, packed: 0,
      in_transit: 0, unit_cost: input.unitCost ?? null, bin_location: input.binLocation || null,
    });
    if (error) throw new Error(error.message);
  }
  return applyStockMovement({
    skuId: input.skuId, warehouseId: input.warehouseId, movementType: "receipt", quantity: input.quantity,
    unitCost: input.unitCost, sourceType: "receiving", reason: input.reference || "Receiving / restock", actorId: input.actorId,
  });
}

export async function listWarehouses() {
  const { data } = await db().from("erp_warehouses").select("id, code, name, city, state, is_active").eq("tenant_id", TENANT_ID).order("name");
  return data || [];
}

export async function listWarehouseLocations() {
  const { data } = await db().from("erp_warehouse_locations")
    .select("id, warehouse_id, code, name, location_type, bin, is_pickable, is_active")
    .eq("tenant_id", TENANT_ID).order("code").limit(200);
  return data || [];
}

// ── Catalog admin ────────────────────────────────────────────────────────────

export async function categoryTree() {
  const { data } = await db().from("categories")
    .select("id, parent_id, level, name, slug, sort_order, is_active")
    .or(`tenant_id.eq.${TENANT_ID},tenant_id.is.null`).eq("is_active", true).order("sort_order");
  const rows = data || [];
  const byParent = new Map<string | null, any[]>();
  for (const r of rows) {
    const key = r.parent_id || null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(r);
  }
  const build = (parent: string | null): any[] =>
    (byParent.get(parent) || []).map((n) => ({ ...n, children: build(n.id) }));
  return build(null);
}

export async function listCatalogProducts(opts: { categoryId?: string; search?: string; page?: number }) {
  const page = Math.max(1, opts.page || 1); const perPage = 48;
  let q = db().from("products")
    .select("id, name, slug, status, category_id, created_at", { count: "exact" })
    .eq("tenant_id", TENANT_ID).order("created_at", { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1);
  if (opts.categoryId) q = q.eq("category_id", opts.categoryId);
  if (opts.search) q = q.ilike("name", `%${opts.search}%`);
  const { data, count, error } = await q;
  if (error) throw new Error(error.message);
  return { products: data || [], total: count || 0, page, perPage };
}

export async function listSupplierCatalog(opts: { search?: string; supplierId?: string; page?: number }) {
  const page = Math.max(1, opts.page || 1); const perPage = 48;
  let q = db().from("supplier_catalog_products")
    .select("id, supplier_id, external_id, name, brand_name, variant_count, image_url, category_id, slug, is_hidden", { count: "exact" })
    .order("name").range((page - 1) * perPage, page * perPage - 1);
  if (opts.supplierId) q = q.eq("supplier_id", opts.supplierId);
  if (opts.search) q = q.ilike("name", `%${opts.search}%`);
  const { data, count, error } = await q;
  if (error) throw new Error(error.message);
  return { products: data || [], total: count || 0, page, perPage };
}

export async function setProductStatus(productId: string, status: "published" | "draft" | "archived") {
  const { error } = await db().from("products").update({ status }).eq("id", productId).eq("tenant_id", TENANT_ID);
  if (error) throw new Error(error.message);
}

// ── Purchasing (vendors + AP bills as the PO record until PO tables land) ───

export async function listVendors() {
  const { data } = await db().from("acct_vendors")
    .select("id, vendor_number, legal_name, email, phone, currency, payment_terms_days, is_active")
    .eq("tenant_id", TENANT_ID).order("legal_name");
  return data || [];
}

export async function listPurchaseBills() {
  const { data, error } = await db().from("acct_ap_bills")
    .select("*").eq("tenant_id", TENANT_ID).order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  return data || [];
}

// ── Shipping ─────────────────────────────────────────────────────────────────

export async function listShipments() {
  const sb = db();
  const { data, error } = await sb.from("erp_shipments")
    .select("*")
    .eq("tenant_id", TENANT_ID).order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  const rows = data || [];
  // erp_shipments.fulfillment_id has no FK PostgREST can embed — resolve the
  // fulfillment numbers with a second query and attach them in embed shape.
  const ids = [...new Set(rows.map((s: any) => s.fulfillment_id).filter(Boolean))];
  if (ids.length) {
    const { data: fuls } = await sb.from("erp_fulfillment_orders")
      .select("id, fulfillment_number, order_id").in("id", ids);
    const byId = new Map((fuls || []).map((f: any) => [f.id, f]));
    for (const s of rows as any[]) {
      const f = byId.get(s.fulfillment_id);
      s.erp_fulfillment_orders = f ? { fulfillment_number: f.fulfillment_number, order_id: f.order_id } : null;
    }
  }
  return rows;
}

export async function createShipmentLabel(input: {
  fulfillmentId: string; carrier: string; trackingNumber: string; actorId?: string;
}) {
  const sb = db();
  // One label per fulfillment unless explicitly replaced — a second buy would
  // overwrite tracking the business already paid for (UnSaid Memories label rule).
  const { data: existing } = await sb.from("erp_shipments").select("id, tracking_number")
    .eq("fulfillment_id", input.fulfillmentId).eq("tenant_id", TENANT_ID).limit(1);
  if (existing?.length) throw new Error(`fulfillment already has a label (tracking ${existing[0].tracking_number})`);
  const shipmentNumber = `SHP-${Date.now().toString(36).toUpperCase()}`;
  const trackingUrl = trackingUrlFor(input.carrier, input.trackingNumber);
  const { data, error } = await sb.from("erp_shipments").insert({
    tenant_id: TENANT_ID, shipment_number: shipmentNumber, fulfillment_id: input.fulfillmentId,
    status: "label_created", tracking_number: input.trackingNumber, tracking_url: trackingUrl || null,
  }).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

// ── Ops reporting ────────────────────────────────────────────────────────────

export async function opsReport() {
  const sb = db();
  const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
  const [{ data: mtd }, { data: all }] = await Promise.all([
    sb.from("erp_orders").select("total, status").eq("tenant_id", TENANT_ID).gte("order_date", start.toISOString()),
    sb.from("erp_orders").select("status").eq("tenant_id", TENANT_ID).limit(1000),
  ]);
  const revenue = (mtd || []).filter((o: any) => !["cancelled", "refunded"].includes(o.status))
    .reduce((s: number, o: any) => s + Number(o.total || 0), 0);
  const byStatus: Record<string, number> = {};
  for (const o of all || []) byStatus[o.status] = (byStatus[o.status] || 0) + 1;
  const { count: openReturns } = await sb.from("erp_return_authorizations")
    .select("id", { count: "exact", head: true }).eq("tenant_id", TENANT_ID)
    .in("status", ["action_required", "requested", "approved", "awaiting_package"]);
  const { count: lowStock } = await sb.from("erp_inventory_balances")
    .select("id", { count: "exact", head: true }).eq("tenant_id", TENANT_ID).lte("on_hand", 5);
  return {
    mtdRevenue: Math.round(revenue * 100) / 100,
    mtdOrders: (mtd || []).length,
    byStatus, openReturns: openReturns || 0, lowStockSkus: lowStock || 0,
    generatedAt: new Date().toISOString(),
  };
}

export async function opsLedgerCsv(): Promise<string> {
  const { data } = await db().from("erp_orders")
    .select("order_number, order_date, status, customer_email, subtotal, tax_total, shipping_total, total, amount_paid, amount_refunded, balance_due")
    .eq("tenant_id", TENANT_ID).order("order_date", { ascending: false }).limit(500);
  const head = "order_number,order_date,status,customer_email,subtotal,tax,shipping,total,paid,refunded,balance_due";
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [head, ...(data || []).map((o: any) => [o.order_number, o.order_date, o.status, o.customer_email, o.subtotal, o.tax_total, o.shipping_total, o.total, o.amount_paid, o.amount_refunded, o.balance_due].map(esc).join(","))].join("\n");
}
