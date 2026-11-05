import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { getShippingSettings } from "@/lib/shipping/settings";
import { existingOrderLabel, loadOrder, logOrderEvent, parseShipTo, type ShipTo } from "@/lib/orders/lifecycle";
import { auditAction, getActorIdFromRequest } from "@/lib/quick-actions/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// POST /api/admin/orders/[id]/reroute — Admin Tree C2 · Reroute shipment.
//
// Until this route, tracking could be edited on an order but a shipment
// could not be rerouted (census C2, 2026-10-15). A reroute is a
// void-and-reissue over the EXISTING shipping stack (the same Shippo /
// USPS purchase paths as /api/admin/orders/[id]/label):
//
//   Body: { new_address?: { name?, street1, city, state, zip },
//           carrier?, service?, provider?: "shippo" | "usps",
//           weight_lb?, reason? }
//   At least one of new_address / carrier / service is required — a
//   reroute that changes nothing is refused, not recorded.
//
// Order of operations (the label route's contract): the replacement
// label is PURCHASED FIRST. Only a real label writes anything — the old
// tracking is superseded on the order, the destination (when changed)
// replaces shipping_address, the void of the old label + the reroute
// itself are recorded in metadata.reroute_history and a
// 'shipment_rerouted' fulfillment event, and the new label lands in
// commerce_shipping_labels. When the carrier API is not configured the
// purchase throws the stack's own not-configured error and this route
// answers 503 with the label route's exact body — nothing is recorded,
// because no reroute happened.
//
// Guards: cancelled → 409 · delivered → 409 (a delivered shipment
// cannot be rerouted) · no usable destination (stored or supplied) →
// 400 · USPS provider with a non-USPS carrier change → 400 (USPS is a
// single-carrier stack; carrier choice rides Shippo).
// ============================================================================

type NewAddress = { name?: string; street1: string; city: string; state: string; zip: string };

