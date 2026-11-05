import { getTenantId } from "@/lib/tenant";
// Trust & Safety + Support Desk — shared vocabulary.
// Adapted from UnSaid Memories src/lib/support/tickets.ts (branch 10-28-2026) for Unsaid:
// no seller portal — requester types cover customers, staff, partners and
// external requesters; "seller_id" columns in the ported schema hold the
// subject account id (customer or partner) a case is about.

export function tenantId(): string {
  return getTenantId();
}

export const TICKET_STATUSES = ["open", "pending", "resolved", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const REQUESTER_TYPES = ["customer", "employee", "partner", "franchise", "external"] as const;
export type RequesterType = (typeof REQUESTER_TYPES)[number];

export const REQUESTER_LABELS: Record<string, string> = {
  customer: "Customer",
  employee: "Employee",
  partner: "Partner",
  seller: "Partner",
  franchise: "Franchise",
  external: "External",
  vet: "Partner",
  pharmacy: "Partner",
};

/** Departments = support_categories codes (the desk's category vocabulary). */
export const DEPARTMENTS = [
  { code: "general", label: "General" },
  { code: "billing", label: "Billing" },
  { code: "technical", label: "Technical" },
  { code: "seller_support", label: "Partner Support" },
  { code: "payments", label: "Payments" },
  { code: "dmca", label: "Legal / DMCA" },
  { code: "chargeback", label: "Chargebacks" },
  { code: "privacy_request", label: "Privacy" },
  { code: "trust_safety", label: "Trust & Safety" },
  { code: "legal", label: "Legal" },
  { code: "feedback", label: "Feedback" },
  { code: "contact", label: "Contact" },
] as const;
export const DEPARTMENT_LABELS: Record<string, string> = Object.fromEntries(
  DEPARTMENTS.map((d) => [d.code, d.label])
);

export const SORTS = [
  { code: "recent", label: "Recent activity" },
  { code: "oldest_activity", label: "Oldest activity" },
  { code: "priority", label: "Priority first" },
  { code: "sla", label: "SLA due first" },
  { code: "newest", label: "Newest first" },
  { code: "oldest", label: "Oldest first" },
] as const;

export const RELATION_TYPES = ["duplicate_of", "related", "child", "problem", "incident"] as const;
export const RELATION_LABELS: Record<string, string> = {
  duplicate_of: "Duplicate of",
  related: "Related",
  child: "Child",
  problem: "Problem",
  incident: "Incident",
};

export const ACTION_TYPES = ["refund", "store_credit", "listing_takedown", "account_change"] as const;
export const ACTION_LABELS: Record<string, string> = {
  refund: "Refund",
  store_credit: "Store credit",
  listing_takedown: "Listing takedown",
  account_change: "Account change",
};
/** Money actions at or above this amount wait for an approver (Sunny's rule, from UnSaid Memories desk). */
export const APPROVAL_THRESHOLD = 100;

export const LINK_TYPES = ["order", "payment", "listing", "customer", "appointment", "prescription"] as const;

export function fmtDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
export function fmtMoney(n?: number | null): string {
  if (n == null) return "—";
  return `$${Number(n).toFixed(2)}`;
}
export function timeAgo(iso?: string | null): string {
  if (!iso) return "—";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
