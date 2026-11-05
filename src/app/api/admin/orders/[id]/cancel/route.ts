import { SITE_URL } from "@/lib/site-url";
import { toResendVariables } from "@/lib/email/resend-templates";
import { renderHostedEmail } from "@/lib/email/hosted-render";
import { sendEmail } from "@/lib/email";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { loadOrder, logOrderEvent } from "@/lib/orders/lifecycle";
import {
  rollupSplitParentFulfillmentSafe,
  sellerQueryFnForPgClient,
} from "@/lib/sellers/order-split";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// POST /api/admin/orders/[id]/cancel — Admin Tree C2 · Force cancel.
//
// The governed cancel act for an order, in the same idiom as the transition
// route: guarded state checks, the spine's own status vocabulary
// (status + fulfillment_status both move to 'cancelled'), the reason and
// the force flag stamped into metadata, and a commerce_fulfillment_events
// row via logOrderEvent. Before this route the only cancel path was the
// queue's raw PATCH dropdown — an unguarded generic write with no event,
// no reason, and no record of the act.
//
// Guards:
//   already cancelled → 409 · delivered → 409 (a delivered order cannot be
//   cancelled) · shipped → 409 unless { force: true } (the tree's "force").
//
// Cancelling NEVER touches payment: a paid order stays paid on the record,
// the response says so, and refunding is the separate C2 force-refund act
// (the finance spine's issue_refund). No money moves here.
// ============================================================================

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireModuleApi("orders", "write");
  if (gate) return gate;

  const { id } = await params;
  const tenant = resolveTenantId(req);
  const body = await req.json().catch(() => ({}));
  const reason = String(body?.reason || "").trim() || null;
  const force = body?.force === true;

  const outcome = await withPg(async (client) => {
    const order = await loadOrder(client, tenant, id);
    if (!order) return { error: "Order not found", status: 404 } as const;

    const fs = String(order.fulfillment_status || "").toLowerCase();
    const st = String(order.status || "").toLowerCase();
    if (fs === "cancelled" || st === "cancelled") {
      return { error: "Order is already cancelled", status: 409 } as const;
    }
    if (fs === "delivered" || st === "delivered") {
      return { error: "A delivered order cannot be cancelled", status: 409 } as const;
    }
    if (fs === "shipped" && !force) {
      return {
        error: "Order has already shipped — resend with force: true to force-cancel a shipped order",
        status: 409,
      } as const;
    }

    const meta = order.metadata && typeof order.metadata === "object" ? { ...order.metadata } : {};
    const now = new Date().toISOString();
    meta.cancelled_at = now;
    if (reason) meta.cancel_reason = reason.slice(0, 500);
    meta.force_cancel = force;

    await client.query(
      `UPDATE public.commerce_orders
          SET status = 'cancelled', fulfillment_status = 'cancelled',
              metadata = $2, updated_at = now()
        WHERE id::text = $1 AND tenant_id = $3`,
      [id, JSON.stringify(meta), tenant]
    );
    await logOrderEvent(client, tenant, id, "cancelled",
      String(order.fulfillment_status || "pending"), "cancelled",
      { cancelled_at: now, reason, force });

    // A cancelled checkout-split child drops out of its parent's
    // roll-up — the remaining parts define the order's progress.
    await rollupSplitParentFulfillmentSafe(sellerQueryFnForPgClient(client), id);

    return {
      ok: true,
      paymentStatus: String(order.payment_status || "unpaid"),
      emailTo: (order.customer_email || order.email || order.crm_email || order.shop_email || null) as string | null,
      firstName: (order.shop_first || order.crm_first || null) as string | null,
      totalAmount: Number(order.total_amount || 0),
    } as const;
  });

  if (!outcome) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
  if ("error" in outcome) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  }

  try {
    revalidatePath("/admin/orders");
    revalidatePath("/customer/orders");
  } catch { /* best-effort */ }

  // The customer hears about the cancellation from us (Sunny's
  // design), with the amount that will be refunded when paid — the
  // refund itself is the separate act, and its own email follows
  // when the money moves. Fire-and-forget.
  if (outcome.emailTo) {
    const paid = outcome.paymentStatus === "paid";
    const vars = toResendVariables({
      firstName: outcome.firstName || "there",
      orderNumber: id.slice(0, 8),
      refundAmount: paid ? `$${outcome.totalAmount.toFixed(2)}` : "$0.00",
      ordersUrl: `${SITE_URL}/account/orders`,
    });
    void sendEmail({
      to: outcome.emailTo,
      template: "order_canceled",
      subject: `Your order was canceled — ${id.slice(0, 8)}`,
      relatedOrderId: id,
      html: renderHostedEmail("order_canceled", vars) || "",
      variables: vars,
    }).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    orderId: id,
    fulfillmentStatus: "cancelled",
    paymentStatus: outcome.paymentStatus,
    note: outcome.paymentStatus === "paid"
      ? "This order was paid. Cancelling does not refund it — issue a refund separately (force refund)."
      : null,
  });
}
