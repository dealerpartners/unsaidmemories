import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { buildPrintDocument, escapeHtml } from "@/lib/printing/document";
import { PACKING_SLIP_CSS, packingSlipBody } from "@/lib/printing/packing-slip";
import { getPrinterSettings } from "@/lib/printing/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// GET /api/admin/orders/packing-slips?ids=a,b,c — Batch packing slips
// (SA-43): every requested order's slip in ONE print document, a page
// break between slips, printed on this device's printer via the OS
// print dialog. Orders that don't exist for the tenant get a visible
// note section instead of silently vanishing from the batch.
// ============================================================================

const MAX_BATCH = 50;

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("orders", "read");
  if (gate) return gate;

  const tenant = resolveTenantId(req);
  const settings = await getPrinterSettings(tenant);

  const ids = (req.nextUrl.searchParams.get("ids") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_BATCH);

  const sections = await withPg(async (client) => {
    const out: string[] = [];
    for (const id of ids) {
      const body = await packingSlipBody(client, tenant, id);
      out.push(
        body ??
          `<h1>Packing Slip</h1><div class="meta">Order #${escapeHtml(id.slice(0, 8))}</div>` +
            `<p style="color:#b91c1c;">This order was not found for this shop, so no slip could be printed for it.</p>`,
      );
    }
    return out;
  });

  const bodyHtml = sections && sections.length
    ? sections.map((s) => `<section class="slip">${s}</section>`).join("")
    : `<h1>Packing Slips</h1><p style="color:#666;">No orders were selected, so there is nothing to print.</p>`;

  const html = buildPrintDocument({
    title: "Batch Packing Slips",
    docType: "document",
    settings,
    bodyHtml,
    extraCss: PACKING_SLIP_CSS + `\n  .slip + .slip { page-break-before: always; }`,
  });

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  });
}
