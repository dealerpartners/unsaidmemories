// ---------------------------------------------------------------------------
// /api/admin/inventory/actions/route.ts
//
// Inventory quick actions — FULL_FEATURE_TREE.txt Section 4
// (Order & Inventory) inventory half.
//
// Actions:
//   restock, add_inventory, adjust_stock, barcode_lookup, receive_shipment,
//   transfer_stock, low_stock_report
//
// Tables: erp_products, erp_inventory_balances, erp_warehouses,
// erp_inventory_transactions (movements ledger).
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { guardPayloadIds, guardRequiredFields } from "@/lib/quick-actions/validate";
import { requireAdminApi } from "@/lib/admin/gate";
import { adminGet, adminCreate, adminUpdate, adminList, resolveTenantId} from "@/lib/admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const T = {
  products: "erp_products",
  balances: "erp_inventory_balances",
  warehouses: "erp_warehouses",
  txns: "erp_inventory_transactions",
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
      case "restock":
      case "add_inventory":
      case "adjust_stock": {
        const productId = String(p.product_id || p.erp_product_id || "");
        const warehouseId = String(p.warehouse_id || "");
        const delta = Number(p.quantity ?? p.delta ?? 0);
        if (!productId || !delta) return NextResponse.json({ error: "product_id and quantity required" }, { status: 400 });
        // Find or create the balance row
        const bal = await adminList(T.balances, { tenantId: resolveTenantId(req),  filters: { product_id: productId, ...(warehouseId ? { warehouse_id: warehouseId } : {}) }, limit: 1 });
        const bj = await bal.json().catch(() => ({ data: [] }));
        let balanceRow = (bj?.data || [])[0] || null;
        if (!balanceRow) {
          const c = await adminCreate(T.balances, {
            product_id: productId,
            warehouse_id: warehouseId || null,
            quantity_on_hand: 0,
            quantity_reserved: 0,
          }, { tenantId: resolveTenantId(req) });
          const cj = await c.json().catch(() => null);
          balanceRow = cj?.data || null;
          if (!balanceRow) return NextResponse.json({ error: "Inventory balance table not available" }, { status: 501 });
        }
        const newQoh = Number(balanceRow.quantity_on_hand || 0) + delta;
        const upd = await adminUpdate(T.balances, balanceRow.id, { quantity_on_hand: newQoh }, { tenantId: resolveTenantId(req) });
        const updJ = await upd.clone().json().catch(() => null);
        if (!upd.ok || updJ?.error || updJ?._empty || !updJ?.data) {
          return NextResponse.json({ error: "Inventory balance could not be updated — the stock change was not saved" }, { status: 502 });
        }
        // Movement ledger entry
        await adminCreate(T.txns, {
          product_id: productId,
          warehouse_id: warehouseId || balanceRow.warehouse_id || null,
          quantity_delta: delta,
          quantity_after: newQoh,
          movement_type: action === "adjust_stock" ? "adjustment" : "restock",
          reason: p.reason || null,
          reference: p.reference || null,
        }, { tenantId: resolveTenantId(req) });
        const uj = await upd.json().catch(() => null);
        return NextResponse.json({ data: uj?.data || { quantity_on_hand: newQoh }, previous: Number(balanceRow.quantity_on_hand || 0), delta });
      }
      case "barcode_lookup": {
        const barcode = String(p.barcode || "");
        if (!barcode) return NextResponse.json({ error: "barcode required" }, { status: 400 });
        const r = await adminList(T.products, { tenantId: resolveTenantId(req),  filters: { barcode }, limit: 1 });
        const rj = await r.json().catch(() => ({ data: [] }));
        const row = (rj?.data || [])[0];
        if (!row) {
          const r2 = await adminList(T.products, { tenantId: resolveTenantId(req),  filters: { sku: barcode }, limit: 1 });
          const rj2 = await r2.json().catch(() => ({ data: [] }));
          const row2 = (rj2?.data || [])[0];
          if (!row2) return NextResponse.json({ error: "No product found for barcode" }, { status: 404 });
          return NextResponse.json({ data: row2 });
        }
        return NextResponse.json({ data: row });
      }
      case "receive_shipment": {
        const poId = String(p.po_id || "");
        const items: any[] = Array.isArray(p.items) ? p.items : [];
        if (!items.length) return NextResponse.json({ error: "items required" }, { status: 400 });
        const applied: any[] = [];
        for (const it of items) {
          const productId = String(it.product_id || "");
          const qty = Number(it.quantity ?? 0);
          if (!productId || !qty) continue;
          const bal = await adminList(T.balances, { tenantId: resolveTenantId(req),  filters: { product_id: productId }, limit: 1 });
          const bj = await bal.json().catch(() => ({ data: [] }));
          const row = (bj?.data || [])[0];
          if (row) {
            const newQoh = Number(row.quantity_on_hand || 0) + qty;
            const u = await adminUpdate(T.balances, row.id, { quantity_on_hand: newQoh }, { tenantId: resolveTenantId(req) });
            const uj2 = await u.json().catch(() => null);
            if (uj2?.data) applied.push({ product_id: productId, quantity: qty, new_on_hand: newQoh });
          }
        }
        await adminCreate(T.txns, {
          movement_type: "po_receipt",
          reason: `PO ${poId || "manual"} receipt`,
          reference: poId || null,
          quantity_delta: applied.reduce((s, a) => s + a.quantity, 0),
        }, { tenantId: resolveTenantId(req) });
        return NextResponse.json({ ok: true, applied, po_id: poId || null });
      }
      case "transfer_stock": {
        const productId = String(p.product_id || "");
        const fromWh = String(p.from_warehouse_id || "");
        const toWh = String(p.to_warehouse_id || "");
        const qty = Number(p.quantity ?? 0);
        if (!productId || !fromWh || !toWh || !qty) return NextResponse.json({ error: "product_id, from_warehouse_id, to_warehouse_id, quantity required" }, { status: 400 });
        const fromBal = await adminList(T.balances, { tenantId: resolveTenantId(req),  filters: { product_id: productId, warehouse_id: fromWh }, limit: 1 });
        const fj = await fromBal.json().catch(() => ({ data: [] }));
        const fromRow = (fj?.data || [])[0];
        if (!fromRow || Number(fromRow.quantity_on_hand || 0) < qty) return NextResponse.json({ error: "Insufficient stock at source warehouse" }, { status: 422 });
        const dec = await adminUpdate(T.balances, fromRow.id, { quantity_on_hand: Number(fromRow.quantity_on_hand) - qty }, { tenantId: resolveTenantId(req) });
        const decJ = await dec.json().catch(() => null);
        if (!decJ?.data) return NextResponse.json({ error: "Source warehouse balance could not be updated — transfer aborted, no stock moved" }, { status: 502 });
        const toBal = await adminList(T.balances, { tenantId: resolveTenantId(req),  filters: { product_id: productId, warehouse_id: toWh }, limit: 1 });
        const tj = await toBal.json().catch(() => ({ data: [] }));
        const toRow = (tj?.data || [])[0];
        let credited = false;
        if (toRow) {
          const inc = await adminUpdate(T.balances, toRow.id, { quantity_on_hand: Number(toRow.quantity_on_hand) + qty }, { tenantId: resolveTenantId(req) });
          const incJ = await inc.json().catch(() => null);
          credited = !!incJ?.data;
        } else {
          const cre = await adminCreate(T.balances, { product_id: productId, warehouse_id: toWh, quantity_on_hand: qty, quantity_reserved: 0 }, { tenantId: resolveTenantId(req) });
          const creJ = await cre.json().catch(() => null);
          credited = !!creJ?.data;
        }
        if (!credited) return NextResponse.json({ error: "Source warehouse was debited but the destination balance could not be updated — reconcile the destination balance manually" }, { status: 502 });
        return NextResponse.json({ ok: true, product_id: productId, transferred: qty, from: fromWh, to: toWh });
      }
      case "low_stock_report": {
        const threshold = Number(p.threshold ?? 10);
        const r = await adminList(T.balances, { tenantId: resolveTenantId(req),  limit: 500 });
        const rj = await r.json().catch(() => ({ data: [] }));
        const low = (rj?.data || []).filter((b: any) => Number(b.quantity_on_hand || 0) <= threshold);
        return NextResponse.json({ data: low, total: low.length, threshold });
      }
      default:
        return NextResponse.json({ error: `Unknown inventory action: ${action}` }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "inventory action failed", action }, { status: 500 });
  }
}
