// ============================================================================
// Built module surfaces — the §7 modules that have a REAL scoped surface
// inside the employee portal today.
//
// GET /api/employee/modules resolves what a person is assigned; this
// registry is the other half of the truth: which of those modules
// actually have a page here. A module with no surface yet is simply
// ABSENT from the portal's doors — no placeholder door, no teaser — until
// its own build lands and adds a row here. (Sunny's phasing: surfaces
// arrive crew by crew on the one mechanism.)
//
// Labels mirror GET /api/employee/modules' labels; the resolution
// endpoint itself is untouched. The Support surface is the §7 doors
// ruling's phase 2 (Sunny, 2026-10-14: support work lives in the
// employee portal) — its grant is the platform's 'support' module, the
// desk's own code, resolved through the same store. The AR cluster
// (§7.3–7.7: payments, invoices, deposits, refunds_disputes,
// gift_cards_credits) is phase 4 — one grant code per leaf, resolved
// through the same store. The inventory cluster (§7.8–7.10: inventory,
// products_services, purchasing) is the next phase — same mechanism,
// one grant code per leaf. The §7.8 'inventory' grant is also the one
// the employee order read rides on (the C1 fold, on the portal-
// completion lineage): one grant, two surfaces, no second orders door.
// Communications (§7.11) is the next phase — the employee face of the
// customer-conversation record the customer portal reads (the M1 ↔ M9
// contract: same record, two views). Reports (§7.12) follows — the
// granted employee's windowed view of their own work and their shop's
// day (M7 scoped to the person and the tenant, never the admin
// analytics face). Permission Settings (§7.13) closes the §7 list —
// it is the one surface whose subject is the grant state itself: every
// staff member's own read-only view of what they hold, at what level,
// and who assigned it. Its code is NOT a grant code (the grant store's
// CHECK carries no 'permission_settings'; a person cannot be assigned
// the right to see their own assignments) — the surface stands for
// everyone, reached from the modules index as an ordinary door, and
// the GET route behind it enforces staff identity, not a grant.
// ============================================================================

export interface BuiltModuleSurface {
  code: string;
  label: string;
  href: string;
}

export const BUILT_MODULE_SURFACES: BuiltModuleSurface[] = [
  { code: "customers", label: "Customers", href: "/employee/modules/customers" },
  { code: "appointments", label: "Appointments", href: "/employee/modules/appointments" },
  { code: "payments", label: "Payments", href: "/employee/modules/payments" },
  { code: "invoices", label: "Invoices", href: "/employee/modules/invoices" },
  { code: "deposits", label: "Deposits", href: "/employee/modules/deposits" },
  { code: "refunds_disputes", label: "Refunds & Disputes", href: "/employee/modules/refunds-disputes" },
  { code: "gift_cards_credits", label: "Gift Cards & Credits", href: "/employee/modules/gift-cards-credits" },
  { code: "inventory", label: "Inventory", href: "/employee/modules/inventory" },
  { code: "products_services", label: "Products & Services", href: "/employee/modules/products-services" },
  { code: "purchasing", label: "Purchasing", href: "/employee/modules/purchasing" },
  { code: "communications", label: "Communications", href: "/employee/modules/communications" },
  { code: "reports", label: "Reports", href: "/employee/modules/reports" },
  { code: "support", label: "Support", href: "/employee/modules/support" },
  { code: "permission_settings", label: "Permission Settings", href: "/employee/modules/permission-settings" },
];

export function builtSurfaceFor(code: string): BuiltModuleSurface | undefined {
  return BUILT_MODULE_SURFACES.find((s) => s.code === code);
}
