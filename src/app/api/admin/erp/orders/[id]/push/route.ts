import { NextRequest, NextResponse } from "next/server";
import { requireAdminActor, PLATFORM_TENANT_ID } from "@/lib/admin/gate";
import { pushOrderToSuppliers, confirmSupplierOrder, syncPrintfulTracking } from "@/lib/suppliers/push";
import { createServerClient } from "@/lib/supabase";
import { postFulfillmentCogs } from "@/lib/commerce/fulfillment-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/erp/orders/[id]/push { action: "push" | "confirm" | "sync", fulfillmentOrderId? }
// push    — submit the order's lines to their suppliers (Printful draft orders).
// confirm — explicitly confirm one Printful fulfillment into production.
// sync    — poll Printful for tracking on open fulfillments.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminActor();
  if ("error" in gate) return gate.error;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === "confirm") {
      if (!body.fulfillmentOrderId) return NextResponse.json({ error: "fulfillmentOrderId is required" }, { status: 400 });
      const confirmed = await confirmSupplierOrder(body.fulfillmentOrderId);
      return NextResponse.json({ confirmed });
    }
    if (body.action === "sync") {
      const result = await syncPrintfulTracking();
      return NextResponse.json(result);
    }
    const result = await pushOrderToSuppliers(id);
    // Books follow the goods: groups that were actually submitted
    // post their supplier COGS / payable. A COGS failure never
    // unsubmits a supplier order — it is reported alongside.
    let cogs: Awaited<ReturnType<typeof postFulfillmentCogs>> | null = null;
    try {
      cogs = await postFulfillmentCogs(createServerClient(), PLATFORM_TENANT_ID, id, result.groups);
    } catch (e) {
      console.error("[erp push] COGS posting failed:", e);
    }
    return NextResponse.json({ ...result, cogs });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
