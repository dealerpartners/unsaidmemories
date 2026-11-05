// ===========================================================================
// lib/capabilities/roles.ts — M3 (DOCX §7.4 / §2.2): the role → capability
// map. This file is the ONLY place a role's capability set is defined;
// every guard in lib/capabilities/guards.ts, sellerSectionGuard, the
// teach gate and the cabinet vet gate reads from here, so a role's
// permissions can never drift between routes.
//
// ROLE VOCABULARY (DOCX §1 / Roles sheet — the defined vocabulary, and
// the ONLY role words guards may use):
//   platform admin, accountant, customer, learner, seller, pharmacy,
//   affiliate, advertiser.
// No other role word may be introduced by a guard. (Standing rule:
// contradictory role words may be renamed to the defined term; sellers
// stay sellers.)
//
// E-COMMERCE CLEANUP: the salon-admin / salon-operator / groomer / vet
// roles and the pet.* / appointments / staff_groomer_management
// capability codes were DROPPED when the platform moved off pet
// grooming, appointments, and telemedicine. The legacy code paths in
// lib/capabilities/guards.ts still push these role strings at runtime
// (definedRolesForWord maps "groomer" / "vet" / "owner" / "manager"
// onto them); capabilitiesForRole now returns [] for those role
// strings because they are no longer keys in ROLE_CAPABILITIES. A
// follow-up will collapse definedRolesForWord onto the e-commerce
// vocabulary; this file's role set is the contract, not that mapping.
//
// DERIVATION (auditable, not invented):
//   · Base: the workbook's Actions sheet (296 rows → 87 object.verb
//     cells), grouped by portal × audience: admin/owner → platform,
//     affiliate/partner → affiliate, seller/partner → seller,
//     customer/owner → customer, ads/partner → advertiser,
//     admin/platform → platform admin.
//   · The 32 M1-only cells (in platform_capabilities but in no Actions
//     row) are assigned here by object, so the map covers all 119 live
//     capability rows, not just the 87 action cells.
//   · DOCX role promises (Roles sheet, "the promise, in one line")
//     fill the roles the Actions sheet leaves thin: accountant (no
//     portal of its own — the ledger), pharmacy (25 promised leaves),
//     learner (the Learning Center side of the customer portal).
//   · platform admin holds ALL 119: the platform admin runs the
//     marketplace, and requireAdminApi previously passed platform
//     admins everywhere — anything narrower would newly deny an admin
//     flow M3 must preserve.
//   · agent is a LENS, not a role (it is not in the role vocabulary
//     above), so it has no entry in ROLE_CAPABILITIES: what an agent
//     may do is the agent COLUMN of the §3.3 matrix (transitions.ts),
//     intersected with its principal's roles, and purpose policy is
//     M6's job, not M3's. No agent actor exists live yet.
// ===========================================================================

export const ROLE_VOCABULARY = [
  "platform admin",
  "accountant",
  "customer",
  "learner",
  "seller",
  "pharmacy",
  "affiliate",
  "advertiser",
] as const;
export type DefinedRole = (typeof ROLE_VOCABULARY)[number];

/** All 120 live capability codes (M1's 112 + M3's 7 + M5's
 *  platform.impersonate). Kept in sync with migration 20261188 by the
 *  /api/capabilities proof endpoint, which diffs this list against
 *  platform_capabilities at runtime. */
