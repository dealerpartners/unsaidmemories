import { SITE_URL } from "@/lib/site-url";
import { toResendVariables } from "@/lib/email/resend-templates";
import { renderHostedEmail } from "@/lib/email/hosted-render";
import { sendEmail } from "@/lib/email";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createAuthClient } from "@/lib/supabase/server";
import { getStripeFromVault } from "@/lib/stripe-customer";
import { getAuthorizeNetConfig, isAuthorizeNetConfigured, chargeWithNonce, chargeSavedCard } from "@/lib/authorize-net";
import { processPaidOrder } from "@/lib/commerce/order-paid";
import { resolveCartRouting, mixedSupplierCopy } from "@/lib/commerce/supplier-routing";
import { resolveDesignSnapshot, resolveDesignDataSnapshot } from "@/lib/commerce/design-snapshot";
import { quoteShipping, persistOrderEstimates, freeShippingPromo } from "@/lib/commerce/shipping";
import Stripe from "stripe";
import { getTenantId } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLATFORM_TENANT_ID = getTenantId();

// POST /api/checkout — create order from cart + payment on the
// active gateway (Authorize.net via an Accept.js nonce when its keys
// are saved in Connections & Keys; otherwise a Stripe PaymentIntent).
// Body: {
//   cart_id,
//   shipping_address: { name, line1, line2, city, state, postal_code, country, email, phone },
//   shipping_selections?: { [package_index]: shipping_profile_id }
// }
// Flow (payment-first):
//   1. Guest-friendly — a signed-in user's order is linked to their
//      customer_id; a guest's order is linked by shipping_address.email
//      (the webhook captures a crm_customers row keyed by email).
//   2. Load cart + items, re-price every line from DB (never trust client).
//   3. Resolve each line's supplier (variant_fulfillment_routes priority)
//      and quote shipping per supplier group from shipping_profiles —
//      the server computes shipping; the client only picks method ids.
//   4. Create orders row (status=pending_payment) incl. shipping_cost, and
//      order_items rows carrying design_publication_id +
//      design_file_snapshot_url (the UnSaid Memories pattern: full line data is
//      persisted server-side before the Stripe object exists; the webhook
//      re-resolves everything from the order, never from Stripe metadata).
//   5. Persist order_shipping_estimates with the customer's selections.
//   6. Create Stripe PaymentIntent (amount = subtotal + shipping) with
//      metadata[order_id]. Fulfillment fires ONLY via the webhook.
export async function POST(req: NextRequest) {
  // Guest checkout: user may be null. Email from shipping_address is the
  // identity hook — the webhook captures crm_customers by email.
  const authClient = await createAuthClient();
  const { data: { user } } = await authClient.auth.getUser();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { cart_id, shipping_address, shipping_selections, payment_nonce, payment_card_id } = body;
  if (!cart_id) return NextResponse.json({ error: "cart_id required" }, { status: 400 });
  if (!shipping_address?.name || !shipping_address?.line1 || !shipping_address?.city || !shipping_address?.postal_code || !shipping_address?.email) {
    return NextResponse.json({ error: "shipping_address with name, line1, city, postal_code, email required" }, { status: 400 });
  }
  const country = String(shipping_address.country || "US").toUpperCase();

  // Gateway selection (client direction 2026-11-02): Authorize.net
  // when its keys are saved in Connections & Keys; otherwise Stripe.
  // Stripe stays wired for Connect banking data either way — this
  // choice is only about who takes the store's card payments.
  const useAuthorizeNet = await isAuthorizeNetConfigured();
  if (useAuthorizeNet && !payment_card_id && (!payment_nonce?.data_descriptor || !payment_nonce?.data_value)) {
    // Accept.js tokenizes the card in the customer's browser; the
    // server only ever sees the opaque nonce it returns. A saved
    // card (payment_card_id) needs no nonce — the gateway charges
    // the stored profile instead.
    return NextResponse.json({ error: "payment_nonce required" }, { status: 400 });
  }
  let stripe: Stripe | null = null;
  if (!useAuthorizeNet) {
    try {
      // Connections & Keys first (a saved key wins), env fallback —
      // pasting a live key on the Connections page switches checkout.
      stripe = await getStripeFromVault();
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  const sb = createServerClient();

  // 1. Load cart.
  const { data: cart } = await sb.from("carts").select("*").eq("id", cart_id).eq("tenant_id", PLATFORM_TENANT_ID).eq("status", "active").maybeSingle();
  if (!cart) return NextResponse.json({ error: "active cart not found" }, { status: 404 });

  const { data: cartItems } = await sb.from("cart_items").select("*").eq("cart_id", cart.id);
  if (!cartItems?.length) return NextResponse.json({ error: "cart is empty" }, { status: 400 });

  // 2. Re-price from DB + label lines for notices.
  let subtotal = 0;
  const pricedItems: any[] = [];
  for (const ci of cartItems) {
    let price: number | null = null;
    let label: string | null = null;
    if (ci.supplier_catalog_variant_id) {
      const { data: v } = await sb.from("supplier_catalog_variants").select("price_snapshot, name").eq("id", ci.supplier_catalog_variant_id).maybeSingle();
      price = v?.price_snapshot != null ? Number(v.price_snapshot) : null;
      label = v?.name ?? null;
    } else if (ci.product_variant_id) {
      const { data: v } = await sb.from("product_variants").select("price, sku, products(name)").eq("id", ci.product_variant_id).maybeSingle();
      price = v?.price != null ? Number(v.price) : null;
      label = (v as any)?.products?.name ?? v?.sku ?? null;
    } else {
      price = ci.unit_price != null ? Number(ci.unit_price) : null;
    }
    if (price == null) return NextResponse.json({ error: `item ${ci.id} has no price` }, { status: 400 });
    subtotal += price * ci.quantity;
    pricedItems.push({ ...ci, unit_price: price, label });
  }
  subtotal = Math.round(subtotal * 100) / 100;

  // 3. Supplier routing + shipping quote (server-side numbers only).
  const routing = await resolveCartRouting(sb, pricedItems);
  const quote = await quoteShipping(sb, {
    tenantId: PLATFORM_TENANT_ID,
    lines: pricedItems,
    country,
    region: shipping_address.state ?? shipping_address.region ?? null,
    postalCode: shipping_address.postal_code,
    routing,
  });

  // 3b. An item with no shipping methods can never check out at $0
  // shipping — that silently gives the shipping away. Block the order
  // and say which item is stuck, without naming where it comes from.
  const unshippable = quote.packages.filter((p) => p.methods.length === 0);
  if (unshippable.length) {
    return NextResponse.json(
      {
        error: `Shipping isn't available yet for: ${unshippable.map((p) => p.label).join(", ")}. Remove it from your bag or try again later — nothing was charged.`,
      },
      { status: 422 }
    );
  }

  // 4. Create order (pending_payment). Shipping total is finalized from the
  // persisted estimates below; start from the cheapest combination and let
  // persistOrderEstimates return the selected total.
  const { data: order, error: oe } = await sb.from("orders").insert({
    tenant_id: PLATFORM_TENANT_ID,
    customer_id: cart.customer_id ?? user?.id ?? null,
    status: "pending_payment",
    total: subtotal,
    shipping_address,
  }).select().single();
  if (oe) return NextResponse.json({ error: oe.message }, { status: 500 });

  // 5. Persist estimates + selections → shipping total + method label.
  let shippingTotal = 0;
  let methodLabel: string | null = null;
  try {
    const persisted = await persistOrderEstimates(sb, {
      tenantId: PLATFORM_TENANT_ID,
      orderId: order.id,
      quote,
      country,
      postalCode: shipping_address.postal_code,
      selections: shipping_selections ?? {},
    });
    shippingTotal = persisted.shipping_total;
    methodLabel = persisted.method_label || null;
    // Smart-cart promo: at the threshold the SHIPFREE promotion
    // applies itself — the order ships free and the label says so.
    const promo = await freeShippingPromo(sb, PLATFORM_TENANT_ID, subtotal, shippingTotal);
    if (promo?.applied) {
      shippingTotal = 0;
      methodLabel = `${methodLabel ? methodLabel + " · " : ""}${promo.code} free shipping`;
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  const total = Math.round((subtotal + shippingTotal) * 100) / 100;
  await sb.from("orders").update({
    total,
    shipping_cost: shippingTotal,
    shipping_method: methodLabel,
  }).eq("id", order.id);

  // 6. Order items — design carriage included (publication id +
  // print-file snapshot resolved now, so fulfillment never chases
  // the studio) AND the design data itself, frozen at order time:
  // design_snapshot carries the studio's saved canvas node tree, so
  // the order line — and everything downstream of it — reads what
  // was actually bought even if the design is later edited or
  // deleted. A missing snapshot never fails checkout; the file-URL
  // snapshot and the publication link still carry the line.
  const itemRows: any[] = [];
  for (const pi of pricedItems) {
    let snapshot: string | null = (pi as any).design_file_snapshot_url ?? null;
    if (!snapshot && pi.design_publication_id) {
      snapshot = await resolveDesignSnapshot(sb, pi.design_publication_id);
    }
    let designSnapshot: unknown = null;
    if (pi.design_publication_id) {
      try {
        designSnapshot = await resolveDesignDataSnapshot(sb, pi.design_publication_id);
      } catch {
        designSnapshot = null;
      }
    }
    itemRows.push({
      order_id: order.id,
      tenant_id: PLATFORM_TENANT_ID,
      product_variant_id: pi.product_variant_id,
      supplier_catalog_variant_id: pi.supplier_catalog_variant_id,
      design_publication_id: pi.design_publication_id,
      design_file_snapshot_url: snapshot,
      design_snapshot: designSnapshot,
      quantity: pi.quantity,
      unit_price: pi.unit_price,
    });
  }
  const { error: ie } = await sb.from("order_items").insert(itemRows);
  if (ie) return NextResponse.json({ error: ie.message }, { status: 500 });

  // 7. Payment on the active gateway, for the full amount (goods +
  // shipping). Authorize.net: charge the Accept.js nonce NOW — the
  // approval is synchronous, so a success runs the shared
  // paid-order flow inline (the gateway webhook later redelivers
  // the same event and takes the flow's self-heal branch; nothing
  // double-fires). A decline marks the order payment_failed, leaves
  // the cart active, and returns the gateway's own words so the
  // customer can retry with another card.
  if (useAuthorizeNet) {
    const nameParts = String(shipping_address.name).trim().split(/\s+/);
    let charge;
    try {
      const cfg = await getAuthorizeNetConfig();
      const shipTo = {
        firstName: nameParts[0] || "",
        lastName: nameParts.slice(1).join(" ") || "",
        address: shipping_address.line1,
        city: shipping_address.city,
        state: shipping_address.state || "",
        zip: shipping_address.postal_code,
        country,
      };
      if (payment_card_id) {
        // Saved card: the row must belong to this signed-in account.
        if (!user) {
          return NextResponse.json({ error: "Sign in to use a saved card." }, { status: 401 });
        }
        const { data: cardRow } = await sb
          .from("commerce_customer_payment_methods")
          .select("*")
          .eq("id", String(payment_card_id))
          .eq("provider", "authorize_net")
          .eq("status", "active")
          .eq("metadata->>auth_user_id", user.id)
          .maybeSingle();
        if (!cardRow?.provider_customer_id || !cardRow?.provider_token) {
          return NextResponse.json({ error: "That saved card is no longer available." }, { status: 400 });
        }
        charge = await chargeSavedCard({
          cfg,
          orderId: order.id,
          amount: total,
          customerProfileId: String(cardRow.provider_customer_id),
          paymentProfileId: String(cardRow.provider_token),
          email: shipping_address.email ?? user?.email ?? "",
          shipTo,
        });
        await sb
          .from("commerce_customer_payment_methods")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", cardRow.id);
      } else {
        charge = await chargeWithNonce({
          cfg,
          orderId: order.id,
          amount: total,
          dataDescriptor: String(payment_nonce.data_descriptor),
          dataValue: String(payment_nonce.data_value),
          email: shipping_address.email ?? user?.email ?? "",
          shipTo,
        });
      }
    } catch (e: any) {
      await sb.from("orders").update({ status: "payment_failed" }).eq("id", order.id);
      // The customer hears about a failed payment from us, not just
      // from an error toast — fire-and-forget, never blocks the 402.
      const buyerEmail = shipping_address.email ?? user?.email ?? "";
      if (buyerEmail) {
        const firstName = String(shipping_address.name || "").trim().split(/\s+/)[0] || "there";
        void sendEmail({
          to: buyerEmail,
          template: "payment_failed",
          subject: "We couldn't process your payment",
          relatedOrderId: order.id,
          html: renderHostedEmail("payment_failed", toResendVariables({
            firstName,
            orderNumber: order.id.slice(0, 8),
            failureReason: String(e.message || "Your card was declined.").slice(0, 200),
            last4: "",
            retryUrl: `${SITE_URL}/checkout`,
          })) || "",
          variables: toResendVariables({
            firstName,
            orderNumber: order.id.slice(0, 8),
            failureReason: String(e.message || "Your card was declined.").slice(0, 200),
            last4: "",
            retryUrl: `${SITE_URL}/checkout`,
          }),
        }).catch(() => {});
      }
      return NextResponse.json({ error: e.message, order_id: order.id }, { status: 402 });
    }

    // Approved — the same flow the webhooks run.
    await processPaidOrder(sb, PLATFORM_TENANT_ID, order.id);

    // 8. Convert cart.
    await sb.from("carts").update({ status: "converted", updated_at: new Date().toISOString() }).eq("id", cart.id);

    return NextResponse.json({
      order_id: order.id,
      gateway: "authorize_net",
      paid: true,
      transaction_id: charge.transId,
      subtotal,
      shipping_total: shippingTotal,
      total,
      status: "paid",
      suppliers: routing.groups.map((g) => ({
        supplier_id: g.supplier_id,
        supplier_name: g.supplier_name,
        line_count: g.lines.length,
      })),
      mixed_supplier: mixedSupplierCopy(routing),
      unrouted_items: routing.unrouted.length,
    }, { status: 201 });
  }

  // Stripe PaymentIntent for the full amount (goods + shipping).
  if (!stripe) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 500 });
  }
  let intent;
  try {
    intent = await stripe.paymentIntents.create({
      amount: Math.round(total * 100),
      currency: "usd",
      metadata: { order_id: order.id, tenant_id: PLATFORM_TENANT_ID },
      receipt_email: shipping_address.email ?? user?.email ?? undefined,
    });
  } catch (e: any) {
    return NextResponse.json({ error: `Stripe error: ${e.message}` }, { status: 502 });
  }

  await sb.from("orders").update({ stripe_payment_intent_id: intent.id }).eq("id", order.id);

  // 8. Convert cart.
  await sb.from("carts").update({ status: "converted", updated_at: new Date().toISOString() }).eq("id", cart.id);

  return NextResponse.json({
    order_id: order.id,
    client_secret: intent.client_secret,
    subtotal,
    shipping_total: shippingTotal,
    total,
    status: "pending_payment",
    suppliers: routing.groups.map((g) => ({
      supplier_id: g.supplier_id,
      supplier_name: g.supplier_name,
      line_count: g.lines.length,
    })),
    mixed_supplier: mixedSupplierCopy(routing),
    unrouted_items: routing.unrouted.length,
  }, { status: 201 });
}
