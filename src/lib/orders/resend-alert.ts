// ---------------------------------------------------------------------------
// deliverOrderAlert — the REAL delivery behind the "Resend Alert" quick
// action (tree A.4.6 / A.5.5, SA-36), shared by the commerce actions route
// and the orders actions route.
//
// Before this helper existed, both routes only stamped a log/note row and
// reported "Alert resent" — no email ever left the building. Now the alert
// is an actual customer email through the Resend pipeline (sendEmail):
//   - order not found            → 404
//   - no customer email on order → 422 (honest, nothing sent)
//   - provider/send failure      → 502 with the provider's reason
//   - success                    → activity_log + CRM note written, and the
//                                  caller can truthfully say "resent".
// A shipped order re-sends the shipped/tracking email; any other order
// gets an order-update email carrying the staff message when one is given.
// ---------------------------------------------------------------------------

import { pgExec, pgQuery } from "@/lib/pg";
import { loadOrder, loadOrderItems } from "@/lib/orders/lifecycle";
import { sendEmail } from "@/lib/email";
import { orderShippedHtml } from "@/lib/email/templates/commerce";
import { BRAND, button, detailsCard, esc, eyebrow, frame, h1, noteBox, p } from "@/lib/email/design";

// loadOrder / loadOrderItems take a minimal { query } client; pgQuery
// matches that contract (failures surface as [], i.e. "not found").
const pgClient = {
  query: async (sql: string, params?: unknown[]) => ({
    rows: await pgQuery(sql, params ?? []),
  }),
};

export type OrderAlertResult =
  | { ok: true; emailed: true; to: string }
  | { ok: false; status: number; error: string; message: string };

export async function deliverOrderAlert(opts: {
  tenant: string;
  orderId: string;
  message?: string | null;
}): Promise<OrderAlertResult> {
  const { tenant, orderId } = opts;
  const staffMessage = opts.message ? String(opts.message).trim() : "";

  const order = await loadOrder(pgClient, tenant, orderId);
  if (!order) {
    return { ok: false, status: 404, error: "order_not_found", message: "Order not found" };
  }

  const to = order.customer_email_resolved as string | null;
  if (!to) {
    return {
      ok: false, status: 422, error: "no_customer_email",
      message: "This order has no customer email address — the alert cannot be sent.",
    };
  }

  const items = await loadOrderItems(pgClient, orderId);
  const itemNames = items.map((i: any) => i.product_name).filter(Boolean) as string[];
  const firstName = String(order.customer_name || "there").split(" ")[0] || "there";
  const orderNumber = `#${String(order.id).slice(0, 8).toUpperCase()}`;
  const trackingNumber = order.tracking_number ? String(order.tracking_number) : null;
  const carrier = order.carrier ? String(order.carrier) : null;

  let subject: string;
  let html: string;
  if (trackingNumber) {
    subject = `Your UnSaid Memories order ${orderNumber} has shipped`;
    html = orderShippedHtml({
      firstName,
      orderNumber,
      carrier: carrier || undefined,
      trackingNumber,
      itemNames,
    });
    // A shipped order's alert IS the tracking email; a staff note, when
    // given, is preserved on the CRM note written after the send.
  } else {
    const statusText = String(order.fulfillment_status || order.status || "pending").replace(/_/g, " ");
    subject = `Update on your UnSaid Memories order ${orderNumber}`;
    html = frame({
      preheader: `An update on your order ${orderNumber}.`,
      body: [
        eyebrow("Order update"),
        h1(`A quick update on your order, ${esc(firstName)}`),
        staffMessage
          ? p(esc(staffMessage))
          : p(`You asked us to resend your order alert — here's where things stand. Your order is currently <strong>${esc(statusText)}</strong> and we're on it.`),
        ...(itemNames.length
          ? [p(`<strong>Items:</strong><br/>${itemNames.map((n) => esc(n)).join("<br/>")}`)]
          : []),
        detailsCard("Order", [
          { label: "Order number", value: esc(orderNumber) },
          { label: "Status", value: esc(statusText) },
          ...(order.total_amount ? [{ label: "Total", value: esc(String(order.total_amount)) }] : []),
        ]),
        button(BRAND.portalUrl, "View my order"),
        noteBox("Questions about this order? Reply to this email or call us at 901-722-1114."),
      ].join(""),
      reason: "You're receiving this because you placed an order at unsaidmemories.com and an update was requested.",
    });
  }

  const sent = await sendEmail({
    to,
    template: "order_alert",
    subject,
    html,
    relatedOrderId: orderId,
    customerId: order.crm_customer_id || undefined,
    tenantId: tenant,
  });
  if (!sent.ok) {
    return {
      ok: false, status: 502, error: "email_not_sent",
      message: `The alert email could not be sent: ${sent.error || "email provider error"}`,
    };
  }

  // Delivery actually happened — now the log rows tell the truth.
  await pgExec(
    `INSERT INTO public.activity_log
       (entity, "entityId", action, summary, actor, "createdAt", tenant_id)
     VALUES ('order', $1, 'alert_resent', $2, 'system', now(), $3)`,
    [orderId, `Resent alert for order ${orderId} — emailed to ${to}`, tenant],
  );
  if (order.crm_customer_id) {
    await pgExec(
      `INSERT INTO public.crm_notes (id, tenant_id, customer_id, note_type, body, is_pinned)
       VALUES (gen_random_uuid(), $1, $2::uuid, 'system', $3, false)`,
      [tenant, order.crm_customer_id, `Alert resent for order ${orderId} (emailed to ${to})${staffMessage ? ` — message: ${staffMessage}` : ""}`],
    );
  }

  return { ok: true, emailed: true, to };
}
