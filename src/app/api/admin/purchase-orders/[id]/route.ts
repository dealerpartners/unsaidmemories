import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";

export const dynamic = "force-dynamic";

// GET /api/admin/purchase-orders/[id] -> PO detail with lines + vendor
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireModuleApi("purchasing", "read");
  if (denied) return denied;
  const { id } = await params;
  const tenant = resolveTenantId(req);

  try {
    const out = await withPg(async (c) => {
      const { rows: pos } = await c.query(
        `SELECT po.id, po.po_number, po.status, po.order_date, po.expected_date,
                po.subtotal, po.tax_total, po.shipping_total, po.total,
                po.currency, po.notes, po.created_at, po.updated_at,
                v.id AS vendor_id, v.name AS vendor_name, v.vendor_number AS vendor_code,
                v.email AS vendor_email, v.phone AS vendor_phone
           FROM public.erp_purchase_orders po
           LEFT JOIN public.erp_vendors v ON v.id = po.vendor_id AND v.tenant_id = po.tenant_id
          WHERE po.id = $1::uuid AND po.tenant_id = $2`,
        [id, tenant]
      );
      if (!pos.length) return { purchaseOrder: null };
      const { rows: lines } = await c.query(
        `SELECT l.id, l.sku_id, l.description, l.quantity_ordered, l.quantity_received,
                l.unit_cost, l.tax_amount, l.line_total, l.created_at,
                s.sku AS sku_code, s.barcode
           FROM public.erp_purchase_order_lines l
           LEFT JOIN public.erp_product_skus s ON s.id = l.sku_id AND s.tenant_id = l.tenant_id
          WHERE l.purchase_order_id = $1::uuid AND l.tenant_id = $2
          ORDER BY l.created_at`,
        [id, tenant]
      );
      return { purchaseOrder: pos[0], lines };
    });
    if (!out || !out.purchaseOrder) {
      return NextResponse.json({ error: "PO not found" }, { status: 404 });
    }
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "PO detail failed" }, { status: 500 });
  }
}

// PATCH /api/admin/purchase-orders/[id] -> edit PO header (vendor, expected_date, notes)
// Only allowed when status is draft or pending_approval.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireModuleApi("purchasing", "write");
  if (denied) return denied;
  const { id } = await params;
  const tenant = resolveTenantId(req);
  const body = await req.json().catch(() => ({}));

  try {
    const out = await withPg(async (c) => {
      const { rows: cur } = await c.query(
        `SELECT status FROM public.erp_purchase_orders WHERE id = $1::uuid AND tenant_id = $2`,
        [id, tenant]
      );
      if (!cur.length) return { error: "PO not found", status: 404 };
      if (!["draft", "pending_approval"].includes(cur[0].status)) {
        return { error: `Cannot edit PO in status '${cur[0].status}'`, status: 400 };
      }
      const sets: string[] = ["updated_at = now()"];
      const vals: any[] = [];
      let i = 1;
      if (body.vendor_id) { sets.push(`vendor_id = $${i++}::uuid`); vals.push(String(body.vendor_id)); }
      if (body.expected_date !== undefined) { sets.push(`expected_date = $${i++}`); vals.push(body.expected_date || null); }
      if (body.notes !== undefined) { sets.push(`notes = $${i++}`); vals.push(body.notes || null); }
      if (body.shipping_total !== undefined) { sets.push(`shipping_total = $${i++}`); vals.push(Number(body.shipping_total || 0)); }
      if (sets.length === 1) return { error: "Nothing to update", status: 400 };
      // Recompute total if shipping changed
      if (body.shipping_total !== undefined) {
        sets.push(`total = subtotal + tax_total + $${i - 1}`);
      }
      vals.push(id, tenant);
      const { rowCount } = await c.query(
        `UPDATE public.erp_purchase_orders SET ${sets.join(", ")}
          WHERE id = $${i++}::uuid AND tenant_id = $${i++}`,
        vals
      );
      return { updated: rowCount };
    });
    if ((out as any).error) {
      return NextResponse.json({ error: (out as any).error }, { status: (out as any).status || 400 });
    }
    return NextResponse.json({ ok: true, ...out });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "PO update failed" }, { status: 500 });
  }
}
