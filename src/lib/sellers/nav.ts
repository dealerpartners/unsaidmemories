// ---------------------------------------------------------------------------
// sellers/nav.ts — the seller portal's navigation model.
//
// The seller SHELL is generated from the database (GET /api/seller/shell):
// the seller's own record status drives ACCESS, per the platform
// onboarding model — an applicant has no marketplace access until the
// platform activates them; activation opens the full seller center;
// suspension narrows access to governance + account + communication so
// the seller can see and answer their record; a closed account keeps
// account + support only. Capability grants layer on top: Advertising
// opens only when seller_capabilities.can_advertise is set.
//
// NAVIGATION DOCTRINE (Sunny's standing rule, applied 2026-10-15): the
// canonical tree IS the navigation — every section RENDERS for every
// seller, and access is expressed as a LOCK with a plain-language
// reason, never by hiding the node. sellerVisibleSections below remains
// the ACCESS rule (what actually opens); sellerLockedSections derives
// the locks the sidebar renders from it.
//
// Section ids are DawgNavSection ids (the shared sidebar union); hrefs are
// the section roots inside /seller.
// ---------------------------------------------------------------------------

import type { DawgNavSection } from "@/lib/types";
import { roleAllowsSection, isTeamRole, TEAM_ROLE_LABELS } from "@/lib/sellers/team";

export interface SellerShellData {
  /** Team access: present when the session reaches the store through
   * seller_users (or is the owner). role drives section locks for
   * non-owner members — see src/lib/sellers/team.ts. */
  team?: { role: string; isOwner: boolean } | null;
  seller: {
    id: string;
    display_name?: string | null;
    legal_name?: string | null;
    slug?: string | null;
    email?: string | null;
    status?: string | null;
    seller_type?: string | null;
  } | null;
  onboarding: { step: string; status: string }[];
  capabilities: {
    is_pro?: boolean;
    pro_tier?: string | null;
    can_advertise?: boolean;
    can_bulk_import?: boolean;
    status?: string | null;
  } | null;
  counts: {
    openViolations: number;
    pendingAppeals: number;
    unreadNotifications: number;
    listings: number;
    orders: number;
  } | null;
}

/** Section id → route the sidebar navigates to. Hrefs follow Tree A —
 * the seller application's own map (products, settings, messages,
 * reports, advertising as first-class sections). */
export const SELLER_SECTION_HREFS: Partial<Record<DawgNavSection, string>> = {
  dashboard: "/seller/dashboard",
  onboarding: "/seller/onboarding/wizard",
  catalog: "/seller/products",
  inventory: "/seller/inventory/overview",
  orders: "/seller/orders/inbox",
  customers: "/seller/customers",
  returns: "/seller/returns/overview",
  shipping: "/seller/shipping/templates",
  payments: "/seller/payments/overview",
  tax: "/seller/tax/identity",
  pricing: "/seller/pricing/overview",
  promotions: "/seller/promotions/pricing",
  live: "/seller/live",
  social: "/seller/social",
  advertising: "/seller/advertising",
  analytics: "/seller/analytics/sales",
  performance: "/seller/performance/overview",
  reports: "/seller/reports",
  governance: "/seller/governance/violations",
  brands: "/seller/brands/registry",
  "ai-ops": "/seller/ai-ops/disclosures",
  communication: "/seller/messages/inbox",
  success: "/seller/success",
  account: "/seller/settings/profile",
  profile: "/seller/settings/profile",
  docs: "/seller/docs",
  settings: "/seller/settings/profile",
};

/** Section children — the sub-pages each section owns, from the real
 * route tree. The tree IS the navigation (Sunny's law, 2026-10-14):
 * a parent without its children in the navigation leaves those pages
 * homeless, however well they are wired. The sidebar renders these
 * under their parent, always visible; a locked parent locks its
 * children with the same reason. Only routes that exist appear here —
 * detail pages ([id]) and wizard steps are flow, not navigation. */
export const SELLER_NAV_CHILDREN: Partial<
  Record<DawgNavSection, { label: string; href: string }[]>
