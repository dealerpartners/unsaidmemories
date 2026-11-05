// Site-page linker (server-side).
//
// The corpus prose names real site pages two ways:
//
//   1. Literal route paths in code spans — "Check the Help Center at `/docs`",
//      "sign back in at `/access-seller`", "the FAQ at `/faq`".
//   2. Plain-language phrases — "the shop", "the booking wizard".
//
// The owner's ruling: language that has a page is deep linked to that page.
// This module rewrites both forms into markdown links AFTER clean() and
// linkReferences() have run, so every rendered surface (Help Center,
// Developer Portal, portal guide readers) speaks the same linked voice.
//
// The route set below is VALIDATED: every path resolves to a real page in
// the app router (checked against the route tree, including the dynamic
// /shop/[...slug] and /learn/courses/[slug] catch-alls). Paths that do not
// exist as routes (e.g. bare `/analytics/summary`, `/governance/appeals` —
// portal tab names, not pages) are deliberately absent and stay plain code
// text rather than becoming dead links.
//
// Phrase rules link the FIRST occurrence per document, never inside
// headings, never inside another link's text, and never on a line that
// already links the same target (the code span wins that line).

/** Corpus-referenced routes that exist as pages. Trailing slashes are
 *  normalized away before matching. */
const SITE_ROUTES: ReadonlySet<string> = new Set([
  "/access-customer",
  "/access-seller",
  "/account",
  // NOTE: "/admin-login" is deliberately NOT linkable. The platform's login
  // door is never advertised (owner directive): a publicized login address
  // invites attacks. Corpus prose must not mention it, and the linker must
  // never turn a mention into a clickable route.
  "/admin/analytics",
  "/admin/audit",
  "/admin/catalog-review",
  "/admin/dashboard",
  "/admin/deposits",
  "/admin/fees",
  "/admin/financial-settings",
  "/admin/franchise",
  "/admin/lms-dashboard",
  "/admin/messages",
  "/admin/orders",
  "/admin/payments",
  "/admin/policies",
  "/admin/policies/versions",
  "/admin/refunds",
  "/admin/reports",
  "/admin/returns",
  "/admin/sellers",
  "/admin/settings",
  "/admin/settings/backups",
  "/admin/settings/email",
  "/admin/settings/locations",
  "/admin/settings/printing",
  "/admin/settings/shipping",
  "/admin/settings/users",
  "/admin/stripe-connections",
  "/admin/trust-safety",
  "/admin/trust-safety/appeals",
  "/admin/trust-safety/investigations",
  "/admin/trust-safety/violations",
  "/customer/dashboard",
  "/customer/invoices",
  "/customer/notifications",
  "/customer/orders",
  "/customer/orders/buy-again",
  "/customer/orders/gift-cards",
  "/customer/orders/perks",
  "/customer/orders/reship",
  "/customer/orders/subscriptions",
  "/customer/orders/wish-list",
  "/customer/pets",
  "/customer/profile/address-book",
  "/customer/profile/communication-preferences",
  "/customer/profile/payment-methods",
  "/customer/receipts",
  "/customer/settings",
  "/customer/support",
  "/dmca",
  "/docs",
  "/faq",
  "/free-shipping",
  "/gift-cards",
  "/learn",
  "/learn/classroom",
  "/learn/courses/veterinary-technician",
  "/learn/enroll",
  "/learn/instructor/review",
  "/learn/instructor/sessions",
  "/learn/sign-in",
  "/policies",
  "/pricing",
  "/seller",
  "/seller/account/company-info",
  "/seller/account/contact",
  "/seller/account/health-compliance",
  "/seller/account/notifications",
  "/seller/account/policy-acceptances",
  "/seller/account/profile",
  "/seller/account/security",
  "/seller/account/users",
  "/seller/advertising",
  "/seller/analytics/conversion",
  "/seller/analytics/pricing-insights",
  "/seller/analytics/reports",
  "/seller/analytics/search-insights",
  "/seller/analytics/success-hub",
  "/seller/analytics/success-hub/match-buy-box",
  "/seller/analytics/success-hub/match-price",
  "/seller/catalog/bundles",
  "/seller/catalog/categories",
  "/seller/catalog/imports",
  "/seller/catalog/listings",
  "/seller/catalog/listings/new",
  "/seller/catalog/listings/new/express",
  "/seller/catalog/listings/new/match-catalog",
  "/seller/catalog/listings/new/single",
  "/seller/catalog/listings/new/spreadsheet",
  "/seller/catalog/listings/new/supplier-import",
  "/seller/catalog/media",
  "/seller/catalog/suppression",
  "/seller/catalog/variants",
  "/seller/communication/forum",
  "/seller/communication/inbox",
  "/seller/communication/support",
  "/seller/dashboard",
  "/seller/docs",
  "/seller/governance/appeals",
  "/seller/governance/audit-log",
  "/seller/governance/policies",
  "/seller/governance/violations",
  "/seller/inventory/low-stock",
  "/seller/inventory/movements",
  "/seller/inventory/overview",
  "/seller/inventory/replenishment",
  "/seller/inventory/stock",
  "/seller/inventory/wfs-inbound",
  "/seller/messages",
  "/seller/onboarding",
  "/seller/onboarding/bank-info",
  "/seller/onboarding/business-verification",
  "/seller/onboarding/customer-favorites",
  "/seller/onboarding/first-listing",
  "/seller/onboarding/global-markets",
  "/seller/onboarding/overview",
  "/seller/onboarding/policy-acceptance",
  "/seller/onboarding/tax-identity",
  "/seller/orders/bulk-acknowledge",
  "/seller/orders/bulk-ship",
  "/seller/orders/cancelled",
  "/seller/orders/inbox",
  "/seller/orders/late",
  "/seller/orders/pause-operations",
  "/seller/orders/unshipped",
  "/seller/payments/fees",
  "/seller/payments/methods",
  "/seller/payments/overview",
  "/seller/payments/payouts",
  "/seller/payments/statements",
  "/seller/payments/tax-docs",
  "/seller/payments/wallet",
  "/seller/performance/carrier",
  "/seller/performance/inr-rate",
  "/seller/performance/late-shipment",
  "/seller/performance/negative-feedback",
  "/seller/performance/overview",
  "/seller/performance/regional",
  "/seller/performance/return-rate",
  "/seller/pricing/bulk-editor",
  "/seller/pricing/buy-box",
  "/seller/pricing/discounts",
  "/seller/pricing/overview",
  "/seller/pricing/pricing-insights",
  "/seller/pricing/promotions",
  "/seller/products",
  "/seller/returns/disputes",
  "/seller/returns/insights",
  "/seller/returns/overview",
  "/seller/returns/refunds",
  "/seller/returns/requests",
  "/seller/returns/rules",
  "/seller/settings",
  "/seller/shipping",
  "/seller/shipping/carriers",
  "/seller/shipping/delivery-promises",
  "/seller/shipping/exceptions",
  "/seller/shipping/labels",
  "/seller/shipping/performance",
  "/seller/shipping/return-address",
  "/seller/shipping/templates",
  "/shop",
  "/shop/bag",
  "/shop/brands",
  "/shop/cat/toys",
  "/shop/collections",
  "/shop/dog/beds",
  "/vet/referrals",
]);

