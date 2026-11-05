import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";

export const dynamic = "force-dynamic";

// GET /api/admin/purchase-orders/[id]/lines -> list lines for a PO
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireModuleApi("purchasing", "read");
  if (denied) return denied;
  const { id } = await params;
  const tenant = resolveTenantId(req);

  try {
    const out = await withPg(async (c) => {
      const { rows } = await c.query(
        `SELECT l.id, l.sku_id, l.description, l.quantity_ordered, l.quantity_received,
                l.unit_cost, l.tax_amount, l.line_total, l.created_at,
                s.sku AS sku_code, s.barcode
           FROM public.erp_purchase_order_lines l
           LEFT JOIN public.erp_product_skus s ON s.id = l.sku_id AND s.tenant_id = l.tenant_id
          WHERE l.purchase_order_id = $1::uuid AND l.tenant_id = $2
          ORDER BY l.created_at`,
        [id, tenant]
      );
      return { lines: rows };
    });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "PO lines failed" }, { status: 500 });
  }
}

// POST /api/admin/purchase-orders/[id]/lines -> add a line to a PO
// Body: { sku_id, description?, quantity, unit_cost?, tax_amount? }
// Only allowed when PO status is draft or pending_approval.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireModuleApi("purchasing", "write");
  if (denied) return denied;
  const { id } = await params;
  const tenant = resolveTenantId(req);
  const body = await req.json().catch(() => ({}));

  const skuId = body.sku_id ? String(body.sku_id) : null;
  const qty = Number(body.quantity || 0);
  const unitCost = Number(body.unit_cost || 0);
  const taxAmt = Number(body.tax_amount || 0);
  if (!skuId || qty <= 0) {
    return NextResponse.json({ error: "sku_id and quantity > 0 are required" }, { status: 400 });
  }

  try {
    const out = await withPg(async (c) => {
      const { rows: cur } = await c.query(
        `SELECT status, subtotal, tax_total, shipping_total FROM public.erp_purchase_orders
          WHERE id = $1::uuid AND tenant_id = $2`,
        [id, tenant]
      );
      if (!cur.length) return { error: "PO not found", status: 404 };
      if (!["draft", "pending_approval"].includes(cur[0].status)) {
        return { error: `Cannot add lines to PO in status '${cur[0].status}'`, status: 400 };
      }
      const lineTotal = qty * unitCost;
      const { rows: ins } = await c.query(
        `INSERT INTO public.erp_purchase_order_lines
           (id, tenant_id, purchase_order_id, sku_id, description,
            quantity_ordered, quantity_received, unit_cost, tax_amount, line_total, created_at)
         VALUES (gen_random_uuid(), $1, $2::uuid, $3::uuid, $4, $5, 0, $6, $7, $8, now())
         RETURNING id`,
        [tenant, id, skuId, body.description ? String(body.description) : null, qty, unitCost, taxAmt, lineTotal]
      );
      // Recompute PO totals from lines
      await c.query(
        `UPDATE public.erp_purchase_orders po
            SET subtotal = COALESCE((SELECT SUM(line_total) FROM public.erp_purchase_order_lines
                                     WHERE purchase_order_id = po.id AND tenant_id = po.tenant_id), 0),
                tax_total = COALESCE((SELECT SUM(tax_amount) FROM public.erp_purchase_order_lines
                                      WHERE purchase_order_id = po.id AND tenant_id = po.tenant_id), 0),
                total = COALESCE((SELECT SUM(line_total) FROM public.erp_purchase_order_lines
                                  WHERE purchase_order_id = po.id AND tenant_id = po.tenant_id), 0)
                      + COALESCE((SELECT SUM(tax_amount) FROM public.erp_purchase_order_lines
                                  WHERE purchase_order_id = po.id AND tenant_id = po.tenant_id), 0)
                      + po.shipping_total,
                updated_at = now()
          WHERE po.id = $1::uuid AND po.tenant_id = $2`,
        [id, tenant]
      );
      return { lineId: ins[0]?.id };
    });
    if ((out as any).error) {
      return NextResponse.json({ error: (out as any).error }, { status: (out as any).status || 400 });
    }
    return NextResponse.json({ ok: true, ...out });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Add line failed" }, { status: 500 });
  }
}

// DELETE /api/admin/purchase-orders/[id]/lines?line_id=xxx -> remove a line
// Only allowed when PO status is draft or pending_approval.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireModuleApi("purchasing", "write");
  if (denied) return denied;
  const { id } = await params;
  const tenant = resolveTenantId(req);
  const lineId = req.nextUrl.searchParams.get("line_id");
  if (!lineId) return NextResponse.json({ error: "line_id required" }, { status: 400 });

  try {
    const out = await withPg(async (c) => {
      const { rows: cur } = await c.query(
        `SELECT status FROM public.erp_purchase_orders WHERE id = $1::uuid AND tenant_id = $2`,
        [id, tenant]
      );
      if (!cur.length) return { error: "PO not found", status: 404 };
      if (!["draft", "pending_approval"].includes(cur[0].status)) {
        return { error: `Cannot remove lines from PO in status '${cur[0].status}'`, status: 400 };
      }
      const { rowCount } = await c.query(
        `DELETE FROM public.erp_purchase_order_lines
          WHERE id = $1::uuid AND purchase_order_id = $2::uuid AND tenant_id = $3`,
        [lineId, id, tenant]
      );
      // Recompute PO totals
      await c.query(
        `UPDATE public.erp_purchase_orders po
            SET subtotal = COALESCE((SELECT SUM(line_total) FROM public.erp_purchase_order_lines
                                     WHERE purchase_order_id = po.id AND tenant_id = po.tenant_id), 0),
                tax_total = COALESCE((SELECT SUM(tax_amount) FROM public.erp_purchase_order_lines
                                      WHERE purchase_order_id = po.id AND tenant_id = po.tenant_id), 0),
                total = COALESCE((SELECT SUM(line_total) FROM public.erp_purchase_order_lines
                                  WHERE purchase_order_id = po.id AND tenant_id = po.tenant_id), 0)
                      + COALESCE((SELECT SUM(tax_amount) FROM public.erp_purchase_order_lines
                                  WHERE purchase_order_id = po.id AND tenant_id = po.tenant_id), 0)
                      + po.shipping_total,
                updated_at = now()
          WHERE po.id = $1::uuid AND po.tenant_id = $2`,
        [id, tenant]
      );
      return { deleted: rowCount };
    });
    if ((out as any).error) {
      return NextResponse.json({ error: (out as any).error }, { status: (out as any).status || 400 });
    }
    return NextResponse.json({ ok: true, ...out });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Delete line failed" }, { status: 500 });
  }
}
