// ---------------------------------------------------------------------------
// Trust & Safety vocabularies (Admin Portal Tree §F).
//
// The type vocabularies ARE the tree's leaf names — F2's five appeal
// leaves and F3's five investigation leaves — enforced in the live schema
// by CHECK constraints (DDL 20261072, applied directly in Supabase; the
// .sql file is the record). Every writer sets the type at birth; the
// per-type queues in the §F faces are views over these values.
// ---------------------------------------------------------------------------

export const APPEAL_TYPES = [
  "account_suspension",
  "dispute_decision",
  "privacy",
  "reinstatement",
  "de_escalation",
] as const;
export type AppealType = (typeof APPEAL_TYPES)[number];

export const APPEAL_TYPE_LABELS: Record<AppealType, string> = {
  account_suspension: "Account suspension appeals",
  dispute_decision: "Dispute decision appeals",
  privacy: "Privacy appeals",
  reinstatement: "Reinstatement requests",
  de_escalation: "De-escalation requests",
};

/** Appeal types a SELLER files from the seller portal (privacy is the
 * customer portal's leaf — the customer files it, never a seller). */
export const SELLER_APPEAL_TYPES = [
  "account_suspension",
  "dispute_decision",
  "reinstatement",
  "de_escalation",
] as const;

export const INVESTIGATION_TYPES = [
  "counterfeit",
  "stolen_property",
  "ip_infringement",
  "fraud_patterns",
  "safety_incidents",
] as const;
export type InvestigationType = (typeof INVESTIGATION_TYPES)[number];

export const INVESTIGATION_TYPE_LABELS: Record<InvestigationType, string> = {
  counterfeit: "Counterfeit investigations",
  stolen_property: "Stolen property",
  ip_infringement: "IP infringement",
  fraud_patterns: "Fraud patterns",
  safety_incidents: "Safety incidents",
};

export function isAppealType(v: unknown): v is AppealType {
  return typeof v === "string" && (APPEAL_TYPES as readonly string[]).includes(v);
}

export function isInvestigationType(v: unknown): v is InvestigationType {
  return typeof v === "string" && (INVESTIGATION_TYPES as readonly string[]).includes(v);
}
