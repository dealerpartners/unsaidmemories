import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";
import { resolveItemLabels } from "@/lib/commerce/item-labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLATFORM_TENANT_ID = getTenantId();

// GET /api/checkout/[orderId] — checkout status for the customer.
// Returns order status + items (with display labels and the design
// publication each custom line carries) + fulfillment rows (with supplier
// names) + whether payment is confirmed.
export async function GET(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const sb = createServerClient();

  const { data: order } = await sb.from("orders")
    .select("id, status, total, shipping_address, shipping_method, shipping_cost, created_at, stripe_payment_intent_id")
    .eq("id", orderId).eq("tenant_id", PLATFORM_TENANT_ID).maybeSingle();
  if (!order) return NextResponse.json({ error: "order not found" }, { status: 404 });

  const { data: items } = await sb.from("order_items")
    .select("id, quantity, unit_price, product_variant_id, supplier_catalog_variant_id, design_publication_id, design_snapshot")
    .eq("order_id", orderId);
  const labeledItems = await resolveItemLabels(sb, items ?? []);

  const { data: fulfillment } = await sb.from("fulfillment_orders")
    .select("id, supplier_id, status, tracking_number, tracking_url")
    .eq("order_id", orderId);
  const supplierIds = [...new Set((fulfillment ?? []).map((f: any) => f.supplier_id).filter(Boolean))];
  const supplierNames = new Map<string, string>();
  if (supplierIds.length) {
    const { data: suppliers } = await sb.from("suppliers").select("id, name").in("id", supplierIds);
    for (const s of suppliers ?? []) supplierNames.set(s.id, s.name);
  }
  const fulfillmentWithNames = (fulfillment ?? []).map((f: any) => ({
    ...f,
    supplier_name: supplierNames.get(f.supplier_id) ?? null,
  }));

  return NextResponse.json({
    order: {
      ...order,
      payment_confirmed: order.status === "paid" || order.status === "fulfilled",
    },
    items: labeledItems,
    fulfillment: fulfillmentWithNames,
  });
}
