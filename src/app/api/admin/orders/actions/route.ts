// ---------------------------------------------------------------------------
// /api/admin/orders/actions/route.ts
//
// Order & Inventory + Fulfillment quick actions — FULL_FEATURE_TREE.txt
// Sections 4 and 5.
//
// Actions:
//   ORDERS: create_order, resend_alert, export_csv, review_return,
//           track_return, view_return, create_return
//   FULFILLMENT: advance_stage, batch_packing_slips, print_postage_label
//
// Packing slip / shipping label return structured data for the UI to
// render/print — they are data actions, not stubs.
//
// Tables: commerce_orders, commerce_order_items, erp_fulfillment_orders,
// customer_return_requests.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { guardPayloadIds, guardRequiredFields } from "@/lib/quick-actions/validate";
import { requireAdminApi } from "@/lib/admin/gate";
import { adminGet, adminCreate, adminUpdate, adminList, adminQuery, resolveTenantId} from "@/lib/admin-api";
import type { ShippoLabel } from "@/lib/shippo";
import { pgExec, pgQuery, pgQueryStrict } from "@/lib/pg";
import { existingOrderLabel, logOrderEvent, parseShipTo } from "@/lib/orders/lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const T = {
  orders: "commerce_orders",
  orderItems: "commerce_order_items",
  fulfillment: "erp_fulfillment_orders",
  returns: "customer_return_requests",
};

const FULFILLMENT_STAGES = ["pending", "picking", "packing", "packed", "shipped", "delivered"];

// The orders lifecycle helpers (logOrderEvent) take a minimal { query }
// client. pgQuery matches that contract — it never throws (failures
// surface as []), and the helpers are built for exactly that: a failed
// event insert is non-fatal.
const pgLifecycleClient = {
  query: async (sql: string, params?: unknown[]) => ({
    rows: await pgQuery(sql, params ?? []),
  }),
};

