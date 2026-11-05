// ============================================================================
// portal-nav — admin OS header/module navigation × portal_module_permissions.
//
// Every header pill, ModuleNav icon, and breadcrumb in the admin OS is gated
// by the current user's real grants in public.portal_module_permissions
// (module_key, permission_level). module_key 'none' rows are never stored,
// so a user is allowed a module when it appears in their grant set.
//
// FAIL OPEN: when permissions can't be fetched (network/table/error) the
// layout passes allowedModules = null and everything renders — an admin is
// never locked out by a fetch error. An empty-but-successful grant set is
// real data and is applied as-is (deny). Owner (is_owner / role 'owner')
// bypasses every check.
// ============================================================================

import type { DawgNavSection } from '@/lib/types';
import { MASTER_ONLY_MODULES } from '@/lib/franchise-access';

/** Admin OS pillars (the header pills + ModuleNav groups). */
export type AdminPillar = 'CRM' | 'ORDERS' | 'ACCOUNTING' | 'MARKETPLACE' | 'LEARN' | 'POS';

/** Canonical map: nav section id → portal_module_permissions module_key.
 *  Audited against the real route tree in src/app/(portals)/admin/. */
export const SECTION_MODULE: Record<string, string> = {
  dashboard: 'crm',
  customers: 'customers',
  services: 'products_services',
  staff: 'crm',
  orders: 'orders',
  'order-details': 'orders',
  products: 'products_services',
  categories: 'products_services',
  catalog: 'products_services',
  media: 'products_services',
  brands: 'products_services',
  filters: 'products_services',
  inventory: 'inventory',
  shipping: 'shipping',
  returns: 'orders',
  'purchase-orders': 'purchasing',
  'supplier-orders': 'purchasing',
  promotions: 'marketing',
  newsletter: 'marketing',
  books: 'accounting',
  invoices: 'invoices',
  payments: 'payments',
  deposits: 'deposits',
  refunds: 'refunds_disputes',
  'gift-cards': 'gift_cards_credits',
  payroll: 'accounting',
  taxes: 'accounting',
  reports: 'reports',
  analytics: 'analytics',
  social: 'social',
  'social/platform-keys': 'social',
  'financial-settings': 'accounting',
  'stripe-connections': 'payments',
  advertising: 'payments',
  subscriptions: 'payments',
  sellers: 'sellers',
  'sellers/review-queue': 'sellers',
  'sellers/advertising': 'sellers',
  listings: 'sellers',
  'catalog-review': 'sellers',
  'brand-registry': 'sellers',
  fees: 'sellers',
  'trust-safety': 'trust_safety',
  messages: 'support',
  settings: 'administration',
  'identity-grants': 'administration',
  policies: 'policies',
  docs: 'docs',
  // Franchise Management Portal (network administration — master-only
  // in practice via MASTER_ONLY_SECTION_IDS below; the module mapping
  // exists so master staff need the administration grant to see it).
  franchise: 'administration',
  'franchise/signup': 'administration',
};

/** Nav sections a child tenant never sees, at any role — the sections
 * whose module is master-only (franchise-access.ts), plus surface
 * entries whose master-only status doesn't come from their module
 * mapping: 'ai-ops' (module ai_ops, unmapped above), 'website-templates'
 * (the master template assignment surface — franchise tenants get My
 * Website instead), and the Franchise Management Portal ('franchise',
 * 'franchise/signup'): the admin manages the franchise NETWORK there;
 * a franchise tenant administers its own business, never the network. */
export const MASTER_ONLY_SECTION_IDS: string[] = [
  ...Object.keys(SECTION_MODULE).filter((s) =>
    (MASTER_ONLY_MODULES as string[]).includes(SECTION_MODULE[s]),
  ),
  'ai-ops',
  'website-templates',
  'franchise',
  'franchise/signup',
];

/** Module keys that gate each pillar (mirrors the permission editor's groups). */
export const PILLAR_MODULES: Record<AdminPillar, string[]> = {
  POS: [],
  CRM: ['crm', 'customers', 'communications'],
  ORDERS: ['orders', 'inventory', 'products_services', 'purchasing', 'shipping', 'marketing'],
  ACCOUNTING: ['accounting', 'payments', 'invoices', 'deposits', 'refunds_disputes', 'gift_cards_credits', 'reports', 'analytics'],
  MARKETPLACE: ['sellers', 'trust_safety'],
  // LEARN leaves the admin OS for /learn (separate surface, own auth) —
  // always rendered, like before.
  LEARN: [],
};

export function sectionAllowed(
  section: string,
  allowedModules: string[] | null,
  isOwner: boolean,
  isMasterTenant: boolean = true,
): boolean {
  // Franchise deny: master-only sections are hidden from child tenants
  // at EVERY role — the owner bypass below must not resurrect them.
  if (!isMasterTenant && MASTER_ONLY_SECTION_IDS.includes(section)) return false;
  if (isOwner || allowedModules === null) return true; // fail open
  const moduleKey = SECTION_MODULE[section];
  if (!moduleKey) return true; // unmapped sections fail open, never hide
  return allowedModules.includes(moduleKey);
}

export function pillarAllowed(
  pillar: AdminPillar,
  allowedModules: string[] | null,
  isOwner: boolean,
  isMasterTenant: boolean = true,
): boolean {
  if (pillar === 'LEARN') return true;
  // Franchise deny: strip master-only module keys for child tenants; a
  // pillar gated only by master-only modules (MARKETPLACE) disappears.
  const mods = isMasterTenant
    ? PILLAR_MODULES[pillar] || []
    : (PILLAR_MODULES[pillar] || []).filter(
        (k) => !(MASTER_ONLY_MODULES as string[]).includes(k),
      );
  if (!isMasterTenant && mods.length === 0) return false;
  if (isOwner || allowedModules === null) return true; // fail open
  return mods.some((k) => allowedModules.includes(k));
}

/** The section ids the current user may see, or null when everything may
 *  show (owner, or permissions unfetched — fail open). Passed to ModuleNav
 *  as `allowedSections`. For a child tenant the result is never null:
 *  master-only sections are always removed, owner or not. */
export function allowedSectionIds(
  allowedModules: string[] | null,
  isOwner: boolean,
  isMasterTenant: boolean = true,
): string[] | null {
  const base =
    isOwner || allowedModules === null
      ? null
      : Object.keys(SECTION_MODULE).filter((s) =>
          allowedModules.includes(SECTION_MODULE[s]),
        );
  if (isMasterTenant) return base;
  const all = base ?? [...Object.keys(SECTION_MODULE), 'ai-ops'];
  return all.filter((s) => !MASTER_ONLY_SECTION_IDS.includes(s));
}

export type { DawgNavSection };
