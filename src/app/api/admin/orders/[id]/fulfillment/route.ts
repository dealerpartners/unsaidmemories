import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";
import { requireAdminApi } from "@/lib/admin/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLATFORM_TENANT_ID = getTenantId();

// GET /api/admin/orders/[id]/fulfillment — fulfillment status per supplier.
// Adapted from petstore GET /api/admin/orders/fulfillment: per-supplier rows
// with tracking, so admin can see which supplier has shipped what.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const { id } = await params;
  const sb = createServerClient();

  const { data: order } = await sb.from("orders").select("id, status").eq("id", id).eq("tenant_id", PLATFORM_TENANT_ID).maybeSingle();
  if (!order) return NextResponse.json({ error: "order not found" }, { status: 404 });

  const { data: rows, error } = await sb.from("fulfillment_orders")
    .select("id, supplier_id, status, tracking_number, tracking_url, cost, supplier_order_external_id, created_at")
    .eq("order_id", id).eq("tenant_id", PLATFORM_TENANT_ID).order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Resolve supplier names.
  const supplierIds = [...new Set((rows ?? []).map((r: any) => r.supplier_id).filter(Boolean))];
  let suppliers: Record<string, { slug: string; name: string }> = {};
  if (supplierIds.length) {
    const { data: s } = await sb.from("suppliers").select("id, slug, name").in("id", supplierIds);
    for (const row of s ?? []) suppliers[row.id] = { slug: row.slug, name: row.name };
  }

  return NextResponse.json({
    order_id: id,
    order_status: order.status,
    fulfillment: (rows ?? []).map((r: any) => ({
      ...r,
      supplier: suppliers[r.supplier_id] ?? null,
    })),
  });
}