> = {
  onboarding: [
    { label: "Overview", href: "/seller/onboarding/overview" },
    { label: "Business verification", href: "/seller/onboarding/business-verification" },
    { label: "Tax identity", href: "/seller/onboarding/tax-identity" },
    { label: "Bank info", href: "/seller/onboarding/bank-info" },
    { label: "Customer favorites", href: "/seller/onboarding/customer-favorites" },
    { label: "First listing", href: "/seller/onboarding/first-listing" },
    { label: "Global markets", href: "/seller/onboarding/global-markets" },
    { label: "Policy acceptance", href: "/seller/onboarding/policy-acceptance" },
  ],
  catalog: [
    { label: "All products", href: "/seller/products" },
    { label: "Add a product", href: "/seller/products/new" },
    { label: "Catalog overview", href: "/seller/catalog/overview" },
    { label: "Listings", href: "/seller/catalog/listings" },
    { label: "Bulk edit", href: "/seller/catalog/listings/bulk" },
    { label: "Imports", href: "/seller/products/imports" },
    { label: "Media library", href: "/seller/catalog/media" },
    { label: "Categories", href: "/seller/catalog/categories" },
    { label: "Bundles", href: "/seller/catalog/bundles" },
    { label: "Variants", href: "/seller/catalog/variants" },
    { label: "Listing quality", href: "/seller/catalog/quality" },
    { label: "Suppression", href: "/seller/catalog/suppression" },
  ],
  inventory: [
    { label: "Overview", href: "/seller/inventory/overview" },
    { label: "Stock", href: "/seller/inventory/stock" },
    { label: "Movements", href: "/seller/inventory/movements" },
    { label: "Low stock", href: "/seller/inventory/low-stock" },
    { label: "Replenishment", href: "/seller/inventory/replenishment" },
    { label: "WFS inbound", href: "/seller/inventory/wfs-inbound" },
  ],
  orders: [
    { label: "Inbox", href: "/seller/orders/inbox" },
    { label: "All orders", href: "/seller/orders" },
    { label: "Unshipped", href: "/seller/orders/unshipped" },
    { label: "Late", href: "/seller/orders/late" },
    { label: "Cancelled", href: "/seller/orders/cancelled" },
    { label: "Bulk acknowledge", href: "/seller/orders/bulk-acknowledge" },
    { label: "Bulk ship", href: "/seller/orders/bulk-ship" },
    { label: "Pause operations", href: "/seller/orders/pause-operations" },
  ],
  returns: [
    { label: "Overview", href: "/seller/returns/overview" },
    { label: "Requests", href: "/seller/returns/requests" },
    { label: "Refunds", href: "/seller/returns/refunds" },
    { label: "Return rules", href: "/seller/returns/rules" },
    { label: "Insights", href: "/seller/returns/insights" },
    { label: "Disputes", href: "/seller/returns/disputes" },
  ],
  shipping: [
    { label: "Templates", href: "/seller/shipping/templates" },
    { label: "Labels", href: "/seller/shipping/labels" },
    { label: "Carriers", href: "/seller/shipping/carriers" },
    { label: "Return address", href: "/seller/shipping/return-address" },
    { label: "Delivery promises", href: "/seller/shipping/delivery-promises" },
    { label: "Exceptions", href: "/seller/shipping/exceptions" },
    { label: "Performance", href: "/seller/shipping/performance" },
  ],
  payments: [
    { label: "Overview", href: "/seller/payments/overview" },
    { label: "Payouts", href: "/seller/payments/payouts" },
    { label: "Statements", href: "/seller/payments/statements" },
    { label: "Fees", href: "/seller/payments/fees" },
    { label: "Payment methods", href: "/seller/payments/methods" },
    { label: "Wallet", href: "/seller/payments/wallet" },
    { label: "Tax documents", href: "/seller/payments/tax-docs" },
  ],
  tax: [
    { label: "Tax identity", href: "/seller/tax/identity" },
    { label: "Classifications", href: "/seller/tax/classifications" },
    { label: "Sales tax", href: "/seller/tax/sales-tax" },
    { label: "Form 1099-K", href: "/seller/tax/1099" },
  ],
  pricing: [
    { label: "Overview", href: "/seller/pricing/overview" },
    { label: "Pricing rules", href: "/seller/pricing/rules" },
    { label: "AutoPrice", href: "/seller/pricing/autoprice" },
    { label: "Bulk editor", href: "/seller/pricing/bulk-editor" },
    { label: "Buy Box", href: "/seller/pricing/buy-box" },
    { label: "Discounts", href: "/seller/pricing/discounts" },
    { label: "Pricing insights", href: "/seller/pricing/pricing-insights" },
  ],
  promotions: [
    { label: "Promotional pricing", href: "/seller/promotions/pricing" },
    { label: "Discounts", href: "/seller/promotions/discounts" },
    { label: "Flash deals", href: "/seller/promotions/flash-deals" },
  ],
  social: [
    { label: "Summary", href: "/seller/social" },
    { label: "Connections", href: "/seller/social?view=connections" },
    { label: "Composer", href: "/seller/social?view=planning" },
    { label: "Calendar", href: "/seller/social?view=planning" },
    { label: "Push a listing", href: "/seller/social?view=push" },
    { label: "Reporting", href: "/seller/social?view=reporting" },
    { label: "Reports", href: "/seller/social?view=reports" },
  ],
  advertising: [
    { label: "Overview", href: "/seller/advertising" },
    { label: "Business", href: "/seller/advertising/business" },
    { label: "Campaigns", href: "/seller/advertising/campaigns" },
    { label: "Manage", href: "/seller/advertising/manage" },
    { label: "Connect", href: "/seller/advertising/connect" },
    { label: "Rewards", href: "/seller/advertising/rewards" },
    { label: "SEM", href: "/seller/advertising/sem" },
    { label: "Troubleshooting", href: "/seller/advertising/troubleshooting" },
  ],
  analytics: [
    { label: "Sales", href: "/seller/analytics/sales" },
    { label: "Traffic", href: "/seller/analytics/traffic" },
    { label: "Conversion", href: "/seller/analytics/conversion" },
    { label: "Pricing insights", href: "/seller/analytics/pricing-insights" },
    { label: "Inventory insights", href: "/seller/analytics/inventory-insights" },
    { label: "Search insights", href: "/seller/analytics/search-insights" },
    { label: "Reports", href: "/seller/analytics/reports" },
    { label: "Success Hub", href: "/seller/analytics/success-hub" },
  ],
  performance: [
    { label: "Overview", href: "/seller/performance/overview" },
    { label: "Return rate", href: "/seller/performance/return-rate" },
    { label: "Item-not-received rate", href: "/seller/performance/inr-rate" },
    { label: "Negative feedback", href: "/seller/performance/negative-feedback" },
    { label: "Late shipment", href: "/seller/performance/late-shipment" },
    { label: "Carrier performance", href: "/seller/performance/carrier" },
    { label: "Regional performance", href: "/seller/performance/regional" },
  ],
  reports: [
    { label: "Orders report", href: "/seller/reports/orders" },
    { label: "Sales report", href: "/seller/reports/sales" },
    { label: "Catalog report", href: "/seller/reports/catalog" },
    { label: "Pricing report", href: "/seller/reports/pricing" },
    { label: "Assortment report", href: "/seller/reports/assortment" },
    { label: "Fulfillment report", href: "/seller/reports/fulfillment" },
  ],
  governance: [
    { label: "Violations", href: "/seller/governance/violations" },
    { label: "Policies", href: "/seller/governance/policies" },
    { label: "Appeals", href: "/seller/governance/appeals" },
    { label: "Audit log", href: "/seller/governance/audit-log" },
  ],
  brands: [
    { label: "Brand registry", href: "/seller/brands/registry" },
    { label: "Authorizations", href: "/seller/brands/authorizations" },
    { label: "Privileges", href: "/seller/brands/privileges" },
  ],
  "ai-ops": [
    { label: "Disclosures", href: "/seller/ai-ops/disclosures" },
    { label: "Agent registry", href: "/seller/ai-ops/agent-registry" },
    { label: "Usage", href: "/seller/ai-ops/usage" },
  ],
  communication: [
    { label: "Inbox", href: "/seller/messages/inbox" },
    { label: "Notifications", href: "/seller/messages/notifications" },
    { label: "Templates", href: "/seller/communication/templates" },
    { label: "Forum", href: "/seller/communication/forum" },
    { label: "Support", href: "/seller/communication/support" },
  ],
  account: [
    { label: "Profile", href: "/seller/settings/profile" },
    { label: "Shop page", href: "/seller/shop-page" },
    { label: "Company", href: "/seller/settings/company" },
    { label: "Tax identity", href: "/seller/tax/identity" },
    { label: "Contact", href: "/seller/settings/contact" },
    { label: "Notifications", href: "/seller/settings/notifications" },
    { label: "Team & users", href: "/seller/settings/users" },
    { label: "Security", href: "/seller/settings/security" },
    { label: "API access", href: "/seller/settings/api-access" },
    { label: "Health & compliance", href: "/seller/settings/health-compliance" },
    { label: "Markets & favorites", href: "/seller/settings/markets-favorites" },
  ],
};

