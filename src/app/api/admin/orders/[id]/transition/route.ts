import { toResendVariables } from "@/lib/email/resend-templates";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { sendEmail } from "@/lib/email";
import { orderShippedHtml } from "@/lib/email/templates/commerce";
import { loadOrder, loadOrderItems, logOrderEvent, trackingUrlFor } from "@/lib/orders/lifecycle";
import { pgQueryStrict } from "@/lib/pg";
import { rollupSplitParentFulfillmentSafe } from "@/lib/sellers/order-split";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// POST /api/admin/orders/[id]/transition — the fulfillment lifecycle steps
// from the order screen:
//   { to: "processing" }  start packing (stamps metadata.packing_started_at)
//   { to: "packed" }      mark packed   (stamps metadata.packed_at; the
//                         fulfillment_status vocabulary the list filters use
//                         stays 'processing' until shipped)
//   { to: "shipped", trackingNumber?, carrier? }
//                         requires a tracking number (body or the one a
//                         purchased label already saved); stamps
//                         metadata.shipped_at and emails the customer their
//                         tracking via the real sendEmail pipeline.
//   { to: "delivered" }   manual mark-delivered (stamps metadata
//                         .delivered_at, delivered_source='manual').
// Every step logs a commerce_fulfillment_events row.
// ============================================================================

const TARGETS = ["processing", "packed", "shipped", "delivered"] as const;
type Target = (typeof TARGETS)[number];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireModuleApi("orders", "write");
  if (gate) return gate;

  const { id } = await params;
  const tenant = resolveTenantId(req);
  const body = await req.json().catch(() => ({}));
  const to = String(body?.to || "") as Target;
  if (!TARGETS.includes(to)) {
    return NextResponse.json(
      { error: `Unknown transition "${to}" — expected one of ${TARGETS.join(", ")}` },
      { status: 400 }
    );
  }

  const outcome = await withPg(async (client) => {
    const order = await loadOrder(client, tenant, id);
    if (!order) return { error: "Order not found", status: 404 } as const;
    const oldStatus = String(order.fulfillment_status || "pending");
    const meta = order.metadata && typeof order.metadata === "object" ? { ...order.metadata } : {};
    const now = new Date().toISOString();

    if (to === "processing") {
      meta.packing_started_at = meta.packing_started_at || now;
      await client.query(
        `UPDATE public.commerce_orders
            SET fulfillment_status = 'processing', metadata = $2, updated_at = now()
          WHERE id::text = $1 AND tenant_id = $3`,
        [id, JSON.stringify(meta), tenant]
      );
      await logOrderEvent(client, tenant, id, "packing_started", oldStatus, "processing");
      return { ok: true, fulfillmentStatus: "processing" } as const;
    }

    if (to === "packed") {
      meta.packed_at = now;
      await client.query(
        `UPDATE public.commerce_orders
            SET fulfillment_status = 'processing', metadata = $2, updated_at = now()
          WHERE id::text = $1 AND tenant_id = $3`,
        [id, JSON.stringify(meta), tenant]
      );
      await logOrderEvent(client, tenant, id, "packed", oldStatus, "processing", { packed_at: now });
      return { ok: true, fulfillmentStatus: "processing", packedAt: now } as const;
    }

    if (to === "shipped") {
      const trackingNumber = String(body?.trackingNumber || order.tracking_number || "").trim();
      const carrier = String(body?.carrier || order.carrier || "USPS").trim() || "USPS";
      if (!trackingNumber) {
        return {
          error: "A tracking number is required to mark shipped — buy a label first or enter the carrier tracking number.",
          status: 400,
        } as const;
      }
      meta.shipped_at = now;
      await client.query(
        `UPDATE public.commerce_orders
            SET fulfillment_status = 'shipped', status = 'shipped',
                tracking_number = $2, carrier = $3,
                tracking_status = COALESCE(tracking_status, 'PRE_TRANSIT'),
                metadata = $4, updated_at = now()
          WHERE id::text = $1 AND tenant_id = $5`,
        [id, trackingNumber, carrier, JSON.stringify(meta), tenant]
      );
      await logOrderEvent(client, tenant, id, "shipped", oldStatus, "shipped", {
        carrier, trackingNumber, shipped_at: now,
      });

      // Customer tracking email — the real Resend pipeline (sendEmail writes
      // the communications history row too). A failed send never un-ships the
      // order; it's reported honestly in the response.
      const toEmail = order.customer_email_resolved;
      let emailed = false;
      let emailError: string | null = null;
      if (toEmail) {
        try {
          const items = await loadOrderItems(client, id);
          const firstName =
            (order.customer_name || "").split(" ")[0] || String(toEmail).split("@")[0];
          const res = await sendEmail({
            to: toEmail,
            template: "order_shipped",
            relatedOrderId: id,
            tenantId: tenant,
            subject: `Your UnSaid Memories order #${id.slice(0, 8)} has shipped`,
            html: orderShippedHtml({
              firstName,
              orderNumber: id.slice(0, 8),
              carrier,
              trackingNumber,
              trackingUrl: trackingUrlFor(carrier, trackingNumber),
              itemNames: items.map((i: any) => String(i.product_name || i.name || "Item")),
            }),
            variables: toResendVariables({
              firstName,
              orderNumber: id.slice(0, 8),
              carrier: carrier || "",
              trackingNumber: trackingNumber || "",
              trackingUrl: trackingUrlFor(carrier, trackingNumber),
              itemList: items.map((i: any) => String(i.product_name || i.name || "Item")).join(", "),
              estimatedDelivery: "",
            }),
          });
          emailed = !!res?.ok;
          if (!emailed) emailError = res?.error || "Email send failed";
        } catch (e: any) {
          emailError = e?.message || "Email send failed";
        }
      } else {
        emailError = "No customer email on this order";
      }
      return {
        ok: true, fulfillmentStatus: "shipped", trackingNumber, carrier, emailed, emailError,
      } as const;
    }

    // delivered
    meta.delivered_at = now;
    meta.delivered_source = "manual";
    await client.query(
      `UPDATE public.commerce_orders
          SET fulfillment_status = 'delivered', status = 'delivered',
              tracking_status = 'DELIVERED', metadata = $2, updated_at = now()
        WHERE id::text = $1 AND tenant_id = $3`,
      [id, JSON.stringify(meta), tenant]
    );
    await logOrderEvent(client, tenant, id, "delivered", oldStatus, "delivered", {
      delivered_at: now, delivered_source: "manual",
    });
    return { ok: true, fulfillmentStatus: "delivered", deliveredAt: now } as const;
  });

  if (!outcome) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
  if ("error" in outcome) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  }

  // If this order is a checkout-split child, its parent's roll-up
  // follows the move (a no-op for every other order).
  await rollupSplitParentFulfillmentSafe(
    (sql, params) => pgQueryStrict<Record<string, unknown>>(sql, params),
    id,
  );

  try {
    revalidatePath("/admin/orders");
    revalidatePath("/customer/orders");
  } catch { /* best-effort */ }

  return NextResponse.json({ orderId: id, ...outcome });
}