export async function POST(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  let body: Record<string, any> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const action = String(body.action || "");
  const p = body.payload ?? body;
  const idGuard = guardPayloadIds(p);
  if (idGuard) return idGuard;
  const reqGuard = guardRequiredFields(action, p);
  if (reqGuard) return reqGuard;

  try {
    switch (action) {
      // ── ORDERS ────────────────────────────────────────────────────
      case "create_order": {
        // SA-31 — create a manual order with its line items. The old body
        // wrote subtotal_cents / total_cents / currency columns that do
        // not exist on commerce_orders (money is TEXT: subtotal /
        // total_amount, "$25.27" format), so the create failed on every
        // call; the item inserts named catalog_item_id / sku /
        // unit_price_cents columns that commerce_order_items does not
        // have either, and their failures were swallowed. Written now
        // with the real schema, via pg, with checked results.
        const tenant = resolveTenantId(req);
        const money = (n: number) => `$${(Math.round(n * 100) / 100).toFixed(2)}`;
        const rawItems = (Array.isArray(p.items) ? p.items : Array.isArray(p.line_items) ? p.line_items : []) as Array<Record<string, any>>;
        type NewItem = { productId: string | null; name: string; quantity: number; unitPrice: number };
        const items: NewItem[] = [];
        for (const it of rawItems) {
          const qty = Number(it.quantity ?? 1);
          if (!qty || qty <= 0) continue;
          const unitPrice = it.unit_price_cents !== undefined ? Number(it.unit_price_cents) / 100 : Number(it.unit_price ?? 0);
          items.push({
            productId: it.catalog_item_id || it.product_id || null,
            name: it.name ? String(it.name) : "Item",
            quantity: qty,
            unitPrice,
          });
        }
        const itemsTotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
        const subtotal = p.subtotal_cents !== undefined ? Number(p.subtotal_cents) / 100 : itemsTotal;
        const total = p.total_cents !== undefined ? Number(p.total_cents) / 100 : subtotal
          + (p.tax_cents !== undefined ? Number(p.tax_cents) / 100 : 0)
          + (p.shipping_cents !== undefined ? Number(p.shipping_cents) / 100 : 0);
        const orderId = crypto.randomUUID();
        const orderRows = await pgQuery<{ id: string }>(
          `INSERT INTO public.commerce_orders
             (id, tenant_id, customer_id, customer_email, email, subtotal, total_amount,
              status, payment_status, fulfillment_status, fulfillment_method,
              shipping_address, notes, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $4, $5, $6, $7, 'unpaid', 'pending', 'in_store', $8, $9, now(), now())
           RETURNING id`,
          [orderId, tenant, p.customer_id || null, p.customer_email || null,
           money(subtotal), money(total), p.status || "pending",
           typeof p.shipping_address === "string" ? p.shipping_address : (p.shipping_address ? JSON.stringify(p.shipping_address) : null),
           p.notes || null],
        );
        if (!orderRows.length) {
          return NextResponse.json({ error: "Order could not be created — the order was not saved" }, { status: 500 });
        }
        const createdItems: any[] = [];
        const failedItems: any[] = [];
        for (const it of items) {
          const landed = await pgExec(
            `INSERT INTO public.commerce_order_items
               (id, tenant_id, order_id, product_id, name, quantity, unit_price, created_at)
             VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, now())`,
            [tenant, orderId, it.productId, it.name, it.quantity, money(it.unitPrice)],
          );
          if (landed) createdItems.push(it);
          else failedItems.push(it);
        }
        if (items.length > 0 && createdItems.length === 0) {
          return NextResponse.json({ error: `Order ${orderId} was created but none of its line items could be saved`, order_id: orderId }, { status: 500 });
        }
        if (failedItems.length > 0) {
          return NextResponse.json({ error: `Order ${orderId} was created but ${failedItems.length} of ${items.length} line items could not be saved`, order_id: orderId, items: createdItems, failedItems }, { status: 500 });
        }
        // Seller attribution (tree §5) — manual orders join the same
        // contract as shop checkout: when the saved lines carry catalog
        // product ids that resolve to exactly one approved seller, stamp
        // the order (metadata.seller_id + the seller_orders bridge row)
        // so the sale surfaces on that seller's portal and in earnings
        // accrual like any other order. Free-text lines (no product id)
        // cannot resolve a seller and stay platform orders, exactly as
        // an unattributed cart does. Failure-isolated: attribution never
        // fails order creation. The strict adapter is deliberate (see
        // shop/checkout): pgQuery swallows errors into [], which inside
        // the writer reads as "no seller" and would hide a real failure.
        const productIds = createdItems
          .map((i) => i.productId)
          .filter((x): x is string => Boolean(x));
        let attribution: { attributed: boolean; sellerId: string | null } = { attributed: false, sellerId: null };
        if (productIds.length > 0) {
          try {
            const { attributeCommerceOrder } = await import("@/lib/sellers/attribution");
            const attr = await attributeCommerceOrder(
              (sql, params) => pgQueryStrict<Record<string, unknown>>(sql, params),
              { tenantId: tenant, orderId, productIds, customerName: p.customer_name || null },
            );
            if (attr.attributed) {
              attribution = { attributed: true, sellerId: attr.sellerId };
            } else if (attr.reason === "mixed") {
              console.error("[admin/orders/actions] manual order spans multiple sellers — the readers' contract carries one seller per order; left unattributed:", orderId);
            }
          } catch (e: any) {
            console.error("[admin/orders/actions] seller attribution failed:", e?.message);
          }
        }
        return NextResponse.json({
          data: { id: orderId, status: p.status || "pending", subtotal: money(subtotal), total_amount: money(total) },
          items: createdItems,
          attribution,
        }, { status: 201 });
      }
      case "resend_alert": {
        // SA-36 — actually email the customer (shared deliverOrderAlert).
        // The old body stamped an `alert_resent_at` column that does not
        // exist on commerce_orders, so the update failed on every call —
        // and even a stamped row would not have sent anything.
        const orderId = String(p.order_id || "");
        if (!orderId) return NextResponse.json({ error: "order_id required" }, { status: 400 });
        const { deliverOrderAlert } = await import("@/lib/orders/resend-alert");
        const result = await deliverOrderAlert({
          tenant: resolveTenantId(req),
          orderId,
          message: p.message ? String(p.message) : null,
        });
        if (!result.ok) {
          return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
        }
        return NextResponse.json({ ok: true, order_id: orderId, alert_resent: true, emailed: true, to: result.to });
      }
      case "export_csv": {
        const q = adminQuery(req);
        const list = await adminList(T.orders, { tenantId: resolveTenantId(req),  limit: 1000, offset: 0, filters: q.filters });
        const lj = await list.json().catch(() => ({ data: [] }));
        const rows: any[] = lj?.data || [];
        // Real commerce_orders columns — the old header named total_cents
        // and currency, which the table does not have, so those columns
        // exported blank for every row.
        const header = "id,status,payment_status,fulfillment_status,total_amount,customer_email,created_at";
        const lines = rows.map((r: any) => [r.id, r.status, r.payment_status, r.fulfillment_status, r.total_amount, r.customer_email, r.created_at].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
        const csv = [header, ...lines].join("\n");
        return new NextResponse(csv, { headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=orders-export.csv" } });
      }
      case "create_return":
      case "review_return": {
        if (action === "create_return") {
          return adminCreate(T.returns, {
            order_id: p.order_id || null,
            customer_id: p.customer_id || null,
            reason: p.reason || null,
            status: "requested",
            items: p.items || null,
          }, { tenantId: resolveTenantId(req) });
        }
        const id = String(p.return_id || "");
        if (!id) return NextResponse.json({ error: "return_id required" }, { status: 400 });
        // With a decision, review WRITES the outcome (SA-39 approve/deny);
        // the old case only fetched the row, so "review" changed nothing.
        // Without one, it returns the request (view behavior).
        const decisionRaw = p.decision || p.status;
        if (!decisionRaw) {
          return adminGet(T.returns, id, { tenantId: resolveTenantId(req) });
        }
        const DECISIONS: Record<string, string> = {
          approve: "approved", approved: "approved",
          reject: "rejected", rejected: "rejected",
          requested: "requested", completed: "completed",
          cancelled: "cancelled", refunded: "refunded",
        };
        const newStatus = DECISIONS[String(decisionRaw).toLowerCase()];
        if (!newStatus) {
          return NextResponse.json({ error: `Unknown review decision "${decisionRaw}" — use approve or reject` }, { status: 400 });
        }
        const existing = await adminGet(T.returns, id, { tenantId: resolveTenantId(req) });
        const ej = await existing.clone().json().catch(() => null);
        if (!existing.ok || ej?.error || !ej?.data) return existing;
        const patch: Record<string, any> = { status: newStatus, handled_by: "admin" };
        if (p.notes || p.admin_notes) patch.admin_notes = String(p.notes || p.admin_notes);
        return adminUpdate(T.returns, id, patch, { tenantId: resolveTenantId(req) });
      }
      case "track_return":
      case "view_return": {
        const id = String(p.return_id || "");
        if (!id) return NextResponse.json({ error: "return_id required" }, { status: 400 });
        return adminGet(T.returns, id, { tenantId: resolveTenantId(req) });
      }

      // ── FULFILLMENT ───────────────────────────────────────────────
      case "advance_fulfillment_stage": {
        const id = String(p.fulfillment_id || p.order_id || "");
        if (!id) return NextResponse.json({ error: "fulfillment_id required" }, { status: 400 });
        const cur = await adminGet(T.fulfillment, id, { tenantId: resolveTenantId(req) });
        const cj = await cur.json().catch(() => null);
        // Legacy rows carry UPPERCASE "UNFULFILLED" — normalize before
        // stepping, or indexOf misses (-1) and the stage jumps wrong.
        const normalizeStage = (s: string) => {
          const v = s.toLowerCase();
          return v === "unfulfilled" ? "pending" : v;
        };
        if (cj?._empty) {
          // Fall back to advancing the order itself
          const o = await adminGet(T.orders, id, { tenantId: resolveTenantId(req) });
          const oj = await o.json().catch(() => null);
          if (!oj?.data) return NextResponse.json({ error: "Fulfillment/order not found" }, { status: 404 });
          const curStage = normalizeStage(String(oj.data.fulfillment_status || oj.data.status || "pending"));
          const next = FULFILLMENT_STAGES[FULFILLMENT_STAGES.indexOf(curStage) + 1] || curStage;
          return adminUpdate(T.orders, id, { fulfillment_status: next }, { tenantId: resolveTenantId(req) });
        }
        if (!cj?.data) return NextResponse.json({ error: "Fulfillment not found" }, { status: 404 });
        const curStage = normalizeStage(String(cj.data.stage || "pending"));
        const next = FULFILLMENT_STAGES[FULFILLMENT_STAGES.indexOf(curStage) + 1] || curStage;
        return adminUpdate(T.fulfillment, id, { stage: next, [`${next}_at`]: new Date().toISOString() }, { tenantId: resolveTenantId(req) });
      }
      case "packing_slip": {
        const orderId = String(p.order_id || "");
        if (!orderId) return NextResponse.json({ error: "order_id required" }, { status: 400 });
        const o = await adminGet(T.orders, orderId, { tenantId: resolveTenantId(req) });
        const oj = await o.json().catch(() => null);
        if (!oj?.data) return NextResponse.json({ error: "Order not found" }, { status: 404 });
        const items = await adminList(T.orderItems, { tenantId: resolveTenantId(req),  filters: { order_id: orderId }, limit: 200 });
        const ij = await items.json().catch(() => ({ data: [] }));
        return NextResponse.json({ data: { order: oj.data, items: ij.data || [], generated_at: new Date().toISOString() } });
      }
      case "batch_packing_slips": {
        const ids: string[] = Array.isArray(p.order_ids) ? p.order_ids : [];
        if (!ids.length) return NextResponse.json({ error: "order_ids required" }, { status: 400 });
        const slips: any[] = [];
        for (const oid of ids.slice(0, 50)) {
          const o = await adminGet(T.orders, oid, { tenantId: resolveTenantId(req) });
          const oj = await o.json().catch(() => null);
          if (!oj?.data) continue;
          // A packing slip without its line items is a blank sheet — the
          // old body returned the order row alone. Include the items.
          const ij = await adminList(T.orderItems, {
            tenantId: resolveTenantId(req), limit: 200, offset: 0,
            filters: { order_id: oid },
          }).then(r => r.json().catch(() => null)).catch(() => null);
          slips.push({ order: oj.data, items: ij?.data || [] });
        }
        return NextResponse.json({ data: slips, count: slips.length });
      }
      case "shipping_label":
      case "print_postage_label": {
        // Purchase a REAL carrier label via Shippo. Honest "not configured"
        // state when no API key — never fakes a label.
        const orderId = String(p.order_id || "");
        if (!orderId) return NextResponse.json({ error: "order_id required" }, { status: 400 });
        const o = await adminGet(T.orders, orderId, { tenantId: resolveTenantId(req) });
        const oj = await o.json().catch(() => null);
        const od = oj?.data;
        if (!od) return NextResponse.json({ error: "Order not found" }, { status: 404 });

        // Double-buy guard — the same rule the order-screen label endpoint
        // enforces: an order that already carries a tracking number is
        // refused BEFORE purchasing, because a second buy would silently
        // overwrite the label already paid for. The one deliberate
        // exception is replace: true in the payload.
        const existingLabel = existingOrderLabel(od);
        if (existingLabel && p.replace !== true) {
          return NextResponse.json({
            error: "order_already_labeled",
            message: `Order already has a ${existingLabel.carrier || "carrier"} label (tracking ${existingLabel.trackingNumber}). Buying another label would replace it — include replace: true to buy a replacement label deliberately.`,
            carrier: existingLabel.carrier,
            trackingNumber: existingLabel.trackingNumber,
          }, { status: 409 });
        }

        // Ship-to via the shared parser — the same one the order-screen
        // label endpoint, the rates lookup, and the shipping station use.
        // It handles the JSON object form AND the plain-string forms shop
        // checkout actually stores ("1486 Charles St · Memphis, TN 38141");
        // the old inline JSON-only parse 400'd every plain-string order.
        // Returns null when no ZIP can be recovered — never guess an address.
        const fallbackName = od.customer_name || od.customer_email || "Customer";
        const to = parseShipTo(od.shipping_address, fallbackName);
        if (!to || !to.zip) {
          return NextResponse.json({
            error: "no_shipping_address",
            message: "Order has no usable shipping address — cannot purchase a label.",
          }, { status: 400 });
        }

        let label: ShippoLabel;
        try {
          const { shippoBuyLabel } = await import("@/lib/shippo");
          label = await shippoBuyLabel({
            to: { ...to, email: od.customer_email || undefined },
            weightLb: Number(p.weight_lb) || 2,
            carrier: p.carrier ? String(p.carrier) : undefined,
            orderId, // return address resolves to the order's seller / house tenant
          });
        } catch (e: any) {
          const msg = String(e?.message || "");
          if (msg === "shippo_not_configured") {
            return NextResponse.json({
              error: "shippo_not_configured",
              message: "Shipping is not configured — set SHIPPO_API_KEY (or SHIPPO_TEST_API) to purchase labels.",
            }, { status: 503 });
          }
          if (e?.name === "ReturnAddressError" || msg.startsWith("Return address")) {
            return NextResponse.json({ error: "return_address_not_set", message: msg }, { status: 422 });
          }
          return NextResponse.json({ error: msg || "label purchase failed" }, { status: 502 });
        }

        // Persist ONLY the real label — the exact shape the order-screen
        // label endpoint (POST /api/admin/orders/[id]/label) and the
        // commerce purchase flow use: tracking + carrier + metadata stamps
        // on the order, the label record, and the fulfillment event.
        // (commerce_orders has NO shipping_label_generated_at column — the
        // stamp lives in metadata. The old adminUpdate wrote that column,
        // failed, and its result was never checked, so a purchased label's
        // tracking was silently lost: money spent, nothing recorded.)
        // The order UPDATE is CHECKED: the label is already bought at this
        // point, so a failed save surfaces loudly — with the tracking
        // number, so the purchase can be recovered — instead of success.
        const tenant = resolveTenantId(req);
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
          return NextResponse.json({
            error: "label_purchased_not_saved",
            message: `A ${label.provider} label was purchased (tracking ${label.trackingNumber}) but could not be saved on order ${orderId}. Do NOT buy another label — record this tracking number on the order manually.`,
            trackingNumber: label.trackingNumber,
            provider: label.provider,
            labelUrl: label.labelUrl,
          }, { status: 500 });
        }
        const labelRowSaved = await pgExec(
          `INSERT INTO public.commerce_shipping_labels
             (tenant_id, carrier, tracking_number, label_type, label_uri, postage_amount, created_at)
           VALUES ($1, $2, $3, 'shipping', $4, $5, now())`,
          [tenant, label.provider, label.trackingNumber, label.labelUrl || null, label.rateCents / 100],
        );
        if (labelRowSaved === 0) {
          return NextResponse.json({
            error: "label_row_not_saved",
            message: `A ${label.provider} label was purchased (tracking ${label.trackingNumber}) but its label row could not be saved. Do NOT buy another label — record this tracking number manually.`,
            trackingNumber: label.trackingNumber,
            provider: label.provider,
            labelUrl: label.labelUrl,
          }, { status: 500 });
        }
        await logOrderEvent(pgLifecycleClient, tenant, orderId, "label_purchased",
          String(od.fulfillment_status || "pending"), String(od.fulfillment_status || "pending"),
          {
            carrier: label.provider, trackingNumber: label.trackingNumber,
            service: label.service, rateCents: label.rateCents, testMode: !!label.testMode,
            // A deliberate replacement (replace: true) names the label it
            // replaced, so the order's history shows both tracking numbers.
            ...(existingLabel
              ? { replaced: true, replacedCarrier: existingLabel.carrier, replacedTrackingNumber: existingLabel.trackingNumber }
              : {}),
          });
        return NextResponse.json({
          data: {
            order: od,
            label: {
              labelUrl: label.labelUrl,
              trackingNumber: label.trackingNumber,
              trackingUrl: label.trackingUrl,
              provider: label.provider,
              service: label.service,
              rateCents: label.rateCents,
              testMode: label.testMode,
            },
          },
        });
      }

      default:
        return NextResponse.json({ error: `Unknown order action: ${action}` }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "order action failed", action }, { status: 500 });
  }
}