/** Every section the full (approved) seller center exposes, in nav order. */
export const SELLER_ALL_SECTIONS: DawgNavSection[] = [
  "dashboard",
  "catalog",
  "inventory",
  "orders",
  "customers",
  "returns",
  "shipping",
  "payments",
  "tax",
  "pricing",
  "promotions",
  "social",
  "advertising",
  "live",
  "analytics",
  "performance",
  "reports",
  "governance",
  "brands",
  "ai-ops",
  "communication",
  "success",
  "account",
  "docs",
];

/** Every section the sidebar RENDERS, in nav order — the full seller
 * tree (SELLER_ALL_SECTIONS plus onboarding, which an approved seller
 * keeps visible as their record of the application). Access is a lock
 * (sellerLockedSections), never a missing row. */
export const SELLER_NAV_SECTIONS: DawgNavSection[] = [
  "dashboard",
  "onboarding",
  ...SELLER_ALL_SECTIONS.filter((s) => s !== "dashboard"),
];

/**
 * The access rule, from the seller's resolved state:
 *  - no sellers row yet → onboarding + communication + account + docs
 *    (the shell exists so they can finish applying and reach support)
 *  - applied → onboarding, dashboard (status + checklist only),
 *    communication, account, docs — NO marketplace access
 *  - approved → the full seller center (advertising still capability-gated)
 *  - suspended → dashboard, governance, communication, account, docs
 *  - closed → account, communication, docs
 */
