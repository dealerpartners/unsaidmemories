// ---------------------------------------------------------------------------
// /api/admin/commerce/actions/route.ts
//
// Commerce / inventory / purchase orders / fulfillment / coupons quick
// actions. Each handler:
//   1. Strips the FIRST module prefix (accts_* / apt_* / crm_* / fulfill_*
//      / order_* / po_*) so the case keys match the registry.
//   2. Performs a real transactional write.
//   3. Appends a row to commerce_audit_log / erp_audit_log.
//   4. Returns structured JSON for TanStack cache invalidation.
//
// CRITICAL FIX vs previous version: every stub case key was the LAST
// underscore-segment of the registry code (e.g. `case 'coupons'` for
// `accts_register_coupons`). The prefix-stripping regex `^[a-z]+_` only
// strips the FIRST run, so `accts_register_coupons` becomes
// `register_coupons`, NOT `coupons`. Every "short" stub case was dead
// code. This rewrite uses the correct prefix-stripped names.
//
// Also fixed real-handler bugs:
//   - erp_inventory_movements.movement_type CHECK enum: 'receipt' invalid
//     (use 'purchase_receipt'); metadata jsonb is NOT NULL
//   - erp_purchase_orders.status CHECK enum: 'ordered' invalid
//     (use 'sent' for new POs, 'received' for receipts); subtotal/tax_total/
//     shipping_total/total are NOT NULL
//   - commerce_inventory_events has no `reference` or `occurred_at` columns
//     (use `payload` jsonb and rely on `created_at` default)
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { guardPayloadIds, guardRequiredFields } from "@/lib/quick-actions/validate";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { getPg, pgExec, pgQuery } from "@/lib/pg";
import { auditAction, getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { existingOrderLabel, loadOrder, logOrderEvent, parseShipTo } from "@/lib/orders/lifecycle";
import { rollupSplitParentFulfillmentSafe } from "@/lib/sellers/order-split";
import type { ShippoLabel } from "@/lib/shippo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cheap UUID shape check — used to coerce non-UUID business keys (e.g.
 * "PAY-AB12", "order-test-1") to NULL for tables whose entity_id column
 * is UUID-typed. */
function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

type LabelPurchaseResult =
  | { ok: true; status: 200; body: Record<string, unknown> }
  | { ok: false; status: number; body: Record<string, unknown> };

// ── Per-location stock helpers (20261021_per_location_stock) ─────────────
// Stock truth is the movement ledger, derivable per (sku, warehouse, bin)
// via public.erp_stock_levels. Every inventory write names a warehouse
// (default: the tenant's MAIN) and a bin (default: the warehouse's DEFAULT
// location row). erp_inventory_balances is a projection of that view —
// refreshed best-effort after writes; the view is always the truth.
async function resolveTenantWarehouse(
  tenant: string,
  warehouseId?: string | null,
): Promise<string | null> {
  if (warehouseId) {
    const rows = await pgQuery<{ id: string }>(
      `SELECT id::text AS id FROM public.erp_warehouses
        WHERE id = $1::uuid AND tenant_id = $2 AND is_active`,
      [warehouseId, tenant],
    );
    return rows[0]?.id ?? null;
  }
  const rows = await pgQuery<{ id: string }>(
    `SELECT id::text AS id FROM public.erp_warehouses
      WHERE tenant_id = $1 AND is_active
      ORDER BY (code = 'MAIN') DESC, created_at LIMIT 1`,
    [tenant],
  );
  return rows[0]?.id ?? null;
}

async function resolveWarehouseBin(
  tenant: string,
  warehouseId: string,
  locationId?: string | null,
): Promise<string | null> {
  if (locationId) {
    const rows = await pgQuery<{ id: string }>(
      `SELECT id::text AS id FROM public.erp_warehouse_locations
        WHERE id = $1::uuid AND tenant_id = $2 AND warehouse_id = $3::uuid AND is_active`,
      [locationId, tenant, warehouseId],
    );
    return rows[0]?.id ?? null;
  }
  const rows = await pgQuery<{ id: string }>(
    `SELECT id::text AS id FROM public.erp_warehouse_locations
      WHERE tenant_id = $1 AND warehouse_id = $2::uuid AND code = 'DEFAULT' AND is_active
      LIMIT 1`,
    [tenant, warehouseId],
  );
  return rows[0]?.id ?? null;
}

/** Derived on-hand for one SKU at one warehouse (all bins), from the view. */
async function stockOnHandAt(
  tenant: string,
  skuId: string,
  warehouseId: string,
): Promise<number> {
  const rows = await pgQuery<{ qty: string }>(
    `SELECT COALESCE(SUM(on_hand), 0)::text AS qty FROM public.erp_stock_levels
      WHERE tenant_id = $1 AND sku_id = $2::uuid AND warehouse_id = $3::uuid`,
    [tenant, skuId, warehouseId],
  );
  return Number(rows[0]?.qty ?? 0) || 0;
}

/** Best-effort projection refresh for one (sku, warehouse) cell. */
async function refreshStockProjection(
  tenant: string,
  skuId: string,
  warehouseId: string,
): Promise<void> {
  await pgExec(
    `SELECT public.erp_rebuild_stock_balances($1::uuid, $2::uuid, $3::uuid)`,
    [tenant, skuId, warehouseId],
  );
}

// The orders lifecycle helpers (loadOrder / logOrderEvent) take a minimal
// { query } client. pgQuery matches that contract — it never throws
// (failures surface as []), and the helpers are built for exactly that:
// an empty load reads as "not found", a failed event insert is non-fatal.
const pgLifecycleClient = {
  query: async (sql: string, params?: unknown[]) => ({
    rows: await pgQuery(sql, params ?? []),
  }),
};

/**
 * Shared real label purchase — used by both `shipping_label` and `postage`.
 * Purchases a REAL carrier label via Shippo or direct USPS. Honest
 * "not configured" states when no API key — never fakes a label.
 */
async function purchaseShippingLabel(opts: {
  orderId: string;
  payload: Record<string, unknown>;
  action: string;
  actorId: string | null;
  ip: string | null;
  tenant: string;
}): Promise<LabelPurchaseResult> {
  const { orderId, payload, action, actorId, ip, tenant } = opts;

  // Load the order through the SAME helper the order-screen label endpoint
  // (POST /api/admin/orders/[id]/label) uses — it resolves the customer
  // from both customer stores and compares the TEXT order id as text.
  // (The previous inline SELECT named a nonexistent customer_name column
  // and compared id = $::uuid against the TEXT id — both error against the
  // live schema, pgQuery swallowed them, and every call 404'd.)
  const order = await loadOrder(pgLifecycleClient, tenant, orderId);
  if (!order) {
    return { ok: false, status: 404, body: { error: "Order not found" } };
  }

  // Double-buy guard — the same rule the order-screen label endpoint
  // enforces (POST /api/admin/orders/[id]/label): an order that already
  // carries a tracking number is refused BEFORE any purchase, because a
  // second buy would silently overwrite the label already paid for. The
  // one deliberate exception is replace: true in the payload; the
  // replacement is then noted in the fulfillment event below.
  const replace = payload.replace === true;
  const existingLabel = existingOrderLabel(order);
  if (existingLabel && !replace) {
    return {
      ok: false, status: 409,
      body: {
        ok: false, error: "order_already_labeled",
        message: `Order already has a ${existingLabel.carrier || "carrier"} label (tracking ${existingLabel.trackingNumber}). Buying another label would replace it — include replace: true in the payload to buy a replacement label deliberately.`,
        carrier: existingLabel.carrier, trackingNumber: existingLabel.trackingNumber,
      },
    };
  }

  // Parse the ship-to with the shared parser — stored addresses are usually
  // the plain shop-checkout string ("1486 Charles St · Memphis, TN 38141"),
  // sometimes JSON. No recoverable ZIP → refuse below, never guess.
  const to = parseShipTo(
    order.shipping_address,
    order.customer_name || order.customer_email_resolved || "Customer",
  );

  if (!to || !to.zip) {
    return {
      ok: false, status: 400,
      body: { ok: false, error: "no_shipping_address", message: "Order has no usable shipping address — cannot purchase a label." },
    };
  }

  const weightLb = Number(payload.weight_lb) || 2;
  const carrier = payload.carrier ? String(payload.carrier) : undefined;
  // Carrier switcher: explicit per-request override wins, then the admin
  // default (app_settings shipping.label_provider), then shippo.
  const { getShippingSettings } = await import("@/lib/shipping/settings");
  const requestedProvider = String(payload.label_provider || "").toLowerCase();
  const labelProvider: "shippo" | "usps" =
    requestedProvider === "usps" || requestedProvider === "shippo"
      ? requestedProvider
      : (await getShippingSettings()).defaultProvider;

  // Normalized label shape across providers.
  type LabelOut = {
    labelUrl: string; trackingNumber: string; trackingUrl?: string;
    provider: string; service: string; rateCents: number;
    testMode?: boolean; simulated?: boolean;
  };
  let label: LabelOut;

  if (labelProvider === "usps") {
    // Direct USPS API path (owner's own USPS API codes) — bypasses Shippo.
    let usps: import("@/lib/shipping/usps-client").UspsLabelResult | null;
    try {
      const { createShippingLabel } = await import("@/lib/shipping/usps-client");
      usps = await createShippingLabel({
        toName: to.name,
        toAddress1: to.street1,
        toCity: to.city,
        toState: to.state,
        toZIP: to.zip,
        weight: Math.round(Math.max(1, weightLb * 16)), // ounces
        orderId, // return address resolves to the order's seller / house tenant
      });
    } catch (e: any) {
      if (e?.name === "ReturnAddressError") {
        return { ok: false, status: 422, body: { ok: false, error: "return_address_not_set", message: String(e.message) } };
      }
      return { ok: false, status: 502, body: { ok: false, error: String(e?.message || "usps_label_failed") } };
    }
    if (!usps) {
      return {
        ok: false, status: 503,
        body: { ok: false, error: "usps_not_configured", message: "USPS is not configured — add USPS API credentials in Admin → Settings → Shipping." },
      };
    }
    if (usps.simulated) {
      // A simulated label carries an invented tracking number — it is a
      // FAILED purchase, never a success, and nothing is saved (same rule
      // as the order-screen label endpoint). createShippingLabel no longer
      // simulates at all; this branch stays as a defensive guard.
      return {
        ok: false, status: 422,
        body: { ok: false, error: "label_unavailable", message: "USPS could not issue a real label for this order. Nothing was saved." },
      };
    }
    label = {
      labelUrl: usps.labelUrl, trackingNumber: usps.trackingNumber,
      provider: "USPS", service: usps.mailClass,
      rateCents: Math.round(Number(usps.postage || 0) * 100),
    };
  } else {
    // Shippo path — purchases a REAL carrier label. Honest "not configured"
    // state when no API key — never fakes a label.
    let shippoLabel: ShippoLabel;
    try {
      const { shippoBuyLabel } = await import("@/lib/shippo");
      shippoLabel = await shippoBuyLabel({
        to: { ...to, email: order.customer_email_resolved || undefined },
        weightLb, carrier,
        orderId, // return address resolves to the order's seller / house tenant
      });
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (msg === "shippo_not_configured") {
        return {
          ok: false, status: 503,
          body: { ok: false, error: "shippo_not_configured", message: "Shipping is not configured — set a Shippo API key in Admin → Settings → Shipping." },
        };
      }
      if (e?.name === "ReturnAddressError") {
        return { ok: false, status: 422, body: { ok: false, error: "return_address_not_set", message: msg } };
      }
      return { ok: false, status: 502, body: { ok: false, error: msg || "label purchase failed" } };
    }
    label = { ...shippoLabel };
  }

  // Persist ONLY the real label — the exact shape the order-screen label
  // endpoint uses: tracking + carrier + metadata stamps on the order, the
  // label record, and the fulfillment event. (commerce_orders has NO
  // shipping_label_generated_at column — the stamp lives in metadata — and
  // the old UPDATE also compared the TEXT id to $::uuid, so it errored on
  // every call; pgExec swallowed it and the action reported success while
  // saving NO tracking.)
  // The order UPDATE is CHECKED: the label is already bought at this point,
  // so a failed save surfaces loudly — with the tracking number, so the
  // purchase can be recovered — instead of a silent success.
  const orderUpdated = await pgExec(
    `UPDATE public.commerce_orders
        SET tracking_number = $2, carrier = $3,
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
              'label_purchased_at', now()::text,
              'label_provider', $4::text,
              'label_test_mode', $5::boolean),
            updated_at = now()
      WHERE id::text = $1 AND tenant_id = $6`,
    [orderId, label.trackingNumber, label.provider, label.provider, !!label.testMode, tenant],
  );
  if (orderUpdated === 0) {
    return {
      ok: false, status: 500,
      body: {
        ok: false, error: "label_purchased_not_saved",
        message: `A ${label.provider} label was purchased (tracking ${label.trackingNumber}) but could not be saved on order ${orderId}. Do NOT buy another label — record this tracking number on the order manually.`,
        label: { trackingNumber: label.trackingNumber, provider: label.provider, labelUrl: label.labelUrl },
      },
    };
  }
  const labelRowSaved = await pgExec(
    `INSERT INTO public.commerce_shipping_labels
       (tenant_id, carrier, tracking_number, label_type, label_uri, postage_amount, created_at)
     VALUES ($1, $2, $3, 'shipping', $4, $5, now())`,
    [tenant, label.provider, label.trackingNumber, label.labelUrl || null, label.rateCents / 100],
  );
  if (labelRowSaved === 0) {
    console.error("[commerce/actions shipping_label] label row insert failed (non-fatal)");
  }
  await logOrderEvent(pgLifecycleClient, tenant, orderId, "label_purchased",
    String(order.fulfillment_status || "pending"), String(order.fulfillment_status || "pending"),
    {
      carrier: label.provider, trackingNumber: label.trackingNumber,
      service: label.service, rateCents: label.rateCents, testMode: !!label.testMode,
      // A deliberate replacement (replace: true) names the label it
      // replaced, so the order's history shows both tracking numbers.
      ...(existingLabel
        ? { replaced: true, replacedCarrier: existingLabel.carrier, replacedTrackingNumber: existingLabel.trackingNumber }
        : {}),
    });
  await auditAction({ action, domain: "commerce", tableName: "commerce_orders", recordId: orderId, afterData: { trackingNumber: label.trackingNumber, provider: label.provider }, actorUserId: actorId, ipAddress: ip });
  return {
    ok: true, status: 200,
    body: {
      ok: true, orderId,
      label: {
        labelUrl: label.labelUrl,
        trackingNumber: label.trackingNumber,
        trackingUrl: label.trackingUrl || "",
        provider: label.provider,
        service: label.service,
        rateCents: label.rateCents,
        testMode: label.testMode || false,
        simulated: label.simulated || false,
        labelProvider,
      },
    },
  };
}

