// ---------------------------------------------------------------------------
// UnSaid Memories — modern email design system.
//
// Clean, friendly, e-commerce-focused — white surfaces, stone text,
// lavender CTAs, rounded cards, clear hierarchy.
//
// Pure string builders — no React, no server-only deps — safe to call from
// API routes, cron automations, and preview tooling alike.
// ---------------------------------------------------------------------------

import { SITE_URL } from "../site-url"

// ---- Brand -----------------------------------------------------------------

export const BRAND = {
  name: "UnSaid Memories",
  legalName: "UnSaid Memories",
  tagline: "Thoughtful things for the people who matter",
  city: "",
  phone: "",
  email: "hello@unsaidmemories.com",
  bookingEmail: "hello@unsaidmemories.com",
  url: SITE_URL,
  pawImg: `${SITE_URL}/unsaid-footer-logo.png`,
  logoImg: `${SITE_URL}/unsaid-footer-logo.png`,
  bookUrl: `${SITE_URL}/shop`,
  servicesUrl: `${SITE_URL}/shop`,
  shopUrl: `${SITE_URL}/shop`,
  loginUrl: `${SITE_URL}/login`,
  learnUrl: `${SITE_URL}/our-world`,
  portalUrl: `${SITE_URL}/account`,
  helpUrl: `${SITE_URL}/contact`,
  hours: {
    tueSat: "",
    sun: "",
    mon: "",
  },
} as const

// Modern palette (matches the site's stone/white/purple tokens).
const C = {
  ink: "#0c0a09", // stone-950 — headings
  body: "#292524", // stone-800 — body copy
  muted: "#78716c", // stone-500 — labels, fine print
  faint: "#a8a29e", // stone-400
  surface: "#ffffff",
  outer: "#ffffff", // white — email background
  soft: "#fafaf9", // stone-50 — footer/cards
  border: "#e7e5e4", // stone-200
  hairline: "#f0eeed",
  primary: "#6942c2", // UnSaid purple — CTAs, accents (the site's brand purple)
  primaryDeep: "#6942c2", // same purple — no separate deep shade in the brand
  primarySoft: "#f2eafe", // lavender tint — callout bg (site token)
  success: "#15803d", // green-700
  successSoft: "#f0fdf4", // green-50
  warn: "#b45309", // amber-700
  warnSoft: "#fffbeb", // amber-50
  brick: "#dc2626", // red-600 — cancellations, destructive
  brickSoft: "#fef2f2", // red-50
}

const SANS = `'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`
const SERIF = `Georgia,'Times New Roman',serif`
const MONO = `'Courier New',Courier,monospace`

// ---- Escaping ---------------------------------------------------------------