export function sellerVisibleSections(shell: SellerShellData | null): DawgNavSection[] {
  if (!shell || !shell.seller) {
    return ["onboarding", "communication", "account", "docs"];
  }
  const statusSections = sellerStatusSections(shell);
  // Team members: the status rule opens the store, their ROLE narrows it.
  if (shell.team && !shell.team.isOwner) {
    return statusSections.filter((s) => roleAllowsSection(shell.team!.role, s));
  }
  return statusSections;
}

function sellerStatusSections(shell: SellerShellData): DawgNavSection[] {
  const status = String(shell.seller?.status || "applied").toLowerCase();
  switch (status) {
    case "approved": {
      const sections: DawgNavSection[] = SELLER_ALL_SECTIONS.filter(
        (s) => s !== "advertising",
      );
      if (shell.capabilities?.can_advertise) {
        const idx = sections.indexOf("promotions");
        sections.splice(idx >= 0 ? idx + 1 : sections.length, 0, "advertising");
      }
      return sections;
    }
    case "suspended":
      return ["dashboard", "governance", "communication", "account", "docs"];
    case "closed":
      return ["account", "communication", "docs"];
    case "applied":
    default:
      return ["dashboard", "onboarding", "communication", "account", "docs"];
  }
}

/**
 * The locks the sidebar renders: every rendered section the access rule
 * does NOT open, with the plain-language reason the seller reads. The
 * reason names the state the seller is actually in — an applicant is
 * told approval unlocks the marketplace, a suspended seller is told why
 * the narrowing happened, and the one capability lock (advertising)
 * names the grant that opens it.
 */