function cleanAddress(raw: any): NewAddress | null | { error: string } {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object") return { error: "new_address must be an object { street1, city, state, zip }" };
  const street1 = String(raw.street1 || raw.address1 || raw.street || "").trim();
  const city = String(raw.city || "").trim();
  const state = String(raw.state || "").trim().toUpperCase();
  const zip = String(raw.zip || raw.postal_code || "").trim();
  if (!street1 || !city || !/^[A-Z]{2}$/.test(state) || !/^\d{5}(-\d{4})?$/.test(zip)) {
    return { error: "new_address needs street1, city, a 2-letter state, and a 5-digit ZIP" };
  }
  return { name: raw.name ? String(raw.name).trim().slice(0, 200) : undefined, street1, city, state, zip };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireModuleApi("orders", "write");
  if (gate) return gate;

  const { id } = await params;
  const tenant = resolveTenantId(req);
  const body = await req.json().catch(() => ({}));
  const reason = body?.reason ? String(body.reason).trim().slice(0, 500) : null;
  const carrier = body?.carrier ? String(body.carrier).trim().slice(0, 80) : null;
  const service = body?.service ? String(body.service).trim().slice(0, 80) : null;
  const weightLb = Math.max(0.1, Number(body?.weight_lb) || 2);

  const addrResult = cleanAddress(body?.new_address);
  if (addrResult && "error" in addrResult) {
    return NextResponse.json({ error: addrResult.error }, { status: 400 });
  }
  const newAddress = addrResult as NewAddress | null;
  if (!newAddress && !carrier && !service) {
    return NextResponse.json(
      { error: "Nothing to reroute: supply new_address, carrier, or service" },
      { status: 400 }
    );
  }

  const order = await withPg(async (client) => loadOrder(client, tenant, id));
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const fs = String(order.fulfillment_status || "").toLowerCase();
  const st = String(order.status || "").toLowerCase();
  if (fs === "cancelled" || st === "cancelled") {
    return NextResponse.json({ error: "Order is cancelled — there is no shipment to reroute" }, { status: 409 });
  }
  if (fs === "delivered" || st === "delivered") {
    return NextResponse.json({ error: "Order is delivered — a delivered shipment cannot be rerouted" }, { status: 409 });
  }

  const fallbackName = order.customer_name || order.customer_email_resolved || "Customer";
  const previousTo = parseShipTo(order.shipping_address, fallbackName);
  const to: ShipTo | null = newAddress
    ? { name: newAddress.name || fallbackName, street1: newAddress.street1, city: newAddress.city, state: newAddress.state, zip: newAddress.zip }
    : previousTo;
  if (!to || !to.zip) {
    return NextResponse.json(
      { error: "no_shipping_address", message: "This order has no usable shipping address (a ZIP is required) and no new_address was supplied — cannot reroute." },
      { status: 400 }
    );
  }

  const settings = await getShippingSettings();
  const requested = String(body?.provider || "").toLowerCase();
  const provider: "shippo" | "usps" =
    requested === "usps" || requested === "shippo" ? requested : settings.defaultProvider;
  if (provider === "usps" && carrier && !/usps/i.test(carrier)) {
    return NextResponse.json(
      { error: "carrier_change_needs_shippo", message: "Changing carrier rides the Shippo stack — resend with provider: \"shippo\" (USPS is a single-carrier provider)." },
      { status: 400 }
    );
  }

  // ── Purchase FIRST (label route contract): nothing is recorded for a
  // label that was never really bought.
  let label: {
    labelUrl: string; trackingNumber: string; trackingUrl?: string;
    provider: string; service: string; rateCents: number; testMode?: boolean;
  };
  try {
    if (provider === "usps") {
      const { createShippingLabel } = await import("@/lib/shipping/usps-client");
      const usps = await createShippingLabel({
        toName: to.name, toAddress1: to.street1, toCity: to.city,
        toState: to.state, toZIP: to.zip,
        weight: Math.round(weightLb * 16), orderId: id,
      });
      if (!usps) {
        return NextResponse.json(
          { error: "usps_not_configured", message: "USPS is not configured — add USPS API credentials in Admin → Settings → Shipping." },
          { status: 503 }
        );
      }
      if ((usps as any).simulated) {
        return NextResponse.json(
          { error: "label_unavailable", message: "USPS could not issue a real label for the reroute. Nothing was saved; the original shipment is unchanged." },
          { status: 422 }
        );
      }
      label = {
        labelUrl: usps.labelUrl, trackingNumber: usps.trackingNumber,
        provider: "USPS", service: usps.mailClass,
        rateCents: Math.round(Number(usps.postage || 0) * 100),
      };
    } else {
      const { shippoBuyLabel } = await import("@/lib/shippo");
      const s = await shippoBuyLabel({
        to: { ...to, email: order.customer_email_resolved || undefined },
        weightLb, orderId: id,
        carrier: carrier || undefined, service: service || undefined,
      });
      label = {
        labelUrl: s.labelUrl, trackingNumber: s.trackingNumber,
        trackingUrl: s.trackingUrl, provider: s.provider,
        service: s.service, rateCents: s.rateCents, testMode: s.testMode,
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
    if (msg === "shippo_no_rates") {
      return NextResponse.json(
        { error: "no_matching_rate", message: `No ${[carrier, service].filter(Boolean).join(" / ") || "carrier"} rate is available for this destination — the original shipment is unchanged.` },
        { status: 422 }
      );
    }
    if (e?.name === "ReturnAddressError" || msg.startsWith("Return address")) {
      return NextResponse.json({ error: "return_address_not_set", message: msg }, { status: 422 });
    }
    return NextResponse.json({ error: msg || "reroute label purchase failed" }, { status: 502 });
  }

  // ── Persist the reroute: supersede the old label, move the order to
  // the new tracking/destination, record the void + reroute in history
  // and the fulfillment event log.
  const previousLabel = existingOrderLabel(order);
  const now = new Date().toISOString();
  const actorId = await getActorIdFromRequest(req);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  await withPg(async (client) => {
    const meta = order.metadata && typeof order.metadata === "object" ? { ...order.metadata } : {};
    const history = Array.isArray(meta.reroute_history) ? [...meta.reroute_history] : [];
    history.push({
      at: now, reason,
      voided: previousLabel
        ? { carrier: previousLabel.carrier, trackingNumber: previousLabel.trackingNumber }
        : null,
      fromAddress: previousTo,
      toAddress: to,
      requestedCarrier: carrier, requestedService: service,
      newCarrier: label.provider, newService: label.service,
      newTrackingNumber: label.trackingNumber,
    });
    meta.rerouted_at = now;
    meta.reroute_history = history.slice(-20);
    meta.label_purchased_at = now;
    meta.label_provider = label.provider;
    meta.label_test_mode = !!label.testMode;

    if (newAddress) {
      await client.query(
        `UPDATE public.commerce_orders
            SET tracking_number = $2, carrier = $3, shipping_address = $4,
                metadata = $5, updated_at = now()
          WHERE id::text = $1 AND tenant_id = $6`,
        [id, label.trackingNumber, label.provider, JSON.stringify({
          name: to.name, address1: to.street1, street1: to.street1,
          city: to.city, state: to.state, zip: to.zip,
        }), JSON.stringify(meta), tenant]
      );
    } else {
      await client.query(
        `UPDATE public.commerce_orders
            SET tracking_number = $2, carrier = $3, metadata = $4, updated_at = now()
          WHERE id::text = $1 AND tenant_id = $5`,
        [id, label.trackingNumber, label.provider, JSON.stringify(meta), tenant]
      );
    }
    await client.query(
      `INSERT INTO public.commerce_shipping_labels
         (tenant_id, carrier, tracking_number, label_type, label_uri, postage_amount, created_at)
       VALUES ($1, $2, $3, 'shipping', $4, $5, now())`,
      [tenant, label.provider, label.trackingNumber, label.labelUrl || null, label.rateCents / 100]
    ).catch((e: any) => console.error("[orders/reroute] label row insert failed (non-fatal):", e?.message || e));
    await logOrderEvent(client, tenant, id, "shipment_rerouted",
      String(order.fulfillment_status || "pending"), String(order.fulfillment_status || "pending"),
      {
        reason,
        voidedTrackingNumber: previousLabel?.trackingNumber ?? null,
        voidedCarrier: previousLabel?.carrier ?? null,
        newTrackingNumber: label.trackingNumber, newCarrier: label.provider,
        newService: label.service, rateCents: label.rateCents,
        addressChanged: !!newAddress, toAddress: to,
      });
  });

  await auditAction({
    action: "reroute_shipment", domain: "commerce", tableName: "commerce_orders",
    recordId: id, actorUserId: actorId, ipAddress: ip,
    beforeData: { trackingNumber: previousLabel?.trackingNumber ?? null, carrier: previousLabel?.carrier ?? null },
    afterData: { trackingNumber: label.trackingNumber, carrier: label.provider, service: label.service, addressChanged: !!newAddress, reason },
  }).catch(() => { /* audit is fail-soft, the reroute stands */ });

  try {
    revalidatePath("/admin/orders");
    revalidatePath("/customer/orders");
  } catch { /* best-effort */ }

  return NextResponse.json({
    ok: true, orderId: id, label,
    voided: previousLabel,
    addressChanged: !!newAddress,
    note: previousLabel
      ? `Previous ${previousLabel.carrier || "carrier"} label ${previousLabel.trackingNumber} is superseded — destroy the old label; only the new tracking number is live on this order.`
      : "No previous label was on this order; the rerouted label is its first.",
  });
}
