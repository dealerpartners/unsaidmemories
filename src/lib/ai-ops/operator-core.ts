// ---------------------------------------------------------------------------
// ai-ops/operator-core.ts — the PURE half of the AI OPERATOR layer (Admin §J
// deepening, Sunny's doctrine 2026-10-14 ~18:21 CDT: "it needs to be more
// than a chat bot — if i click it to build a product category and sub
// category or manage a high risk seller but more importantly to manage
// fraud — thats what the platform should do, not just ask and answer,
// but a real scanner that hints detects responds").
//
// No imports, no database: input validation, the taxonomy slug/path
// builders, and the signal → policy-citation seat map. The database half
// lives in operator.ts and uses these verbatim, so what is proven against
// this file is what the routes run.
// ---------------------------------------------------------------------------

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// --- Scanner signals -------------------------------------------------------
// Every signal the fraud scanner evaluates deterministically over recorded
// facts. A detection's evidence always resolves to real rows (ids + counts
// read at scan time); the scanner never fabricates a signal.

export const OPERATOR_SIGNALS = [
  "refund_fraud",
  "dispute_open",
  "order_sla",
  "dmca_repeat",
  "optout_listing",
  "review_burst",
  "seller_risk",
] as const;
export type OperatorSignal = (typeof OPERATOR_SIGNALS)[number];

export const SIGNAL_LABELS: Record<OperatorSignal, string> = {
  refund_fraud: "Refund coded fraud",
  dispute_open: "Open payment dispute",
  order_sla: "Order SLA breach / stuck",
  dmca_repeat: "Repeat DMCA subject (3 strikes)",
  optout_listing: "Listing under an applied brand opt-out",
  review_burst: "Review burst pattern",
  seller_risk: "Seller risk composite",
};

// --- Policy citations ------------------------------------------------------
// Enforcement cites the RECORDED community guidelines + policies (Sunny,
// 2026-10-14 ~18:24 CDT). The seats, in resolution order per signal:
//   1. the governing RECORD itself where the signal is a record's breach
//      (an applied brand opt-out in public.brand_opt_outs);
//   2. a PUBLISHED seller policy (public.seller_policies, the M3 machinery)
//      whose category/title matches the signal's conduct;
//   3. the SITE policies (doc store — the /policies surface) by the
//      title the signal maps to below.
// A citation that resolves to no recorded row (id null) is named as such on
// the detection — and the consequential responses (case, freeze,
// suspension) REFUSE without a resolved citation (see validateResponse).

export interface CitationSeat {
  /** site policies title this signal's conduct is governed by. */
  siteTitle: string;
  /** seller_policies match terms (category or title, case-insensitive). */
  sellerTerms: string[];
}

export const SIGNAL_CITATIONS: Record<OperatorSignal, CitationSeat> = {
  refund_fraud: { siteTitle: "REFUNDS & RETURNS", sellerTerms: ["refund", "fraud"] },
  dispute_open: { siteTitle: "REFUNDS & RETURNS", sellerTerms: ["chargeback", "dispute", "payment"] },
  order_sla: { siteTitle: "SHIPPING & DELIVERY", sellerTerms: ["fulfillment", "shipping", "delivery"] },
  dmca_repeat: { siteTitle: "TERMS OF SERVICE", sellerTerms: ["copyright", "intellectual", "dmca"] },
  optout_listing: { siteTitle: "TERMS OF SERVICE", sellerTerms: ["brand", "intellectual", "copyright"] },
  review_burst: { siteTitle: "TERMS OF SERVICE", sellerTerms: ["review", "community"] },
  seller_risk: { siteTitle: "TERMS OF SERVICE", sellerTerms: ["seller", "marketplace", "conduct"] },
};

export interface PolicyCitation {
  source: "brand_opt_outs" | "seller_policies" | "site_policies";
  id: string | null;
  title: string | null;
  version: number | null;
}

/** A citation counts as RESOLVED only when it names a recorded row. */
export function citationResolved(c: PolicyCitation | null | undefined): boolean {
  return !!c && typeof c.id === "string" && UUID_RE.test(c.id);
}

// --- Responses -------------------------------------------------------------
// The governed response acts an operator applies from a detection. Every
// act is applied BY A HUMAN from the task (state proposed → applied, the
// decider stamped) — except the one leg Sunny named automatic: a filed
// Case locks the payout (the case is born 'frozen' when the response set
// includes the freeze, per the decided Connect model).

export const RESPONSE_KINDS = [
  "open_case",
  "freeze_payout",
  "notify",
  "suspend_seller_temporary",
] as const;
export type ResponseKind = (typeof RESPONSE_KINDS)[number];

/** Responses that move governance state — citation + reason are mandatory. */
export const CONSEQUENTIAL_RESPONSES: readonly string[] = [
  "open_case",
  "freeze_payout",
  "suspend_seller_temporary",
];

export interface ResponseInput {
  response: string;
  reason?: string | null;
  citation?: PolicyCitation | null;
  case_id?: string | null;
  audience?: string | null;
}

export function validateResponseInput(
  input: ResponseInput,
): { ok: true } | { ok: false; error: string } {
  if (!(RESPONSE_KINDS as readonly string[]).includes(input.response)) {
    return {
      ok: false,
      error: `response must be one of: ${RESPONSE_KINDS.join(", ")}`,
    };
  }
  const reason = String(input.reason ?? "").trim();
  if (!reason) {
    return { ok: false, error: "A reason is required — a governed response never lands unexplained." };
  }
  if (CONSEQUENTIAL_RESPONSES.includes(input.response)) {
    if (!citationResolved(input.citation)) {
      return {
        ok: false,
        error:
          "A cited policy is required for this response — enforcement cites the recorded community guidelines + policies, and no recorded policy was cited.",
      };
    }
  }
  if (input.response === "freeze_payout") {
    if (!input.case_id || !UUID_RE.test(input.case_id)) {
      return {
        ok: false,
        error: "freeze_payout requires the case to freeze (case_id) — open the case first; a filed Case is what locks the payout.",
      };
    }
  }
  if (input.response === "notify") {
    const a = String(input.audience ?? "");
    if (!["seller", "staff", "customer"].includes(a)) {
      return { ok: false, error: "notify requires audience: seller, staff, or customer." };
    }
  }
  return { ok: true };
}

// --- Taxonomy builders -----------------------------------------------------
// taxonomy_nodes conventions, read firsthand from the live tree (436
// nodes): slug is the kebab of the name with "&" read as "and"; path is
// the parent's path + "/" + slug (roots are "/shop/<slug>"); depth is the
// parent's depth + 1; node_type descends animal → department → category →
// subcategory and no deeper.

export function slugifyNodeName(name: string): string {
  return name
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const NODE_TYPE_DESCENT: Record<string, string | null> = {
  animal: "department",
  department: "category",
  category: "subcategory",
  subcategory: null,
};

export function childNodeType(parentType: string): string | null {
  return NODE_TYPE_DESCENT[parentType] ?? null;
}

export function childNodePath(parentPath: string, slug: string): string {
  return `${parentPath.replace(/\/+$/, "")}/${slug}`;
}
