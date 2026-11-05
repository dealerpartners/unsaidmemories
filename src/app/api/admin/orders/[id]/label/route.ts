import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { getShippingSettings } from "@/lib/shipping/settings";
import { existingOrderLabel, loadOrder, logOrderEvent, parseShipTo } from "@/lib/orders/lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// POST /api/admin/orders/[id]/label — buy a REAL carrier label from the
// order screen. Body: { provider?: "shippo" | "usps", weight_lb?, replace? }
//
// Double-buy guard: an order that already carries a tracking number is
// refused with 409 (existing carrier + tracking in the body) — a second
// purchase would silently overwrite the label already paid for. The one
// deliberate exception is replace: true (the fulfillment UI's warned
// re-buy); the replacement is then noted in the fulfillment event log.
//
// The return address resolves per order (ship-from.ts: the seller's own
// address for a seller order, the tenant's otherwise — never a platform
// placeholder). The ship-to is parsed from the order's stored address
// (JSON object or the shop-checkout "street · City, ST ZIP" string); when
// no ZIP can be recovered the purchase is refused, not guessed.
//
// A simulated/failed purchase saves NOTHING: tracking number, label row,
// and the fulfillment event are written only for a real label.
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
  const weightLb = Math.max(0.1, Number(body?.weight_lb) || 2);

  const order = await withPg(async (client) => loadOrder(client, tenant, id));
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Double-buy guard — fires BEFORE any purchase attempt. Disclosure in a
  // UI is not enforcement: direct callers get the same refusal here.
  const replace = body?.replace === true;
  const existingLabel = existingOrderLabel(order);
  if (existingLabel && !replace) {
    return NextResponse.json(
      {
        error: "order_already_labeled",
        message: `This order already has a ${existingLabel.carrier || "carrier"} label (tracking ${existingLabel.trackingNumber}). Buying another label would replace it — pass replace: true to buy a replacement label deliberately.`,
        carrier: existingLabel.carrier,
        trackingNumber: existingLabel.trackingNumber,
      },
      { status: 409 }
    );
  }

  const fallbackName = order.customer_name || order.customer_email_resolved || "Customer";
  const to = parseShipTo(order.shipping_address, fallbackName);
  if (!to || !to.zip) {
    return NextResponse.json(
      {
        error: "no_shipping_address",
        message: "This order has no usable shipping address (a ZIP is required) — cannot purchase a label.",
      },
      { status: 400 }
    );
  }

  const settings = await getShippingSettings();
  const requested = String(body?.provider || "").toLowerCase();
  const provider: "shippo" | "usps" =
    requested === "usps" || requested === "shippo" ? requested : settings.defaultProvider;

  let label: {
    labelUrl: string;
    trackingNumber: string;
    trackingUrl?: string;
    provider: string;
    service: string;
    rateCents: number;
    testMode?: boolean;
  };

  try {
    if (provider === "usps") {
      const { createShippingLabel } = await import("@/lib/shipping/usps-client");
      const usps = await createShippingLabel({
        toName: to.name,
        toAddress1: to.street1,
        toCity: to.city,
        toState: to.state,
        toZIP: to.zip,
        weight: Math.round(weightLb * 16), // ounces
        orderId: id, // ship-from resolves to the order's seller / house tenant
      });
      if (!usps) {
        return NextResponse.json(
          { error: "usps_not_configured", message: "USPS is not configured — add USPS API credentials in Admin → Settings → Shipping." },
          { status: 503 }
        );
      }
      if ((usps as any).simulated) {
        // A simulated label carries an invented tracking number — it is a
        // failed purchase, never something to save on a real order.
        return NextResponse.json(
          { error: "label_unavailable", message: "USPS could not issue a real label for this order. Nothing was saved." },
          { status: 422 }
        );
      }
      label = {
        labelUrl: usps.labelUrl,
        trackingNumber: usps.trackingNumber,
        provider: "USPS",
        service: usps.mailClass,
        rateCents: Math.round(Number(usps.postage || 0) * 100),
      };
    } else {
      const { shippoBuyLabel } = await import("@/lib/shippo");
      const s = await shippoBuyLabel({
        to: { ...to, email: order.customer_email_resolved || undefined },
        weightLb,
        orderId: id, // ship-from resolves per order
      });
      label = {
        labelUrl: s.labelUrl,
        trackingNumber: s.trackingNumber,
        trackingUrl: s.trackingUrl,
        provider: s.provider,
        service: s.service,
        rateCents: s.rateCents,
        testMode: s.testMode,
      };
    }
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (msg === "shippo_not_configured") {
      return NextResponse.json(
        { error: "shippo_not_configured", message: "Shipping is not configured — set a Shippo API key in Admin → Settings → Shipping." },
        { status: 503 }
      );
    }
    if (e?.name === "ReturnAddressError" || msg.startsWith("Return address")) {
      return NextResponse.json({ error: "return_address_not_set", message: msg }, { status: 422 });
    }
    return NextResponse.json({ error: msg || "label purchase failed" }, { status: 502 });
  }

  // Persist ONLY the real label: tracking + carrier on the order, the label
  // record, and the fulfillment event. (commerce_orders has no
  // shipping_label_generated_at column — the stamp lives in metadata.)
  await withPg(async (client) => {
    await client.query(
      `UPDATE public.commerce_orders
          SET tracking_number = $2, carrier = $3,
              metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'label_purchased_at', now()::text,
                'label_provider', $4::text,
                'label_test_mode', $5::boolean),
              updated_at = now()
        WHERE id::text = $1 AND tenant_id = $6`,
      [id, label.trackingNumber, label.provider, label.provider, !!label.testMode, tenant]
    );
    await client.query(
      `INSERT INTO public.commerce_shipping_labels
         (tenant_id, carrier, tracking_number, label_type, label_uri, postage_amount, created_at)
       VALUES ($1, $2, $3, 'shipping', $4, $5, now())`,
      [tenant, label.provider, label.trackingNumber, label.labelUrl || null, label.rateCents / 100]
    ).catch((e: any) => console.error("[orders/label] label row insert failed (non-fatal):", e?.message || e));
    await logOrderEvent(client, tenant, id, "label_purchased",
      String(order.fulfillment_status || "pending"), String(order.fulfillment_status || "pending"),
      {
        carrier: label.provider, trackingNumber: label.trackingNumber,
        service: label.service, rateCents: label.rateCents, testMode: !!label.testMode,
        // A deliberate replacement (replace: true) names the label it
        // replaced, so the order's history shows both tracking numbers.
        ...(existingLabel
          ? { replaced: true, replacedCarrier: existingLabel.carrier, replacedTrackingNumber: existingLabel.trackingNumber }
          : {}),
      });
  });

  return NextResponse.json({ ok: true, orderId: id, label });
}
