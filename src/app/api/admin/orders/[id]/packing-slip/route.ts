import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { buildPrintDocument } from "@/lib/printing/document";
import { PACKING_SLIP_CSS, packingSlipBody } from "@/lib/printing/packing-slip";
import { getPrinterSettings } from "@/lib/printing/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// GET /api/admin/orders/[id]/packing-slip — Printable packing slip.
// Renders through the shared print document shell: letter/A4 geometry and
// auto-print behavior come from the tenant's printer settings, and the
// document prints on this device's printer via the OS print dialog.
// ============================================================================

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireModuleApi("orders", "read");
  if (gate) return gate;

  const { id } = await params;
  const tenant = resolveTenantId(req);
  const settings = await getPrinterSettings(tenant);

  const body = await withPg(async (client) => packingSlipBody(client, tenant, id));

  if (!body) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const html = buildPrintDocument({
    title: `Packing Slip ${id.slice(0, 8)}`,
    docType: "document",
    settings,
    bodyHtml: body,
    extraCss: PACKING_SLIP_CSS,
  });

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  });
}
