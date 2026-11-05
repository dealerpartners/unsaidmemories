import { sendEmail } from "@/lib/email";
import { toResendVariables } from "@/lib/email/resend-templates";
import { SITE_URL } from "@/lib/site-url";
import { createServerClient } from "@/lib/supabase";
import { orderConfirmationHtml } from "@/lib/email/templates/commerce";
import { itemListHtml, resolveOrderItemImages } from "@/lib/email/order-items";

/**
 * The order-confirmation email — the DESIGNED confirmation
 * (orderConfirmationHtml in the brand frame), sent through the
 * provider layer (sendEmail: Resend or Brevo per the store's provider
 * setting, from-address per the provider settings). It replaces the
 * original plain-text direct-Resend version.
 *
 * Discipline: this NEVER throws. A mail failure must not fail the
 * payment webhook — the payment is real whether or not the receipt
 * email leaves. The caller logs the outcome.
 *
 * Money rows are honest to the pricing model: shipping is part of
 * each piece's price, so the Shipping row reads "Included"; Tax is
 * the order total less the merchandise sum when that's positive
 * (orders carry no tax column), else $0.00.
 */
export interface ConfirmationResult {
  sent: boolean;
  id?: string;
  reason?: string;
}

interface EmailableOrder {
  id: string;
  total: number | string;
  shipping_address: Record<string, any> | null;
}

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function sendOrderConfirmationEmail(
  order: EmailableOrder,
  orderNumber: string | null,
): Promise<ConfirmationResult> {
  try {
    const to = order.shipping_address?.email;
    if (!to || typeof to !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return { sent: false, reason: "order carries no buyer email" };
    }
    const ref = orderNumber ?? order.id;
    const total = Number(order.total ?? 0);
    const addr = (order.shipping_address || {}) as Record<string, any>;
    const firstName = String(addr.first_name || "").trim() || "there";

    // Line items with resolved names (catalog variant → catalog
    // product name; native variant → product name).
    const supabase = createServerClient();
    const { data: itemRows } = await supabase
      .from("order_items")
      .select(
        "id, quantity, unit_price, product_variant_id, supplier_catalog_variant_id, product_variants ( products ( id, name ) )",
      )
      .eq("order_id", order.id);
    const rows = (itemRows || []) as any[];
    const catalogNames = new Map<string, string>();
    const catalogVariantIds = [
      ...new Set(rows.map((r) => r.supplier_catalog_variant_id).filter(Boolean)),
    ] as string[];
    if (catalogVariantIds.length) {
      const { data: variants } = await supabase
        .from("supplier_catalog_variants")
        .select("id, supplier_catalog_product_id, supplier_catalog_products ( name )")
        .in("id", catalogVariantIds);
      for (const v of (variants || []) as any[]) {
        const name = v.supplier_catalog_products?.name;
        if (name) catalogNames.set(v.id, name);
      }
    }
    // The picture of what they ordered: resolve each row's product
    // image (catalog variant → product image; native product → its
    // catalog mirror under the same id).
    const images = await resolveOrderItemImages(
      supabase,
      rows.map((r) => ({
        id: r.id,
        supplier_catalog_variant_id: r.supplier_catalog_variant_id,
        product_id: r.product_variants?.products?.id || null,
      })),
    );
    let itemsSum = 0;
    const items = rows.map((r) => {
      const qty = Number(r.quantity || 1);
      const line = Number(r.unit_price || 0) * qty;
      itemsSum += line;
      return {
        name:
          (r.supplier_catalog_variant_id
            ? catalogNames.get(r.supplier_catalog_variant_id)
            : null) ||
          r.product_variants?.products?.name ||
          "Item",
        qty,
        price: money(line),
        imageUrl: images.get(r.id),
      };
    });

    const tax = Math.max(0, Math.round((total - itemsSum) * 100) / 100);
    const shipTo =
      [
        [addr.first_name, addr.last_name].filter(Boolean).join(" "),
        addr.address_line1 || addr.line1,
        [addr.city, addr.state].filter(Boolean).join(", "),
        addr.postal_code || addr.zip,
      ]
        .filter(Boolean)
        .join(" · ") || undefined;

    const html = orderConfirmationHtml({
      firstName,
      orderNumber: ref,
      items: items.length ? items : [{ name: "Your order", qty: 1, price: money(total) }],
      subtotal: money(itemsSum || total),
      shipping: "Included",
      tax: money(tax),
      total: money(total),
      shipTo,
    });

    const res = await sendEmail({
      to,
      template: "order_confirmation",
      subject: `Your Unsaid Memories order is confirmed (${ref})`,
      html,
      relatedOrderId: order.id,
      category: "transactional",
      variables: toResendVariables({
        firstName,
        orderNumber: ref,
        items,
        itemList: itemListHtml(items),
        itemCount: items.reduce((n, i) => n + (Number(i.qty) || 0), 0),
        subtotal: money(itemsSum || total),
        tax: money(tax),
        total: money(total),
        orderUrl: `${SITE_URL}/account/orders`,
      }),
    });
    if (res.ok) return { sent: true, id: res.messageId };
    return { sent: false, reason: res.error || "send failed" };
  } catch (e: any) {
    return { sent: false, reason: e?.message || "send failed" };
  }
}
