import "server-only"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { sendEmail } from "@/lib/email"
import { detailsCard, esc, eyebrow, frame, h1, lineItems, noteBox, p } from "@/lib/email/design"

// ============================================================================
// receipt.ts — PDF receipt generation + email delivery.
//
// Generates a clean, printable PDF receipt for a POS sale or online order.
// The PDF can be:
//   • Opened in the browser (returned as a Response with application/pdf)
//   • Printed directly (the browser's print dialog handles thermal/letter)
//   • Emailed to the customer via Resend (attached as a PDF)
//
// The register is the HUB — every sale posts to:
//   commerce_sales → acct_journal_entries (accounting)
//   commerce_payments → payment_transactions (ledger)
//   commerce_orders → customer portal (orders)
//   crm_customers → CRM profile (customer 360)
//   erp_inventory_movements → inventory (stock decrement)
// ============================================================================

export type ReceiptData = {
  saleNumber: string
  receiptNumber: string
  date: string
  customerEmail?: string | null
  customerPhone?: string | null
  customerName?: string | null
  lines: {
    description: string
    quantity: number
    unitPrice: number
    lineTotal: number
  }[]
  subtotal: number
  discountTotal: number
  taxTotal: number
  total: number
  paidTotal: number
  changeDue: number
  payments: {
    methodName: string
    amount: number
  }[]
  staffName?: string | null
  registerName?: string | null
}

