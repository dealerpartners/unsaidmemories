// ---------------------------------------------------------------------------
// Seller team roles — the shared contract for seller team membership.
//
// A seller (the owner) invites team members by email into seller_users
// with one of these roles. The role decides which seller-center sections
// the member can open (nav locks in src/lib/sellers/nav.ts) and which
// /api/seller routes answer them (sellerSectionGuard in api-context.ts).
// One map, three consumers — nav, shell, and API guards all read THIS
// file, so the surfaces can never drift apart.
//
// Baseline sections for EVERY role: dashboard (home), communication
// (messages/support), docs (how-to), account (own profile/settings).
// "owner" and "admin" are the store's own full-access roles; team
// management itself (invite / change role / remove) requires one of
// them (TEAM_MANAGER_ROLES) — a logistics hire can never mint admins.
// ---------------------------------------------------------------------------

import type { DawgNavSection } from "@/lib/types";

export const TEAM_ROLES = [
  "owner",
  "admin",
  "logistics",
  "sales",
  "marketing",
  "go_live_talent",
  "ap",
  "receivables",
  "fulfillment",
  "support",
  "catalog",
] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  owner: "Owner",
  admin: "Admin",
  logistics: "Logistics",
  sales: "Sales",
  marketing: "Marketing",
  go_live_talent: "Go Live Talent",
  ap: "Accounts Payable (AP)",
  receivables: "Accounts Receivable",
  fulfillment: "Fulfillment",
  support: "Support",
  catalog: "Catalog",
};

export const TEAM_ROLE_DESCRIPTIONS: Record<TeamRole, string> = {
  owner: "Full access, including team management and account settings.",
  admin: "Full access to the seller center, including team management.",
  logistics: "Orders, shipping, inventory and returns — the fulfillment floor.",
  sales: "Orders, customers, catalog, pricing, promotions and sales reporting.",
  marketing: "Social, advertising, promotions, live, customers and marketing analytics.",
  go_live_talent: "Runs live selling sessions and the social that promotes them.",
  ap: "Payments out: payouts, fees, tax and payment reporting.",
  receivables: "Money in: orders, returns/refunds, payments and revenue reporting.",
  fulfillment: "Orders, shipping, inventory and returns.",
  support: "Messages, orders and customer lookup, and governance responses.",
  catalog: "Catalog, products, inventory and pricing.",
};

const BASELINE: DawgNavSection[] = ["dashboard", "communication", "docs", "account"];

export const ROLE_SECTIONS: Record<TeamRole, DawgNavSection[] | "all"> = {
  owner: "all",
  admin: "all",
  logistics: [...BASELINE, "orders", "shipping", "inventory", "returns"],
  sales: [...BASELINE, "orders", "customers", "catalog", "pricing", "promotions", "analytics", "reports"],
  marketing: [...BASELINE, "social", "advertising", "promotions", "catalog", "analytics", "live", "customers"],
  go_live_talent: [...BASELINE, "live", "social", "catalog"],
  ap: [...BASELINE, "payments", "tax", "reports", "orders"],
  receivables: [...BASELINE, "payments", "orders", "returns", "reports", "analytics"],
  fulfillment: [...BASELINE, "orders", "shipping", "inventory", "returns"],
  support: [...BASELINE, "orders", "customers", "governance"],
  catalog: [...BASELINE, "catalog", "inventory", "pricing", "brands"],
};

/** Roles allowed to invite, re-role, suspend, or remove team members. */
export const TEAM_MANAGER_ROLES: readonly string[] = ["owner", "admin"];

export function isTeamRole(value: string): value is TeamRole {
  return (TEAM_ROLES as readonly string[]).includes(value);
}

/** Can this role open this section at all? Unknown roles open nothing
 * beyond the baseline every signed-in team member needs. */
export function roleAllowsSection(role: string, section: DawgNavSection): boolean {
  if (isTeamRole(role)) {
    const allowed = ROLE_SECTIONS[role];
    if (allowed === "all") return true;
    return allowed.includes(section);
  }
  return BASELINE.includes(section);
}

/** The sections a role opens — used by the shell/nav lock computation. */
export function sectionsForRole(role: string): DawgNavSection[] | "all" {
  if (isTeamRole(role)) return ROLE_SECTIONS[role];
  return BASELINE;
}
