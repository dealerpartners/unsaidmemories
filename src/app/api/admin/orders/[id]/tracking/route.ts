import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { trackPackage } from "@/lib/shipping/usps-client";
import { loadOrder, logOrderEvent } from "@/lib/orders/lifecycle";
import {
  rollupSplitParentFulfillmentSafe,
  sellerQueryFnForPgClient,
} from "@/lib/sellers/order-split";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// GET /api/admin/orders/[id]/tracking — live carrier tracking for the order.
//
// USPS orders are looked up through the real USPS client (usps-client
// .trackPackage). Honesty rules:
//   • Carrier API unreachable → { available: false } and the order is NOT
//     touched. An invented status never reaches the order.
//   • A real DELIVERED answer flips the order to delivered and stamps
//     metadata.delivered_at with delivered_source='carrier'.
//   • Other real answers persist tracking_status only.
// Non-USPS carriers have no lookup integration here — the response says so
// and points at the carrier + tracking number already on the order.
// ============================================================================

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireModuleApi("orders", "read");
  if (gate) return gate;

  const { id } = await params;
  const tenant = resolveTenantId(req);

  const order = await withPg(async (client) => loadOrder(client, tenant, id));
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const trackingNumber = String(order.tracking_number || "").trim();
  const carrier = String(order.carrier || "").trim();
  if (!trackingNumber) {
    return NextResponse.json(
      { ok: false, available: false, reason: "This order has no tracking number yet — buy a label or mark it shipped with one." },
      { status: 400 }
    );
  }
  if (!/usps/i.test(carrier || "USPS")) {
    return NextResponse.json({
      ok: true,
      available: false,
      reason: `Live tracking lookup is wired for USPS only — this order ships via ${carrier || "an unknown carrier"}.`,
      trackingNumber,
      carrier,
      recordedStatus: order.tracking_status || null,
      fulfillmentStatus: order.fulfillment_status || null,
    });
  }

  const result = await trackPackage(trackingNumber);

  if (result.unavailable) {
    return NextResponse.json({
      ok: true,
      available: false,
      reason: result.summary,
      trackingNumber,
      carrier: "USPS",
      recordedStatus: order.tracking_status || null,
      fulfillmentStatus: order.fulfillment_status || null,
    });
  }

  // Real carrier answer — persist it.
  const now = new Date().toISOString();
  await withPg(async (client) => {
    if (result.isDelivered) {
      const meta = order.metadata && typeof order.metadata === "object" ? { ...order.metadata } : {};
      if (!meta.delivered_at) {
        meta.delivered_at = now;
        meta.delivered_source = "carrier";
      }
      await client.query(
        `UPDATE public.commerce_orders
            SET tracking_status = 'DELIVERED', fulfillment_status = 'delivered',
                status = 'delivered', metadata = $2, updated_at = now()
          WHERE id::text = $1 AND tenant_id = $3`,
        [id, JSON.stringify(meta), tenant]
      );
      await logOrderEvent(client, tenant, id, "delivered",
        String(order.fulfillment_status || "shipped"), "delivered",
        { carrier: "USPS", trackingNumber, delivered_at: now, delivered_source: "carrier", summary: result.summary });
      // Checkout-split child? Its parent's roll-up follows the delivery.
      await rollupSplitParentFulfillmentSafe(sellerQueryFnForPgClient(client), id);
    } else {
      await client.query(
        `UPDATE public.commerce_orders
            SET tracking_status = $2, updated_at = now()
          WHERE id::text = $1 AND tenant_id = $3`,
        [id, result.status, tenant]
      );
      await logOrderEvent(client, tenant, id, "tracking_refreshed",
        String(order.fulfillment_status || ""), String(order.fulfillment_status || ""),
        { carrier: "USPS", trackingNumber, tracking_status: result.status, summary: result.summary });
    }
  });

  try {
    revalidatePath("/admin/orders");
    revalidatePath("/customer/orders");
  } catch { /* best-effort */ }

  return NextResponse.json({
    ok: true,
    available: true,
    status: result.status,
    summary: result.summary,
    isDelivered: result.isDelivered,
    expectedDeliveryDate: result.expectedDeliveryDate || null,
    events: (result.events || []).map((e) => ({
      description: e.eventDescription || e.eventName || e.eventCode || "",
      timestamp: e.eventTimestamp || null,
      city: e.eventCity || null,
      state: e.eventState || null,
    })),
    trackingNumber,
    carrier: "USPS",
    fulfillmentStatus: result.isDelivered ? "delivered" : order.fulfillment_status || null,
  });
}