export const ALL_CAPABILITY_CODES = [
  "party.amend", "party.automate", "party.converse", "party.discover", "party.draft", "party.inspect", "party.measure",
  "offering.amend", "offering.automate", "offering.converse", "offering.discover", "offering.draft", "offering.inspect", "offering.measure", "offering.publish", "offering.verify",
  "commitment.amend", "commitment.automate", "commitment.converse", "commitment.discover", "commitment.draft", "commitment.inspect", "commitment.measure", "commitment.settle", "commitment.transition",
  "order.amend", "order.automate", "order.converse", "order.discover", "order.draft", "order.enforce", "order.inspect", "order.measure", "order.publish", "order.settle", "order.transition", "order.verify",
  "fulfillment.amend", "fulfillment.automate", "fulfillment.converse", "fulfillment.discover", "fulfillment.draft", "fulfillment.inspect", "fulfillment.measure", "fulfillment.publish", "fulfillment.transition", "fulfillment.verify",
  "money.amend", "money.automate", "money.converse", "money.discover", "money.draft", "money.enforce", "money.inspect", "money.measure", "money.publish", "money.settle", "money.transition", "money.verify",
  "evidence.amend", "evidence.discover", "evidence.draft", "evidence.enforce", "evidence.inspect", "evidence.measure",
  "communication.amend", "communication.automate", "communication.converse", "communication.discover", "communication.draft", "communication.inspect", "communication.measure", "communication.verify",
  "governance.automate", "governance.draft", "governance.inspect", "governance.measure", "governance.publish",
  "insight.amend", "insight.discover", "insight.measure", "insight.publish", "insight.transition",
  "supply.draft", "supply.inspect", "supply.measure", "supply.publish",
  "content.amend", "content.automate", "content.converse", "content.draft", "content.inspect",
  "agreement.amend", "agreement.draft", "agreement.inspect", "agreement.verify",
  "relationship.amend", "relationship.automate", "relationship.converse", "relationship.discover", "relationship.draft", "relationship.inspect",
  "workflow.amend", "workflow.transition", "workflow.verify",
  "ai_system.amend", "ai_system.draft", "ai_system.inspect",
  "org.amend", "org.automate", "org.converse", "org.discover", "org.draft", "org.inspect", "org.settle", "org.transition",
  // M5 (DOCX §7.6): impersonation is a platform capability, not a
  // module write — the K1 enter/start legs are gated on this code.
  // scope_mode is 'tenant' (migration 20261188): the act is bounded
  // to the actor's tenant, exactly as the K1 record always was, so
  // the platform admin (ALL codes) and the salon hats below both
  // pass within their tenant and no existing K1 caller is newly
  // denied. A platform scope_mode would have denied every salon
  // admin by construction. (The stored verb is 'enforce' — the
  // capability table's verb CHECK admits no 'impersonate'; guards
  // look up scope_mode by code only.)
  "platform.impersonate",
] as const;

/** The legacy salon set is retained here as DEAD CODE for backward
 *  compatibility with any external reader that still imports it by name.
 *  The "salon admin" / "salon operator" / "groomer" / "vet" roles that
 *  pointed at it were dropped in the e-commerce cleanup, so nothing in
 *  ROLE_CAPABILITIES below references it anymore. The pet.* capability
 *  codes that used to live in it have been removed (the platform has no
 *  pet/patient surface). */
const SALON_CAPABILITIES: readonly string[] = [
  "commitment.amend", "commitment.automate", "commitment.converse", "commitment.discover", "commitment.draft", "commitment.inspect", "commitment.measure", "commitment.settle", "commitment.transition",
  "party.amend", "party.automate", "party.converse", "party.discover", "party.draft", "party.inspect", "party.measure",
  "fulfillment.amend", "fulfillment.automate", "fulfillment.converse", "fulfillment.discover", "fulfillment.draft", "fulfillment.inspect", "fulfillment.measure", "fulfillment.publish", "fulfillment.transition", "fulfillment.verify",
  "order.amend", "order.automate", "order.converse", "order.discover", "order.draft", "order.inspect", "order.measure", "order.publish", "order.settle", "order.transition", "order.verify",
  "offering.amend", "offering.automate", "offering.converse", "offering.discover", "offering.draft", "offering.inspect", "offering.measure", "offering.publish", "offering.verify",
  "money.amend", "money.automate", "money.converse", "money.discover", "money.draft", "money.inspect", "money.measure", "money.publish", "money.settle", "money.transition", "money.verify",
  "communication.amend", "communication.automate", "communication.converse", "communication.discover", "communication.draft", "communication.inspect", "communication.measure", "communication.verify",
  "org.amend", "org.automate", "org.converse", "org.discover", "org.draft", "org.inspect", "org.settle", "org.transition",
  "insight.amend", "insight.discover", "insight.measure", "insight.publish", "insight.transition",
  "evidence.amend", "evidence.discover", "evidence.draft", "evidence.inspect", "evidence.measure",
  "supply.draft", "supply.inspect", "supply.measure", "supply.publish",
  "workflow.amend", "workflow.transition", "workflow.verify",
  "platform.impersonate",
];

