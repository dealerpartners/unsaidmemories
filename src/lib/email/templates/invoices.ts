// ---------------------------------------------------------------------------
// Invoice emails (sent via Resend): invoice delivery and payment reminders.
// ---------------------------------------------------------------------------

import { BRAND, button, detailsCard, eyebrow, frame, h1, lineItems, noteBox, p, esc } from "../design"
import { SITE_URL } from "../../site-url"

export interface InvoiceLineItem {
  description: string
  quantity: number
  unitPrice: string
  total: string
}

export interface InvoiceEmailData {
  invoiceNumber: string
  customerName: string
  amountDue: string
  total: string
  subtotal: string
  depositPaid?: string
  dueDate?: string | null
  notes?: string | null
  lineItems: InvoiceLineItem[]
  paymentUrl: string
  isReminder?: boolean
}

export function invoiceEmailHtml(d: InvoiceEmailData): string {
  const heading = d.isReminder ? `Reminder: invoice ${esc(d.invoiceNumber)} is due` : `Invoice ${esc(d.invoiceNumber)}`
  const preheader = d.isReminder
    ? `Friendly reminder — ${d.amountDue} due${d.dueDate ? ` by ${d.dueDate}` : ""}.`
    : `Your invoice for ${d.amountDue} is ready.`

  const totals: { label: string; value: string; strong?: boolean }[] = [
    { label: "Subtotal", value: esc(d.subtotal) },
  ]
  if (d.depositPaid) {
    totals.push({ label: "Deposit paid", value: esc(d.depositPaid) })
  }
  totals.push({ label: "Amount due", value: esc(d.amountDue), strong: true })

  return frame({
    preheader,
    body: [
      eyebrow(d.isReminder ? "Payment reminder" : "Invoice"),
      h1(heading),
      p(`Hi ${esc(d.customerName)}, ${d.isReminder ? "this is a friendly reminder that the following invoice is still outstanding." : "thank you for choosing UnSaid Memories. Your invoice is ready below."}`),
      lineItems(
        d.lineItems.map((li) => ({
          name: li.description,
          qty: li.quantity,
          price: li.total,
        })),
        totals,
      ),
      ...(d.dueDate ? [noteBox(`Due date: <strong>${esc(d.dueDate)}</strong>`)] : []),
      ...(d.notes ? [p(esc(d.notes), { muted: true, small: true })] : []),
      button(d.paymentUrl, `Pay ${esc(d.amountDue)}`),
      p(`Questions about this invoice? Reply to this email and mention invoice ${esc(d.invoiceNumber)}.`, { muted: true, small: true, center: true }),
    ].join(""),
    reason: `You're receiving this because you have an outstanding invoice with UnSaid Memories.`,
  })
}

export const SAMPLE_INVOICE_EMAIL: InvoiceEmailData = {
  invoiceNumber: "INV-ABC123",
  customerName: "Jamie",
  amountDue: "$95.00",
  total: "$120.00",
  subtotal: "$120.00",
  depositPaid: "$25.00",
  dueDate: "2026-10-20",
  notes: "Wayland collection — first run.",
  lineItems: [
    { description: "Speckled Wayland Ceramic Mug, 13oz", quantity: 2, unitPrice: "$37.50", total: "$75.00" },
    { description: "De-shedding treatment", quantity: 1, unitPrice: "$25.00", total: "$25.00" },
  ],
  paymentUrl: "https://www.unsaidmemories.com/pay/invoice/abc123",
}
