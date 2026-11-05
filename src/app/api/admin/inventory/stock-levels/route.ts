import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"

export const dynamic = "force-dynamic"

// Stock levels are DERIVED from the movement ledger (erp_inventory_movements)
// — the same truth POS, the catalog, and the inventory tab read. This route
// used to run generic CRUD over erp_inventory_balances, a table with no live
// writer and zero rows for the master tenant (and it searched on columns
// that table doesn't have), so it could only ever answer empty.
export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("inventory", "read")
  if (denied) return denied
  const tenant = resolveTenantId(req)
  const sp = req.nextUrl.searchParams
  const q = (sp.get("q") || sp.get("search") || "").trim()
  const limit = Math.min(500, Math.max(1, Number(sp.get("limit") || 100) || 100))
  const offset = Math.max(0, Number(sp.get("offset") || 0) || 0)
  const like = `%${q.replace(/[%_]/g, "")}%`
  // Per-location stock (20261021): levels come from erp_stock_levels
  // (the movement-ledger view), scoped to one warehouse — ?warehouse_id,
  // defaulting to the tenant's MAIN (identical numbers today: every
  // movement resolves to MAIN). ?detail=bin returns one row per bin.
  const warehouseParam = (sp.get("warehouse_id") || "").trim()
  const detailBin = sp.get("detail") === "bin"

  const out = await withPg(async (c) => {
    const wh = (
      await c.query(
        `SELECT id FROM public.erp_warehouses
          WHERE tenant_id = $1 AND is_active AND ($2 = '' OR id::text = $2)
          ORDER BY (code = 'MAIN') DESC, created_at LIMIT 1`,
        [tenant, warehouseParam],
      )
    ).rows[0]
    if (!wh) return { warehouseId: null as string | null, rows: [] as any[] }
    if (detailBin) {
      const { rows } = await c.query(
        `SELECT s.id::text AS sku_id, s.sku, s.barcode,
                p.id::text AS product_id, p.name, p.brand,
                sl.warehouse_id::text AS warehouse_id,
                sl.location_id::text AS location_id, loc.code AS bin,
                sl.on_hand::float AS on_hand, sl.reserved::float AS reserved,
                p.reorder_point::float AS reorder_point
           FROM public.erp_stock_levels sl
           JOIN public.erp_product_skus s ON s.id = sl.sku_id AND s.tenant_id = sl.tenant_id
           JOIN public.erp_products p ON p.id = s.product_id AND p.tenant_id = s.tenant_id
           LEFT JOIN public.erp_warehouse_locations loc
             ON loc.id = sl.location_id AND loc.tenant_id = sl.tenant_id
          WHERE sl.tenant_id = $1 AND sl.warehouse_id = $2::uuid
            AND ($3 = '%%' OR p.name ILIKE $3 OR s.sku ILIKE $3)
          ORDER BY p.name, s.sku, loc.code
          LIMIT $4 OFFSET $5`,
        [tenant, wh.id, like, limit, offset],
      )
      return { warehouseId: wh.id as string | null, rows }
    }
    const { rows } = await c.query(
      `SELECT s.id::text AS sku_id, s.sku, s.barcode,
              p.id::text AS product_id, p.name, p.brand,
              COALESCE(mv.on_hand, 0)::float AS on_hand,
              COALESCE(mv.reserved, 0)::float AS reserved,
              mv.bin_locations AS bin_locations,
              p.reorder_point::float AS reorder_point
         FROM public.erp_product_skus s
         JOIN public.erp_products p ON p.id = s.product_id AND p.tenant_id = s.tenant_id
         LEFT JOIN LATERAL (
           SELECT SUM(sl.on_hand) AS on_hand, SUM(sl.reserved) AS reserved,
                  string_agg(DISTINCT loc.code, ', ' ORDER BY loc.code)
                    FILTER (WHERE sl.on_hand <> 0) AS bin_locations
             FROM public.erp_stock_levels sl
             LEFT JOIN public.erp_warehouse_locations loc
               ON loc.id = sl.location_id AND loc.tenant_id = sl.tenant_id
            WHERE sl.sku_id = s.id AND sl.tenant_id = s.tenant_id
              AND sl.warehouse_id = $5::uuid
         ) mv ON true
        WHERE s.tenant_id = $1
          AND mv.on_hand IS NOT NULL
          AND ($2 = '%%' OR p.name ILIKE $2 OR s.sku ILIKE $2)
        ORDER BY p.name, s.sku
        LIMIT $3 OFFSET $4`,
      [tenant, like, limit, offset, wh.id],
    )
    return { warehouseId: wh.id as string | null, rows }
  })
  if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
  return NextResponse.json({ rows: out.rows, count: out.rows.length, limit, offset, warehouseId: out.warehouseId })
}

// Stock is never written directly — every change is a movement on the
// ledger (restock / receive / count correction via set_stock). A direct
// write here would fork the truth, so POST refuses honestly and points
// at the movement-writing paths.
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Stock levels are not written directly — they derive from the inventory movement ledger. Use Restock, Receive Shipment, or the On-hand editor (set_stock) so every change lands as an auditable movement.",
    },
    { status: 405 },
  )
}