export const ROLE_CAPABILITIES: Record<DefinedRole, readonly string[]> = {
  "platform admin": ALL_CAPABILITY_CODES,
  accountant: [
    "money.amend", "money.automate", "money.converse", "money.discover", "money.draft", "money.enforce", "money.inspect", "money.measure", "money.publish", "money.settle", "money.transition", "money.verify",
    "order.inspect", "order.measure",
    "commitment.discover", "commitment.inspect",
    "insight.discover", "insight.measure", "insight.publish",
    "party.inspect", "org.inspect",
  ],
  customer: [
    "commitment.amend", "commitment.automate", "commitment.inspect", "commitment.transition",
    "fulfillment.transition",
    "money.discover", "money.draft", "money.settle",
    "order.inspect",
    "party.amend", "party.automate", "party.converse", "party.discover", "party.draft", "party.inspect",
    "evidence.draft", "evidence.inspect",
    "communication.converse", "communication.inspect",
  ],
  learner: [
    "content.converse", "content.draft", "content.inspect",
    "evidence.discover", "evidence.draft", "evidence.inspect",
    "commitment.inspect",
    "party.inspect",
    "communication.converse",
    "money.inspect", "money.settle",
  ],
  seller: [
    "communication.amend", "communication.converse", "communication.discover", "communication.draft", "communication.verify",
    "content.automate", "content.converse",
    "evidence.amend", "evidence.draft", "evidence.inspect",
    "fulfillment.amend", "fulfillment.draft", "fulfillment.transition",
    "insight.discover", "insight.measure", "insight.publish",
    "money.amend", "money.draft", "money.inspect", "money.measure", "money.settle", "money.verify",
    "offering.amend", "offering.converse", "offering.discover", "offering.draft", "offering.publish",
    "order.amend", "order.converse", "order.draft", "order.inspect", "order.settle", "order.transition",
    "org.amend", "org.automate", "org.discover", "org.draft", "org.inspect",
    "party.amend", "party.discover", "party.inspect",
    "supply.draft", "supply.inspect", "supply.measure", "supply.publish",
    "agreement.amend", "agreement.draft", "agreement.verify",
  ],
  pharmacy: [
    "offering.draft", "offering.inspect",
    "fulfillment.amend", "fulfillment.draft", "fulfillment.transition",
    "money.inspect", "money.settle",
    "evidence.draft", "evidence.inspect", "evidence.verify",
    "org.draft", "org.inspect",
    "communication.converse",
    "order.inspect", "order.transition",
    "supply.draft", "supply.inspect", "supply.publish",
  ],
  affiliate: [
    "agreement.amend", "agreement.draft", "agreement.verify",
    "ai_system.draft",
    "communication.automate", "communication.converse", "communication.draft", "communication.inspect",
    "content.draft",
    "evidence.discover", "evidence.draft", "evidence.enforce", "evidence.inspect", "evidence.measure",
    "fulfillment.draft",
    "insight.discover", "insight.measure", "insight.publish",
    "money.amend", "money.draft", "money.enforce", "money.inspect", "money.publish", "money.settle", "money.transition",
    "offering.converse", "offering.discover", "offering.draft", "offering.verify",
    "org.amend", "org.automate", "org.discover", "org.draft", "org.inspect", "org.settle",
    "relationship.automate", "relationship.converse", "relationship.draft",
  ],
  advertiser: [
    "content.converse", "content.draft", "content.publish",
    "insight.discover", "insight.measure", "insight.publish", "insight.transition",
    "org.amend", "org.discover", "org.draft", "org.inspect",
    "party.discover", "party.inspect",
    "money.draft", "money.inspect", "money.settle",
    "communication.converse", "communication.draft",
  ],
};

export function capabilitiesForRole(role: string): readonly string[] {
  return (ROLE_CAPABILITIES as Record<string, readonly string[]>)[role] ?? [];
}

export function isDefinedRole(role: string): role is DefinedRole {
  return (ROLE_VOCABULARY as readonly string[]).includes(role);
}

