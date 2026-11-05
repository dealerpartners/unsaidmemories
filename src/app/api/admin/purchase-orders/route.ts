import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";

export const dynamic = "force-dynamic";

// GET /api/admin/purchase-orders -> real PO list from erp_purchase_orders
// ?tab=all|ordered|transit|received
export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("purchasing", "read");
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const tenant = resolveTenantId(req);
  const tab = (sp.get("tab") || "all").trim();
  const search = (sp.get("search") || "").trim();

  try {
    const out = await withPg(async (c) => {
      const conds = ["po.tenant_id = $1"];
      const params: any[] = [tenant];
      // Tab mapping onto the erp_purchase_orders status CHECK enum:
      // draft | pending_approval | approved | sent | partially_received | received | closed | cancelled
      if (tab === "ordered") {
        conds.push(`po.status IN ('approved','sent')`);
      } else if (tab === "transit") {
        conds.push(`po.status IN ('sent','partially_received')`);
      } else if (tab === "received") {
        conds.push(`po.status IN ('received','closed')`);
      }
      if (search) {
        params.push(`%${search.replace(/[%_]/g, "")}%`);
        conds.push(`(po.po_number ILIKE $${params.length} OR v.name ILIKE $${params.length})`);
      }
      const { rows } = await c.query(
        `SELECT po.id, po.po_number, po.status, po.order_date, po.expected_date,
                po.subtotal, po.tax_total, po.shipping_total, po.total,
                po.currency, po.notes, po.created_at,
                v.name AS vendor_name, v.vendor_number AS vendor_code
           FROM public.erp_purchase_orders po
           LEFT JOIN public.erp_vendors v ON v.id = po.vendor_id AND v.tenant_id = po.tenant_id
          WHERE ${conds.join(" AND ")}
          ORDER BY po.created_at DESC LIMIT 200`,
        params
      );
      return { purchaseOrders: rows };
    });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "purchase orders list failed" }, { status: 500 });
  }
}