export async function POST(req: NextRequest) {
  const tenant = resolveTenantId(req);
  const gate = await requireModuleApi("products_services", "write");
  if (gate) return gate;

  let action = "";
  let payload: Record<string, unknown> = {};
  let actorId: string | null = null;
  let ip: string | null = null;

  try {
    const body = await req.json();
    action = String(body.action || "");
    payload = body.payload ?? body;
    delete (payload as Record<string, unknown>).action;
    const idGuard = guardPayloadIds(payload);
    if (idGuard) return idGuard;
    const reqGuard = guardRequiredFields(action, payload);
    if (reqGuard) return reqGuard;
    actorId = await getActorIdFromRequest(req);
    ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  } catch (e) {
    return NextResponse.json({ error: `Invalid request body: ${e instanceof Error ? e.message : "unknown"}` }, { status: 400 });
  }

  // Palette alias: registry reg-discounts → "discounts"; the handler below is
  // register_discounts (the name the useActions hooks send).
  const strippedAction = action.replace(/^[a-z]+_/, "");
  const shortAction = strippedAction === "discounts" ? "register_discounts" : strippedAction;

  try {
    switch (shortAction) {
      // ───────────────────────────────────────────────────────────────────
      // INVENTORY handlers
      // ───────────────────────────────────────────────────────────────────

      case "restock_inventory":
      case "add_inventory":
      case "restock": {
        // inv_restock_inventory / apt_add_inventory
        // ALSO accept "restock" (frontend registry ID `order-restock`
        // prefix-strips `order_` → `restock`).
        // INSERT a new inventory movement (purchase receipt or adjustment).
        // CHECK constraint: movement_type IN (erp_inventory_movement_type)
        // We accept 'receive' | 'purchase_receipt' | 'adjustment' from the
        // caller and default to 'purchase_receipt'.
        const VALID_MOVEMENT = new Set([
          "opening","purchase_receipt","sale","return","transfer","adjustment",
          "damage","scrap","count_adjustment","reservation","reservation_release",
          "allocation","deallocation","pick","unpick","pack","unpack","ship",
          "receive","putaway","cycle_count","reclassification","cost_adjustment",
        ]);
        let movementType = String(payload.movement_type || "purchase_receipt");
        if (!VALID_MOVEMENT.has(movementType)) movementType = "purchase_receipt";
        // Per-location stock: every movement names a warehouse (default
        // the tenant's MAIN) and a bin (default the warehouse's DEFAULT
        // location), so the per-location derivation sees every write.
        const warehouseId = await resolveTenantWarehouse(
          tenant,
          payload.warehouse_id ? String(payload.warehouse_id) : null,
        );
        if (!warehouseId) {
          return NextResponse.json({ ok: false, error: "No active warehouse found for this store — a stock movement needs a warehouse" }, { status: 400 });
        }
        const binId = await resolveWarehouseBin(
          tenant,
          warehouseId,
          payload.location_id ? String(payload.location_id) : null,
        );
        const quantity = Number(payload.quantity || 0);
        const unitCost = Number(payload.unit_cost ?? payload.cost ?? 0);
        const reason = payload.reason ? String(payload.reason) : "manual_restock";
        const reference = payload.reference ? String(payload.reference) : null;
        if (!quantity) {
          return NextResponse.json({ ok: false, error: "A quantity is required to record an inventory movement" }, { status: 400 });
        }
        if (movementType === "purchase_receipt" && quantity < 0) {
          return NextResponse.json({ ok: false, error: "Restock quantity must be positive — use an adjustment movement to remove stock" }, { status: 400 });
        }
        // Resolve the SKU. Callers send different keys: the palette hooks
        // send sku_id; the Inventory tabs and the Orders page prompt send
        // product_id (a catalog item id) or a typed SKU code. All three
        // resolve against erp_product_skus — the movement's sku_id is a
        // FK-shaped uuid into that table, and an unresolved key used to
        // die on the ::uuid cast and surface as a generic 500.
        const rawKey = String(payload.sku_id || payload.product_id || payload.sku || "").trim();
        if (!rawKey) {
          return NextResponse.json({ ok: false, error: "sku_id or product_id is required" }, { status: 400 });
        }
        const skuRows = await pgQuery<{ sku_id: string }>(
          `SELECT id::text AS sku_id
             FROM public.erp_product_skus
            WHERE tenant_id = $1 AND is_active IS NOT FALSE
              AND (id::text = $2 OR product_id::text = $2 OR sku = $2)
            ORDER BY (id::text = $2) DESC
            LIMIT 1`,
          [tenant, rawKey],
        );
        const skuId = skuRows[0]?.sku_id ?? null;
        if (!skuId) {
          return NextResponse.json({ ok: false, error: `No active SKU found for "${rawKey}" — restock needs a SKU from the catalog` }, { status: 400 });
        }
        const outbound = ["sale", "damage", "scrap", "ship"].includes(movementType);
        const rows = await pgQuery<{ id: string }>(
          `INSERT INTO public.erp_inventory_movements
             (id, tenant_id, movement_type, sku_id, warehouse_id,
              from_location_id, to_location_id, quantity,
              unit_cost, source_type, reference, reason, metadata, performed_by, occurred_at, created_at)
           VALUES (gen_random_uuid(), $1, $2, $3::uuid, $4::uuid,
                   $5::uuid, $6::uuid, $7, $8,
                   'manual', $9, $10, '{}'::jsonb, $11::uuid, now(), now())
           RETURNING id`,
          [tenant, movementType, skuId, warehouseId,
           outbound ? binId : null, outbound ? null : binId,
           quantity, unitCost, reference, reason, actorId],
        );
        const movementId = rows[0]?.id ?? null;
        if (!movementId) {
          return NextResponse.json({ ok: false, error: "Inventory movement could not be recorded — the restock was not saved" }, { status: 500 });
        }
        await refreshStockProjection(tenant, skuId, warehouseId);
        await auditAction({ action, domain: "erp", tableName: "erp_inventory_movements", recordId: movementId, afterData: { movementType, skuId, quantity, unitCost, reason }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, movementId, movementType, skuId, quantity, unitCost });
      }

      case "barcode_lookup": {
        // Inventory-tab Barcode Lookup (B.2.4) — this case did not exist,
        // so the button died at the switch default with "Unknown action".
        // Barcodes live on erp_product_skus.barcode; an exact barcode
        // match wins, falling back to the SKU code. Stock is the
        // movement-derived on-hand (same CASE convention as POS/catalog).
        const code = String(payload.barcode || payload.code || "").trim();
        if (!code) {
          return NextResponse.json({ ok: false, error: "A barcode or SKU code is required" }, { status: 400 });
        }
        // Lookup tiers: exact barcode → exact SKU code → SKU code ending
        // in the scanned code (this catalog embeds the UPC as the SKU
        // suffix, e.g. 'ACANA…-064992612108', and some rows carry the bare
        // UPC as their whole code). A product can own several SKU rows,
        // only one of which carries the stock — so on-hand is summed at
        // the PRODUCT level across its SKUs, and tier order only picks
        // which row represents the match.
        const rows = await pgQuery<{
          sku_id: string; sku: string; barcode: string | null;
          product_id: string; name: string; brand: string | null; on_hand: number;
        }>(
          `SELECT s.id::text AS sku_id, s.sku, s.barcode,
                  p.id::text AS product_id, p.name, p.brand,
                  COALESCE(pmv.qty, 0)::float8 AS on_hand
             FROM public.erp_product_skus s
             JOIN public.erp_products p ON p.id = s.product_id AND p.tenant_id = s.tenant_id
             LEFT JOIN LATERAL (
               SELECT SUM(CASE WHEN m.movement_type IN ('sale','damage','scrap','ship') THEN -m.quantity ELSE m.quantity END) AS qty
                 FROM public.erp_inventory_movements m
                 JOIN public.erp_product_skus s2 ON s2.id = m.sku_id AND s2.tenant_id = m.tenant_id
                WHERE s2.product_id = p.id AND m.tenant_id = s.tenant_id
             ) pmv ON true
            WHERE s.tenant_id = $1
              AND (s.barcode = $2 OR s.sku = $2 OR s.sku LIKE '%-' || $2)
            ORDER BY (COALESCE(pmv.qty, 0) > 0) DESC, (s.barcode = $2) DESC, (s.sku = $2) DESC
            LIMIT 1`,
          [tenant, code],
        );
        if (!rows.length) {
          return NextResponse.json({ ok: false, error: `No product found for code "${code}"` }, { status: 404 });
        }
        const r = rows[0];
        return NextResponse.json({
          ok: true,
          data: { skuId: r.sku_id, sku: r.sku, barcode: r.barcode, productId: r.product_id, name: r.name, brand: r.brand, onHand: Number(r.on_hand) || 0 },
        });
      }

      case "low_stock_report": {
        // Inventory-tab Low Stock Report (B.2.4) — case did not exist
        // ("Unknown action"). Scope is the STOCKED set (SKUs with ledger
        // history — the in-store shelf), each compared against its
        // product's reorder_point; products without a reorder point use
        // the caller's threshold (default 5, the dashboard convention).
        const fallbackThreshold = Number(payload.threshold ?? 5);
        const rows = await pgQuery<{
          sku_id: string; sku: string; product_id: string; name: string;
          on_hand: number; reorder_point: number | null; threshold: number;
        }>(
          `SELECT s.id::text AS sku_id, s.sku, p.id::text AS product_id, p.name,
                  COALESCE(mv.qty, 0)::float8 AS on_hand,
                  p.reorder_point::float8 AS reorder_point,
                  (CASE WHEN p.reorder_point > 0 THEN p.reorder_point ELSE $2 END)::float8 AS threshold
             FROM public.erp_product_skus s
             JOIN public.erp_products p ON p.id = s.product_id AND p.tenant_id = s.tenant_id
             JOIN LATERAL (
               SELECT SUM(CASE WHEN movement_type IN ('sale','damage','scrap','ship') THEN -quantity ELSE quantity END) AS qty
                 FROM public.erp_inventory_movements
                WHERE sku_id = s.id AND tenant_id = s.tenant_id
             ) mv ON true
            WHERE s.tenant_id = $1
              AND mv.qty IS NOT NULL
              AND mv.qty <= (CASE WHEN p.reorder_point > 0 THEN p.reorder_point ELSE $2 END)
            ORDER BY on_hand ASC, p.name ASC
            LIMIT 200`,
          [tenant, fallbackThreshold],
        );
        const data = rows.map(r => ({
          skuId: r.sku_id, sku: r.sku, productId: r.product_id, name: r.name,
          onHand: Number(r.on_hand) || 0, reorderPoint: r.reorder_point, threshold: Number(r.threshold),
        }));
        await auditAction({ action, domain: "erp", tableName: "erp_inventory_movements", recordId: null, afterData: { lowStockCount: data.length, fallbackThreshold }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, data, rows: data, count: data.length });
      }

      case "transfer_stock": {
        // Inventory-tab Transfer — REAL since the per-location stock
        // build (20261021): stock derives per (sku, warehouse, bin) from
        // the movement ledger, so a transfer is ONE 'transfer' movement
        // in ONE transaction: −qty at the source bin, +qty at the
        // destination bin (the erp_stock_levels view reads the legs from
        // from_location_id / to_location_id). Callers name warehouses
        // (bins optional — each warehouse's DEFAULT bin is used); the
        // payload's product resolves to its SKU (multi-SKU products must
        // name sku_id — variants move separately).
        const qty = Number(payload.quantity ?? 0);
        const fromWhId = payload.from_warehouse_id ? String(payload.from_warehouse_id) : null;
        const toWhId = payload.to_warehouse_id ? String(payload.to_warehouse_id) : null;
        if (!qty || qty <= 0) {
          return NextResponse.json({ ok: false, error: "A positive quantity is required to transfer stock" }, { status: 400 });
        }
        if (!fromWhId || !toWhId) {
          return NextResponse.json({ ok: false, error: "from_warehouse_id and to_warehouse_id are required" }, { status: 400 });
        }
        if (fromWhId === toWhId && !payload.to_location_id) {
          return NextResponse.json({ ok: false, error: "Source and destination are the same warehouse — name a destination bin (to_location_id) for a bin-to-bin move" }, { status: 400 });
        }
        const fromWh = await resolveTenantWarehouse(tenant, fromWhId);
        const toWh = await resolveTenantWarehouse(tenant, toWhId);
        if (!fromWh) return NextResponse.json({ ok: false, error: "Source warehouse not found for this store" }, { status: 404 });
        if (!toWh) return NextResponse.json({ ok: false, error: "Destination warehouse not found for this store" }, { status: 404 });

        // Resolve the SKU: explicit sku_id wins; a product_id resolves
        // only when the product carries exactly one active SKU.
        let skuId = payload.sku_id ? String(payload.sku_id) : null;
        if (!skuId) {
          const rawKey = String(payload.product_id || payload.sku || "").trim();
          if (!rawKey) {
            return NextResponse.json({ ok: false, error: "sku_id or product_id is required" }, { status: 400 });
          }
          const skuRows = await pgQuery<{ id: string; sku: string }>(
            `SELECT id::text AS id, sku FROM public.erp_product_skus
              WHERE tenant_id = $1 AND is_active IS NOT FALSE
                AND (id::text = $2 OR product_id::text = $2 OR sku = $2)
              ORDER BY (id::text = $2) DESC, (sku = $2) DESC`,
            [tenant, rawKey],
          );
          if (!skuRows.length) {
            return NextResponse.json({ ok: false, error: `No active SKU found for "${rawKey}"` }, { status: 404 });
          }
          const distinct = new Map(skuRows.map(r => [r.id, r.sku]));
          if (distinct.size > 1 && !skuRows.some(r => r.id === rawKey || r.sku === rawKey)) {
            return NextResponse.json({
              ok: false,
              error: `That product has ${distinct.size} SKUs — transfers move one SKU at a time. Name the SKU: ${[...distinct.values()].join(", ")}`,
            }, { status: 400 });
          }
          skuId = skuRows[0].id;
        } else {
          const okRows = await pgQuery<{ id: string }>(
            `SELECT id::text AS id FROM public.erp_product_skus WHERE id = $1::uuid AND tenant_id = $2`,
            [skuId, tenant],
          );
          if (!okRows.length) {
            return NextResponse.json({ ok: false, error: "SKU not found for this store" }, { status: 404 });
          }
        }

        const fromBin = await resolveWarehouseBin(tenant, fromWh, payload.from_location_id ? String(payload.from_location_id) : null);
        const toBin = await resolveWarehouseBin(tenant, toWh, payload.to_location_id ? String(payload.to_location_id) : null);
        if (!fromBin || !toBin) {
          return NextResponse.json({ ok: false, error: "A named bin was not found in its warehouse" }, { status: 404 });
        }
        if (fromBin === toBin) {
          return NextResponse.json({ ok: false, error: "Source and destination bins are the same — nothing to move" }, { status: 400 });
        }

        const available = await stockOnHandAt(tenant, skuId, fromWh);
        if (available < qty) {
          return NextResponse.json({
            ok: false,
            error: `Insufficient stock at the source warehouse: ${available} on hand, ${qty} requested. Transfers cannot move stock that isn't there (sales can oversell with a warning — transfers cannot).`,
          }, { status: 422 });
        }

        // One transaction: the transfer movement + both projection cells.
        const client = await getPg();
        let movementId: string | null = null;
        try {
          await client.query("BEGIN");
          const ins = await client.query(
            `INSERT INTO public.erp_inventory_movements
               (id, tenant_id, movement_type, sku_id, warehouse_id,
                from_location_id, to_location_id, quantity, unit_cost,
                source_type, reference, reason, metadata, performed_by, occurred_at, created_at)
             VALUES (gen_random_uuid(), $1, 'transfer', $2::uuid, $3::uuid,
                     $4::uuid, $5::uuid, $6, 0,
                     'transfer', $7, $8, $9::jsonb, $10::uuid, now(), now())
             RETURNING id`,
            [tenant, skuId, fromWh, fromBin, toBin, qty,
             `TRF-${Date.now().toString(36).toUpperCase()}`,
             payload.reason ? String(payload.reason) : "Warehouse transfer",
             JSON.stringify({ from_warehouse_id: fromWh, to_warehouse_id: toWh }),
             actorId],
          );
          movementId = ins.rows[0]?.id ?? null;
          if (!movementId) throw new Error("transfer movement insert returned no row");
          await client.query(
            `SELECT public.erp_rebuild_stock_balances($1::uuid, $2::uuid, $3::uuid)`,
            [tenant, skuId, fromWh],
          );
          await client.query(
            `SELECT public.erp_rebuild_stock_balances($1::uuid, $2::uuid, $3::uuid)`,
            [tenant, skuId, toWh],
          );
          await client.query("COMMIT");
        } catch (e) {
          await client.query("ROLLBACK").catch(() => {});
          return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Transfer failed — no stock moved" }, { status: 500 });
        } finally {
          client.release();
        }
        const [fromOnHand, toOnHand] = await Promise.all([
          stockOnHandAt(tenant, skuId, fromWh),
          stockOnHandAt(tenant, skuId, toWh),
        ]);
        await auditAction({ action, domain: "erp", tableName: "erp_inventory_movements", recordId: movementId, afterData: { skuId, quantity: qty, fromWarehouseId: fromWh, toWarehouseId: toWh, fromBin, toBin }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({
          ok: true, movementId, skuId, quantity: qty,
          fromWarehouseId: fromWh, toWarehouseId: toWh,
          fromBinId: fromBin, toBinId: toBin,
          sourceOnHand: fromOnHand, destinationOnHand: toOnHand,
        });
      }

      // ───────────────────────────────────────────────────────────────────
      // PURCHASE ORDER handlers
      // ───────────────────────────────────────────────────────────────────

      case "create_po": {
        // order_create_po / po_create → create_po
        // CHECK constraint: status IN ('draft','pending_approval','approved',
        // 'sent','partially_received','received','closed','cancelled')
        // POs are created as pending_approval — must be approved before sending to vendor.
        const vendorId = String(payload.vendor_id || "");
        if (!vendorId) {
          return NextResponse.json({ ok: false, error: "vendor_id is required to create a purchase order" }, { status: 400 });
        }
        const vendorRows = await pgQuery<{ id: string }>(
          `SELECT id FROM public.erp_vendors WHERE id = $1::uuid AND tenant_id = $2`,
          [vendorId, tenant],
        );
        if (!vendorRows.length) {
          return NextResponse.json({ ok: false, error: "Vendor not found — pick a vendor from the vendor list" }, { status: 400 });
        }
        const warehouseId = payload.warehouse_id ? String(payload.warehouse_id) : null;
        const poNumber = String(payload.po_number || `PO-${Date.now().toString(36).toUpperCase()}`);
        const currency = String(payload.currency || "USD");
        const expectedDate = payload.expected_date ? String(payload.expected_date) : null;
        const expectedTotal = Number(payload.expected_total ?? payload.total ?? 0);
        const lineItems = (payload.line_items as Array<{ sku_id?: string; description?: string; quantity?: number; unit_cost?: number; subtotal?: number; tax_amount?: number }>) || [];
        const subtotal = lineItems.length
          ? lineItems.reduce((s, i) => s + Number(i.subtotal ?? (Number(i.quantity || 0) * Number(i.unit_cost || 0))), 0)
          : expectedTotal;
        const taxTotal = Number(payload.tax_total ?? lineItems.reduce((s, i) => s + Number(i.tax_amount || 0), 0));
        const shippingTotal = Number(payload.shipping_total ?? 0);
        const total = subtotal + taxTotal + shippingTotal;
        const notes = payload.notes ? String(payload.notes) : null;
        const rows = await pgQuery<{ id: string }>(
          `INSERT INTO public.erp_purchase_orders
             (id, tenant_id, po_number, vendor_id, warehouse_id, status, order_date,
              expected_date, currency, subtotal, tax_total, shipping_total, total,
              notes, created_by, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3::uuid, $4::uuid, 'pending_approval', CURRENT_DATE,
                  $5, $6, $7, $8, $9, $10, $11, $12::uuid, now(), now())
           RETURNING id`,
          [tenant, poNumber, vendorId, warehouseId, expectedDate, currency, subtotal, taxTotal, shippingTotal, total, notes, actorId],
        );
        const poId = rows[0]?.id ?? null;
        if (!poId) {
          return NextResponse.json({ ok: false, error: `Purchase order ${poNumber} could not be created — the PO was not saved` }, { status: 500 });
        }
        // Insert line items into erp_purchase_order_lines
        let lineCount = 0;
        if (poId) {
          for (const li of lineItems) {
            const skuId = li.sku_id ? String(li.sku_id) : null;
            const qty = Number(li.quantity || 0);
            const unitCost = Number(li.unit_cost || 0);
            if (!skuId || qty <= 0) continue;
            const lineTotal = Number(li.subtotal ?? (qty * unitCost));
            const taxAmt = Number(li.tax_amount || 0);
            const landed = await pgExec(
              `INSERT INTO public.erp_purchase_order_lines
                 (id, tenant_id, purchase_order_id, sku_id, description,
                  quantity_ordered, quantity_received, unit_cost, tax_amount, line_total, created_at)
               VALUES (gen_random_uuid(), $1, $2::uuid, $3::uuid, $4, $5, 0, $6, $7, $8, now())`,
              [tenant, poId, skuId, li.description ? String(li.description) : null, qty, unitCost, taxAmt, lineTotal],
            );
            if (landed) lineCount++;
          }
        }
        await auditAction({ action, domain: "erp", tableName: "erp_purchase_orders", recordId: poId, afterData: { poNumber, vendorId, total, lineCount }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, poId, poNumber, vendorId, total, status: "pending_approval", lineCount });
      }

      case "receive_po":
      case "receive": {
        // po_receive → receive (legacy alias receive_po) — SA-45.
        // received_items: [{ line_id?, sku_id, quantity, unit_cost }]
        // Updates quantity_received on lines, inserts inventory movements
        // into erp_inventory_movements (the live stock system), and sets
        // PO status from what the lines actually show.
        //
        // The old body had three live defects: an EMPTY received_items
        // still rewrote the PO status to "sent" (approving a
        // pending_approval PO by accident, or regressing a
        // partially_received one); the full requested quantity went into
        // stock even past what was ordered (line was capped, movement was
        // not — over-receive inflated inventory); and a nonexistent PO
        // reported success.
        const poId = String(payload.po_id || "");
        if (!poId) return NextResponse.json({ ok: false, error: "po_id required" }, { status: 400 });
        const receivedItems = (payload.received_items as Array<{ line_id?: string; sku_id?: string; quantity?: number; unit_cost?: number }>) || [];
        const usable = receivedItems.filter(ri => ri.sku_id && Number(ri.quantity || 0) > 0);
        if (!usable.length) {
          return NextResponse.json({ ok: false, error: "No items to receive — receiving needs line quantities; receive from the purchase order with per-line quantities" }, { status: 400 });
        }
        const poRows = await pgQuery<{ status: string }>(
          `SELECT status::text AS status FROM public.erp_purchase_orders WHERE id = $1::uuid AND tenant_id = $2`,
          [poId, tenant],
        );
        if (!poRows.length) {
          return NextResponse.json({ ok: false, error: "Purchase order not found" }, { status: 404 });
        }
        const currentStatus = poRows[0].status;
        const lineRows = await pgQuery<{ id: string; sku_id: string; quantity_ordered: string; quantity_received: string; unit_cost: string }>(
          `SELECT id, sku_id, quantity_ordered::text, quantity_received::text, unit_cost::text
             FROM public.erp_purchase_order_lines
            WHERE purchase_order_id = $1::uuid AND tenant_id = $2`,
          [poId, tenant],
        );
        const lineById = new Map(lineRows.map(l => [l.id, l]));
        const lineBySku = new Map(lineRows.map(l => [l.sku_id, l]));
        // Receipts land in a named warehouse (default MAIN) at its
        // receiving/default bin — per-location stock sees every receipt.
        const receiveWh = await resolveTenantWarehouse(
          tenant,
          payload.warehouse_id ? String(payload.warehouse_id) : null,
        );
        if (!receiveWh) {
          return NextResponse.json({ ok: false, error: "No active warehouse found for this store — receiving needs a warehouse" }, { status: 400 });
        }
        const receiveBin = await resolveWarehouseBin(
          tenant,
          receiveWh,
          payload.location_id ? String(payload.location_id) : null,
        );
        const receivedSkuIds = new Set<string>();
        let movementCount = 0;
        let skippedOver = 0;
        for (const ri of usable) {
          const skuId = String(ri.sku_id);
          const qty = Number(ri.quantity || 0);
          const line = (ri.line_id ? lineById.get(String(ri.line_id)) : undefined) || lineBySku.get(skuId);
          let appliedQty = qty;
          if (line) {
            const remaining = Number(line.quantity_ordered) - Number(line.quantity_received);
            appliedQty = Math.min(qty, Math.max(remaining, 0));
            if (appliedQty <= 0) { skippedOver++; continue; }
            const lineUpdated = await pgExec(
              `UPDATE public.erp_purchase_order_lines
                  SET quantity_received = quantity_received + $1
                WHERE id = $2::uuid AND tenant_id = $3 AND purchase_order_id = $4::uuid`,
              [appliedQty, line.id, tenant, poId],
            );
            if (!lineUpdated) { skippedOver++; continue; }
            // Keep the in-memory line current for repeat items on one call.
            line.quantity_received = String(Number(line.quantity_received) + appliedQty);
          }
          const cost = Number(ri.unit_cost ?? (line ? Number(line.unit_cost) : 0) ?? 0);
          const moved = await pgExec(
            `INSERT INTO public.erp_inventory_movements
               (id, tenant_id, movement_type, sku_id, warehouse_id, to_location_id,
                quantity, unit_cost, source_type,
                reference, reason, metadata, performed_by, occurred_at, created_at)
             VALUES (gen_random_uuid(), $1, 'purchase_receipt', $2::uuid, $3::uuid, $4::uuid, $5, $6,
                     'purchase_order', $7, 'PO receipt', '{}'::jsonb, $8::uuid, now(), now())`,
            [tenant, skuId, receiveWh, receiveBin, appliedQty, cost, poId, actorId],
          );
          if (moved) { movementCount++; receivedSkuIds.add(skuId); }
        }
        if (movementCount === 0) {
          return NextResponse.json({ ok: false, error: skippedOver > 0 ? "Nothing was received — every requested line is already fully received on this PO" : "Nothing was received — the receipt could not be recorded" }, { status: 400 });
        }
        for (const sid of receivedSkuIds) {
          await refreshStockProjection(tenant, sid, receiveWh);
        }
        // Status from the lines themselves; never regress an advanced PO.
        let newStatus = currentStatus;
        if (lineRows.length > 0) {
          const ordered = lineRows.reduce((s, l) => s + Number(l.quantity_ordered), 0);
          const received = lineRows.reduce((s, l) => s + Number(l.quantity_received), 0);
          if (ordered > 0 && received >= ordered) newStatus = "received";
          else if (received > 0) newStatus = "partially_received";
        } else {
          newStatus = "received";
        }
        let updated = 0;
        if (newStatus !== currentStatus) {
          updated = await pgExec(
            `UPDATE public.erp_purchase_orders
                SET status = $1, updated_at = now()
              WHERE id = $2::uuid AND tenant_id = $3`,
            [newStatus, poId, tenant],
          );
        }
        await auditAction({ action, domain: "erp", tableName: "erp_purchase_orders", recordId: poId, afterData: { status: newStatus, movementCount, skippedOver }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, poId, updated, status: newStatus, movementCount, skippedOverReceived: skippedOver });
      }

      case "create_po_status": {
        // PO status transitions with approval workflow validation.
        // Allowed: pending_approval → approved | cancelled | draft
        //          approved → sent | cancelled
        //          sent → partially_received | received | cancelled
        //          draft → pending_approval | cancelled
        const poId = String(payload.po_id || "");
        const status = String(payload.status || "draft");
        const allowedTransitions: Record<string, string[]> = {
          draft: ["pending_approval", "cancelled"],
          pending_approval: ["approved", "cancelled", "draft"],
          approved: ["sent", "cancelled"],
          sent: ["partially_received", "received", "cancelled"],
          partially_received: ["received", "cancelled"],
          received: ["closed"],
          closed: [],
          cancelled: [],
        };
        const current = await pgQuery<{ status: string }>(
          `SELECT status FROM public.erp_purchase_orders WHERE id = $1::uuid AND tenant_id = $2`,
          [poId, tenant],
        );
        const cur = current[0]?.status;
        if (!cur) {
          return NextResponse.json({ ok: false, error: "PO not found" }, { status: 404 });
        }
        const allowed = allowedTransitions[cur] || [];
        if (!allowed.includes(status)) {
          return NextResponse.json(
            { ok: false, error: `Cannot transition PO from '${cur}' to '${status}'` },
            { status: 400 },
          );
        }
        const updated = await pgExec(
          `UPDATE public.erp_purchase_orders SET status = $1, updated_at = now()
            WHERE id = $2::uuid AND tenant_id = $3`,
          [status, poId, tenant],
        );
        await auditAction({ action, domain: "erp", tableName: "erp_purchase_orders", recordId: poId, afterData: { from: cur, to: status, updated }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, poId, status, updated });
      }

      // ───────────────────────────────────────────────────────────────────
      // ORDER handlers
      // ───────────────────────────────────────────────────────────────────

      case "create_order":
      case "create": {
        // order_create → create (legacy alias create_order)
        // CRITICAL: po_create (from frontend `po-create`) ALSO strips to
        // "create" because the prefix-strip `^[a-z]+_` matches `po_`. To
        // avoid creating an order when the user wanted a PO, dispatch
        // based on the original action_code here.
        if (action === "po_create" || action === "po_create_po" || action === "po-create") {
          // Route to the create_po handler logic by re-dispatching via the
          // full action_code. We can't `goto` in JS, so duplicate the PO
          // creation logic inline. (Mirrors case "create_po" above.)
          const vendorId = String(payload.vendor_id || "");
          if (!vendorId) {
            return NextResponse.json({ ok: false, error: "vendor_id is required to create a purchase order" }, { status: 400 });
          }
          const warehouseId = payload.warehouse_id ? String(payload.warehouse_id) : null;
          const poNumber = String(payload.po_number || `PO-${Date.now().toString(36).toUpperCase()}`);
          const currency = String(payload.currency || "USD");
          const expectedDate = payload.expected_date ? String(payload.expected_date) : null;
          const expectedTotal = Number(payload.expected_total ?? payload.total ?? 0);
          const lineItems = (payload.line_items as Array<{ subtotal?: number; quantity?: number; unit_cost?: number }>) || [];
          const subtotal = lineItems.length
            ? lineItems.reduce((s, i) => s + Number(i.subtotal ?? (Number(i.quantity || 0) * Number(i.unit_cost || 0))), 0)
            : expectedTotal;
          const taxTotal = Number(payload.tax_total ?? 0);
          const shippingTotal = Number(payload.shipping_total ?? 0);
          const total = subtotal + taxTotal + shippingTotal;
          const notes = payload.notes ? String(payload.notes) : null;
          const poRows = await pgQuery<{ id: string }>(
            `INSERT INTO public.erp_purchase_orders
               (id, tenant_id, po_number, vendor_id, warehouse_id, status, order_date,
                expected_date, currency, subtotal, tax_total, shipping_total, total,
                notes, created_by, created_at, updated_at)
             VALUES (gen_random_uuid(), $1, $2, $3::uuid, $4::uuid, 'sent', CURRENT_DATE,
                    $5, $6, $7, $8, $9, $10, $11, $12::uuid, now(), now())
             RETURNING id`,
            [tenant, poNumber, vendorId, warehouseId, expectedDate, currency, subtotal, taxTotal, shippingTotal, total, notes, actorId],
          );
          const poId = poRows[0]?.id ?? null;
          if (!poId) {
            return NextResponse.json({ ok: false, error: `Purchase order ${poNumber} could not be created — the PO was not saved` }, { status: 500 });
          }
          await auditAction({ action, domain: "erp", tableName: "erp_purchase_orders", recordId: poId, afterData: { poNumber, vendorId, total }, actorUserId: actorId, ipAddress: ip });
          return NextResponse.json({ ok: true, poId, poNumber, vendorId, total, status: "sent" });
        }
        // Manual order creation (SA-31: cart, customer, save). Line items
        // are part of the order — the previous version silently DROPPED
        // them, creating an order whose detail showed zero items.
        const rawItems = (payload.line_items ?? payload.items ?? []) as Array<{
          sku_id?: string; catalog_item_id?: string; product_id?: string;
          name?: string; quantity?: number; unit_price?: number; unit_price_cents?: number;
        }>;
        const money = (n: number) => `$${(Math.round(n * 100) / 100).toFixed(2)}`;
        type ResolvedItem = { productId: string | null; name: string; quantity: number; unitPrice: number };
        const items: ResolvedItem[] = [];
        for (const li of rawItems) {
          const qty = Number(li.quantity ?? 1);
          if (!qty || qty <= 0) continue;
          const unitPrice = li.unit_price_cents !== undefined
            ? Number(li.unit_price_cents) / 100
            : Number(li.unit_price ?? 0);
          let productId = li.catalog_item_id || li.product_id || null;
          let name = li.name ? String(li.name) : "";
          if (li.sku_id && (!productId || !name)) {
            const skuRows = await pgQuery<{ product_id: string; product_name: string | null }>(
              `SELECT s.product_id::text AS product_id, ci.name AS product_name
                 FROM public.erp_product_skus s
                 LEFT JOIN public.commerce_catalog_items ci ON ci.id = s.product_id AND ci.tenant_id = s.tenant_id
                WHERE s.id = $1::uuid AND s.tenant_id = $2`,
              [String(li.sku_id), tenant],
            );
            if (skuRows[0]) {
              productId = productId || skuRows[0].product_id;
              name = name || skuRows[0].product_name || "";
            }
          }
          if (!name && productId) {
            const catRows = await pgQuery<{ name: string }>(
              `SELECT name FROM public.commerce_catalog_items WHERE id::text = $1 AND tenant_id = $2`,
              [productId, tenant],
            );
            name = catRows[0]?.name || "";
          }
          items.push({ productId, name: name || "Item", quantity: qty, unitPrice });
        }
        const itemsTotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
        let customerEmail = String(payload.customer_email || "");
        const customerId = payload.customer_id ? String(payload.customer_id) : null;
        if (!customerEmail && customerId) {
          const custRows = await pgQuery<{ email: string | null }>(
            `SELECT email FROM public.customers WHERE id::text = $1
             UNION ALL
             SELECT email FROM public.crm_customers WHERE id::text = $1 OR source_customer_id::text = $1
             LIMIT 1`,
            [customerId],
          );
          customerEmail = custRows[0]?.email || "";
        }
        const totalAmount = Number(payload.total_amount ?? payload.total ?? (items.length ? itemsTotal : 0));
        const subtotal = Number(payload.subtotal ?? (items.length ? itemsTotal : totalAmount));
        const fulfillmentMethod = payload.fulfillment_method ? String(payload.fulfillment_method) : "local_pickup";
        const fulfillmentStatus = payload.fulfillment_status ? String(payload.fulfillment_status) : "pending";
        const status = String(payload.status || "draft");
        const paymentStatus = String(payload.payment_status || "unpaid");
        const orderId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        const inserted = await pgExec(
          `INSERT INTO public.commerce_orders
             (id, tenant_id, customer_email, customer_id, email, subtotal, total_amount,
              status, payment_status, fulfillment_status, fulfillment_method, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $3, $5, $6, $7, $8, $9, $10, now(), now())`,
          [orderId, tenant, customerEmail || null, customerId, money(subtotal), money(totalAmount), status, paymentStatus, fulfillmentStatus, fulfillmentMethod],
        );
        if (!inserted) {
          return NextResponse.json({ ok: false, error: `Order ${orderId} could not be created — the order was not saved` }, { status: 500 });
        }
        let itemCount = 0;
        for (const it of items) {
          const landed = await pgExec(
            `INSERT INTO public.commerce_order_items
               (id, tenant_id, order_id, product_id, name, quantity, unit_price, created_at)
             VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, now())`,
            [tenant, orderId, it.productId, it.name, it.quantity, money(it.unitPrice)],
          );
          if (landed) itemCount++;
        }
        if (items.length > 0 && itemCount === 0) {
          return NextResponse.json({ ok: false, error: `Order ${orderId} was created but none of its ${items.length} line items could be saved — check the order before fulfilling it`, orderId }, { status: 500 });
        }
        await auditAction({ action, domain: "commerce", tableName: "commerce_orders", recordId: orderId, afterData: { orderId, customerEmail, totalAmount, status, itemCount }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, orderId, customerEmail, totalAmount, status, itemCount });
      }

      case "advance_fulfillment_stage":
      case "advance": {
        // fulfill_advance → advance (legacy alias advance_fulfillment_stage)
        // SA-42: move the order through the fulfillment state machine.
        // The fulfillment queue sends { stage } — the old handler only read
        // status/fulfillment_status, so every advance silently wrote the
        // default "released", a stage no queue filter matches (orders
        // vanished from the board), and it reported success even for
        // order ids that don't exist.
        const orderId = String(payload.order_id || "");
        if (!orderId) return NextResponse.json({ ok: false, error: "order_id required" }, { status: 400 });
        const currentRows = await pgQuery<{ fulfillment_status: string | null }>(
          `SELECT fulfillment_status FROM public.commerce_orders WHERE id::text = $1 AND tenant_id = $2`,
          [orderId, tenant],
        );
        if (!currentRows.length) {
          return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
        }
        const oldStatus = String(currentRows[0].fulfillment_status || "pending");
        const STAGE_CHAIN = ["pending", "picking", "packing", "packed", "shipped", "delivered"];
        const ALLOWED_TARGETS = new Set([...STAGE_CHAIN, "ready"]);
        const normalize = (s: string) => {
          const v = s.trim().toLowerCase();
          return v === "unfulfilled" ? "pending" : v;
        };
        const requested = payload.stage || payload.status || payload.fulfillment_status;
        let newStatus: string;
        if (requested) {
          newStatus = normalize(String(requested));
          if (!ALLOWED_TARGETS.has(newStatus)) {
            return NextResponse.json({ ok: false, error: `Unknown fulfillment stage "${requested}" — use one of: ${[...ALLOWED_TARGETS].join(", ")}` }, { status: 400 });
          }
        } else {
          const cur = normalize(oldStatus);
          const idx = STAGE_CHAIN.indexOf(cur);
          newStatus = idx >= 0 && idx < STAGE_CHAIN.length - 1 ? STAGE_CHAIN[idx + 1] : cur;
        }
        const updated = await pgExec(
          `UPDATE public.commerce_orders
              SET fulfillment_status = $1, updated_at = now()
            WHERE id::text = $2 AND tenant_id = $3`,
          [newStatus, orderId, tenant],
        );
        if (!updated) {
          return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
        }
        await logOrderEvent(pgLifecycleClient, tenant, orderId, "fulfillment_advanced", oldStatus, newStatus, { via: action });
        // Checkout-split child? Its parent's roll-up follows the advance.
        await rollupSplitParentFulfillmentSafe(
          (sql, params) => pgQuery(sql, params),
          orderId,
        );
        await auditAction({ action, domain: "commerce", tableName: "commerce_orders", recordId: isUuid(orderId) ? orderId : null, afterData: { fulfillmentStatus: newStatus, updated }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, orderId, fulfillmentStatus: newStatus, previousStatus: oldStatus, updated });
      }

      case "checkout": {
        // crm_checkout → checkout
        // Mark an order as paid + captured; record a commerce_payment row
        // linked to the order via sale_id (commerce_sales).
        const orderId = String(payload.order_id || "");
        const amount = Number(payload.amount || 0);
        const method = payload.method ? String(payload.method) : "cash";
        // Look up the default cash payment method
        const methodRows = await pgQuery<{ id: string }>(
          `SELECT id FROM public.commerce_payment_methods
            WHERE tenant_id = $1 AND active = true AND method_type = $2
            ORDER BY (code = 'manual_cash') DESC, id LIMIT 1`,
          [tenant, method],
        );
        const methodId = methodRows[0]?.id ?? null;
        if (!methodId) {
          return NextResponse.json({ ok: false, error: `No active ${method} payment method configured` }, { status: 400 });
        }
        const payNum = `PAY-${Date.now().toString(36).toUpperCase()}`;
        const orderUpdated = await pgExec(
          `UPDATE public.commerce_orders
              SET status = 'paid', payment_status = 'paid', updated_at = now()
            WHERE id = $1 AND tenant_id = $2`,
          [orderId, tenant],
        );
        const paymentInserted = await pgExec(
          `INSERT INTO public.commerce_payments
             (id, tenant_id, payment_number, payment_method_id, amount, currency, status, created_at)
           VALUES (gen_random_uuid(), $1, $2, $3::uuid, $4, 'USD', 'succeeded', now())`,
          [tenant, payNum, methodId, amount],
        );
        if (!orderUpdated || !paymentInserted) {
          return NextResponse.json({ ok: false, error: `Checkout for order ${orderId} did not complete — ${!orderUpdated ? "the order was not updated" : `payment ${payNum} was not saved`} (order updated: ${orderUpdated}, payment saved: ${paymentInserted})` }, { status: 500 });
        }
        await auditAction({ action, domain: "commerce", tableName: "commerce_orders", recordId: orderId, afterData: { amount, method, payNum }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, orderId, amount, paymentNumber: payNum, method, status: "paid" });
      }

      // ───────────────────────────────────────────────────────────────────
      // SHIPPING / ALERTS handlers
      // ───────────────────────────────────────────────────────────────────

      case "shipping_label":
      case "label": {
        // fulfill_shipping_label → shipping_label (legacy alias label)
        const orderId = payload.order_id ? String(payload.order_id) : null;
        if (!orderId) return NextResponse.json({ error: "order_id required" }, { status: 400 });
        const result = await purchaseShippingLabel({ orderId, payload, action, actorId, ip, tenant });
        return NextResponse.json(result.body, { status: result.status });
      }

      case "shipping_rates":
      case "rates": {
        // Label Station: return REAL carrier rates for an order's destination.
        // Honest 503 when Shippo is not configured — never mock rates.
        const orderId = payload.order_id ? String(payload.order_id) : null;
        const weightLb = Number(payload.weight_lb) || 2;
        const toZip = payload.to_zip ? String(payload.to_zip) : null;
        let zip = toZip;
        if (!zip && orderId) {
          const rows = await pgQuery<{ shipping_address: string | null }>(
            // commerce_orders.id is TEXT (slug ids exist) — compare as text,
            // the same treatment the label purchase above uses. The old
            // id = $1::uuid comparison errored against the TEXT id, pgQuery
            // swallowed it, and the ZIP stayed null → honest-but-wrong 400
            // "No destination ZIP" on orders that have one.
            `SELECT shipping_address::text FROM public.commerce_orders WHERE id::text = $1 AND tenant_id = $2`,
            [orderId, tenant]
          );
          // Extract the ZIP with the shared parser — stored addresses are
          // usually the plain shop-checkout string ("1486 Charles St ·
          // Memphis, TN 38141"), sometimes JSON. The old inline JSON.parse
          // only understood the JSON shape, so plain-string orders fell
          // through to the honest-but-wrong 400 despite having a ZIP.
          // parseShipTo returns null when no ZIP is recoverable → the 400
          // below stays honest for those.
          const to = parseShipTo(rows[0]?.shipping_address ?? null, "Customer");
          zip = to?.zip || null;
        }
        if (!zip) return NextResponse.json({ ok: false, error: "no_destination_zip", message: "No destination ZIP — cannot rate." }, { status: 400 });
        try {
          const { shippoRates } = await import("@/lib/shippo");
          const rates = await shippoRates({ toZip: zip, weightLb, tenantId: tenant });
          return NextResponse.json({ ok: true, rates });
        } catch (e: any) {
          const msg = String(e?.message || "");
          if (msg === "shippo_not_configured") {
            return NextResponse.json({ ok: false, error: "shippo_not_configured", message: "Shipping is not configured — set a Shippo API key in Admin → Settings → Shipping." }, { status: 503 });
          }
          if (e?.name === "ReturnAddressError") {
            return NextResponse.json({ ok: false, error: "return_address_not_set", message: msg }, { status: 422 });
          }
          return NextResponse.json({ ok: false, error: msg || "rates failed" }, { status: 502 });
        }
      }

      case "resend_alert":
      case "alert": {
        // fulfill_resend_alert → resend_alert (legacy alias alert)
        // SA-36: resend the customer alert — an ACTUAL email through the
        // Resend pipeline (shared deliverOrderAlert). The old handler only
        // wrote log rows and claimed "Alert resent" while nothing was ever
        // sent. Delivery failures now surface as real errors.
        const orderId = payload.order_id ? String(payload.order_id) : null;
        if (!orderId) return NextResponse.json({ ok: false, error: "order_id required" }, { status: 400 });
        const { deliverOrderAlert } = await import("@/lib/orders/resend-alert");
        const result = await deliverOrderAlert({
          tenant,
          orderId,
          message: payload.message ? String(payload.message) : null,
        });
        if (!result.ok) {
          return NextResponse.json({ ok: false, error: result.error, message: result.message }, { status: result.status });
        }
        await auditAction({ action, domain: "crm", tableName: "activity_log", recordId: null, afterData: { orderId, emailedTo: result.to }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, orderId, emailed: true, to: result.to, message: `Alert emailed to ${result.to}` });
      }

      // ───────────────────────────────────────────────────────────────────
      // COUPONS / DISCOUNTS handlers
      // ───────────────────────────────────────────────────────────────────

      case "register_coupons": {
        // accts_register_coupons → register_coupons
        // commerce_coupons: id, tenant_id, promotion_id, code (NOT NULL),
        // customer_id, usage_limit, usage_count (NOT NULL), status (NOT NULL),
        // valid_from, valid_to
        const coupons = (payload.coupons as Array<{
          code: string;
          promotion_id?: string;
          customer_id?: string;
          usage_limit?: number;
          valid_from?: string;
          valid_to?: string;
        }>) || [];
        // Single-coupon convenience path
        if (coupons.length === 0 && payload.code) {
          coupons.push({
            code: String(payload.code),
            promotion_id: payload.promotion_id ? String(payload.promotion_id) : undefined,
            customer_id: payload.customer_id ? String(payload.customer_id) : undefined,
            usage_limit: payload.usage_limit !== undefined ? Number(payload.usage_limit) : undefined,
            valid_from: payload.valid_from ? String(payload.valid_from) : undefined,
            valid_to: payload.valid_to ? String(payload.valid_to) : undefined,
          });
        }
        const results: Array<{ code: string; couponId: string | null }> = [];
        for (const c of coupons) {
          const rows = await pgQuery<{ id: string }>(
            `INSERT INTO public.commerce_coupons
               (id, tenant_id, promotion_id, code, customer_id, usage_limit, usage_count,
                status, valid_from, valid_to)
             VALUES (gen_random_uuid(), $1, $2::uuid, $3, $4::uuid, $5, 0, 'active', $6, $7)
             RETURNING id`,
            [tenant, c.promotion_id || null, c.code, c.customer_id || null, c.usage_limit || null, c.valid_from || null, c.valid_to || null],
          );
          results.push({ code: c.code, couponId: rows[0]?.id ?? null });
        }
        const registeredCoupons = results.filter(r => r.couponId).length;
        if (results.length > 0 && registeredCoupons === 0) {
          return NextResponse.json({ ok: false, error: "None of the coupons could be registered — nothing was saved" }, { status: 500 });
        }
        await auditAction({ action, domain: "commerce", tableName: "commerce_coupons", recordId: null, afterData: { count: registeredCoupons, coupons: results }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, count: registeredCoupons, coupons: results });
      }

      case "register_discounts": {
        // accts_register_discounts → register_discounts
        // We use commerce_promotions (the umbrella table for both discounts
        // and promotions). Required NOT NULL columns: code, name, promotion_type,
        // value, active, rules (jsonb), actions (jsonb).
        const discounts = (payload.discounts as Array<{
          code: string;
          name: string;
          promotion_type?: string;
          value?: number;
          minimum_subtotal?: number;
          maximum_discount?: number;
          start_at?: string;
          end_at?: string;
          usage_limit?: number;
        }>) || [];
        // Single-discount convenience path
        if (discounts.length === 0 && payload.code) {
          discounts.push({
            code: String(payload.code),
            name: String(payload.name || payload.code),
            promotion_type: payload.promotion_type ? String(payload.promotion_type) : "fixed_amount",
            value: payload.value !== undefined ? Number(payload.value) : 0,
            minimum_subtotal: payload.minimum_subtotal !== undefined ? Number(payload.minimum_subtotal) : undefined,
            maximum_discount: payload.maximum_discount !== undefined ? Number(payload.maximum_discount) : undefined,
            start_at: payload.start_at ? String(payload.start_at) : undefined,
            end_at: payload.end_at ? String(payload.end_at) : undefined,
            usage_limit: payload.usage_limit !== undefined ? Number(payload.usage_limit) : undefined,
          });
        }
        const results: Array<{ code: string; promotionId: string | null }> = [];
        for (const d of discounts) {
          const rows = await pgQuery<{ id: string }>(
            `INSERT INTO public.commerce_promotions
               (id, tenant_id, code, name, promotion_type, value, minimum_subtotal,
                maximum_discount, start_at, end_at, usage_limit, usage_count, active, rules, actions)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, true, '{}'::jsonb, '{}'::jsonb)
             RETURNING id`,
            [tenant, d.code, d.name, d.promotion_type || "fixed_amount", d.value || 0, d.minimum_subtotal || 0, d.maximum_discount || 0, d.start_at || null, d.end_at || null, d.usage_limit || null],
          );
          results.push({ code: d.code, promotionId: rows[0]?.id ?? null });
        }
        const registeredDiscounts = results.filter(r => r.promotionId).length;
        if (results.length > 0 && registeredDiscounts === 0) {
          return NextResponse.json({ ok: false, error: "None of the discounts could be registered — nothing was saved" }, { status: 500 });
        }
        await auditAction({ action, domain: "commerce", tableName: "commerce_promotions", recordId: null, afterData: { count: registeredDiscounts, discounts: results }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, count: registeredDiscounts, discounts: results });
      }

      case "coupons": {
        // reg_coupons → coupons ("Register: Accept Coupon"). Validates a
        // coupon code for the register and returns the discount terms the
        // sale applies. Acceptance is validation only — the redemption is
        // recorded when the sale completes. A coupon resolves either as a
        // commerce_coupons row (optionally carrying its terms on the linked
        // commerce_promotions row) or directly as a promotion code.
        const code = String(payload.code || "").trim().toUpperCase();
        if (!code) {
          return NextResponse.json({ ok: false, error: "Coupon code is required" }, { status: 400 });
        }
        const reject = (reason: string) =>
          NextResponse.json({ ok: false, error: `Coupon not accepted: ${reason}` }, { status: 422 });
        const couponRows = await pgQuery<{
          id: string; status: string; usage_limit: number | null; usage_count: number;
          valid_from: string | null; valid_to: string | null; promotion_id: string | null;
        }>(
          `SELECT id, status, usage_limit, usage_count, valid_from, valid_to, promotion_id
             FROM public.commerce_coupons
            WHERE tenant_id = $1 AND UPPER(code) = $2
            LIMIT 1`,
          [tenant, code],
        );
        const coupon = couponRows[0];
        if (coupon) {
          if (String(coupon.status).toLowerCase() !== "active") return reject(`coupon is ${coupon.status}`);
          const now = Date.now();
          if (coupon.valid_from && new Date(coupon.valid_from).getTime() > now) return reject("coupon is not yet valid");
          if (coupon.valid_to && new Date(coupon.valid_to).getTime() < now) return reject("coupon has expired");
          if (coupon.usage_limit != null && Number(coupon.usage_count) >= Number(coupon.usage_limit)) return reject("coupon usage limit reached");
          let terms: Record<string, unknown> = {};
          if (coupon.promotion_id) {
            const promos = await pgQuery<Record<string, unknown>>(
              `SELECT name, promotion_type, value, minimum_subtotal, maximum_discount
                 FROM public.commerce_promotions WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
              [coupon.promotion_id, tenant],
            );
            terms = promos[0] || {};
          }
          await auditAction({ action, domain: "commerce", tableName: "commerce_coupons", recordId: coupon.id, afterData: { code, accepted: true }, actorUserId: actorId, ipAddress: ip });
          return NextResponse.json({ ok: true, code, couponId: coupon.id, ...terms });
        }
        const promoRows = await pgQuery<{
          id: string; name: string; promotion_type: string; value: number;
          minimum_subtotal: number | null; maximum_discount: number | null;
          start_at: string | null; end_at: string | null; usage_limit: number | null; usage_count: number;
        }>(
          `SELECT id, name, promotion_type, value, minimum_subtotal, maximum_discount,
                  start_at, end_at, usage_limit, usage_count
             FROM public.commerce_promotions
            WHERE tenant_id = $1 AND UPPER(code) = $2 AND active = true
            LIMIT 1`,
          [tenant, code],
        );
        const promo = promoRows[0];
        if (!promo) return NextResponse.json({ ok: false, error: "Coupon not recognized" }, { status: 404 });
        const now = Date.now();
        if (promo.start_at && new Date(promo.start_at).getTime() > now) return reject("promotion has not started");
        if (promo.end_at && new Date(promo.end_at).getTime() < now) return reject("promotion has ended");
        if (promo.usage_limit != null && Number(promo.usage_count) >= Number(promo.usage_limit)) return reject("promotion usage limit reached");
        await auditAction({ action, domain: "commerce", tableName: "commerce_promotions", recordId: promo.id, afterData: { code, accepted: true }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({
          ok: true, code, promotionId: promo.id, name: promo.name,
          promotion_type: promo.promotion_type, value: promo.value,
          minimum_subtotal: promo.minimum_subtotal, maximum_discount: promo.maximum_discount,
        });
      }

      // ───────────────────────────────────────────────────────────────────
      // RETURNS — list, review, track, view. Uses erp_return_authorizations
      // (the RMA table) + erp_return_lines for itemized breakdowns.
      // ───────────────────────────────────────────────────────────────────

      case "list_returns": {
        // List all return authorizations for the tenant, newest first.
        const limit = Math.min(parseInt(String(payload.limit || "100")) || 100, 500);
        const statusFilter = payload.status ? String(payload.status) : null;
        const where = ["r.tenant_id = $1"];
        const params: any[] = [tenant];
        let pi = 2;
        if (statusFilter) { where.push(`r.status::text = $${pi}`); params.push(statusFilter); pi++; }
        const rows = await pgQuery<{
          id: string; rma_number: string; status: string; order_id: string;
          crm_customer_id: string | null; reason_code: string | null;
          requested_at: string; approved_at: string | null; received_at: string | null;
          completed_at: string | null; notes: string | null;
          customer_name: string | null; order_number: string | null;
        }>(
          // Join notes: r.order_id is uuid while commerce_orders.id is
          // TEXT — the old `o.id = r.order_id` died with operator error
          // 42883 (swallowed by pgQuery → the list ALWAYS returned empty),
          // and commerce_orders has no order_number column at all. Order
          // numbers live on erp_orders; commerce orders fall back to id.
          `SELECT r.id, r.rma_number, r.status::text, r.order_id, r.crm_customer_id,
                  r.reason_code, r.requested_at::text, r.approved_at::text,
                  r.received_at::text, r.completed_at::text, r.notes,
                  (c.first_name || ' ' || c.last_name) AS customer_name,
                  COALESCE(eo.order_number, o.id) AS order_number
             FROM public.erp_return_authorizations r
             LEFT JOIN public.crm_customers c ON c.id = r.crm_customer_id AND c.tenant_id = r.tenant_id
             LEFT JOIN public.commerce_orders o ON o.id = r.order_id::text AND o.tenant_id = r.tenant_id
             LEFT JOIN public.erp_orders eo ON eo.id = r.order_id AND eo.tenant_id = r.tenant_id
            WHERE ${where.join(" AND ")}
            ORDER BY r.requested_at DESC NULLS LAST LIMIT $${pi}`,
          [...params, limit],
        );
        return NextResponse.json({
          ok: true,
          data: rows.map(r => ({
            id: r.id, rmaNumber: r.rma_number, status: r.status,
            orderId: r.order_id, orderNumber: r.order_number,
            customerId: r.crm_customer_id, customerName: r.customer_name,
            reasonCode: r.reason_code, requestedAt: r.requested_at,
            approvedAt: r.approved_at, receivedAt: r.received_at,
            completedAt: r.completed_at, notes: r.notes,
          })),
          total: rows.length,
        });
      }

      case "review_return": {
        // order_review_return → review_return
        // Update a return authorization's status + notes. The admin
        // inspects the return and either approves (status='inspection')
        // or rejects (status='rejected').
        // erp_return_status enum: requested, approved, awaiting_package,
        // in_transit, received, inspection, approved_for_refund,
        // rejected, restocked, refunded, exchanged, completed, cancelled
        const rmaId = String(payload.rma_id || payload.return_id || "");
        const notes = payload.notes ? String(payload.notes) : null;
        // Decision mapping. The Returns screen sends "approve" / "reject";
        // the old code recognized neither and silently defaulted BOTH to
        // "inspection" — clicking Reject set the return to inspection
        // while the screen announced "Return rejected." Map the UI verbs
        // explicitly, pass real enum statuses through, and refuse anything
        // else instead of guessing.
        const DECISIONS: Record<string, string> = {
          approve: "inspection", // approve the request → move to inspection
          reject: "rejected",
          approved: "approved",
          inspection: "inspection",
          awaiting_package: "awaiting_package",
          in_transit: "in_transit",
          received: "received",
          approved_for_refund: "approved_for_refund",
          rejected: "rejected",
          restocked: "restocked",
          refunded: "refunded",
          exchanged: "exchanged",
          completed: "completed",
          cancelled: "cancelled",
        };
        const newStatus = DECISIONS[String(payload.decision || "inspection").toLowerCase()];
        if (!newStatus) {
          return NextResponse.json({ ok: false, error: `Unknown review decision "${payload.decision}" — use approve, reject, or a return status` }, { status: 400 });
        }
        // §2.2.7a — a rejection records its reason (the review notes,
        // stored on the RMA); reject without one is refused, matching
        // the oversight POST /api/admin/returns rule.
        if (newStatus === "rejected" && !notes) {
          return NextResponse.json({ ok: false, error: "A reason is required to reject a return — add it in the review notes; it is recorded on the return." }, { status: 400 });
        }
        const updated = await pgExec(
          `UPDATE public.erp_return_authorizations
              SET status = $1::erp_return_status, notes = COALESCE($2, notes),
                  approved_at = CASE WHEN $1 IN ('approved_for_refund','restocked','completed') THEN now() ELSE approved_at END,
                  received_at = CASE WHEN $1 = 'received' THEN now() ELSE received_at END,
                  completed_at = CASE WHEN $1 IN ('completed','refunded','exchanged','restocked') THEN now() ELSE completed_at END,
                  updated_at = now()
            WHERE id = $3::uuid AND tenant_id = $4`,
          [newStatus, notes, rmaId, tenant],
        );
        if (!updated) {
          return NextResponse.json({ ok: false, error: "Return not found" }, { status: 404 });
        }
        await auditAction({ action, domain: "erp", tableName: "erp_return_authorizations", recordId: rmaId, afterData: { newStatus, notes, updated }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, rmaId, newStatus, updated, message: `Return ${newStatus}` });
      }

      case "track_return": {
        // order_track_return → track_return
        // Read-only: return the RMA status + key dates so the admin can
        // see where the return is in the pipeline.
        const rmaId = String(payload.rma_id || payload.return_id || "");
        const rows = await pgQuery<{
          id: string; rma_number: string; status: string; order_id: string;
          requested_at: string; approved_at: string | null; received_at: string | null; completed_at: string | null;
        }>(
          `SELECT id, rma_number, status::text, order_id,
                  requested_at::text, approved_at::text, received_at::text, completed_at::text
             FROM public.erp_return_authorizations
            WHERE id = $1::uuid AND tenant_id = $2`,
          [rmaId, tenant],
        );
        if (rows.length === 0) {
          return NextResponse.json({ ok: false, error: "Return not found" }, { status: 404 });
        }
        const r = rows[0];
        // §2.2.7b — the inbound tracking recorded ON the return (latest
        // commerce_return_events 'tracking_update'), so Track shows the
        // customer's carrier + number + carrier status, not just the
        // pipeline dates. Null until staff record tracking on the return.
        const trackRows = await pgQuery<{ payload: Record<string, unknown> | null; created_at: string }>(
          `SELECT payload, created_at::text AS created_at
             FROM public.commerce_return_events
            WHERE rma_id = $1::uuid AND tenant_id = $2 AND event_type = 'tracking_update'
            ORDER BY created_at DESC LIMIT 1`,
          [rmaId, tenant],
        );
        const tp = (trackRows[0]?.payload || {}) as Record<string, unknown>;
        const result = {
          rmaId: r.id, rmaNumber: r.rma_number, status: r.status, orderId: r.order_id,
          requestedAt: r.requested_at, approvedAt: r.approved_at,
          receivedAt: r.received_at, completedAt: r.completed_at,
          carrier: tp.carrier ? String(tp.carrier) : null,
          trackingNumber: tp.tracking_number ? String(tp.tracking_number) : null,
          carrierStatus: tp.carrier_status ? String(tp.carrier_status) : null,
          trackingRecordedAt: trackRows[0]?.created_at ?? null,
        };
        await auditAction({ action, domain: "erp", tableName: "erp_return_authorizations", recordId: rmaId, afterData: { status: r.status }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, returnTracking: result });
      }

      case "view_return": {
        // order_view_return → view_return
        // Read-only: return the full RMA details + itemized return lines
        // (sku, qty requested/received/approved).
        const rmaId = String(payload.rma_id || payload.return_id || "");
        const rmaRows = await pgQuery<{
          id: string; rma_number: string; status: string; order_id: string;
          crm_customer_id: string | null; reason_code: string | null;
          requested_at: string; approved_at: string | null; received_at: string | null;
          completed_at: string | null; notes: string | null;
        }>(
          `SELECT id, rma_number, status::text, order_id, crm_customer_id,
                  reason_code, requested_at::text, approved_at::text, received_at::text,
                  completed_at::text, notes
             FROM public.erp_return_authorizations
            WHERE id = $1::uuid AND tenant_id = $2`,
          [rmaId, tenant],
        );
        if (rmaRows.length === 0) {
          return NextResponse.json({ ok: false, error: "Return not found" }, { status: 404 });
        }
        const r = rmaRows[0];
        // Get the return line items
        const lineRows = await pgQuery<{
          id: string; sku_id: string; quantity_requested: string;
          quantity_received: string; quantity_approved: string;
        }>(
          `SELECT id, sku_id, quantity_requested::text, quantity_received::text, quantity_approved::text
             FROM public.erp_return_lines
            WHERE rma_id = $1::uuid AND tenant_id = $2`,
          [rmaId, tenant],
        );
        const lines = lineRows.map(l => ({
          lineId: l.id, skuId: l.sku_id,
          quantityRequested: Number(l.quantity_requested),
          quantityReceived: Number(l.quantity_received),
          quantityApproved: Number(l.quantity_approved),
        }));
        const result = {
          rmaId: r.id, rmaNumber: r.rma_number, status: r.status, orderId: r.order_id,
          customerId: r.crm_customer_id, reasonCode: r.reason_code,
          requestedAt: r.requested_at, approvedAt: r.approved_at,
          receivedAt: r.received_at, completedAt: r.completed_at, notes: r.notes,
          lines,
        };
        await auditAction({ action, domain: "erp", tableName: "erp_return_authorizations", recordId: rmaId, afterData: { status: r.status, lineCount: lines.length }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, returnDetails: result });
      }

      // ───────────────────────────────────────────────────────────────────
      // INVENTORY EXPORTS — CSV stock levels + ledger movement log
      // ───────────────────────────────────────────────────────────────────

      case "export_csv": {
        // com_export_csv (Orders surface, SA-37) — export ORDERS. This case
        // used to share a body with inv_export_csv and returned INVENTORY
        // data, so the Orders "Export CSV" action produced stock rows
        // (from a balances table that holds zero rows for this tenant).
        const rows = await pgQuery<{
          id: string; customer_email: string | null; status: string;
          payment_status: string | null; fulfillment_status: string | null;
          total_amount: string | null; created_at: string;
        }>(
          `SELECT id, customer_email, status, payment_status, fulfillment_status,
                  total_amount::text, created_at::text
             FROM public.commerce_orders
            WHERE tenant_id = $1
            ORDER BY created_at DESC
            LIMIT 1000`,
          [tenant],
        );
        const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const csv = [
          "id,customer_email,status,payment_status,fulfillment_status,total_amount,created_at",
          ...rows.map(r => [r.id, r.customer_email, r.status, r.payment_status, r.fulfillment_status, r.total_amount, r.created_at].map(esc).join(",")),
        ].join("\n");
        await auditAction({ action, domain: "commerce", tableName: "commerce_orders", recordId: null, afterData: { totalOrders: rows.length }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, csv, totalOrders: rows.length, rows });
      }

      case "inv_export_csv": {
        // inv_export_csv → inventory stock export (SA-37, Inventory surface)
        // Stock is DERIVED from erp_inventory_movements — the live
        // inventory system (SUM of signed movement quantities per SKU).
        // The old body read erp_inventory_balances, which has zero rows
        // for this tenant (its writer is dead code), so the export was
        // always an empty file.
        const rows = await pgQuery<{
          sku_id: string; sku_code: string; product_id: string | null;
          product_name: string | null; on_hand: string; last_unit_cost: string | null;
        }>(
          `SELECT s.id::text AS sku_id, s.sku AS sku_code, s.product_id::text AS product_id,
                  ci.name AS product_name,
                  COALESCE(SUM(CASE WHEN m.movement_type IN ('sale','damage','scrap','ship') THEN -m.quantity ELSE m.quantity END), 0)::text AS on_hand,
                  (SELECT m2.unit_cost::text FROM public.erp_inventory_movements m2
                    WHERE m2.sku_id = s.id AND m2.tenant_id = s.tenant_id
                    ORDER BY m2.occurred_at DESC LIMIT 1) AS last_unit_cost
             FROM public.erp_product_skus s
             LEFT JOIN public.commerce_catalog_items ci ON ci.id = s.product_id AND ci.tenant_id = s.tenant_id
             LEFT JOIN public.erp_inventory_movements m ON m.sku_id = s.id AND m.tenant_id = s.tenant_id
            WHERE s.tenant_id = $1
            GROUP BY s.id, s.sku, s.product_id, ci.name
            ORDER BY s.sku`,
          [tenant],
        );
        const inventory = rows.map(r => ({
          skuId: r.sku_id, skuCode: r.sku_code, productId: r.product_id,
          productName: r.product_name,
          onHand: Number(r.on_hand),
          unitCost: Number(r.last_unit_cost || 0),
          inventoryValue: Number(r.on_hand) * Number(r.last_unit_cost || 0),
        }));
        const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const csv = [
          "sku_code,product_name,on_hand,unit_cost,inventory_value",
          ...inventory.map(r => [r.skuCode, r.productName, r.onHand, r.unitCost.toFixed(2), r.inventoryValue.toFixed(2)].map(esc).join(",")),
        ].join("\n");
        const result = {
          totalSkus: inventory.length,
          totalOnHand: inventory.reduce((s, r) => s + r.onHand, 0),
          totalValue: inventory.reduce((s, r) => s + r.inventoryValue, 0),
          inventory,
        };
        await auditAction({ action, domain: "erp", tableName: "erp_inventory_movements", recordId: null, afterData: { totalSkus: inventory.length, totalValue: result.totalValue }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, csv, csvData: result });
      }

      case "export_ledger": {
        // com_export_ledger (SA-38, plugs B.3.2 Books) — the GENERAL
        // LEDGER: journal entry lines with accounts, via the same
        // rpc_get_general_ledger the Books/reports surfaces use, with the
        // spec's date-range + account filters and a CSV payload. This case
        // used to return the INVENTORY movement log — a different ledger
        // entirely (that data now lives only under inv_export_ledger).
        const fromDate = payload.from_date ? String(payload.from_date) : "2000-01-01";
        const toDate = payload.to_date ? String(payload.to_date) : new Date().toISOString().slice(0, 10);
        const accountFilter = payload.account_code ? String(payload.account_code) : (payload.account ? String(payload.account) : null);
        const glRows = await pgQuery<{
          entry_no: string; entry_date: string; posting_date: string; source: string;
          memo: string | null; reference: string | null; line_no: string;
          account_code: string; account_name: string; account_type: string;
          line_description: string | null; debit: string; credit: string; running_balance: string;
        }>(
          `SELECT * FROM public.rpc_get_general_ledger($1, $2::date, $3::date)`,
          [tenant, fromDate, toDate],
        );
        const glLines = glRows
          .filter(r => !accountFilter || r.account_code === accountFilter)
          .map(r => ({
            entryNo: Number(r.entry_no), entryDate: r.entry_date, postingDate: r.posting_date,
            source: r.source, memo: r.memo, reference: r.reference, lineNo: Number(r.line_no),
            accountCode: r.account_code, accountName: r.account_name, accountType: r.account_type,
            description: r.line_description, debit: Number(r.debit), credit: Number(r.credit),
            runningBalance: Number(r.running_balance),
          }));
        const escGl = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const glCsv = [
          "entry_no,entry_date,posting_date,source,reference,memo,line_no,account_code,account_name,account_type,description,debit,credit,running_balance",
          ...glLines.map(l => [l.entryNo, l.entryDate, l.postingDate, l.source, l.reference, l.memo, l.lineNo, l.accountCode, l.accountName, l.accountType, l.description, l.debit.toFixed(2), l.credit.toFixed(2), l.runningBalance.toFixed(2)].map(escGl).join(",")),
        ].join("\n");
        const glResult = {
          dateRange: { from: fromDate, to: toDate },
          accountFilter,
          lineCount: glLines.length,
          totalDebit: glLines.reduce((s, l) => s + l.debit, 0),
          totalCredit: glLines.reduce((s, l) => s + l.credit, 0),
          lines: glLines,
        };
        await auditAction({ action, domain: "acct", tableName: "acct_journal_entries", recordId: null, afterData: { lineCount: glLines.length, dateRange: glResult.dateRange }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, csv: glCsv, ledgerData: glResult });
      }

      case "inv_export_ledger": {
        // inv_export_ledger → the INVENTORY movement ledger (Inventory
        // surface): the full movement history from erp_inventory_movements
        // — every receipt, sale, transfer, adjustment. Not the general
        // ledger; see export_ledger above.
        const rows = await pgQuery<{
          id: string; movement_type: string; sku_id: string; warehouse_id: string | null;
          quantity: string; unit_cost: string; total_cost: string | null;
          source_type: string | null; source_id: string | null;
          reference: string | null; reason: string | null;
          occurred_at: string;
        }>(
          `SELECT id, movement_type::text, sku_id, warehouse_id,
                  quantity::text, unit_cost::text, total_cost::text,
                  source_type, source_id, reference, reason, occurred_at::text
             FROM public.erp_inventory_movements
            WHERE tenant_id = $1
            ORDER BY occurred_at DESC LIMIT 500`,
          [tenant],
        );
        const movements = rows.map(r => ({
          id: r.id, movementType: r.movement_type, skuId: r.sku_id,
          warehouseId: r.warehouse_id, quantity: Number(r.quantity),
          unitCost: Number(r.unit_cost), totalCost: Number(r.total_cost || 0),
          sourceType: r.source_type, sourceId: r.source_id,
          reference: r.reference, reason: r.reason, occurredAt: r.occurred_at,
        }));
        const result = {
          totalMovements: movements.length,
          totalQuantity: movements.reduce((s, m) => s + Math.abs(m.quantity), 0),
          totalCost: movements.reduce((s, m) => s + Math.abs(m.totalCost), 0),
          movements,
        };
        const escMv = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const mvCsv = [
          "occurred_at,movement_type,sku_id,quantity,unit_cost,total_cost,source_type,reference,reason",
          ...movements.map(m => [m.occurredAt, m.movementType, m.skuId, m.quantity, m.unitCost.toFixed(2), m.totalCost.toFixed(2), m.sourceType, m.reference, m.reason].map(escMv).join(",")),
        ].join("\n");
        await auditAction({ action, domain: "erp", tableName: "erp_inventory_movements", recordId: null, afterData: { totalMovements: movements.length, totalQuantity: result.totalQuantity }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, csv: mvCsv, ledgerData: result });
      }

      // ───────────────────────────────────────────────────────────────────
      // FULFILLMENT PRINT ACTIONS — packing slip, batch slips, postage
      // labels. These return structured data the frontend renders as a
      // printable view or PDF. Uses erp_orders + erp_order_lines for
      // line-item detail and commerce_orders for shipping info.
      // ───────────────────────────────────────────────────────────────────

      case "packing_slip": {
        // order_packing_slip → packing_slip
        // Generate a single packing slip: order header + line items.
        const orderId = String(payload.order_id || "");
        // Try erp_orders first (UUID-based, has line items)
        const erpRows = await pgQuery<{
          id: string; order_number: string; status: string;
          order_date: string; customer_email: string | null; customer_phone: string | null;
          fulfillment_method: string; total: string;
        }>(
          `SELECT id, order_number, status::text, order_date::text,
                  customer_email, customer_phone, fulfillment_method::text, total::text
             FROM public.erp_orders
            WHERE id = $1::uuid AND tenant_id = $2`,
          [orderId, tenant],
        );
        if (erpRows.length > 0) {
          const o = erpRows[0];
          const lineRows = await pgQuery<{
            id: string; sku_id: string; description: string | null;
            quantity: string; unit_price: string;
          }>(
            `SELECT id, sku_id, description, quantity::text, unit_price::text
               FROM public.erp_order_lines
              WHERE order_id = $1::uuid AND tenant_id = $2
              ORDER BY id`,
            [orderId, tenant],
          );
          const lines = lineRows.map(l => ({
            lineId: l.id, skuId: l.sku_id, description: l.description,
            quantity: Number(l.quantity), unitPrice: Number(l.unit_price),
            lineTotal: Number(l.quantity) * Number(l.unit_price),
          }));
          await auditAction({ action, domain: "erp", tableName: "erp_orders", recordId: orderId, afterData: { orderNumber: o.order_number, lineCount: lines.length }, actorUserId: actorId, ipAddress: ip });
          return NextResponse.json({ ok: true, packingSlip: {
            orderId: o.id, orderNumber: o.order_number, status: o.status,
            orderDate: o.order_date, customerEmail: o.customer_email,
            customerPhone: o.customer_phone, fulfillmentMethod: o.fulfillment_method,
            total: Number(o.total), lines, lineCount: lines.length,
          }});
        }
        // Fallback to commerce_orders (text-based ID) — with the order's
        // REAL line items from commerce_order_items. The old fallback
        // hardcoded lines: [], so every packing slip for a real shop order
        // printed with no items on it.
        const coRows = await pgQuery<{ id: string; customer_email: string | null; total_amount: string; status: string; fulfillment_status: string }>(
          `SELECT id, customer_email, total_amount::text, status, fulfillment_status
             FROM public.commerce_orders WHERE id = $1 AND tenant_id = $2`,
          [orderId, tenant],
        );
        if (coRows.length === 0) {
          return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
        }
        const co = coRows[0];
        const { loadOrderItems } = await import("@/lib/orders/lifecycle");
        const itemRows = await loadOrderItems(pgLifecycleClient, orderId);
        const lines = itemRows.map((i: any) => ({
          lineId: i.id, skuId: i.sku ?? null, description: i.product_name,
          quantity: Number(i.quantity), unitPrice: Number(i.unit_price),
          lineTotal: Number(i.quantity) * Number(i.unit_price),
        }));
        await auditAction({ action, domain: "commerce", tableName: "commerce_orders", recordId: orderId, afterData: { lineCount: lines.length }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, packingSlip: {
          orderId: co.id, orderNumber: co.id, status: co.status,
          fulfillmentStatus: co.fulfillment_status, customerEmail: co.customer_email,
          total: Number(String(co.total_amount || "0").replace(/[^0-9.]/g, "")) || 0, lines, lineCount: lines.length,
        }});
      }

      case "batch_slips": {
        // fulfill_batch_slips → batch_slips (SA-43)
        // Generate packing slips for multiple orders at once. Real orders
        // live in commerce_orders (TEXT ids) — the old body only queried
        // erp_orders with a uuid[] cast, so for every real shop order the
        // batch came back empty while the UI announced slips "queued".
        // If no order_ids are provided, selects commerce orders still
        // needing fulfillment.
        const orderIds = (payload.order_ids as string[]) || null;
        const coWhere = orderIds && orderIds.length > 0
          ? `tenant_id = $1 AND id::text = ANY($2::text[])`
          : `tenant_id = $1 AND lower(COALESCE(fulfillment_status, 'pending')) IN ('pending','unfulfilled','processing','packing')`;
        const coParams: unknown[] = orderIds && orderIds.length > 0 ? [tenant, orderIds] : [tenant];
        const coRows = await pgQuery<{ id: string; status: string; customer_email: string | null; total_amount: string | null; fulfillment_status: string | null; created_at: string }>(
          `SELECT id, status, customer_email, total_amount::text, fulfillment_status, created_at::text
             FROM public.commerce_orders
            WHERE ${coWhere}
            ORDER BY created_at DESC
            LIMIT 50`,
          coParams,
        );
        const slips: any[] = [];
        if (coRows.length > 0) {
          const ids = coRows.map(r => r.id);
          const itemRows = await pgQuery<{ id: string; order_id: string; name: string | null; quantity: string; unit_price: string | null; sku: string | null }>(
            `SELECT oi.id, oi.order_id, oi.name, oi.quantity::text, oi.unit_price::text, ci.sku
               FROM public.commerce_order_items oi
               LEFT JOIN public.commerce_catalog_items ci ON ci.id::text = oi.product_id::text
              WHERE oi.order_id::text = ANY($1::text[]) AND oi.tenant_id = $2
              ORDER BY oi.id`,
            [ids, tenant],
          );
          const byOrder = new Map<string, any[]>();
          for (const l of itemRows) {
            const arr = byOrder.get(l.order_id) || [];
            arr.push({
              lineId: l.id, skuId: l.sku ?? null, description: l.name,
              quantity: Number(l.quantity),
              unitPrice: Number(String(l.unit_price || "0").replace(/[^0-9.]/g, "")) || 0,
            });
            byOrder.set(l.order_id, arr);
          }
          for (const o of coRows) {
            const lines = byOrder.get(o.id) || [];
            slips.push({
              orderId: o.id, orderNumber: o.id, status: o.status,
              fulfillmentStatus: o.fulfillment_status,
              customerEmail: o.customer_email,
              total: Number(String(o.total_amount || "0").replace(/[^0-9.]/g, "")) || 0,
              lines, lineCount: lines.length,
            });
          }
        }
        const result = { slipCount: slips.length, totalLines: slips.reduce((s, sl) => s + sl.lineCount, 0), slips };
        await auditAction({ action, domain: "commerce", tableName: "commerce_orders", recordId: null, afterData: { slipCount: slips.length, totalLines: result.totalLines }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, batchSlips: result });
      }

      case "postage":
      case "print_postage":
      case "print_postage_labels": {
        // fulfill_postage → postage
        // If the order already has a label, return it for printing.
        // Otherwise PURCHASE a real label via the shared flow (Shippo/USPS) —
        // never a fake.
        const orderId = String(payload.order_id || "");
        if (!orderId) return NextResponse.json({ error: "order_id required" }, { status: 400 });
        const coRows = await pgQuery<{
          id: string; tracking_number: string | null; carrier: string | null;
          shipping_address: string | null; fulfillment_method: string | null;
          customer_email: string | null; total_amount: string;
          fulfillment_status: string;
        }>(
          `SELECT id, tracking_number, carrier, shipping_address,
                  fulfillment_method, customer_email, total_amount::text,
                  fulfillment_status
             FROM public.commerce_orders
            WHERE id = $1 AND tenant_id = $2`,
          [orderId, tenant],
        );
        if (coRows.length === 0) {
          return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
        }
        const o = coRows[0];
        if (o.tracking_number && payload.replace !== true) {
          // Already has a real label — return it for printing. With
          // replace: true the caller deliberately re-buys instead, falling
          // through to the shared purchase flow below — which re-checks
          // this same guard and logs the replacement. The printable
          // artifact is the carrier-issued label file stored at purchase
          // time (label_uri); include it so callers print the PROVIDER's
          // label, never a re-drawn one. Null when no file was stored.
          let shippingAddress: Record<string, unknown> | null = null;
          try {
            if (o.shipping_address) shippingAddress = JSON.parse(o.shipping_address);
          } catch { shippingAddress = { raw: o.shipping_address }; }
          const labelRows = await pgQuery<{ label_uri: string | null }>(
            `SELECT label_uri
               FROM public.commerce_shipping_labels
              WHERE tenant_id = $1 AND tracking_number = $2
              ORDER BY created_at DESC
              LIMIT 1`,
            [tenant, o.tracking_number],
          );
          await auditAction({ action, domain: "commerce", tableName: "commerce_orders", recordId: orderId, afterData: { carrier: o.carrier, trackingNumber: o.tracking_number }, actorUserId: actorId, ipAddress: ip });
          return NextResponse.json({
            ok: true,
            postageLabel: {
              orderId: o.id, carrier: o.carrier, trackingNumber: o.tracking_number,
              labelUrl: labelRows[0]?.label_uri || null,
              fulfillmentMethod: o.fulfillment_method, fulfillmentStatus: o.fulfillment_status,
              customerEmail: o.customer_email, total: Number(o.total_amount),
              shippingAddress,
            },
          });
        }
        // No label yet — buy a real one through the shared purchase flow.
        const result = await purchaseShippingLabel({ orderId, payload, action, actorId, ip, tenant });
        if (!result.ok) return NextResponse.json(result.body, { status: result.status });
        const label = (result.body as any).label;
        return NextResponse.json({
          ok: true,
          postageLabel: {
            orderId, carrier: label.provider, trackingNumber: label.trackingNumber,
            labelUrl: label.labelUrl, service: label.service,
            testMode: label.testMode, simulated: label.simulated,
          },
        });
      }

      case "view_vendor": {
        // po_view_vendor → view_vendor (SA-46 read half). The Purchasing
        // screen fires com_view_vendor — this case did not exist, so the
        // action died at the switch default with "Unknown action".
        const vendorId = String(payload.vendor_id || "");
        if (!vendorId) return NextResponse.json({ ok: false, error: "vendor_id required" }, { status: 400 });
        const rows = await pgQuery<Record<string, unknown>>(
          `SELECT id, vendor_number, name, email, phone, tax_identifier,
                  payment_terms, currency, is_active, metadata, created_at::text, updated_at::text
             FROM public.erp_vendors
            WHERE id = $1::uuid AND tenant_id = $2`,
          [vendorId, tenant],
        );
        if (!rows.length) {
          return NextResponse.json({ ok: false, error: "Vendor not found" }, { status: 404 });
        }
        return NextResponse.json({ ok: true, data: rows[0], vendor: rows[0] });
      }

      case "edit_vendor": {
        // po_edit_vendor → edit_vendor
        // Update a vendor's contact info, payment terms, or active status.
        const vendorId = String(payload.vendor_id || "");
        const name = payload.name ? String(payload.name) : null;
        const email = payload.email !== undefined ? String(payload.email) : null;
        const phone = payload.phone !== undefined ? String(payload.phone) : null;
        const taxIdentifier = payload.tax_identifier !== undefined ? String(payload.tax_identifier) : null;
        const paymentTerms = payload.payment_terms !== undefined ? String(payload.payment_terms) : null;
        const currency = payload.currency !== undefined ? String(payload.currency) : null;
        const isActive = payload.is_active !== undefined ? Boolean(payload.is_active) : null;
        const updated = await pgExec(
          `UPDATE public.erp_vendors
              SET name = COALESCE($1, name),
                  email = COALESCE($2, email),
                  phone = COALESCE($3, phone),
                  tax_identifier = COALESCE($4, tax_identifier),
                  payment_terms = COALESCE($5, payment_terms),
                  currency = COALESCE($6, currency),
                  is_active = COALESCE($7, is_active),
                  updated_at = now()
            WHERE id = $8::uuid AND tenant_id = $9`,
          [name, email, phone, taxIdentifier, paymentTerms, currency, isActive, vendorId, tenant],
        );
        if (!updated) {
          return NextResponse.json({ ok: false, error: "Vendor not found" }, { status: 404 });
        }
        await auditAction({ action, domain: "erp", tableName: "erp_vendors", recordId: vendorId, afterData: { name, email, phone, updated }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, vendorId, updated, message: "Vendor updated" });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action} (short: ${shortAction})` }, { status: 400 });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[commerce/actions] ${action} failed:`, msg);
    return NextResponse.json({ error: msg, action }, { status: 500 });
  }
}
