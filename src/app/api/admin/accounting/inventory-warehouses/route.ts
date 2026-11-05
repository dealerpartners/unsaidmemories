import { NextRequest, NextResponse } from "next/server";
import { adminCreate, resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/accounting/inventory-warehouses
//
// Warehouses & Locations (owner's warehouses_locations.html): the
// facility tree (erp_warehouses → erp_warehouse_zones →
// erp_warehouse_locations) with per-warehouse stock rollups, and the
// bin-level stock table — balances placed at their location with
// on-hand / reserved / available and a threshold state from the
// SKU's replenishment rule.

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const warehouses = await pgQuery<{
      id: string; code: string; name: string; warehouse_type: string | null;
      city: string | null; state: string | null; country_code: string | null; is_active: boolean;
      zones: number; locations: number; units: string; stock_value: string;
    }>(
      `SELECT w.id::text AS id, w.code, w.name, w.warehouse_type, w.city, w.state,
              w.country_code, w.is_active,
              (SELECT COUNT(*)::int FROM public.erp_warehouse_zones z WHERE z.warehouse_id = w.id) AS zones,
              (SELECT COUNT(*)::int FROM public.erp_warehouse_locations l WHERE l.warehouse_id = w.id) AS locations,
              (SELECT COALESCE(SUM(b.on_hand), 0)::text FROM public.erp_inventory_balances b WHERE b.warehouse_id = w.id) AS units,
              (SELECT COALESCE(SUM(b.on_hand * COALESCE(b.unit_cost, 0)), 0)::text FROM public.erp_inventory_balances b WHERE b.warehouse_id = w.id) AS stock_value
         FROM public.erp_warehouses w
        WHERE w.tenant_id = $1
        ORDER BY w.name ASC`,
      [tenant],
    );
    const zones = await pgQuery<{ id: string; warehouse_id: string; code: string; name: string; zone_type: string | null }>(
      `SELECT id::text AS id, warehouse_id::text AS warehouse_id, code, name, zone_type
         FROM public.erp_warehouse_zones WHERE tenant_id = $1 ORDER BY code ASC`,
      [tenant],
    );
    const bins = await pgQuery<{
      id: string; bin_code: string | null; bin_name: string | null; bin: string | null; bin_location: string | null;
      warehouse_name: string | null; sku: string | null; product_name: string | null;
      on_hand: string; reserved: string; allocated: string; safety_stock: string | null;
    }>(
      `SELECT b.id::text AS id, loc.code AS bin_code, loc.name AS bin_name, loc.bin, b.bin_location,
              w.name AS warehouse_name, pv.sku, p.name AS product_name,
              b.on_hand::text AS on_hand, b.reserved::text AS reserved, b.allocated::text AS allocated,
              r.safety_stock::text AS safety_stock
         FROM public.erp_inventory_balances b
         LEFT JOIN public.erp_warehouse_locations loc ON loc.id = b.location_id
         LEFT JOIN public.erp_warehouses w ON w.id = b.warehouse_id
         LEFT JOIN public.product_variants pv ON pv.id = b.sku_id
         LEFT JOIN public.products p ON p.id = pv.product_id
         LEFT JOIN public.erp_replenishment_rules r
           ON r.sku_id = b.sku_id AND r.warehouse_id = b.warehouse_id AND r.is_active
        WHERE b.tenant_id = $1
        ORDER BY w.name ASC NULLS LAST, loc.code ASC NULLS LAST
        LIMIT 500`,
      [tenant],
    );
    return NextResponse.json({
      warehouses: warehouses.map((w) => ({
        id: w.id, code: w.code, name: w.name, type: w.warehouse_type,
        city: w.city, state: w.state, country: w.country_code, isActive: w.is_active !== false,
        zones: Number(w.zones || 0), locations: Number(w.locations || 0),
        units: Number(w.units || 0), stockValue: Number(w.stock_value || 0),
        zoneList: zones.filter((z) => z.warehouse_id === w.id),
      })),
      bins: bins.map((b) => {
        const onHand = Number(b.on_hand || 0);
        const available = onHand - Number(b.reserved || 0) - Number(b.allocated || 0);
        const safety = b.safety_stock != null ? Number(b.safety_stock) : null;
        return {
          id: b.id,
          bin: b.bin || b.bin_code || b.bin_location,
          warehouseName: b.warehouse_name, sku: b.sku, productName: b.product_name,
          onHand, reserved: Number(b.reserved || 0), available,
          threshold: safety == null ? "No floor set" : available <= 0 ? "Below floor — empty" : available <= safety ? "Below floor" : "Above floor",
        };
      }),
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/inventory-warehouses]", e);
    return NextResponse.json({ error: e?.message || "Failed to load warehouses" }, { status: 500 });
  }
}

// POST /api/admin/accounting/inventory-warehouses — add a warehouse.

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "write");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const body = await req.json().catch(() => null);
    if (!body?.name || !body?.code) return NextResponse.json({ error: "code and name are required" }, { status: 400 });
    return adminCreate("erp_warehouses", {
      code: String(body.code), name: String(body.name),
      warehouse_type: body.warehouse_type || "fulfillment",
      city: body.city || null, state: body.state || null,
      country_code: body.country_code || "US", timezone: body.timezone || "America/Chicago",
      is_active: true,
    }, { preGated: true, tenantId: tenant, schema: "public" });
  } catch (e: any) {
    console.error("[POST /api/admin/accounting/inventory-warehouses]", e);
    return NextResponse.json({ error: e?.message || "Failed to add warehouse" }, { status: 500 });
  }
}
