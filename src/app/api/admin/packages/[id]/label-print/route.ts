import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg"
import type { SellerQueryFn } from "@/lib/sellers/attribution"
import { buildPrintDocument, escapeHtml } from "@/lib/printing/document"
import { labelImgStyle } from "@/lib/printing/geometry"
import { getPrinterSettings } from "@/lib/printing/settings"
import { resolveLabelPrint } from "@/lib/fulfillment/label-core"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// GET /api/admin/packages/[id]/label-print — admin parity for the
// seller package label print (contract step 9; SA-44 separation).
// Serves the package's stored carrier file only; NEVER buys.
// ============================================================================

const q: SellerQueryFn = async (sql, params) =>
  (await pgQuery(sql, params as any[])) as Record<string, unknown>[]

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("orders", "read")
  if (gate) return gate
  const { id } = await params
  if (!id) return NextResponse.json({ error: "Missing package id" }, { status: 400 })
  const tenant = resolveTenantId(req)

  const { probeLabelStore, loadPackageForLabel } = await import("@/lib/fulfillment/label")
  if (!(await probeLabelStore(q))) {
    return NextResponse.json(
      { error: "label_store_not_installed", message: "Package labels are not enabled yet." },
      { status: 503 },
    )
  }
  const pkg = await loadPackageForLabel(q, tenant, id)
  if (!pkg) return NextResponse.json({ error: "Package not found" }, { status: 404 })

  const settings = await getPrinterSettings(tenant)
  const print = resolveLabelPrint(pkg, { kind: "admin" })
  if (print.ok) {
    if (/\.pdf($|\?)/i.test(print.labelUrl)) {
      return NextResponse.redirect(print.labelUrl)
    }
    const html = buildPrintDocument({
      title: `Shipping Label ${print.trackingNumber || ""}`,
      docType: "label",
      settings,
      bodyHtml: `<img src="${escapeHtml(print.labelUrl)}" alt="Carrier shipping label" style="${labelImgStyle(settings)}" />`,
    })
    return new NextResponse(html, { headers: { "Content-Type": "text/html" } })
  }

  const html = buildPrintDocument({
    title: `Shipping Label ${id.slice(0, 8)}`,
    docType: "label",
    settings,
    bodyHtml: `
  <div style="font-family:-apple-system,sans-serif;padding:24px;max-width:420px;">
    <h1 style="font-size:18px;margin:0 0 8px;">No label file to print</h1>
    <p style="font-size:13px;color:#444;line-height:1.6;">${escapeHtml(print.message)}</p>
    <p style="font-size:13px;color:#444;line-height:1.6;">
      Labels print from the carrier's own file — buy the label for this package and the stored file will print here.
    </p>
  </div>`,
  })
  return new NextResponse(html, { headers: { "Content-Type": "text/html" } })
}