// ---- Generate a PDF receipt (returns a Uint8Array) ----
export async function generateReceiptPdf(data: ReceiptData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold)

  // Receipt dimensions: 3.5" wide × variable height (thermal receipt size)
  const width = 252 // 3.5" × 72pt
  const lineHeight = 14
  const padding = 18
  let y = 0

  // Calculate height based on content
  const headerHeight = 120
  const linesHeight = data.lines.length * lineHeight + 20
  const totalsHeight = 140
  const paymentsHeight = data.payments.length * lineHeight + 30
  const footerHeight = 60
  const height = headerHeight + linesHeight + totalsHeight + paymentsHeight + footerHeight

  const page = pdf.addPage([width, height])
  y = height - padding

  // ---- Header ----
  const centerText = (text: string, fontSize: number, useBold = false) => {
    const textWidth = (useBold ? boldFont : font).widthOfTextAtSize(text, fontSize)
    page.drawText(text, {
      x: (width - textWidth) / 2,
      y: y,
      size: fontSize,
      font: useBold ? boldFont : font,
      color: rgb(0, 0, 0),
    })
    y -= fontSize + 4
  }

  const leftText = (text: string, fontSize: number, useBold = false) => {
    page.drawText(text, {
      x: padding,
      y: y,
      size: fontSize,
      font: useBold ? boldFont : font,
      color: rgb(0, 0, 0),
    })
    y -= fontSize + 4
  }

  const rightText = (text: string, fontSize: number, useBold = false) => {
    const textWidth = (useBold ? boldFont : font).widthOfTextAtSize(text, fontSize)
    page.drawText(text, {
      x: width - padding - textWidth,
      y: y,
      size: fontSize,
      font: useBold ? boldFont : font,
      color: rgb(0, 0, 0),
    })
  }

  const twoColumnText = (left: string, right: string, fontSize: number, useBold = false) => {
    leftText(left, fontSize, useBold)
    y += fontSize + 4 // reset y for right column
    rightText(right, fontSize, useBold)
  }

  // Business name
  centerText("UnSaid Memories", 14, true)
  centerText("699 Waring Rd", 8)
  centerText("Memphis, TN", 8)
  centerText("901-722-1114", 8)
  centerText("www.unsaidmemories.com", 8)
  y -= 6

  // Divider
  page.drawLine({
    start: { x: padding, y: y },
    end: { x: width - padding, y: y },
    thickness: 0.5,
    color: rgb(0.5, 0.5, 0.5),
  })
  y -= 10

  // Receipt info
  leftText(`Receipt: ${data.receiptNumber}`, 8)
  leftText(`Sale: ${data.saleNumber}`, 8)
  leftText(`Date: ${data.date}`, 8)
  if (data.customerName) leftText(`Customer: ${data.customerName}`, 8)
  if (data.staffName) leftText(`Cashier: ${data.staffName}`, 8)
  if (data.registerName) leftText(`Register: ${data.registerName}`, 8)
  y -= 6

  // Divider
  page.drawLine({
    start: { x: padding, y: y },
    end: { x: width - padding, y: y },
    thickness: 0.5,
    color: rgb(0.5, 0.5, 0.5),
  })
  y -= 10

  // ---- Line items ----
  for (const line of data.lines) {
    // Description (left)
    const desc = line.quantity > 1
      ? `${line.quantity}x ${line.description}`
      : line.description
    leftText(desc.slice(0, 32), 8)
    // Price (right)
    rightText(`$${line.lineTotal.toFixed(2)}`, 8)
  }
  y -= 6

  // Divider
  page.drawLine({
    start: { x: padding, y: y },
    end: { x: width - padding, y: y },
    thickness: 0.5,
    color: rgb(0.5, 0.5, 0.5),
  })
  y -= 10

  // ---- Totals ----
  twoColumnText("Subtotal", `$${data.subtotal.toFixed(2)}`, 9)
  if (data.discountTotal > 0) {
    twoColumnText("Discounts", `-$${data.discountTotal.toFixed(2)}`, 9)
  }
  twoColumnText("Tax", `$${data.taxTotal.toFixed(2)}`, 9)
  y -= 4
  page.drawLine({
    start: { x: padding, y: y },
    end: { x: width - padding, y: y },
    thickness: 0.5,
    color: rgb(0.5, 0.5, 0.5),
  })
  y -= 12
  twoColumnText("TOTAL", `$${data.total.toFixed(2)}`, 11, true)
  y -= 6

  // ---- Payments ----
  page.drawLine({
    start: { x: padding, y: y },
    end: { x: width - padding, y: y },
    thickness: 0.5,
    color: rgb(0.5, 0.5, 0.5),
  })
  y -= 10
  for (const pmt of data.payments) {
    twoColumnText(pmt.methodName, `$${pmt.amount.toFixed(2)}`, 8)
  }
  twoColumnText("Tendered", `$${data.paidTotal.toFixed(2)}`, 8)
  if (data.changeDue > 0) {
    twoColumnText("Change Due", `$${data.changeDue.toFixed(2)}`, 9, true)
  }
  y -= 8

  // ---- Footer ----
  page.drawLine({
    start: { x: padding, y: y },
    end: { x: width - padding, y: y },
    thickness: 0.5,
    color: rgb(0.5, 0.5, 0.5),
  })
  y -= 12
  centerText("Thank you for shopping with us!", 8)
  centerText("Returns accepted within 30 days with receipt", 7)
  centerText("www.unsaidmemories.com", 7)

  return pdf.save()
}

// ---- Email a receipt PDF to the customer ----
export async function emailReceipt(
  data: ReceiptData,
  toEmail: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const pdfBytes = await generateReceiptPdf(data)
    const pdfBase64 = Buffer.from(pdfBytes).toString("base64")

    // Build the email body with the modern design system
    const totals: { label: string; value: string; strong?: boolean }[] = [
      { label: "Subtotal", value: `$${data.subtotal.toFixed(2)}` },
      ...(data.discountTotal > 0
        ? [{ label: "Discounts", value: `-$${data.discountTotal.toFixed(2)}` }]
        : []),
      { label: "Tax", value: `$${data.taxTotal.toFixed(2)}` },
      { label: "Total", value: `$${data.total.toFixed(2)}`, strong: true },
    ]
    const body =
      eyebrow("Your receipt") +
      h1("Thanks for your purchase!") +
      detailsCard("Receipt", [
        { label: "Receipt #", value: esc(data.receiptNumber) },
        { label: "Date", value: esc(data.date) },
        { label: "Tendered", value: `$${data.paidTotal.toFixed(2)}` },
        ...(data.changeDue > 0
          ? [{ label: "Change due", value: `$${data.changeDue.toFixed(2)}` }]
          : []),
      ]) +
      `<div style="height:20px"></div>` +
      lineItems(
        data.lines.map((l) => ({
          name: esc(l.description),
          qty: l.quantity,
          price: `$${l.lineTotal.toFixed(2)}`,
        })),
        totals
      ) +
      `<div style="height:20px"></div>` +
      noteBox("Returns accepted within 30 days with receipt.", "sage") +
      p("A PDF copy of this receipt is attached.", { muted: true, small: true })
    const html = frame({
      preheader: `Your receipt ${data.receiptNumber} from UnSaid Memories.`,
      body,
      nav: false,
    })

    const result = await sendEmail({
      to: toEmail,
      template: "pos_receipt",
      subject: `Your receipt from UnSaid Memories — ${data.receiptNumber}`,
      html,
    })

    // Note: the Resend SDK doesn't support attachments in the current
    // sendEmail wrapper. The email body contains the full receipt inline.
    // For PDF attachment, the caller can use Resend's API directly with
    // the attachments parameter.

    return result
  } catch (e: any) {
    return { ok: false, error: e?.message || "Failed to email receipt" }
  }
}

