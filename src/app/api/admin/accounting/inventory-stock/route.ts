import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/accounting/inventory-stock
//
// Stock on Hand (owner's stock_on_hand.html): one row per
// erp_inventory_balances record with its variant/product/category,
// warehouse + bin location, on hand / reserved / allocated, ATP
// (on hand − reserved − allocated — the same "available" the ERP
// inventory list computes), the replenishment rule's floor, FIFO
// (balance) cost, asset value, and a health state computed from the
// real numbers.

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const rows = await pgQuery<{
      id: string; sku_id: string; warehouse_id: string | null;
      sku: string | null; gtin: string | null; product_name: string | null; category_name: string | null;
      warehouse_name: string | null; warehouse_code: string | null;
      location_code: string | null; bin_location: string | null;
      on_hand: string; reserved: string; allocated: string; unit_cost: string | null;
      reorder_point: string | null; safety_stock: string | null; last_counted_at: string | null;
    }>(
      `SELECT b.id::text AS id, b.sku_id::text AS sku_id, b.warehouse_id::text AS warehouse_id,
              pv.sku, pv.gtin, p.name AS product_name, cat.name AS category_name,
              w.name AS warehouse_name, w.code AS warehouse_code,
              loc.code AS location_code, b.bin_location,
              b.on_hand::text AS on_hand, b.reserved::text AS reserved, b.allocated::text AS allocated,
              b.unit_cost::text AS unit_cost,
              r.reorder_point::text AS reorder_point, r.safety_stock::text AS safety_stock,
              b.last_counted_at::text AS last_counted_at
         FROM public.erp_inventory_balances b
         LEFT JOIN public.product_variants pv ON pv.id = b.sku_id
         LEFT JOIN public.products p ON p.id = pv.product_id
         LEFT JOIN public.categories cat ON cat.id = p.category_id
         LEFT JOIN public.erp_warehouses w ON w.id = b.warehouse_id
         LEFT JOIN public.erp_warehouse_locations loc ON loc.id = b.location_id
         LEFT JOIN public.erp_replenishment_rules r
           ON r.sku_id = b.sku_id AND r.warehouse_id = b.warehouse_id AND r.is_active
        WHERE b.tenant_id = $1
        ORDER BY p.name ASC NULLS LAST, pv.sku ASC NULLS LAST
        LIMIT 500`,
      [tenant],
    );
    return NextResponse.json({
      stock: rows.map((r) => {
        const onHand = Number(r.on_hand || 0);
        const reserved = Number(r.reserved || 0);
        const allocated = Number(r.allocated || 0);
        const atp = onHand - reserved - allocated;
        const floor = r.safety_stock != null ? Number(r.safety_stock) : r.reorder_point != null ? Number(r.reorder_point) : null;
        const unitCost = r.unit_cost != null ? Number(r.unit_cost) : null;
        const health = onHand <= 0 ? "Out of stock" : floor != null && atp <= floor ? "Low stock" : reserved > 0 ? "Reserved" : "In stock";
        return {
          id: r.id, skuId: r.sku_id, warehouseId: r.warehouse_id,
          sku: r.sku, barcode: r.gtin, productName: r.product_name, category: r.category_name,
          warehouseName: r.warehouse_name, warehouseCode: r.warehouse_code,
          location: r.bin_location || r.location_code,
          onHand, reserved, allocated, atp,
          minFloor: floor, unitCost,
          assetValue: unitCost != null ? onHand * unitCost : null,
          health, lastCountedAt: r.last_counted_at,
        };
      }),
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/inventory-stock]", e);
    return NextResponse.json({ error: e?.message || "Failed to load stock" }, { status: 500 });
  }
}
