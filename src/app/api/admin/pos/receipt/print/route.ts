import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { loadReceiptData, type ReceiptData } from "@/lib/enterprise/receipt"
import { buildPrintDocument, escapeHtml } from "@/lib/printing/document"
import { getPrinterSettings } from "@/lib/printing/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// GET /api/admin/pos/receipt/print?saleId=... — the register receipt as a
// print document: rendered from the same sale data as the PDF/email
// receipt, formatted for the tenant's receipt paper (80mm / 58mm /
// letter), and printed on THIS device's printer through the OS print
// dialog (auto-fires when the tenant's receipt auto-print setting is on).
// ============================================================================

const money = (n: number) => `$${Number(n || 0).toFixed(2)}`

function receiptBody(d: ReceiptData): string {
  const row = (l: string, v: string, strong = false) =>
    `<div style="display:flex;justify-content:space-between;font-size:${strong ? "15px" : "12.5px"};${strong ? "font-weight:700;border-top:2px solid #111;padding-top:6px;margin-top:4px;" : "padding:1.5px 0;"}"><span>${l}</span><span style="font-variant-numeric:tabular-nums;">${v}</span></div>`

  const lines = d.lines.map((l) => `
    <div style="font-size:12.5px;padding:3px 0;border-bottom:1px dashed #ddd;">
      <div>${escapeHtml(l.description)}</div>
      <div style="display:flex;justify-content:space-between;color:#444;">
        <span>${l.quantity} × ${money(l.unitPrice)}</span>
        <span style="font-variant-numeric:tabular-nums;">${money(l.lineTotal)}</span>
      </div>
    </div>`).join("")

  const payments = d.payments.map((p) =>
    row(escapeHtml(p.methodName || "Payment"), money(p.amount)),
  ).join("")

  return `
  <div style="text-align:center;margin-bottom:8px;">
    <div style="font-size:17px;font-weight:800;letter-spacing:.02em;">ALL ABOUT PAWZ</div>
    <div style="font-size:11px;color:#555;">699 Waring Rd, Memphis, TN 38122<br/>901-722-1114</div>
  </div>
  <div style="display:flex;justify-content:space-between;font-size:11.5px;color:#444;border-bottom:2px solid #111;padding-bottom:6px;">
    <span>Receipt ${escapeHtml(d.receiptNumber)}</span><span>${escapeHtml(d.date)}</span>
  </div>
  ${d.customerName ? `<div style="font-size:12px;padding-top:6px;">Customer: ${escapeHtml(d.customerName)}</div>` : ""}
  <div style="margin:6px 0;">${lines || '<div style="font-size:12.5px;color:#666;">No line items.</div>'}</div>
  ${row("Subtotal", money(d.subtotal))}
  ${d.discountTotal ? row("Discount", `−${money(d.discountTotal)}`) : ""}
  ${row("Tax", money(d.taxTotal))}
  ${row("TOTAL", money(d.total), true)}
  <div style="margin-top:8px;border-top:1px solid #ddd;padding-top:6px;">
    ${payments || row("Paid", money(d.paidTotal))}
    ${d.changeDue ? row("Change", money(d.changeDue)) : ""}
  </div>
  <p style="text-align:center;font-size:11px;color:#555;margin:12px 0 0;">Thank you! &bull; aapawz.com</p>`
}

export async function GET(req: NextRequest) {
  const tenant = resolveTenantId(req);
  const gate = await requireModuleApi("payments", "read")
  if (gate) return gate

  const saleId = req.nextUrl.searchParams.get("saleId")
  if (!saleId) return NextResponse.json({ error: "saleId required" }, { status: 400 })

  const data = await loadReceiptData(saleId, tenant)
  if (!data) return NextResponse.json({ error: "Sale not found" }, { status: 404 })

  const settings = await getPrinterSettings(tenant)
  const html = buildPrintDocument({
    title: `Receipt ${data.receiptNumber}`,
    docType: "receipt",
    settings,
    bodyHtml: receiptBody(data),
  })

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  })
}
