/**
 * Admin module permissions matrix for Unsaid.
 *
 * Adapted from UnSaid Memories src/lib/admin/modules.ts (branch 10-28-2026):
 * the pattern is the prize — a closed ModuleCode union, a runtime list
 * that must stay in lockstep, AccessLevel read|write|full with a rank
 * order, and grants stored per user in public.portal_module_permissions
 * (portal_user_id, module_key, permission_level; the stored value 'all'
 * is read as 'full', matching the UnSaid Memories M3 store semantics).
 *
 * Originally Unsaid's list dropped the UnSaid Memories marketplace codes;
 * the 2026-10-30 wholesale admin import restored them (sellers,
 * ai_ops, subscriptions, social, …) because the imported routes gate
 * on them. Excluded-module codes (lms, telemed) stay out — no route
 * in this tree uses them.
 */

export type ModuleCode =
  | "crm"
  | "orders"
  | "accounting"
  | "inventory"
  | "catalog"
  | "studio"
  | "integrations"
  | "trust_safety"
  | "support"
  | "analytics"
  | "ecommerce"
  | "website"
  | "administration"
  | "ai_ops"
  | "communications"
  | "customers"
  | "deposits"
  | "docs"
  | "gift_cards_credits"
  | "invoices"
  | "payments"
  | "policies"
  | "products_services"
  | "purchasing"
  | "refunds_disputes"
  | "reports"
  | "sellers"
  | "social"
  | "subscriptions"
  | "staff_groomer_management"
  | "appointments";

/** Runtime list of every grantable module code — must stay in lockstep
 *  with the ModuleCode union above; the admin UI offers exactly these. */
export const MODULE_CODES: ModuleCode[] = [
  "staff_groomer_management",
  "appointments",
  "crm",
  "orders",
  "accounting",
  "inventory",
  "catalog",
  "studio",
  "integrations",
  "trust_safety",
  "support",
  "analytics",
  "ecommerce",
  "website",
  "administration",
  "ai_ops",
  "communications",
  "customers",
  "deposits",
  "docs",
  "gift_cards_credits",
  "invoices",
  "payments",
  "policies",
  "products_services",
  "purchasing",
  "refunds_disputes",
  "reports",
  "sellers",
  "social",
  "subscriptions",
];

export const MODULE_LABELS: Record<ModuleCode, string> = {
  staff_groomer_management: "Staff Management",
  appointments: "Appointments",
  crm: "CRM",
  orders: "Orders",
  accounting: "Accounting",
  inventory: "Inventory",
  catalog: "Catalog & Marketplace",
  studio: "Design Studio",
  integrations: "Integrations",
  trust_safety: "Trust & Safety",
  support: "Support Desk",
  analytics: "Analytics & Reports",
  ecommerce: "Ecommerce",
  website: "Website",
  administration: "Administration",
  ai_ops: "AI Ops",
  communications: "Communications",
  customers: "Customers",
  deposits: "Deposits",
  docs: "Documents",
  gift_cards_credits: "Gift Cards & Credits",
  invoices: "Invoices",
  payments: "Payments",
  policies: "Policies",
  products_services: "Products & Services",
  purchasing: "Purchasing",
  refunds_disputes: "Refunds & Disputes",
  reports: "Reports",
  sellers: "Sellers",
  social: "Social",
  subscriptions: "Subscriptions",
};

export type AccessLevel = "read" | "write" | "full";

export const ACCESS_LEVELS: AccessLevel[] = ["read", "write", "full"];

const RANK: Record<string, number> = { none: 0, read: 1, write: 2, full: 3 };

/** Normalize a stored permission_level ('all' is the platform 'full').
 *  Unsaid's grant stores also carry domain levels seeded for specific
 *  modules (orders: 'fulfill', support: 'reply') — any other non-empty
 *  stored level counts as 'write': it is an explicit grant of action,
 *  never a read-only one. */
export function normalizeLevel(stored: string | null | undefined): AccessLevel | "none" {
  if (!stored) return "none";
  if (stored === "all") return "full";
  if (stored === "read" || stored === "write" || stored === "full") return stored;
  return "write";
}

export function levelAtLeast(have: string | null | undefined, need: AccessLevel): boolean {
  return (RANK[normalizeLevel(have)] ?? 0) >= (RANK[need] ?? 0);
}

/** Map an /api/admin/* path prefix to the module that gates it.
 *  Unmapped prefixes fall back to plain admin access (requireAdminApi). */
const API_MODULE_PREFIXES: Array<[string, ModuleCode]> = [
  ["/api/admin/crm", "crm"],
  ["/api/admin/customers", "crm"],
  ["/api/admin/orders", "orders"],
  ["/api/admin/returns", "orders"],
  ["/api/admin/accounting", "accounting"],
  ["/api/admin/invoices", "accounting"],
  ["/api/admin/banking", "accounting"],
  ["/api/admin/deposits", "accounting"],
  ["/api/admin/gift-cards", "accounting"],
  ["/api/admin/disputes", "accounting"],
  ["/api/admin/taxes", "accounting"],
  ["/api/admin/inventory", "inventory"],
  ["/api/admin/products", "catalog"],
  ["/api/admin/categories", "catalog"],
  ["/api/admin/catalog", "catalog"],
  ["/api/admin/collections", "catalog"],
  ["/api/admin/listings", "catalog"],
  ["/api/admin/publish", "catalog"],
  ["/api/admin/designs", "studio"],
  ["/api/admin/studio", "studio"],
  ["/api/admin/integrations", "integrations"],
  ["/api/admin/sync-catalog", "integrations"],
  ["/api/admin/sync-algolia", "integrations"],
  ["/api/admin/trust-safety", "trust_safety"],
  ["/api/admin/support", "support"],
  ["/api/admin/analytics", "analytics"],
  ["/api/admin/dashboard", "analytics"],
  ["/api/admin/ecommerce", "ecommerce"],
  ["/api/admin/website", "website"],
  ["/api/admin/users", "administration"],
  ["/api/admin/system", "administration"],
  ["/api/admin/settings", "administration"],
  ["/api/admin/audit", "administration"],
];

export function moduleForAdminPath(pathname: string): ModuleCode | null {
  for (const [prefix, mod] of API_MODULE_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return mod;
  }
  return null;
}

/** HTTP method → minimum access level it needs on the gating module. */
export function levelForMethod(method: string): AccessLevel {
  return method === "GET" || method === "HEAD" ? "read" : "write";
}
