import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { buildPrintDocument, escapeHtml } from "@/lib/printing/document";
import { labelImgStyle } from "@/lib/printing/geometry";
import { getPrinterSettings } from "@/lib/printing/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// GET /api/admin/orders/[id]/label-print?tracking=… — Print the carrier's
// own label file for an order (SA-44 reprint path).
//
// Labels are the CARRIER's documents (Sunny's ruling): this route never
// draws a label. It resolves the stored carrier file for the order's
// tracking number and hands it to this device's printer:
//   • PDF file  → redirect to the carrier PDF itself (its geometry is
//     carrier-authored 4×6; the PDF viewer's print is the print path).
//   • Image file → a label print document embedding the carrier image at
//     the tenant's label paper size, auto-printing per settings.
//   • No file stored → an honest page saying so. Test-era labels were
//     recorded without files; there is nothing real to print.
// ============================================================================

interface LabelRow {
  label_uri: string | null;
  carrier: string | null;
  tracking_number: string | null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireModuleApi("orders", "read");
  if (gate) return gate;

  const { id } = await params;
  const tenant = resolveTenantId(req);
  const settings = await getPrinterSettings(tenant);
  const trackingParam = req.nextUrl.searchParams.get("tracking") || "";

  const found = await withPg(async (client) => {
    const { rows: orders } = await client.query(
      `SELECT id::text AS id, tracking_number, carrier
         FROM public.commerce_orders
        WHERE id::text = $1 AND tenant_id = $2`,
      [id, tenant],
    );
    if (!orders.length) return { order: null, label: null as LabelRow | null };
    const order = orders[0];
    const tracking = trackingParam || order.tracking_number || "";
    let label: LabelRow | null = null;
    if (tracking) {
      const { rows: labels } = await client.query(
        `SELECT label_uri, carrier, tracking_number
           FROM public.commerce_shipping_labels
          WHERE tenant_id = $1 AND tracking_number = $2
          ORDER BY created_at DESC
          LIMIT 1`,
        [tenant, tracking],
      );
      label = labels[0] || null;
    }
    return { order, label };
  });

  if (!found || !found.order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const { order, label } = found;
  const uri = label?.label_uri || null;
  const tracking = label?.tracking_number || order.tracking_number || trackingParam || "";

  if (uri && /\.pdf($|\?)/i.test(uri)) {
    return NextResponse.redirect(uri);
  }

  if (uri) {
    const html = buildPrintDocument({
      title: `Shipping Label ${tracking}`,
      docType: "label",
      settings,
      bodyHtml: `<img src="${escapeHtml(uri)}" alt="Carrier shipping label" style="${labelImgStyle(settings)}" />`,
    });
    return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
  }

  const html = buildPrintDocument({
    title: `Shipping Label ${tracking || order.id.slice(0, 8)}`,
    docType: "label",
    settings,
    bodyHtml: `
  <div style="font-family:-apple-system,sans-serif;padding:24px;max-width:420px;">
    <h1 style="font-size:18px;margin:0 0 8px;">No label file to print</h1>
    <p style="font-size:13px;color:#444;line-height:1.6;">
      Order #${escapeHtml(order.id.slice(0, 8))}${tracking ? ` &bull; Tracking <span style="font-family:monospace;">${escapeHtml(tracking)}</span>` : ""}
      ${label?.carrier || order.carrier ? ` &bull; ${escapeHtml(label?.carrier || order.carrier || "")}` : ""}
    </p>
    <p style="font-size:13px;color:#444;line-height:1.6;">
      No carrier-issued label file is stored for this order, so there is nothing real to
      print. Labels print from the carrier's own file — buy the label from the order
      (or the Shipping Station) and the stored file will print here.
    </p>
  </div>`,
  });
  return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
}