export function esc(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

// ---- Building blocks ---------------------------------------------------------

/** Small purple uppercase eyebrow above the heading. */
export function eyebrow(text: string, tone: "gold" | "brick" | "sage" = "gold"): string {
  const color = tone === "brick" ? C.brick : tone === "sage" ? C.success : C.primary
  return `<p class="em-eyebrow" style="margin:0 0 8px;font-family:${SANS};font-size:11px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:${color}">${esc(text)}</p>`
}

/** Bold sans display heading. */
export function h1(text: string): string {
  return `<h1 class="em-h1" style="margin:0 0 12px;font-family:${SERIF};font-size:28px;line-height:1.2;font-weight:400;letter-spacing:-0.02em;color:${C.ink}">${text}</h1>`
}

/** Bold sans sub-heading. */
export function h2(text: string): string {
  return `<h2 style="margin:24px 0 8px;font-family:${SERIF};font-size:20px;line-height:1.3;font-weight:400;color:${C.ink}">${text}</h2>`
}

/** Body paragraph. Pass already-escaped/HTML fragments when needed. */
export function p(text: string, opts: { muted?: boolean; small?: boolean; center?: boolean } = {}): string {
  const size = opts.small ? "13px" : "15px"
  const color = opts.muted ? C.muted : C.body
  const align = opts.center ? "text-align:center;" : ""
  return `<p class="em-p" style="margin:0 0 14px;font-family:${SANS};font-size:${size};line-height:1.65;color:${color};${align}">${text}</p>`
}

/** Friendly sub-heading line (replaces the old gold italic flourish). */
export function taglineFlourish(): string {
  return `<p style="margin:0 0 16px;font-family:${SERIF};font-size:15px;font-weight:400;color:${C.muted}">${esc(BRAND.tagline)}</p>`
}

/** Simple hairline divider. */
export function pawDivider(): string {
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:24px 0"><tr>
    <td style="border-top:1px solid ${C.border};font-size:0;line-height:0;">&nbsp;</td>
  </tr></table>`
}

export interface ButtonOpts {
  tone?: "gold" | "ink" | "brick"
  align?: "center" | "left"
}

/** Rounded-pill CTA button (VML roundrect for Outlook + padded anchor). */
export function button(href: string, label: string, opts: ButtonOpts = {}): string {
  const tone = opts.tone || "gold"
  const bg = tone === "ink" ? C.ink : tone === "brick" ? C.brick : C.primary
  const align = opts.align === "left" ? "left" : "center"
  const vmlW = Math.max(160, Math.round((label.length * 8.4 + 64) / 10) * 10)
  const anchor = `<a href="${href}" style="display:inline-block;padding:14px 32px;font-family:${SANS};font-size:13px;font-weight:700;letter-spacing:0.02em;text-decoration:none;color:#ffffff;background:${bg};border-radius:999px;">${esc(label)}</a>`
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;"><tr>
    <td align="${align}">
      <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:48px;v-text-anchor:middle;width:${vmlW}px;" arcsize="50%" stroke="f" fillcolor="${bg}"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:13px;font-weight:bold;">${esc(label)}</center></v:roundrect><![endif]-->
      <!--[if !mso]><!-->${anchor}<!--<![endif]-->
    </td>
  </tr></table>`
}

/** Small "or copy this link" fallback row for action-link emails. */
export function linkFallback(href: string, note = "If the button doesn't work, copy and paste this link into your browser:"): string {
  return `<p style="margin:14px 0 0;font-family:${SANS};font-size:11px;line-height:1.6;color:${C.muted}">${esc(note)}<br/><span style="color:${C.primary};word-break:break-all">${href}</span></p>`
}

export interface DetailRow {
  label: string
  value: string
  /** Render value large (amounts). */
  big?: boolean
}

/** Rounded white detail card with label/value rows — the "receipt" centerpiece. */
export function detailsCard(title: string | null, rows: DetailRow[], opts: { tone?: "gold" | "brick" | "sage"; footer?: string } = {}): string {
  const accent = opts.tone === "brick" ? C.brick : opts.tone === "sage" ? C.success : C.primary
  const header = title
    ? `<tr><td style="padding:18px 22px 10px;font-family:${SANS};font-size:11px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:${accent};">${esc(title)}</td></tr>`
    : ""
  const body = rows
    .map(
      (r, i) => `<tr>
      <td style="padding:${i === 0 && !title ? "18px" : "10px"} 22px 3px;font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${C.muted};">${esc(r.label)}</td>
    </tr>
    <tr>
      <td style="padding:0 22px${i < rows.length - 1 ? `;border-bottom:1px solid ${C.hairline}` : ""};font-family:${SANS};font-size:${r.big ? "28px" : "15px"};font-weight:${r.big ? "800" : "600"};line-height:1.35;color:${C.ink}">${r.value}</td>
    </tr>`
    )
    .join("")
  const footer = opts.footer
    ? `<tr><td style="padding:14px 22px 18px;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.muted};border-top:1px solid ${C.hairline}">${opts.footer}</td></tr>`
    : ""
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background:${C.surface};border:1px solid ${C.border};border-radius:12px;border-top:3px solid ${accent};">
    ${header}${body}${footer}
  </table>`
}

/** Numbered step list. */
export function steps(items: { title: string; body?: string }[]): string {
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background:${C.surface};border:1px solid ${C.border};border-radius:12px;">
    ${items
      .map(
        (it) => `<tr>
        <td width="52" align="center" valign="top" style="padding:18px 0 4px 18px;">
          <div style="width:28px;height:28px;line-height:28px;border-radius:50%;background:${C.primary};color:#ffffff;font-family:${SANS};font-size:13px;font-weight:800;">${items.indexOf(it) + 1}</div>
        </td>
        <td valign="top" style="padding:16px 20px 16px 10px;">
          <div style="font-family:${SANS};font-size:14px;font-weight:700;color:${C.ink};margin-bottom:3px;">${it.title}</div>
          ${it.body ? `<div style="font-family:${SANS};font-size:13px;line-height:1.6;color:${C.body};">${it.body}</div>` : ""}
        </td>
      </tr>`
      )
      .join("")}
  </table>`
}

/** Line items table for order confirmations. */
export function lineItems(items: { name: string; qty: string | number; price: string; imageUrl?: string }[], totals: { label: string; value: string; strong?: boolean }[]): string {
  const hasImages = items.some((it) => it.imageUrl)
  const cols = hasImages ? 4 : 3
  const rows = items
    .map(
      (it) => `<tr>
      ${hasImages ? `<td width="74" style="padding:12px 0 12px 22px;border-bottom:1px solid ${C.hairline};">${it.imageUrl ? `<img src="${esc(it.imageUrl)}" width="52" height="52" alt="" style="display:block;border-radius:8px;object-fit:cover;"/>` : ``}</td>` : ``}
      <td style="padding:12px 22px;font-family:${SANS};font-size:14px;color:${C.ink};border-bottom:1px solid ${C.hairline};">${esc(it.name)}</td>
      <td align="center" width="70" style="padding:12px 8px;font-family:${SANS};font-size:13px;color:${C.muted};border-bottom:1px solid ${C.hairline};">×&nbsp;${esc(String(it.qty))}</td>
      <td align="right" width="110" style="padding:12px 22px;font-family:${SANS};font-size:14px;font-weight:600;color:${C.ink};border-bottom:1px solid ${C.hairline};">${it.price}</td>
    </tr>`
    )
    .join("")
  const totalsRows = totals
    .map(
      (t) => `<tr>
      <td colspan="${hasImages ? 3 : 2}" style="padding:${t.strong ? "14px" : "8px"} 22px 4px;font-family:${SANS};font-size:${t.strong ? "13px" : "12px"};font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${t.strong ? C.ink : C.muted};text-align:right;">${esc(t.label)}</td>
      <td align="right" style="padding:${t.strong ? "14px" : "8px"} 22px 4px;font-family:${SANS};font-size:${t.strong ? "22px" : "13px"};font-weight:${t.strong ? "800" : "600"};color:${C.ink};">${t.value}</td>
    </tr>`
    )
    .join("")
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background:${C.surface};border:1px solid ${C.border};border-radius:12px;">
    <tr><td colspan="${cols}" style="padding:18px 22px 8px;font-family:${SANS};font-size:11px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:${C.primary};">Your items</td></tr>
    ${rows}${totalsRows}
    <tr><td colspan="${cols}" style="padding:8px 22px 18px;"></td></tr>
  </table>`
}

/** One-time code display (OTP / magic-link emails). */
export function otpCode(code: string, note?: string): string {
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background:${C.surface};border:1px dashed ${C.primary};border-radius:12px;">
    <tr><td align="center" style="padding:22px 16px 8px;font-family:${SANS};font-size:11px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:${C.primary};">Your one-time code</td></tr>
    <tr><td align="center" style="padding:0 16px 10px;font-family:${MONO};font-size:30px;font-weight:700;letter-spacing:9px;color:${C.ink};">${esc(code)}</td></tr>
    ${note ? `<tr><td align="center" style="padding:0 16px 18px;font-family:${SANS};font-size:12px;color:${C.muted};">${esc(note)}</td></tr>` : `<tr><td style="padding:0 0 14px;"></td></tr>`}
  </table>`
}

/** Friendly callout box for policies / reassurance notes. */
export function noteBox(text: string, tone: "gold" | "brick" | "sage" = "gold"): string {
  const accent = tone === "brick" ? C.brick : tone === "sage" ? C.success : C.primary
  const bg = tone === "brick" ? C.brickSoft : tone === "sage" ? C.successSoft : C.primarySoft
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background:${bg};border-left:4px solid ${accent};border-radius:0 8px 8px 0;">
    <tr><td style="padding:14px 18px;font-family:${SANS};font-size:13px;line-height:1.65;color:${C.body};">${text}</td></tr>
  </table>`
}

/** Light hero band (warm orange tint, bold sans headline). */
export function heroBand(eyebrowText: string, headline: string, sub?: string): string {
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${C.primarySoft}" style="border-radius:12px;">
    <tr><td align="center" style="padding:32px 24px 28px;">
      <img src="${BRAND.pawImg}" width="28" height="28" alt="" style="display:block;margin:0 auto 12px;"/>
      <div style="font-family:${SANS};font-size:11px;font-weight:800;letter-spacing:0.22em;text-transform:uppercase;color:${C.primary};">${esc(eyebrowText)}</div>
      <div class="em-h1" style="margin:10px 0 0;font-family:${SANS};font-size:28px;line-height:1.2;font-weight:800;color:${C.ink};">${headline}</div>
      ${sub ? `<div style="margin:10px 0 0;font-family:${SANS};font-size:14px;line-height:1.6;color:${C.body};">${sub}</div>` : ""}
    </td></tr>
  </table>`
}

// ---- The frame ---------------------------------------------------------------

export interface FrameOpts {
  /** Hidden preview text shown after the subject in the inbox. */
  preheader?: string
  /** Inner HTML body (already composed from the blocks above). */
  body: string
  /** Show the BOOK · SERVICES · SHOP · LEARN nav strip. Default true. */
  nav?: boolean
  /** Marketing emails get an unsubscribe link in the footer. */
  marketing?: boolean
  /** Why is this person receiving this — shown as fine print. */
  reason?: string
  /** Learning Center emails badge the header wordmark. */
  academy?: boolean
}

/** Full email document — header, nav, content, footer. */
export function frame(opts: FrameOpts): string {
  const preheader = opts.preheader
    ? `<div style="display:none;font-size:1px;color:${C.outer};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${esc(opts.preheader)}</div>`
    : ""
  const nav =
    opts.nav === false
      ? ""
      : `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${C.surface}">
    <tr><td align="center" class="em-nav" style="padding:12px 8px;border-bottom:1px solid ${C.border};font-family:${SANS};font-size:10px;font-weight:700;letter-spacing:0.14em;">
      <a href="${BRAND.shopUrl}" style="color:${C.body};text-decoration:none;">SHOP</a><span style="color:${C.faint};padding:0 10px;">·</span><a href="${BRAND.learnUrl}" style="color:${C.body};text-decoration:none;">OUR WORLD</a><span style="color:${C.faint};padding:0 10px;">·</span><a href="${BRAND.helpUrl}" style="color:${C.body};text-decoration:none;">CONTACT</a>
    </td></tr>
  </table>`
  const reason =
    opts.reason ||
    `You're receiving this email because you have an UnSaid Memories account or placed an order with us.`
  const unsub = opts.marketing
    ? `<div style="margin:10px 0 0;font-family:${SANS};font-size:11px;line-height:1.7;color:${C.muted};"><a href="mailto:${BRAND.email}?subject=Unsubscribe%20from%20marketing%20emails" style="color:${C.primary};text-decoration:underline;">Unsubscribe from marketing emails</a> — transactional emails (bookings, receipts, account security) are always sent.</div>`
    : ""
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="x-apple-disable-message-reformatting"/>
<meta name="color-scheme" content="light only"/>
<meta name="supported-color-schemes" content="light only"/>
<title>unsaid</title>
<style>
  body{margin:0;padding:0;width:100%!important;min-width:100%;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
  table{border-collapse:collapse;}
  img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}
  a{color:${C.primary};}
  @media only screen and (max-width:620px){
    .em-container{width:100%!important;}
    .em-content{padding:28px 20px!important;}
    .em-h1{font-size:22px!important;}
    .em-nav a{padding:0 5px!important;}
    .em-p{font-size:14px!important;}
    .em-hide-mobile{display:none!important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.outer};">
${preheader}
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${C.outer}">
  <tr>
    <td align="center" style="padding:0;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;max-width:100%;background:${C.surface};">
        <!-- Header -->
        <tr>
          <td bgcolor="${C.surface}" align="center" style="padding:32px 20px 24px;">
            <img src="${BRAND.logoImg}" width="190" alt="unsaid" style="display:block;margin:0 auto;width:190px;"/>
          </td>
        </tr>
        ${nav ? `<tr><td>${nav}</td></tr>` : ""}
        <!-- Content -->
        <tr>
          <td class="em-content" style="padding:32px 36px 36px;background:${C.surface};">
            ${opts.body}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td bgcolor="${C.surface}" align="center" style="padding:48px 24px 40px;border-top:1px solid ${C.border};">
            <a href="${BRAND.url}" style="text-decoration:none;"><img src="${BRAND.logoImg}" width="140" alt="unsaid" style="display:block;margin:0 auto 8px;border:0;width:140px;"/></a>
            <div style="margin:10px 0 0;font-family:${SANS};font-size:11px;line-height:1.8;color:${C.muted};">
              unsaid<br/>
              <a href="mailto:${BRAND.email}" style="color:${C.muted};text-decoration:none;">${BRAND.email}</a><br/>
              <a href="${BRAND.url}" style="color:${C.muted};text-decoration:none;">unsaidmemories.com</a>
            </div>
            <div style="margin:12px 0 0;font-family:${SANS};font-size:11px;letter-spacing:0.06em;">
              <a href="${BRAND.shopUrl}" style="color:${C.primary};text-decoration:none;">SHOP</a><span style="color:${C.faint};padding:0 8px;">·</span><a href="${BRAND.loginUrl}" style="color:${C.primary};text-decoration:none;">LOGIN</a><span style="color:${C.faint};padding:0 8px;">·</span><a href="${BRAND.helpUrl}" style="color:${C.primary};text-decoration:none;">CONTACT</a>
            </div>
            <div style="margin:14px 0 0;border-top:1px solid ${C.border};padding-top:14px;font-family:${SANS};font-size:10px;line-height:1.7;color:${C.faint};">
              ${esc(reason)}<br/>${esc(BRAND.legalName)} · <a href="${BRAND.url}" style="color:${C.faint};text-decoration:none;">unsaidmemories.com</a>
            </div>
            ${unsub}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}

// ---- Simple one-off emails ----------------------------------------------------
// For call sites that currently build raw inline HTML (partner application
// confirmations, admin notifications, newsletter welcome). Composes the
// modern frame with clear hierarchy: what happened → details → CTA.

export interface SimpleEmailOpts {
  preheader?: string
  eyebrowText?: string
  heading: string
  paragraphs?: string[]
  rows?: { label: string; value: string }[]
  cta?: { href: string; label: string }
  note?: string
  marketing?: boolean
  reason?: string
}

export function simpleEmail(opts: SimpleEmailOpts): string {
  const parts: string[] = []
  if (opts.eyebrowText) parts.push(eyebrow(opts.eyebrowText))
  parts.push(h1(esc(opts.heading)))
  for (const para of opts.paragraphs || []) {
    parts.push(p(para))
  }
  if (opts.rows && opts.rows.length > 0) {
    parts.push(
      detailsCard(null, opts.rows.map((r) => ({ label: r.label, value: esc(r.value) })))
    )
  }
  if (opts.cta) {
    parts.push(button(opts.cta.href, opts.cta.label, { align: "left" }))
  }
  if (opts.note) {
    parts.push(p(esc(opts.note), { muted: true, small: true }))
  }
  return frame({
    preheader: opts.preheader,
    body: parts.join(""),
    marketing: opts.marketing,
    reason: opts.reason,
  })
}