// ---------------------------------------------------------------------------
// Module → capabilities: the bridge that lets a module grant count as
// capability EVIDENCE in a guard (requireCapabilityApi's module leg).
// A module is a packaging of capabilities (DOCX §2.7), not a second
// permission system: the module grant says the person works in that
// area, the role set says which verbs they may use there. BOTH must
// hold for the module leg to pass.
// ---------------------------------------------------------------------------
export const MODULE_CAPABILITIES: Record<string, readonly string[]> = {
  customers: ["party.amend", "party.converse", "party.discover", "party.draft", "party.inspect", "party.measure"],
  communications: ["communication.amend", "communication.automate", "communication.converse", "communication.discover", "communication.draft", "communication.inspect", "communication.measure", "communication.verify"],
  payments: ["money.draft", "money.inspect", "money.settle"],
  invoices: ["money.draft", "money.inspect"],
  deposits: ["money.draft", "money.inspect", "money.settle"],
  refunds_disputes: ["money.settle"],
  gift_cards_credits: ["money.draft", "money.settle"],
  orders: ["order.amend", "order.converse", "order.discover", "order.draft", "order.inspect", "order.measure", "order.publish", "order.settle", "order.transition", "order.verify"],
  inventory: ["supply.draft", "supply.inspect", "supply.measure", "supply.publish"],
  products_services: ["offering.amend", "offering.converse", "offering.discover", "offering.draft", "offering.inspect", "offering.measure", "offering.publish", "offering.verify"],
  purchasing: ["supply.draft", "supply.inspect", "order.draft"],
  sellers: ["org.amend", "org.discover", "org.draft", "org.inspect", "offering.amend", "offering.draft"],
  trust_safety: ["governance.automate", "governance.draft", "governance.inspect", "governance.measure", "governance.publish"],
  shipping: ["fulfillment.amend", "fulfillment.transition", "supply.publish"],
  marketing: ["content.amend", "content.converse", "content.draft", "content.inspect", "communication.converse"],
  analytics: ["insight.discover", "insight.measure", "insight.publish"],
  reports: ["insight.discover", "insight.measure", "insight.publish"],
  cms: ["content.amend", "content.converse", "content.draft", "content.inspect"],
  lms: ["content.draft", "content.inspect", "evidence.draft", "evidence.inspect"],
  policies: ["governance.automate", "governance.draft", "governance.inspect", "governance.measure", "governance.publish"],
  docs: ["evidence.amend", "evidence.discover", "evidence.draft", "evidence.inspect"],
  administration: ["governance.automate", "governance.draft", "governance.inspect", "governance.measure", "governance.publish", "org.amend"],
  accounting: ["money.amend", "money.converse", "money.discover", "money.draft", "money.inspect", "money.measure", "money.publish", "money.settle", "money.transition", "money.verify"],
  ai_ops: ["ai_system.amend", "ai_system.draft", "ai_system.inspect"],
  subscriptions: ["money.draft", "money.settle", "org.amend"],
  support: ["communication.converse", "communication.inspect", "evidence.inspect"],
  telemed: ["commitment.amend", "commitment.inspect", "commitment.transition", "evidence.verify"],
  social: ["content.amend", "content.converse", "content.draft", "content.inspect"],
  vet: ["commitment.amend", "commitment.inspect", "evidence.verify"],
};

