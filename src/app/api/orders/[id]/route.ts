import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLATFORM_TENANT_ID = getTenantId();

// GET /api/orders/[id] — order detail: order + line items + fulfillment.
// Adapted from petstore GET /api/admin/orders/[id]: one response with everything the detail screen needs.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = createServerClient();

  const { data: order } = await sb.from("orders").select("*").eq("id", id).eq("tenant_id", PLATFORM_TENANT_ID).maybeSingle();
  if (!order) return NextResponse.json({ error: "order not found" }, { status: 404 });

  const { data: items } = await sb.from("order_items").select("*").eq("order_id", id).eq("tenant_id", PLATFORM_TENANT_ID);

  const { data: fulfillment } = await sb.from("fulfillment_orders")
    .select("*, suppliers!fulfillment_orders_supplier_id_fkey(slug, name)")
    .eq("order_id", id).eq("tenant_id", PLATFORM_TENANT_ID);

  return NextResponse.json({ order, items: items ?? [], fulfillment: fulfillment ?? [] });
}
