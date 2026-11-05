// ---------------------------------------------------------------------------
// Packing slip body — shared by the single-slip print route and the batch
// slips print route. Returns the slip's inner HTML (no document shell;
// callers wrap it with buildPrintDocument) or null when the order doesn't
// exist for the tenant.
// ---------------------------------------------------------------------------

import { escapeHtml } from "./document";

export const PACKING_SLIP_CSS = `
  h1 { font-size: 22px; margin: 0 0 4px; }
  .meta { color: #666; font-size: 13px; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th { text-align: left; padding: 8px; background: #f5f5f5; font-size: 12px; text-transform: uppercase; }
  .totals { text-align: right; margin-top: 16px; }
  .totals div { margin: 4px 0; }
  .notes { background: #fffbeb; border: 1px solid #fde68a; padding: 12px; border-radius: 6px; margin-top: 16px; font-size: 13px; }
`;

function parseMoney(v: unknown): number {
  // commerce_orders money columns are TEXT like "$25.27".
  const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export async function packingSlipBody(
  client: any,
  tenant: string,
  id: string,
): Promise<string | null> {
  // Order header — customer may be a shop customer (customers.id, the id
  // commerce_orders.customer_id actually holds) or a CRM customer.
  const { rows: orders } = await client.query(
    `SELECT o.id::text AS id, o.email, o.customer_email, o.customer_id::text AS customer_id,
            o.status, o.payment_status, o.fulfillment_status, o.fulfillment_method,
            o.subtotal, o.total_amount, o.shipping_address, o.notes,
            o.tracking_number, o.carrier, o.created_at::text AS created_at,
            sc."firstName" AS shop_first, sc."lastName" AS shop_last, sc.phone AS shop_phone,
            c.first_name, c.last_name, c.phone
     FROM public.commerce_orders o
     LEFT JOIN public.customers sc ON sc.id = o.customer_id
     LEFT JOIN public.crm_customers c ON c.id::text = o.customer_id OR c.source_customer_id::text = o.customer_id
     WHERE o.id::text = $1 AND o.tenant_id = $2`,
    [id, tenant],
  );
  if (!orders.length) return null;
  const o = orders[0];

  // Line items — real columns: oi.name, oi.unit_price (text like "$12.84"),
  // SKU via product_id → commerce_catalog_items. Line total is computed.
  const { rows: items } = await client.query(
    `SELECT oi.quantity, oi.name AS product_name, ci.sku AS sku,
            COALESCE(NULLIF(regexp_replace(oi.unit_price, '[^0-9.]', '', 'g'), ''), '0')::numeric AS unit_price
     FROM public.commerce_order_items oi
     LEFT JOIN public.commerce_catalog_items ci ON ci.id::text = oi.product_id::text
     WHERE oi.order_id::text = $1
     ORDER BY oi.created_at ASC NULLS LAST`,
    [id],
  );

  const customerName = [o.shop_first, o.shop_last].filter(Boolean).join(" ")
    || [o.first_name, o.last_name].filter(Boolean).join(" ")
    || o.customer_email || o.email || "—";
  const phone = o.shop_phone || o.phone || "";
  const addr = o.shipping_address || "—";
  const date = o.created_at ? new Date(o.created_at).toLocaleDateString() : "—";

  const itemRows = items.map((it: any) => {
    const qty = Number(it.quantity) || 0;
    const unit = Number(it.unit_price) || 0;
    return `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee;">${qty}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(it.product_name || "—")}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(it.sku || "—")}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">$${unit.toFixed(2)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">$${(qty * unit).toFixed(2)}</td>
    </tr>`;
  }).join("");

  return `
  <h1>Packing Slip</h1>
  <div class="meta">Order #${o.id.slice(0, 8)} &bull; ${date} &bull; ${escapeHtml(o.fulfillment_status || "")}</div>
  <div style="display:flex;gap:32px;margin-bottom:16px;">
    <div><strong>Ship to:</strong><br>${escapeHtml(customerName)}<br><span style="color:#666;font-size:13px;">${escapeHtml(addr)}</span><br><span style="color:#666;font-size:13px;">${escapeHtml(phone)}</span></div>
    <div><strong>Method:</strong><br>${escapeHtml(o.fulfillment_method || "—")}<br>${o.tracking_number ? `<span style="font-size:13px;">${escapeHtml(o.carrier || "")}: ${escapeHtml(o.tracking_number)}</span>` : ""}</div>
  </div>
  <table><thead><tr><th>Qty</th><th>Product</th><th>SKU</th><th style="text-align:right;">Unit</th><th style="text-align:right;">Total</th></tr></thead>
  <tbody>${itemRows || '<tr><td colspan="5" style="padding:16px;text-align:center;color:#999;">No items</td></tr>'}</tbody></table>
  <div class="totals">
    <div>Subtotal: $${parseMoney(o.subtotal).toFixed(2)}</div>
    <div style="font-size:18px;font-weight:700;">Total: $${parseMoney(o.total_amount).toFixed(2)}</div>
  </div>
  ${o.notes ? `<div class="notes"><strong>Notes:</strong> ${escapeHtml(o.notes)}</div>` : ""}`;
}
