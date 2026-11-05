import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { generateReceiptPdf, emailReceipt, loadReceiptData } from "@/lib/enterprise/receipt"
import { withPg } from "@/lib/crm/enterprise"
import {
  recordSmsMessage,
  sendSmsStrict,
  SmsNotConfiguredError,
} from "@/lib/messaging/sms"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// /api/admin/pos/receipt — receipt PDF generation + email/SMS delivery.
// (Printing a receipt on this device's printer lives at
//  /api/admin/pos/receipt/print.)
//
//   GET  /api/admin/pos/receipt?saleId=...                 → PDF file (application/pdf)
//   POST /api/admin/pos/receipt { saleId, email }          → email the receipt
//   POST /api/admin/pos/receipt { saleId, channel: "sms" } → text the receipt
//        (Twilio via lib/messaging/sms, BL-10; phone from the body or the
//        sale's customer record; the delivery is recorded as a
//        commerce_receipts row with delivery_method 'sms' plus the
//        crm_messages row the delivery-status webhook tracks)
// ============================================================================

// ---- GET: return the PDF file ----
export async function GET(req: NextRequest) {
  const tenant = resolveTenantId(req);
  const gate = await requireModuleApi("payments", "read")
  if (gate) return gate

  const saleId = req.nextUrl.searchParams.get("saleId")
  if (!saleId) return NextResponse.json({ error: "saleId required" }, { status: 400 })

  const data = await loadReceiptData(saleId, tenant)
  if (!data) return NextResponse.json({ error: "Sale not found" }, { status: 404 })

  const pdfBytes = await generateReceiptPdf(data)

  return new NextResponse(pdfBytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="receipt-${data.receiptNumber}.pdf"`,
    },
  })
}

// ---- POST: email or SMS the receipt ----
export async function POST(req: NextRequest) {
  const tenant = resolveTenantId(req);
  const gate = await requireModuleApi("payments", "write")
  if (gate) return gate

  const body = await req.json().catch(() => ({}))
  const { saleId, email, phone, channel } = body
  if (!saleId) return NextResponse.json({ error: "saleId required" }, { status: 400 })

  const data = await loadReceiptData(saleId, tenant)
  if (!data) return NextResponse.json({ error: "Sale not found" }, { status: 404 })

  // SMS receipt (BL-10): a real Twilio text through the platform's one
  // SMS provider module. Fails loudly when the provider is not
  // configured — the register never reports a text that didn't send.
  if (channel === "sms" || (phone && !email)) {
    const toPhone = String(phone || data.customerPhone || "").trim()
    if (!toPhone) return NextResponse.json({ error: "No phone number — provide one in the request body" }, { status: 400 })

    const itemCount = data.lines.reduce((n, l) => n + (Number(l.quantity) || 0), 0)
    const text =
      `All About Pawz receipt ${data.receiptNumber} — ${data.date}. ` +
      `Total $${data.total.toFixed(2)} (paid $${data.paidTotal.toFixed(2)}), ${itemCount} item${itemCount === 1 ? "" : "s"}. ` +
      `Thank you for shopping with us!`

    const smsSend = await withPg(async (c) => {
      try {
        const sent = await sendSmsStrict(c, tenant, toPhone, text)
        return { ok: true as const, sent }
      } catch (e) {
        return { ok: false as const, error: e as Error }
      }
    })
    if (!smsSend) return NextResponse.json({ error: "Database unavailable — the text was not sent" }, { status: 503 })
    if (!smsSend.ok) {
      await withPg(async (c) => {
        await recordSmsMessage(c, {
          tenantId: tenant,
          toAddress: toPhone,
          subject: `Receipt ${data.receiptNumber}`,
          body: text,
          status: "failed",
          failureReason: smsSend.error.message,
          metadata: { source: "pos_sms_receipt", sale_id: saleId, receipt_number: data.receiptNumber },
        })
      }).catch(() => null)
      const status = smsSend.error instanceof SmsNotConfiguredError ? 503 : 502
      return NextResponse.json({ error: smsSend.error.message }, { status })
    }
    // The delivery record: a commerce_receipts row for this SMS
    // delivery (the print row from the sale itself stands), plus the
    // crm_messages row keyed by the Twilio message id that the
    // /api/twilio/status webhook keeps current.
    const messageId = await withPg(async (c) => {
      await c.query(
        `INSERT INTO public.commerce_receipts
           (tenant_id, sale_id, receipt_number, receipt_type, delivery_method, destination, document_uri)
         VALUES ($1, $2::uuid, $3, 'sale', 'sms', $4, $5)`,
        [tenant, saleId, data.receiptNumber, toPhone, `/api/admin/pos/receipt?saleId=${saleId}`],
      )
      return recordSmsMessage(c, {
        tenantId: tenant,
        toAddress: toPhone,
        fromAddress: smsSend.sent.from,
        subject: `Receipt ${data.receiptNumber}`,
        body: text,
        status: "sent",
        providerMessageId: smsSend.sent.sid,
        deliveryStatus: smsSend.sent.status,
        metadata: { source: "pos_sms_receipt", sale_id: saleId, receipt_number: data.receiptNumber },
      })
    }).catch(() => null)
    return NextResponse.json({ ok: true, texted: toPhone, providerMessageId: smsSend.sent.sid, messageId })
  }

  const toEmail = email || data.customerEmail
  if (!toEmail) return NextResponse.json({ error: "No email address — provide one in the request body" }, { status: 400 })

  const result = await emailReceipt(data, toEmail)
  if (!result.ok) return NextResponse.json({ error: result.error || "Failed to email" }, { status: 500 })

  return NextResponse.json({ ok: true, emailed: toEmail })
}
