/**
 * Integration provider registry — the services the System →
 * Integrations page reports on. Env presence only: key VALUES are
 * never read into responses or pages.
 */

export const PROVIDERS: Array<{
  key: string;
  name: string;
  kind: string;
  env: string[];
  supplierSlug?: string;
  note: string;
}> = [
  { key: "stripe", name: "Stripe", kind: "Payments", env: ["STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY", "STRIPE_WEBHOOK_SECRET"], note: "Checkout, payments, refunds. Webhook secret must be set or signature verification falls back to unauthenticated parsing." },
  { key: "resend", name: "Resend", kind: "Email", env: ["RESEND_API_KEY"], note: "Transactional email (order confirmations, invites, support)." },
  { key: "printful", name: "Printful", kind: "Print on demand", env: ["PRINTFUL_API_KEY"], supplierSlug: "printful", note: "Catalog, mockups, order fulfillment." },
  { key: "gelato", name: "Gelato", kind: "Print on demand", env: ["GELATO_API_KEY"], supplierSlug: "gelato", note: "Catalog and order fulfillment." },
  { key: "prodigi", name: "Prodigi", kind: "Print on demand", env: ["PRODIGI_API_KEY"], supplierSlug: "prodigi", note: "Wall art and print fulfillment." },
  { key: "gooten", name: "Gooten", kind: "Print on demand", env: ["GOOTEN_RECIPE_ID", "GOOTEN_PARTNER_BILLING_KEY"], supplierSlug: "gooten", note: "Catalog and order fulfillment." },
  { key: "teemill", name: "Teemill", kind: "Print on demand", env: ["TEEMILL_PUBLIC_SAFE_KEY"], supplierSlug: "teemill", note: "Apparel fulfillment." },
  { key: "spreadconnect", name: "SpreadConnect", kind: "Print on demand", env: ["SPREADCONNECT_API_KEY"], supplierSlug: "spreadconnect", note: "Apparel and merchandise fulfillment." },
  { key: "algolia", name: "Algolia", kind: "Search", env: ["ALGOLIA_APP_ID", "ALGOLIA_SEARCH_API_KEY", "ALGOLIA_WRITE_API_KEY"], note: "Catalog search index." },
  { key: "pollinations", name: "Pollinations", kind: "AI imagery", env: ["POLLINATIONS_API_KEY"], note: "Design-studio inspiration imagery. Server-side key only — never exposed to the browser." },
];
