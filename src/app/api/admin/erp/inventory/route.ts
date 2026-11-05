import { NextRequest, NextResponse } from "next/server";
import { requireAdminActor } from "@/lib/admin/gate";
import { listInventory, listWarehouses, listWarehouseLocations, applyStockMovement, receiveStock } from "@/lib/orders/erp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/erp/inventory?q= — balances with variant/warehouse/rule joins.
export async function GET(req: NextRequest) {
  const gate = await requireAdminActor();
  if ("error" in gate) return gate.error;
  try {
    const [rows, warehouses, locations] = await Promise.all([
      listInventory(req.nextUrl.searchParams.get("q") || undefined),
      listWarehouses(),
      listWarehouseLocations(),
    ]);
    return NextResponse.json({ balances: rows, warehouses, locations });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/admin/erp/inventory { action: "adjust"|"count"|"receive"|"transfer"|"damage", ... }
// Every action writes an erp_inventory_movements row and moves the balance.
export async function POST(req: NextRequest) {
  const gate = await requireAdminActor();
  if ("error" in gate) return gate.error;
  const body = await req.json().catch(() => null);
  if (!body?.skuId || !body?.action) {
    return NextResponse.json({ error: "skuId and action are required" }, { status: 400 });
  }
  try {
    const actorId = gate.actor.userId;
    if (body.action === "receive") {
      if (!body.warehouseId) return NextResponse.json({ error: "warehouseId is required for receiving" }, { status: 400 });
      const r = await receiveStock({
        skuId: body.skuId, warehouseId: body.warehouseId, quantity: Number(body.quantity),
        unitCost: body.unitCost ? Number(body.unitCost) : undefined,
        binLocation: body.binLocation, actorId, reference: body.reason,
      });
      return NextResponse.json(r);
    }
    if (body.action === "transfer") {
      if (!body.toWarehouseId) return NextResponse.json({ error: "toWarehouseId is required for transfer" }, { status: 400 });
      await applyStockMovement({
        skuId: body.skuId, warehouseId: body.warehouseId, movementType: "transfer_out",
        quantity: Number(body.quantity), reason: body.reason || "Transfer out", actorId,
      });
      const r = await receiveStock({
        skuId: body.skuId, warehouseId: body.toWarehouseId, quantity: Number(body.quantity),
        actorId, reference: body.reason || "Transfer in",
      });
      return NextResponse.json(r);
    }
    const movementType =
      body.action === "count" ? "stock_count" :
      body.action === "damage" ? "damage" :
      Number(body.quantity) < 0 ? "adjustment_out" : "adjustment_in";
    const quantity = body.action === "count"
      ? Math.abs(Number(body.quantity)) // count = set-to handled as delta below
      : Math.abs(Number(body.quantity));
    if (body.action === "count") {
      // A stock count sets the absolute on-hand: compute the delta first.
      const rows = await listInventory();
      const current = rows.find((r: any) => r.sku_id === body.skuId && (!body.warehouseId || r.warehouse_id === body.warehouseId));
      if (!current) return NextResponse.json({ error: "no balance to count for this SKU" }, { status: 404 });
      const delta = Number(body.quantity) - Number(current.on_hand || 0);
      if (delta === 0) return NextResponse.json({ skuId: body.skuId, onHand: current.on_hand, delta: 0 });
      const r = await applyStockMovement({
        skuId: body.skuId, warehouseId: body.warehouseId,
        movementType: delta < 0 ? "count_correction_down" : "stock_count",
        quantity: Math.abs(delta), reason: body.reason || "Stock count", actorId,
      });
      return NextResponse.json({ ...r, delta });
    }
    const r = await applyStockMovement({
      skuId: body.skuId, warehouseId: body.warehouseId, movementType,
      quantity, unitCost: body.unitCost ? Number(body.unitCost) : undefined,
      reason: body.reason, actorId,
    });
    return NextResponse.json(r);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
