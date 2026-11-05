import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";

export const dynamic = "force-dynamic";

// GET /api/admin/purchase-orders/skus?q=... -> SKU search for PO line picker
export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("purchasing", "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  const q = (req.nextUrl.searchParams.get("q") || "").trim();

  try {
    const out = await withPg(async (c) => {
      const params: any[] = [tenant];
      let cond = "";
      if (q) {
        params.push(`%${q.replace(/[%_]/g, "")}%`);
        cond = `AND (s.sku ILIKE $2 OR s.barcode ILIKE $2 OR ci.name ILIKE $2)`;
      }
      const { rows } = await c.query(
        `SELECT s.id AS sku_id, s.sku AS sku_code, s.barcode, s.unit_price, s.standard_cost,
                s.uom, ci.name AS product_name
           FROM public.erp_product_skus s
           LEFT JOIN public.commerce_catalog_items ci ON ci.id = s.product_id AND ci.tenant_id = s.tenant_id
          WHERE s.tenant_id = $1 AND s.is_active IS NOT FALSE ${cond}
          ORDER BY s.sku LIMIT 50`,
        params
      );
      return { skus: rows };
    });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "SKU search failed" }, { status: 500 });
  }
}