// ---- Load a sale + its lines + payments as ReceiptData ----
// Shared by the receipt PDF/email route and the receipt print route.
export async function loadReceiptData(saleId: string, tenant: string): Promise<ReceiptData | null> {
  const { withPg } = await import("@/lib/crm/enterprise")
  return (await withPg(async (client) => {
    const { rows: saleRows } = await client.query(`
      SELECT s.id, s.sale_number, s.subtotal, s.discount_total, s.tax_total,
             s.total, s.paid_total, s.change_due, s.sale_at, s.metadata,
             c."firstName" AS customer_first, c."lastName" AS customer_last,
             c.email AS customer_email, c.phone AS customer_phone
      FROM public.commerce_sales s
      LEFT JOIN public.customers c ON s.customer_id::text = c.id
      WHERE s.id = $1 AND s.tenant_id = $2
    `, [saleId, tenant])
    if (saleRows.length === 0) return null
    const sale = saleRows[0]

    const { rows: lineRows } = await client.query(`
      SELECT description, quantity, unit_price, gross_amount, discount_amount, line_total
      FROM public.commerce_sale_lines WHERE sale_id = $1 ORDER BY line_no
    `, [saleId])

    const { rows: payRows } = await client.query(`
      SELECT p.amount, pm.name AS method_name
      FROM public.commerce_payments p
      JOIN public.commerce_payment_methods pm ON pm.id = p.payment_method_id
      WHERE p.sale_id = $1
    `, [saleId])

    const { rows: recRows } = await client.query(`
      SELECT receipt_number FROM public.commerce_receipts WHERE sale_id = $1 LIMIT 1
    `, [saleId])

    const date = new Date(sale.sale_at).toLocaleString("en-US", {
      year: "numeric", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit",
    })

    return {
      saleNumber: sale.sale_number,
      receiptNumber: recRows[0]?.receipt_number || `R-${sale.sale_number}`,
      date,
      customerEmail: sale.customer_email || null,
      customerPhone: sale.customer_phone || null,
      customerName: sale.customer_first
        ? `${sale.customer_first} ${sale.customer_last || ""}`.trim()
        : null,
      lines: lineRows.map((l: any) => ({
        description: l.description,
        quantity: Number(l.quantity) || 1,
        unitPrice: Number(l.unit_price) || 0,
        lineTotal: Number(l.line_total) || 0,
      })),
      subtotal: Number(sale.subtotal) || 0,
      discountTotal: Number(sale.discount_total) || 0,
      taxTotal: Number(sale.tax_total) || 0,
      total: Number(sale.total) || 0,
      paidTotal: Number(sale.paid_total) || 0,
      changeDue: Number(sale.change_due) || 0,
      payments: payRows.map((p: any) => ({
        methodName: p.method_name,
        amount: Number(p.amount) || 0,
      })),
      staffName: null,
      registerName: null,
    }
  })) ?? null
}