export function sellerLockedSections(
  shell: SellerShellData | null,
): Partial<Record<DawgNavSection, string>> {
  const open = new Set(sellerVisibleSections(shell));
  const status = String(shell?.seller?.status || "").toLowerCase();
  const reasonFor = (section: DawgNavSection): string => {
    if (shell?.team && !shell.team.isOwner && !roleAllowsSection(shell.team.role, section)) {
      const label = isTeamRole(shell.team.role) ? TEAM_ROLE_LABELS[shell.team.role] : shell.team.role;
      return `Your team role (${label}) doesn't include this section — ask your store owner if you need it.`;
    }
    if (status === "approved" && section === "advertising") {
      return "Advertising opens when you activate your free advertiser account in the Ad Center — it takes a minute and needs no approval.";
    }
    if (status === "suspended") {
      return "Unavailable while your account is suspended. Governance, Messages, and Account stay open so you can answer your record.";
    }
    if (status === "closed") {
      return "Your seller account is closed.";
    }
    return "Opens once your seller application is approved.";
  };
  const locks: Partial<Record<DawgNavSection, string>> = {};
  for (const section of SELLER_NAV_SECTIONS) {
    if (!open.has(section)) locks[section] = reasonFor(section);
  }
  return locks;
}

/**
 * Seller TYPE availability (Sunny's ruling, 2026-10-14): there is a
 * seller, and then there are seller TYPES — manufacturer_brand,
 * supplier, reseller, drop_shipper (Tree A's four; "marketplace" names
 * the platform model, never a type). Type drives module availability:
 *
 *   module        manufacturer  supplier  reseller  drop_shipper
 *   api_access        ✓           ✓         —          —
 *   csv_import        ✓           ✓         ✓          ✓
 *   (every other Tree A module: all four types — his text names no
 *    other restriction, and silence means available, never invented)
 *
 * The pairing: manufacturers and suppliers integrate through the API;
 * resellers and drop shippers manage their catalog by CSV upload (the
 * portal bulk import). CSV stays open to every type — his text assigns
 * it as the reseller/drop-shipper path, it does not withdraw it from
 * manufacturers/suppliers — and it remains separately gated by the
 * can_bulk_import capability grant (an onboarding seller imports as
 * part of onboarding; see /api/seller/imports). API access is the
 * differentiator, and it is enforced at the ROUTE level
 * (/api/seller/api-access refuses other types), not only in nav.
 */
export const SELLER_TYPE_MODULE_RULES: Record<string, readonly string[] | "all"> = {
  api_access: ["manufacturer_brand", "supplier"],
  csv_import: "all",
};

export function sellerTypeAllowsModule(
  sellerType: string | null | undefined,
  module: string,
): boolean {
  const rule = SELLER_TYPE_MODULE_RULES[module];
  if (!rule || rule === "all") return true;
  return rule.includes(String(sellerType || "").toLowerCase());
}

/** Sidebar badges from live counts (violations awaiting the seller,
 * unread platform notifications). Zero counts render no badge. */
export function sellerSectionBadges(
  shell: SellerShellData | null,
): Partial<Record<DawgNavSection, string>> {
  const badges: Partial<Record<DawgNavSection, string>> = {};
  if (!shell?.counts) return badges;
  if (shell.counts.openViolations > 0) {
    badges.governance = String(shell.counts.openViolations);
  }
  if (shell.counts.unreadNotifications > 0) {
    badges.communication = String(shell.counts.unreadNotifications);
  }
  return badges;
}

/** Onboarding completion from the seller's real step state. */
export function onboardingProgress(shell: SellerShellData | null, totalSteps: number) {
  const done = new Set(
    (shell?.onboarding || [])
      .filter((s) => s.status === "completed")
      .map((s) => s.step),
  );
  return { completedSteps: done, completedCount: done.size, totalSteps };
}
