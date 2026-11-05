import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { buildPrintDocument } from "@/lib/printing/document";
import { getPrinterSettings } from "@/lib/printing/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// GET /api/admin/orders/pick-list — Pick list for unfulfilled orders.
// Returns HTML printable pick list: products + quantities + bin locations.
// Renders through the shared print document shell (tenant printer
// settings geometry + auto-print; device print dialog).
// ============================================================================

const PICK_LIST_CSS = `
  h1 { font-size: 22px; margin: 0 0 4px; }
  .meta { color: #666; font-size: 13px; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 10px; background: #f5f5f5; font-size: 12px; text-transform: uppercase; }
`;

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("orders", "read");
  if (gate) return gate;

  const tenant = resolveTenantId(req);
  const settings = await getPrinterSettings(tenant);

  const bodyHtml = await withPg(async (client) => {
    // Aggregate unfulfilled order items by product
    const { rows } = await client.query(
      `SELECT COALESCE(ci.name, oi.name) AS product_name, ci.sku AS sku,
              SUM(oi.quantity)::int AS total_qty,
              COUNT(DISTINCT o.id)::int AS order_count,
              MAX(eb.bin_location) AS bin_location,
              STRING_AGG(DISTINCT o.id::text, ', ') AS order_ids
       FROM public.commerce_orders o
       JOIN public.commerce_order_items oi ON oi.order_id::text = o.id::text
       LEFT JOIN public.commerce_catalog_items ci ON ci.id::text = oi.product_id::text
       LEFT JOIN public.erp_inventory_balances eb ON eb.sku_id = ci.sku_id AND eb.tenant_id = o.tenant_id
       WHERE o.tenant_id = $1
         AND UPPER(o.fulfillment_status) IN ('PENDING', 'UNFULFILLED', 'PROCESSING')
       GROUP BY COALESCE(ci.name, oi.name), ci.sku
       ORDER BY product_name`,
      [tenant]
    );

    const date = new Date().toLocaleDateString();
    const rowsHtml = rows.map((r: any, i: number) => `
      <tr>
        <td style="padding:10px;border-bottom:1px solid #eee;"><input type="checkbox" style="width:18px;height:18px;"></td>
        <td style="padding:10px;border-bottom:1px solid #eee;font-weight:600;">${escapeHtml(r.product_name || "—")}</td>
        <td style="padding:10px;border-bottom:1px solid #eee;font-family:monospace;">${escapeHtml(r.sku || "—")}</td>
        <td style="padding:10px;border-bottom:1px solid #eee;">${escapeHtml(r.bin_location || "—")}</td>
        <td style="padding:10px;border-bottom:1px solid #eee;text-align:center;font-size:18px;font-weight:700;">${r.total_qty}</td>
        <td style="padding:10px;border-bottom:1px solid #eee;text-align:center;color:#666;">${r.order_count}</td>
      </tr>`).join("");

    return `
  <h1>Pick List</h1>
  <div class="meta">${date} &bull; ${rows.length} SKUs to pick &bull; Unfulfilled orders</div>
  <table><thead><tr><th></th><th>Product</th><th>SKU</th><th>Bin</th><th style="text-align:center;">Qty</th><th style="text-align:center;">Orders</th></tr></thead>
  <tbody>${rowsHtml || '<tr><td colspan="6" style="padding:24px;text-align:center;color:#999;">No unfulfilled orders — nothing to pick.</td></tr>'}</tbody></table>`;
  });

  const html = buildPrintDocument({
    title: `Pick List`,
    docType: "document",
    settings,
    bodyHtml: bodyHtml ?? "",
    extraCss: PICK_LIST_CSS,
  });

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  });
}

function escapeHtml(s: string): string {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c] || c));
}
