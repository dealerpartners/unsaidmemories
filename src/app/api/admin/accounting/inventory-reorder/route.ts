import { NextRequest, NextResponse } from "next/server";
import { adminCreate, resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/accounting/inventory-reorder
//
// Commitments & Reorder (owner's commitments_reorder.html): the MRP
// allocation matrix computed live — current stock and committed
// (reserved + allocated) from erp_inventory_balances, ATP, the
// replenishment rule's safety floor / reorder point / lead time
// (falling back to the variant's reorder_level), quantities already
// on open purchase orders (acct_ap_bills source_system =
// 'purchase_order', status 'open', lines' item_ref), and a computed
// recommended reorder quantity. Recommendations are labeled as
// computed — nothing here is a forecast dressed up as a fact.

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const rows = await pgQuery<{
      sku_id: string; sku: string | null; product_name: string | null; category_name: string | null;
      stock: string; committed: string; unit_cost: string | null;
      reorder_point: string | null; safety_stock: string | null; maximum_stock: string | null;
      lead_time_days: number | null; vendor_name: string | null; vendor_id: string | null;
      variant_reorder_level: number | null; on_order: string;
    }>(
      `WITH bal AS (
         SELECT sku_id, SUM(on_hand) AS stock, SUM(reserved + allocated) AS committed,
                SUM(on_hand * unit_cost) / NULLIF(SUM(on_hand) FILTER (WHERE unit_cost IS NOT NULL), 0) AS unit_cost
           FROM public.erp_inventory_balances WHERE tenant_id = $1 GROUP BY sku_id
       ), onord AS (
         SELECT l.item_ref AS sku_id, SUM(l.quantity) AS qty
           FROM public.acct_ap_bill_lines l
           JOIN public.acct_ap_bills b ON b.id = l.bill_id
          WHERE b.tenant_id = $1 AND b.source_system = 'purchase_order' AND b.status = 'open'
            AND l.item_ref IS NOT NULL
          GROUP BY l.item_ref
       ), rule AS (
         SELECT DISTINCT ON (r.sku_id) r.sku_id, r.reorder_point, r.safety_stock,
                r.maximum_stock, r.lead_time_days, r.preferred_vendor_id
           FROM public.erp_replenishment_rules r
          WHERE r.tenant_id = $1 AND r.is_active
          ORDER BY r.sku_id, r.reorder_point DESC NULLS LAST
       )
       SELECT pv.id::text AS sku_id, pv.sku, p.name AS product_name, cat.name AS category_name,
              COALESCE(bal.stock, 0)::text AS stock, COALESCE(bal.committed, 0)::text AS committed,
              bal.unit_cost::text AS unit_cost,
              rule.reorder_point::text AS reorder_point, rule.safety_stock::text AS safety_stock,
              rule.maximum_stock::text AS maximum_stock, rule.lead_time_days,
              v.legal_name AS vendor_name, rule.preferred_vendor_id::text AS vendor_id,
              pv.reorder_level AS variant_reorder_level,
              COALESCE(onord.qty, 0)::text AS on_order
         FROM public.product_variants pv
         JOIN public.products p ON p.id = pv.product_id
         LEFT JOIN public.categories cat ON cat.id = p.category_id
         LEFT JOIN bal ON bal.sku_id = pv.id
         LEFT JOIN rule ON rule.sku_id = pv.id
         LEFT JOIN onord ON onord.sku_id = pv.id::text
         LEFT JOIN public.acct_vendors v ON v.id = rule.preferred_vendor_id
        WHERE pv.tenant_id = $1
          AND (bal.sku_id IS NOT NULL OR rule.sku_id IS NOT NULL OR COALESCE(pv.reorder_level, 0) > 0)
        ORDER BY p.name ASC, pv.sku ASC NULLS LAST
        LIMIT 500`,
      [tenant],
    );
    const vendors = await pgQuery<{ id: string; legal_name: string }>(
      `SELECT id::text AS id, legal_name FROM public.acct_vendors
        WHERE tenant_id = $1 AND is_active ORDER BY legal_name ASC`,
      [tenant],
    );
    const warehouses = await pgQuery<{ id: string; name: string }>(
      `SELECT id::text AS id, name FROM public.erp_warehouses
        WHERE tenant_id = $1 AND is_active ORDER BY name ASC`,
      [tenant],
    );
    const matrix = rows.map((r) => {
      const stock = Number(r.stock || 0);
      const committed = Number(r.committed || 0);
      const atp = stock - committed;
      const onOrder = Number(r.on_order || 0);
      const safety = r.safety_stock != null ? Number(r.safety_stock) : null;
      const reorderPoint = r.reorder_point != null ? Number(r.reorder_point)
        : r.variant_reorder_level != null ? Number(r.variant_reorder_level) : null;
      const floor = safety ?? reorderPoint;
      const target = r.maximum_stock != null ? Number(r.maximum_stock)
        : reorderPoint != null ? reorderPoint + (safety ?? 0) : null;
      const belowTrigger = reorderPoint != null && atp + onOrder < reorderPoint;
      const recQty = belowTrigger && target != null ? Math.max(0, Math.ceil(target - (atp + onOrder))) : 0;
      const unitCost = r.unit_cost != null ? Number(r.unit_cost) : null;
      const priority = recQty > 0 && floor != null && atp + onOrder <= floor ? "Urgent"
        : recQty > 0 ? "Reorder" : "OK";
      return {
        skuId: r.sku_id, sku: r.sku, productName: r.product_name, category: r.category_name,
        stock, committed, atp, onOrder,
        safetyFloor: floor, leadTimeDays: r.lead_time_days,
        recQty, unitCost,
        estCost: recQty > 0 && unitCost != null ? recQty * unitCost : null,
        vendorName: r.vendor_name, vendorId: r.vendor_id, priority,
        hasRule: r.reorder_point != null || r.safety_stock != null,
      };
    });
    return NextResponse.json({ matrix, vendors, warehouses });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/inventory-reorder]", e);
    return NextResponse.json({ error: e?.message || "Failed to load reorder matrix" }, { status: 500 });
  }
}

// POST /api/admin/accounting/inventory-reorder — create a
// replenishment rule (sku + warehouse + thresholds).

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "write");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const body = await req.json().catch(() => null);
    if (!body?.sku_id || !body?.warehouse_id) {
      return NextResponse.json({ error: "sku_id and warehouse_id are required" }, { status: 400 });
    }
    return adminCreate("erp_replenishment_rules", {
      sku_id: String(body.sku_id), warehouse_id: String(body.warehouse_id),
      method: "reorder_point",
      reorder_point: body.reorder_point === "" || body.reorder_point == null ? null : Number(body.reorder_point),
      safety_stock: body.safety_stock === "" || body.safety_stock == null ? null : Number(body.safety_stock),
      maximum_stock: body.maximum_stock === "" || body.maximum_stock == null ? null : Number(body.maximum_stock),
      lead_time_days: body.lead_time_days ? Number(body.lead_time_days) : null,
      preferred_vendor_id: body.preferred_vendor_id || null,
      is_active: true,
    }, { preGated: true, tenantId: tenant, schema: "public" });
  } catch (e: any) {
    console.error("[POST /api/admin/accounting/inventory-reorder]", e);
    return NextResponse.json({ error: e?.message || "Failed to save reorder rule" }, { status: 500 });
  }
}
