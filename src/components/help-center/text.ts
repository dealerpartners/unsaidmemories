// Help Center text rules (client + server safe).
//
// The Help Center's typographic voice retires the em dash: every adapted
// string renders with colons instead. clean() runs once per string in the
// server data adapter (titles, section titles, bodies), so every surface
// (sidebar, TOC, breadcrumbs, prev/next, article prose) speaks the same way.

const EM_DASH = /\u2014/g;

/** Replace em dashes with colons, keeping sane spacing and line endings. */
export function clean(text: string): string {
  if (!text || !EM_DASH.test(text)) return text ?? "";
  return text
    .replace(/\s*\u2014\s*/g, ": ")
    .replace(/:\s*$/gm, "")
    .trimEnd();
}

// ---------------------------------------------------------------------------
// Step 15 portal architecture (owner spec, 2026-10-21): the documentation
// platform is bifurcated into dedicated portals. Canonical doc URLs live
// here so every sidebar, prev/next rail, breadcrumb and cross-reference
// resolves to the portal that owns the content:
//   Legal        -> /legal/{section}/{slug}
//   Help (buyer) -> /help/{section}/{slug}
//   Partner U    -> /partner-u/{portal}/{group}/{slug}
//   Developers   -> /developers/* (devdocsHref, unchanged)
//   Staff/Admin  -> behind /admin and /employee (no public URL)
// ---------------------------------------------------------------------------

/** Partner U portal slug per partner audience. */
export const PARTNER_PORTAL_BY_AUDIENCE: Record<string, string> = {
  seller: "sellers",
  vet: "veterinary-pharmacy",
  pharmacy: "veterinary-pharmacy",
  groomer: "grooming",
  brand: "brands-manufacturers",
  manufacturer: "brands-manufacturers",
};

/** Partner U portals in top-nav order. */
export const PARTNER_PORTALS: { slug: string; label: string }[] = [
  { slug: "sellers", label: "Sellers" },
  { slug: "veterinary-pharmacy", label: "Veterinary & Pharmacy" },
  { slug: "grooming", label: "Grooming Partners" },
  { slug: "brands-manufacturers", label: "Brands & Manufacturers" },
];

/** The named section tree per Partner U portal (owner Step 15 spec). */
export const PARTNER_GROUPS: Record<string, { slug: string; title: string }[]> = {
  sellers: [
    { slug: "getting-started", title: "Getting Started" },
    { slug: "products-catalog", title: "Products & Catalog" },
    { slug: "inventory", title: "Inventory" },
    { slug: "orders-fulfillment", title: "Orders & Fulfillment" },
    { slug: "returns", title: "Returns" },
    { slug: "seller-standards", title: "Seller Standards" },
  ],
  grooming: [
    { slug: "getting-started", title: "Getting Started" },
    { slug: "services", title: "Services" },
    { slug: "booking", title: "Booking" },
    { slug: "operations", title: "Operations" },
    { slug: "partner-standards", title: "Partner Standards" },
  ],
  "brands-manufacturers": [
    { slug: "getting-started", title: "Getting Started" },
    { slug: "catalog", title: "Catalog" },
    { slug: "brand-management", title: "Brand Management" },
    { slug: "inventory", title: "Inventory" },
    { slug: "analytics", title: "Analytics" },
    { slug: "integrations", title: "Integrations" },
  ],
  "veterinary-pharmacy": [
    { slug: "getting-started", title: "Getting Started" },
    { slug: "integrations", title: "Integrations" },
    { slug: "services", title: "Services" },
    { slug: "orders-prescriptions", title: "Orders / Prescriptions" },
    { slug: "compliance", title: "Compliance" },
  ],
};

/** Article slug -> Partner U group slug (editorial mapping over the
 *  compiled corpus; unmapped partner articles land in Getting Started). */
