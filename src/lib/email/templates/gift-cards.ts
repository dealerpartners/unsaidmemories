// ---------------------------------------------------------------------------
// Gift cards (sent via Resend): the recipient's card and the buyer's receipt.
// ---------------------------------------------------------------------------

import { BRAND, button, detailsCard, eyebrow, frame, h1, heroBand, noteBox, p, esc } from "../design"
import { SITE_URL } from "../../site-url"

// Sign-in door that lands the person on their gift cards after authenticating.
const GIFT_CARDS_PORTAL = `${BRAND.portalUrl}?redirect=${encodeURIComponent("/customer/orders/gift-cards")}`

const cardBlock = (cardNumber: string, amount: string, designUrl?: string | null) => `
  ${designUrl ? `<img src="${esc(designUrl)}" width="512" alt="UnSaid Memories gift card" style="display:block;width:100%;max-width:512px;height:auto;margin:0 auto 18px;border-radius:14px;"/>` : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:#ffffff;border:1px solid #e7e5e4;border-radius:12px;">
    <tr><td align="center" style="padding:22px 16px;">
      <div style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:0.28em;color:#ea580c;text-transform:uppercase;">Gift card value</div>
      <div style="margin:6px 0 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:38px;font-weight:800;color:#0c0a09;">${esc(amount)}</div>
      <div style="font-family:'Courier New',monospace;font-size:20px;letter-spacing:0.12em;font-weight:700;color:#1a1a1a;">${esc(cardNumber)}</div>
    </td></tr>
  </table>`

export interface GiftCardDeliveryData {
  recipientName?: string
  senderName: string
  amount: string
  cardNumber: string
  message?: string
  designUrl?: string | null
}

export function giftCardDeliveryHtml(d: GiftCardDeliveryData): string {
  return frame({
    preheader: `${d.senderName} sent you a ${d.amount} gift card.`,
    nav: true,
    body: [
      heroBand("A gift for you", `${esc(d.senderName)} sent you a gift card`, `Good for anything in the UnSaid Memories shop.`),
      `<div style="height:26px"></div>`,
      eyebrow(d.recipientName ? `For ${esc(d.recipientName)}` : "Your gift"),
      h1(`Something special, for someone who matters`),
      ...(d.message ? [noteBox(`“${esc(d.message)}” — ${esc(d.senderName)}`)] : []),
      cardBlock(d.cardNumber, d.amount, d.designUrl),
      p(`Use this number at checkout on unsaidmemories.com. The balance comes off your total, and anything left stays on the card.`),
      button(GIFT_CARDS_PORTAL, "See my gift card balance"),
      p(`Sign in with this email address and your card appears in your account.`, { muted: true, small: true, center: true }),
      button(`${SITE_URL}/book/appointment`, "Book an appointment", { tone: "ink" }),
    ].join(""),
    reason: `You're receiving this because ${esc(d.senderName)} sent you an UnSaid Memories gift card.`,
  })
}

export interface GiftCardPurchaseData {
  amount: string
  recipientName?: string
  recipientEmail: string
  cardNumber: string
  designUrl?: string | null
}

export function giftCardPurchaseHtml(d: GiftCardPurchaseData): string {
  return frame({
    preheader: `Your ${d.amount} gift card is on its way.`,
    body: [
      eyebrow("Gift card purchased"),
      h1(`Thank you — it's on its way`),
      p(`Your gift card was emailed to ${esc(d.recipientName || d.recipientEmail)}. Keep this receipt for your records.`),
      cardBlock(d.cardNumber, d.amount, d.designUrl),
      detailsCard("Receipt", [
        { label: "Amount", value: esc(d.amount), big: true },
        { label: "Sent to", value: esc(d.recipientEmail) },
        { label: "Redeemable", value: "Online at unsaidmemories.com" },
      ]),
      button(GIFT_CARDS_PORTAL, "View in my account"),
      p(`Sign in with this email address to see the card under your account.`, { muted: true, small: true, center: true }),
    ].join(""),
    reason: `You're receiving this receipt because you purchased an UnSaid Memories gift card.`,
  })
}

export const SAMPLE_GIFT_CARD_DELIVERY: GiftCardDeliveryData = {
  recipientName: "Jamie",
  senderName: "Alex",
  amount: "$50.00",
  cardNumber: "AAP-7K3Q-9XMD-41ZP-WB8E",
  message: "Happy birthday — treat Biscuit to a spa day!",
}

export const SAMPLE_GIFT_CARD_PURCHASE: GiftCardPurchaseData = {
  amount: "$50.00",
  recipientName: "Jamie",
  recipientEmail: "jamie@example.com",
  cardNumber: "AAP-7K3Q-9XMD-41ZP-WB8E",
}

export interface GiftCardReminderData {
  recipientName?: string
  cardNumber: string
  balance: string
  expiresAt?: string | null
}

export function giftCardReminderHtml(d: GiftCardReminderData): string {
  return frame({
    preheader: `You still have ${d.balance} on your UnSaid Memories gift card.`,
    nav: true,
    body: [
      eyebrow("Gift card reminder"),
      h1(`Don't forget your ${esc(d.balance)}`),
      p(d.recipientName ? `Hi ${esc(d.recipientName)},` : `Hi there,`),
      p(`You still have <strong>${esc(d.balance)}</strong> on your UnSaid Memories gift card. It never hurts to treat your pet.`),
      cardBlock(d.cardNumber, d.balance),
      ...(d.expiresAt ? [noteBox(`This card expires on <strong>${esc(d.expiresAt)}</strong>.`)] : []),
      p(`Use this number at checkout on unsaidmemories.com.`),
      button(GIFT_CARDS_PORTAL, "Check my balance"),
      button(`${SITE_URL}/book/appointment`, "Book an appointment", { tone: "ink" }),
    ].join(""),
    reason: `You're receiving this because you have an UnSaid Memories gift card with a remaining balance.`,
  })
}

export const SAMPLE_GIFT_CARD_REMINDER: GiftCardReminderData = {
  recipientName: "Jamie",
  cardNumber: "AAP-7K3Q-9XMD-41ZP-WB8E",
  balance: "$32.50",
  expiresAt: "2027-10-13",
}
