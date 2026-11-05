import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/orders/[id]/items — line items for an order.
//
// Real schema: commerce_order_items carries name + product_id +
// unit_price (TEXT, stored like "$12.84") directly. The catalog join is via
// product_id → commerce_catalog_items.id (for the SKU). Line total is
// quantity × unit_price — there is no stored total column.

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const { id: orderId } = await params;
  if (!orderId) return NextResponse.json({ error: "order id required" }, { status: 400 });
  try {
    const rows = await pgQuery<{
      id: string; product_name: string | null; sku: string | null;
      quantity: number; unit_price: string | null;
    }>(
      `SELECT oi.id::text AS id,
              oi.name AS product_name,
              ci.sku AS sku,
              oi.quantity,
              COALESCE(NULLIF(regexp_replace(oi.unit_price, '[^0-9.]', '', 'g'), ''), '0') AS unit_price
         FROM public.commerce_order_items oi
         LEFT JOIN public.commerce_catalog_items ci ON ci.id::text = oi.product_id::text
        WHERE oi.order_id::text = $1
        ORDER BY oi.created_at ASC NULLS LAST`,
      [orderId]
    );
    return NextResponse.json({
      data: rows.map((r) => {
        const qty = Number(r.quantity) || 0;
        const unit = Number(r.unit_price) || 0;
        return {
          id: r.id,
          product_name: r.product_name,
          sku: r.sku,
          quantity: qty,
          unit_price: unit,
          total: Math.round(qty * unit * 100) / 100,
        };
      }),
      total: rows.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load items" }, { status: 500 });
  }
}