// ---------------------------------------------------------------------------
// Seller section → capability: sellerSectionGuard's new test. A section
// is open to a team member exactly when the member's team-role
// capability subset contains ALL of the section's capabilities (AND,
// not ANY — the conjunction is what keeps section granularity
// expressible in capability terms). The subsets are DERIVED from
// ROLE_SECTIONS (team.ts) via this map, so the guard cannot drift
// from the nav contract. Equivalence was checked by hand over every
// section sellerSectionGuard actually guards × every team role: for
// those sections, section ∈ ROLE_SECTIONS[role] ⟺ the section's
// capabilities ⊆ the role's derived subset. Three sections need a
// two-capability conjunction to stay exact (a single verb would also
// pass for a role that does not open the section): promotions needs
// offering.amend + insight.discover (catalog has the first but not
// the second), pricing needs offering.amend + order.inspect (marketing
// has the first but not the second), brands needs offering.amend +
// supply.inspect (sales/marketing have the first but not the second).
// Sections with NO entry here deny every team member (performance,
// ai-ops) — exactly as nav does, since no role opens them — while
// owner/admin still pass via the full seller set. Baseline sections
// (dashboard, communication, docs, account) need no capability — every
// signed-in team member holds them, exactly as before.
// ---------------------------------------------------------------------------
export const SECTION_CAPABILITIES: Record<string, readonly string[]> = {
  customers: ["party.inspect"],
  appointments: ["commitment.inspect"],
  orders: ["order.inspect"],
  "order-details": ["order.inspect"],
  inventory: ["supply.inspect"],
  shipping: ["fulfillment.transition"],
  live: ["content.converse"],
  returns: ["order.transition"],
  "purchase-orders": ["order.draft"],
  "supplier-orders": ["order.draft"],
  products: ["offering.inspect"],
  catalog: ["offering.draft"],
  brands: ["offering.amend", "supply.inspect"],
  // Pricing needs margin measurement as well as offering amendment:
  // repricing without a margin view is how a catalog gets priced
  // below cost. The two roles that price (sales, catalog) hold
  // money.measure via TEAM_ROLE_EXTRA_CAPABILITIES below; marketing
  // — which runs promotions off existing prices — does not, which is
  // what keeps pricing exact (a pure section union cannot express it:
  // marketing shares every catalog verb through its catalog section).
  pricing: ["offering.amend", "money.measure"],
  promotions: ["offering.amend", "insight.discover"],
  social: ["content.converse"],
  advertising: ["insight.publish"],
  analytics: ["insight.discover"],
  reports: ["insight.measure"],
  payments: ["money.inspect"],
  deposits: ["money.settle"],
  refunds: ["money.settle"],
  "gift-cards": ["money.draft"],
  payroll: ["money.amend"],
  tax: ["money.amend"],
  taxes: ["money.amend"],
  banking: ["money.inspect"],
  invoices: ["money.draft"],
  bills: ["money.draft"],
  "financial-settings": ["money.amend"],
  "stripe-connections": ["money.amend"],
  governance: ["agreement.amend"],
  "trust-safety": ["governance.inspect"],
  policies: ["governance.inspect"],
  docs: ["evidence.inspect"],
  sellers: ["org.inspect"],
  "sellers/review-queue": ["offering.verify"],
  "sellers/advertising": ["insight.publish"],
  listings: ["offering.draft"],
  "catalog-review": ["offering.verify"],
  "brand-registry": ["offering.amend"],
  fees: ["money.amend"],
  "ai-ops": ["ai_system.inspect"],
  // performance: deliberately UNMAPPED — no team role opens it in nav,
  // so every team member is denied (owner/admin pass via the full set).
  messages: ["communication.converse"],
  "phone-messages": ["communication.converse"],
  subscriptions: ["money.settle"],
  documents: ["evidence.inspect"],
  calendar: ["commitment.inspect"],
  services: ["offering.inspect"],
  staff: ["org.inspect"],
  schedule: ["commitment.inspect"],
  pay: ["money.inspect"],
  hr: ["org.inspect"],
  pets: ["pet.inspect"],
  "grooming-records": ["fulfillment.inspect"],
  "my-learning": ["content.inspect"],
  "course-catalog": ["content.inspect"],
  "in-progress": ["content.inspect"],
  completed: ["content.inspect"],
  certificates: ["evidence.inspect"],
  resources: ["content.inspect"],
  newsletter: ["communication.converse"],
  books: ["content.inspect"],
  filters: ["offering.inspect"],
  categories: ["offering.inspect"],
  settings: ["org.amend"],
};

/** Team-role capability subsets, derived from ROLE_SECTIONS via
 *  SECTION_CAPABILITIES: a team role's capabilities are the union of
 *  its sections' capabilities (baseline sections contribute none).
 *  Owner/admin hold the full seller set. Computed here, not stored,
 *  so the two contracts cannot drift apart. */
export function teamRoleCapabilities(role: string, sections: readonly string[] | "all"): readonly string[] {
  if (sections === "all") return ROLE_CAPABILITIES.seller;
  const out = new Set<string>();
  for (const section of sections) {
    for (const cap of SECTION_CAPABILITIES[section] ?? []) out.add(cap);
  }
  for (const cap of TEAM_ROLE_EXTRA_CAPABILITIES[role] ?? []) out.add(cap);
  return [...out];
}

/** Per-role capabilities that section membership alone cannot express
 *  (see the pricing note above): the roles that price hold
 *  money.measure for margin-aware repricing. Every other team-role
 *  capability comes from the section derivation. */
export const TEAM_ROLE_EXTRA_CAPABILITIES: Record<string, readonly string[]> = {
  sales: ["money.measure"],
  catalog: ["money.measure"],
};
