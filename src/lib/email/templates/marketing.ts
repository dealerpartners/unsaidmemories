// ---------------------------------------------------------------------------
// Marketing mailer (sales / discount coupons). Includes the unsubscribe
// footer — CAN-SPAM style — and honest fine print, unlike the transactional
// templates which never carry unsubscribe links.
// ---------------------------------------------------------------------------

import { BRAND, button, detailsCard, eyebrow, h1, heroBand, noteBox, p, frame, esc } from "../design"

export interface CouponMailerData {
  firstName: string
  eyebrowText: string
  headline: string
  subline: string
  offerCode: string
  offerDetails: string
  validThrough: string
  finePrint?: string
  ctaLabel?: string
  ctaUrl?: string
}

export function couponMailerHtml(d: CouponMailerData): string {
  return frame({
    marketing: true,
    preheader: `${esc(d.subline)} — code ${esc(d.offerCode)}.`,
    body: [
      heroBand(d.eyebrowText, d.headline, esc(d.subline)),
      `<div style="height:8px;"></div>`,
      eyebrow(`A treat for you, ${esc(d.firstName)}`),
      p(`Because the best-behaved clients deserve the best treats (and we're not above bribery). Here's a little something for your next visit:`),
      detailsCard("Your offer", [
        { label: "Promo code", value: esc(d.offerCode), big: true },
        { label: "The deal", value: esc(d.offerDetails) },
        { label: "Good through", value: esc(d.validThrough) },
      ]),
      button(d.ctaUrl || BRAND.bookUrl, d.ctaLabel || "Book with my code"),
      noteBox(
        d.finePrint ||
          `One code per order. Applies to orders placed online during the offer window. Can't be combined with other offers or applied to past orders. Enter the code at checkout.`,
        "gold"
      ),
      p(`Questions? Just reply to this email — it comes straight to us.`, { muted: true, small: true }),
    ].join(""),
    reason: `You're receiving this because you opted in to news and offers from UnSaid Memories.`,
  })
}

export const SAMPLE_COUPON: CouponMailerData = {
  firstName: "Brea",
  eyebrowText: "A note from the studio",
  headline: "Spring Fluff-Up",
  subline: "20% off shop favorites, spring edit.",
  offerCode: "SPRING20",
  offerDetails: "20% off any order placed online",
  validThrough: "Sunday, April 30",
  ctaLabel: "Book my fluff-up",
}

// ---- Newsletter confirmation ------------------------------------------------
// The "You're subscribed" receipt for /api/newsletter/subscribe — the
// reference instance of the alerts pattern (src/lib/notify.ts). Before
// the pattern, this email existed only as an ad-hoc inline render in
// the route, under a template label the catalog didn't know, sent
// fire-and-forget — and the subscribe insert itself threw 42P10, so it
// never rendered at all. Marketing frame: it carries the unsubscribe
// footer like every marketing send.

/**
 * The double opt-in email (owner directive 2026-10-24): fired by every
 * newsletter signup, it asks the address owner to CONFIRM the
 * subscription. Until the button is clicked the subscriber row stays
 * confirmed=false and the address receives no newsletter mail — the
 * subscription is not active yet. The link carries the row's
 * confirm_token to GET /api/newsletter/confirm (migration 20261172).
 */
export function newsletterConfirmationHtml(confirmUrl: string): string {
  return frame({
    marketing: true,
    preheader: "One tap to confirm your newsletter subscription.",
    body: [
      eyebrow("Newsletter"),
      h1("Confirm your subscription"),
      p("You asked to join the UnSaid Memories newsletter — new pieces, maker notes, and exclusive offers. Tap the button below to confirm your subscription. You're not on the list until you do."),
      button(confirmUrl, "Confirm your subscription"),
      p("If you didn't sign up, just ignore this email — the request goes nowhere and you won't be subscribed or emailed again about it."),
    ].join(""),
    reason: "You're receiving this because this address was entered on the UnSaid Memories newsletter signup.",
  })
}