export const PARTNER_GROUP_BY_SLUG: Record<string, string> = {
  // Sellers
  "seller-center-overview": "getting-started",
  "seller-onboarding-in-eight-steps": "getting-started",
  "business-verification-and-tax-identity": "getting-started",
  "account-settings-and-security": "getting-started",
  "creating-listings": "products-catalog",
  "listing-content-standards": "products-catalog",
  "pricing-promotions-and-the-buy-box": "products-catalog",
  "brand-gating-and-authorizations": "products-catalog",
  "brand-tools-and-advertising": "products-catalog",
  "inventory-management": "inventory",
  "orders-acknowledgment-and-shipping": "orders-fulfillment",
  "shipping-templates-labels-and-delivery-promises": "orders-fulfillment",
  "payments-wallet-and-payouts": "orders-fulfillment",
  "fees-and-statements": "orders-fulfillment",
  "returns-refunds-and-disputes": "returns",
  "performance-and-account-health": "seller-standards",
  "policies-violations-and-appeals": "seller-standards",
  "seller-center-troubleshooting": "seller-standards",
  // Grooming Partners
  "how-bookings-reach-the-salon": "getting-started",
  "intake-and-handling-profiles": "services",
  "running-the-appointment": "services",
  "schedule-slots-and-availability": "booking",
  "cancellations-no-shows-and-fees": "booking",
  "pricing-surcharges-deposits-and-discounts": "operations",
  "incident-reports-safety-and-commissions": "partner-standards",
  // Brands & Manufacturers
  "claiming-your-brand": "getting-started",
  "manufacturer-program": "getting-started",
  "private-label-and-white-label": "getting-started",
  "listing-content-standards-and-listing-control": "catalog",
  "brand-registry": "brand-management",
  "brand-assets-and-logos": "brand-management",
  "brand-gating-and-authorized-sellers": "brand-management",
  "minimum-advertised-price": "brand-management",
  "complaints-takedowns-and-anti-counterfeit": "brand-management",
  "brand-stores-and-advertising": "brand-management",
};

export function partnerGroupForSlug(slug: string): string {
  return PARTNER_GROUP_BY_SLUG[slug] ?? "getting-started";
}

/** Canonical article URL in the bifurcated portal architecture. */
export function hcArticleHref(a: {
  domainSlug: string;
  sectionSlug: string;
  slug: string;
  audience?: string;
}): string {
  if (a.domainSlug === "legal") return `/legal/${a.sectionSlug}/${a.slug}`;
  if (a.domainSlug === "help") {
    const portal = a.audience ? PARTNER_PORTAL_BY_AUDIENCE[a.audience] : undefined;
    if (portal) return `/partner-u/${portal}/${partnerGroupForSlug(a.slug)}/${a.slug}`;
    return `/help/${a.sectionSlug}/${a.slug}`;
  }
  return `/docs/${a.domainSlug}/${a.sectionSlug}/${a.slug}`;
}

/** Help-domain sections that belong to a Partner U portal. */
const PARTNER_SECTION_PORTAL: Record<string, string> = {
  "help/seller-center": "sellers",
  "help/groomer-services": "grooming",
  "help/brand-manufacturer-franchise": "brands-manufacturers",
};

/** Canonical section URL. Center-scoped variants (developers/staff) keep
 *  their legacy shape for the internal surfaces that still use them. */
export function hcSectionHref(
  domainSlug: string,
  sectionSlug: string,
  center?: "developers" | "staff",
): string {
  if (center) return `/docs/${center}/${domainSlug}/${sectionSlug}`;
  if (domainSlug === "legal") return `/legal/${sectionSlug}`;
  if (domainSlug === "help") {
    const portal = PARTNER_SECTION_PORTAL[`help/${sectionSlug}`];
    if (portal) return `/partner-u/${portal}`;
    return `/help/${sectionSlug}`;
  }
  return `/docs/${domainSlug}/${sectionSlug}`;
}

/** Domain landing URL in the bifurcated architecture. */
export function hcDomainHref(domainSlug: string): string {
  if (domainSlug === "legal") return "/legal";
  if (domainSlug === "help") return "/help";
  return `/docs/${domainSlug}`;
}

/** Audience display labels (the center's taxonomy). */
export const AUDIENCE_LABELS: Record<string, string> = {
  everyone: "Everyone",
  buyer: "Buyer",
  seller: "Seller",
  brand: "Brand Partner",
  manufacturer: "Manufacturer",
  franchise: "Franchisee",
  vet: "Veterinarian",
  pharmacy: "Pharmacy",
  groomer: "Groomer & Pet Services",
  employee: "Employee",
  admin: "Admin",
  developer: "Developer & Partner",
  internal: "Internal",
};

export function audienceLabel(audience: string): string {
  return AUDIENCE_LABELS[audience] ?? audience;
}