interface PhraseRule {
  re: RegExp;
  href: string;
}

/** Named pages in prose: first occurrence only, case-insensitive. */
const PHRASES: PhraseRule[] = [
  { re: /\bthe booking wizard\b/i, href: "/book/appointment" },
  { re: /\bthe help center\b/i, href: "/docs" },
  { re: /\bthe shop\b/i, href: "/shop" },
];

const CODE_SPAN_ROUTE = /(?<!\]\()`(\/[A-Za-z0-9/_-]+?)`/g;
const MD_LINK = /\[([^\]]*)\]\(([^)]*)\)/g;

/**
 * Rewrite site-page language into markdown links:
 *
 *   "Check the Help Center at `/docs` and the FAQ at `/faq` first."
 *     -> "…at [`/docs`](/docs) … at [`/faq`](/faq) first."
 *   "The shop, the booking wizard, and the help center are built to…"
 *     -> each named page linked on its first occurrence.
 *
 * Code spans keep their backticks inside the link text, so they render as
 * code-styled links and the corpus visual language is preserved.
 */
export function linkSitePages(body: string): string {
  if (!body) return body;

  // Pass 1 — literal route code spans become links (code styling kept).
  let out = body.replace(CODE_SPAN_ROUTE, (full, path: string) => {
    const target = path.replace(/\/+$/, "") || "/";
    return SITE_ROUTES.has(target) ? `[${full}](${target})` : full;
  });

  // Pass 2 — named page phrases: first occurrence, outside headings and
  // existing link text; a line that already links the same target is done.
  for (const rule of PHRASES) {
    const lines = out.split("\n");
    let placed = false;
    for (let i = 0; i < lines.length && !placed; i++) {
      const line = lines[i];
      if (line.startsWith("#")) continue;
      const m = line.match(rule.re);
      if (!m || m.index === undefined) continue;
      const mIndex = m.index;

      // Never inside another link's text: collect link spans on the line.
      const spans: Array<[number, number]> = [];
      let lm: RegExpExecArray | null;
      MD_LINK.lastIndex = 0;
      while ((lm = MD_LINK.exec(line))) spans.push([lm.index, lm.index + lm[0].length]);
      if (spans.some(([s, e]) => mIndex >= s && mIndex < e)) continue;

      // The line already deep links this page (code span pass): it stands.
      if (line.includes(`](${rule.href})`)) {
        placed = true;
        continue;
      }

      lines[i] =
        line.slice(0, m.index) + `[${m[0]}](${rule.href})` + line.slice(m.index + m[0].length);
      placed = true;
    }
    out = lines.join("\n");
  }

  return out;
}
