// ---------------------------------------------------------------------------
// ai-ops/operator.ts — the AI OPERATOR layer (Admin §J deepening, Sunny's
// doctrine 2026-10-14 ~18:21–18:24 CDT):
//
//   "it needs to be more than a chat bot — if i click it to build a
//    product category and sub category or manage a high risk seller but
//    more importantly to manage fraud — thats what the platform should
//    do, not just ask and answer, but a real scanner that hints detects
//    responds."
//
// §J built the records layer (public.ai_tasks, 20261061). This lib is the
// layer WORKING, in three parts:
//
//   1. THE FRAUD SCANNER — deterministic evaluations over RECORDED facts
//      (no model judgment is faked: where an evaluation would need a
//      model's eye, the record carries the seam — the ai_tasks row itself,
//      function 'fraud_scan' — and the deterministic legs are what run).
//      Every detection lands as an ai_task in state 'proposed' with its
//      evidence (the row ids + counts it rests on) and its policy
//      citation (the recorded community guidelines + policies — seller
//      policies via the M3 machinery, site policies via the doc store,
//      and for opt-out breaches the applied opt-out record itself).
//   2. RESPONSES — governed acts a HUMAN applies from a detection:
//      open a case (seller_disputes / order_cases, the stores' own
//      shapes), freeze the payout (the Trust Center's frozen state —
//      the decided model: a filed Case locks the payout), notify
//      (seller / staff / customer notification stores), and TEMPORARY
//      SUSPENSION of a seller through the sellers status write shape —
//      recorded as temporary ON THE CASE (its evidence carries the
//      suspension fact; reinstatement is the paired governed act below),
//      never a silent permanent state. A response without a cited,
//      recorded policy + a reason is REFUSED (operator-core validation +
//      the citation row is re-verified against its seat here).
//   3. DIRECTED ACTIONS — an admin's click executes a governed act:
//      build a category (+ subcategory) on taxonomy_nodes through its
//      own conventions, and the high-risk seller file (getSellerRiskFile)
//      with the response acts attached.
//
// SOCIAL WATCH: the watch includes reviews (live — the review_burst
// detector) and SOCIAL-MEDIA COMMENTS. No social ingestion exists in
// this codebase (firsthand census: no connector, no store, no reader) —
// the registry carries the 'social_watch' seat and the operator face
// states the gap. No feed is faked.
//
// Tenancy: tenant_id is a predicate in every statement. Gate: the routes
// ride requireModuleApi("ai_ops", …) — the AI layer's own module.
// ---------------------------------------------------------------------------

import { writeSellerAudit } from "@/lib/sellers/audit";
import { buildCaseFreezeCall } from "@/lib/stripe-connect-payloads";
import {
  UUID_RE,
  SIGNAL_CITATIONS,
  SIGNAL_LABELS,
  citationResolved,
  validateResponseInput,
  slugifyNodeName,
  childNodeType,
  childNodePath,
  type OperatorSignal,
  type PolicyCitation,
  type ResponseInput,
} from "@/lib/ai-ops/operator-core";

type Client = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;
};

const str = (v: unknown): string | null =>
  v == null ? null : typeof v === "string" ? v : String(v);
const num = (v: unknown): number => (v == null ? 0 : Number(v) || 0);

// ===========================================================================
// Policy citations — resolve a signal's citation against the recorded seats.
// ===========================================================================

export async function resolveCitation(
  c: Client,
  tenant: string,
  signal: OperatorSignal,
  ctx?: { brandId?: string | null },
): Promise<PolicyCitation> {
  const seat = SIGNAL_CITATIONS[signal];
  // 1. The governing record itself (an applied brand opt-out).
  if (signal === "optout_listing" && ctx?.brandId) {
    const { rows } = await c.query(
      `SELECT id, strength FROM public.brand_opt_outs
        WHERE tenant_id = $1 AND brand_id = $2::uuid AND status = 'applied'
        ORDER BY applied_at DESC NULLS LAST LIMIT 1`,
      [tenant, ctx.brandId],
    );
    if (rows[0]) {
      return {
        source: "brand_opt_outs",
        id: String(rows[0].id),
        title: `Brand opt-out (${rows[0].strength === "ever" ? "never sell" : "by approval"})`,
        version: null,
      };
    }
  }
  // 2. A published seller policy (M3 machinery) matching the conduct.
  const patterns = seat.sellerTerms.map((t) => `%${t}%`);
  const { rows: sp } = await c.query(
    `SELECT id, title, current_version FROM public.seller_policies
      WHERE tenant_id = $1 AND status = 'published'
        AND (lower(category) LIKE ANY($2::text[]) OR lower(title) LIKE ANY($2::text[]))
      ORDER BY updated_at DESC LIMIT 1`,
    [tenant, patterns],
  );
  if (sp[0]) {
    return {
      source: "seller_policies",
      id: String(sp[0].id),
      title: String(sp[0].title),
      version: num(sp[0].current_version) || null,
    };
  }
  // 3. The site policies (the /policies surface — community guidelines seat).
  // BL-13: site policies live in the one policy store (seller_policies,
  // category 'Site policy') — the same store step 2 reads for seller
  // policies; the doc store's policy content-type is retired.
  const { rows: site } = await c.query(
    `SELECT id, title FROM public.seller_policies WHERE tenant_id = $1 AND category = 'Site policy' AND title = $2 LIMIT 1`,
    [tenant, seat.siteTitle],
  );
  if (site[0]) {
    return { source: "site_policies", id: String(site[0].id), title: String(site[0].title), version: null };
  }
  return { source: "site_policies", id: null, title: seat.siteTitle, version: null };
}

/** Re-verify a citation names a live recorded row in its seat (the
 *  anti-fabrication leg of the response gate). */
async function verifyCitationRow(
  c: Client,
  tenant: string,
  citation: PolicyCitation,
): Promise<boolean> {
  if (!citationResolved(citation)) return false;
  const table =
    citation.source === "brand_opt_outs" ? "public.brand_opt_outs" : "public.seller_policies";
  const extra =
    citation.source === "brand_opt_outs"
      ? "AND status = 'applied'"
      : citation.source === "site_policies"
        ? "AND category = 'Site policy'"
        : "";
  // All seats carry uuid ids (the site-policy seat lives in
  // seller_policies since BL-13; its ids are uuids like the others).
  const idExpr = "$2::uuid";
  const { rows } = await c.query(
    `SELECT id FROM ${table} WHERE tenant_id = $1 AND id = ${idExpr} ${extra} LIMIT 1`,
    [tenant, citation.id],
  );
  return rows.length > 0;
}

// ===========================================================================
// 1. THE FRAUD SCANNER — deterministic detectors over recorded facts.
// ===========================================================================

export interface DetectionDraft {
  signal: OperatorSignal;
  subject_type: string;
  subject_id: string | null;
  subject_key: string;
  severity: "high" | "medium" | "low";
  evidence: Record<string, unknown>;
  recommended_responses: string[];
  brand_id?: string | null;
}

const DETECTOR_CAP = 100;

async function detectRefundFraud(c: Client, tenant: string): Promise<DetectionDraft[]> {
  const { rows } = await c.query(
    `SELECT id, refund_number, amount::float AS amount, status, sale_id, payment_id, created_at
       FROM public.commerce_refunds
      WHERE tenant_id = $1 AND reason_code = 'fraud'
        AND status NOT IN ('rejected','void','cancelled')
      ORDER BY created_at DESC LIMIT ${DETECTOR_CAP}`,
    [tenant],
  );
  return rows.map((r) => ({
    signal: "refund_fraud" as const,
    subject_type: "refund",
    subject_id: String(r.id),
    subject_key: `refund:${r.id}`,
    severity: "high" as const,
    evidence: {
      refund_number: r.refund_number,
      amount: num(r.amount),
      status: r.status,
      sale_id: r.sale_id,
      payment_id: r.payment_id,
      recorded_at: r.created_at,
    },
    recommended_responses: ["notify"],
  }));
}

async function detectOpenDisputes(c: Client, tenant: string): Promise<DetectionDraft[]> {
  const { rows } = await c.query(
    `SELECT id, dispute_number, reason, status, amount::float AS amount, payment_id, sale_id, opened_at
       FROM public.commerce_disputes
      WHERE tenant_id = $1 AND resolved_at IS NULL
      ORDER BY opened_at DESC LIMIT ${DETECTOR_CAP}`,
    [tenant],
  );
  return rows.map((r) => ({
    signal: "dispute_open" as const,
    subject_type: "dispute",
    subject_id: String(r.id),
    subject_key: `dispute:${r.id}`,
    severity: (num(r.amount) >= 100 ? "high" : "medium") as "high" | "medium",
    evidence: {
      dispute_number: r.dispute_number,
      reason: r.reason,
      status: r.status,
      amount: num(r.amount),
      payment_id: r.payment_id,
      sale_id: r.sale_id,
      opened_at: r.opened_at,
    },
    recommended_responses: ["notify"],
  }));
}

// §C's facet predicates, verbatim from src/app/api/admin/orders/route.ts
// (the oversight queue's standing 48h conventions, original tree §2.1).
const ORDER_TERMINAL = `(upper(o.fulfillment_status) IN ('DELIVERED','CANCELLED') OR upper(o.status) IN ('CANCELLED','REFUNDED'))`;
const ORDER_SLA = `NOT ${ORDER_TERMINAL} AND upper(o.fulfillment_status) IN ('PENDING','UNFULFILLED','PROCESSING') AND o.created_at < now() - interval '48 hours'`;
const ORDER_STUCK = `NOT ${ORDER_TERMINAL} AND o.updated_at < now() - interval '48 hours'`;

async function detectOrderSla(c: Client, tenant: string): Promise<DetectionDraft[]> {
  const { rows } = await c.query(
    `SELECT o.id, o.status, o.fulfillment_status, o.payment_status, o.created_at, o.updated_at,
            (${ORDER_SLA}) AS sla_breach, (${ORDER_STUCK}) AS stuck
       FROM public.commerce_orders o
      WHERE o.tenant_id = $1 AND ((${ORDER_SLA}) OR (${ORDER_STUCK}))
      ORDER BY o.created_at ASC LIMIT ${DETECTOR_CAP}`,
    [tenant],
  );
  return rows.map((r) => {
    const breach = r.sla_breach ? "sla_breach" : "stuck";
    return {
      signal: "order_sla" as const,
      subject_type: "order",
      subject_id: UUID_RE.test(String(r.id)) ? String(r.id) : null,
      subject_key: `order:${r.id}`,
      severity: (r.sla_breach ? "medium" : "low") as "medium" | "low",
      evidence: {
        order_id: String(r.id),
        status: r.status,
        fulfillment_status: r.fulfillment_status,
        payment_status: r.payment_status,
        breach,
        created_at: r.created_at,
        updated_at: r.updated_at,
      },
      recommended_responses: ["open_case", "notify"],
    };
  });
}

async function detectDmcaRepeat(c: Client, tenant: string): Promise<DetectionDraft[]> {
  const { rows } = await c.query(
    `SELECT target_seller_id, count(*)::int AS claims,
            array_agg(id) AS detail_ids, array_agg(ticket_id) AS ticket_ids
       FROM public.dmca_details
      WHERE tenant_id = $1 AND target_seller_id IS NOT NULL
      GROUP BY target_seller_id HAVING count(*) >= 3`,
    [tenant],
  );
  return rows.map((r) => ({
    signal: "dmca_repeat" as const,
    subject_type: "seller",
    subject_id: String(r.target_seller_id),
    subject_key: `seller:${r.target_seller_id}`,
    severity: "high" as const,
    evidence: {
      dmca_claims: num(r.claims),
      detail_ids: r.detail_ids,
      ticket_ids: r.ticket_ids,
      strikes_rule:
        "Three DMCA strikes hand to ONE governance case (the support desk never suspends; governance decides).",
    },
    recommended_responses: ["open_case", "freeze_payout", "suspend_seller_temporary", "notify"],
  }));
}

const OPTOUT_JOIN = `
  FROM public.seller_listings l
  JOIN public.brands b ON b.tenant_id = l.tenant_id AND lower(b.name) = lower(l.brand)
  JOIN public.brand_opt_outs oo ON oo.tenant_id = l.tenant_id AND oo.brand_id = b.id AND oo.status = 'applied'
 WHERE l.tenant_id = $1 AND l.suppression_reason IS NULL`;

async function detectOptoutListings(c: Client, tenant: string): Promise<DetectionDraft[]> {
  const { rows } = await c.query(
    `SELECT l.id, l.seller_id, l.title, l.brand, l.status,
            oo.id AS optout_id, oo.strength, b.id AS brand_id, b.name AS brand_name
     ${OPTOUT_JOIN}
      ORDER BY l.created_at DESC LIMIT ${DETECTOR_CAP}`,
    [tenant],
  );
  return rows.map((r) => ({
    signal: "optout_listing" as const,
    subject_type: "listing",
    subject_id: String(r.id),
    subject_key: `listing:${r.id}`,
    severity: (r.strength === "ever" ? "high" : "medium") as "high" | "medium",
    evidence: {
      listing_title: r.title,
      listing_status: r.status,
      seller_id: r.seller_id,
      brand: r.brand_name,
      optout_id: r.optout_id,
      strength: r.strength,
    },
    recommended_responses: ["open_case", "notify"],
    brand_id: String(r.brand_id),
  }));
}

async function detectReviewBursts(c: Client, tenant: string): Promise<DetectionDraft[]> {
  const drafts: DetectionDraft[] = [];
  const { rows: byCustomer } = await c.query(
    `SELECT customer_id, count(*)::int AS n, array_agg(id) AS review_ids,
            min(created_at) AS first_at, max(created_at) AS last_at
       FROM public.reviews
      WHERE tenant_id = $1 AND customer_id IS NOT NULL
        AND created_at > now() - interval '24 hours'
      GROUP BY customer_id HAVING count(*) >= 4`,
    [tenant],
  );
  for (const r of byCustomer) {
    drafts.push({
      signal: "review_burst",
      subject_type: "reviewer",
      subject_id: null,
      subject_key: `reviewer:${r.customer_id}`,
      severity: "medium",
      evidence: {
        customer_id: r.customer_id,
        reviews_in_window: num(r.n),
        review_ids: r.review_ids,
        window_hours: 24,
        first_at: r.first_at,
        last_at: r.last_at,
        pattern: "same reviewer, 4+ reviews in 24h",
      },
      recommended_responses: ["notify"],
    });
  }
  const { rows: byProduct } = await c.query(
    `SELECT product_id, count(*)::int AS n, count(DISTINCT customer_id)::int AS reviewers,
            array_agg(id) AS review_ids
       FROM public.reviews
      WHERE tenant_id = $1 AND created_at > now() - interval '24 hours'
      GROUP BY product_id HAVING count(*) >= 5 AND count(DISTINCT customer_id) >= 3`,
    [tenant],
  );
  for (const r of byProduct) {
    drafts.push({
      signal: "review_burst",
      subject_type: "product",
      subject_id: String(r.product_id),
      subject_key: `product:${r.product_id}`,
      severity: "medium",
      evidence: {
        product_id: r.product_id,
        reviews_in_window: num(r.n),
        distinct_reviewers: num(r.reviewers),
        review_ids: r.review_ids,
        window_hours: 24,
        pattern: "product pile-on, 5+ reviews from 3+ reviewers in 24h",
      },
      recommended_responses: ["notify"],
    });
  }
  return drafts;
}

async function detectSellerRisk(c: Client, tenant: string): Promise<DetectionDraft[]> {
  // The composite counts RECORDED adverse facts only. Orders carry no
  // seller attribution (§C + §I, proven firsthand), so a per-seller
  // late/stuck share does not exist and is NOT part of this composite —
  // the formula is printed on every detection's evidence.
  const { rows } = await c.query(
    `SELECT s.id,
       (SELECT count(*)::int FROM public.seller_disputes d
         WHERE d.tenant_id = s.tenant_id AND d.seller_id = s.id
           AND d.status IS DISTINCT FROM 'released' AND d.status IS DISTINCT FROM 'refunded'
           AND d.status IS DISTINCT FROM 'reversed') AS open_cases,
       (SELECT count(*)::int FROM public.seller_disputes d
         WHERE d.tenant_id = s.tenant_id AND d.seller_id = s.id AND d.status = 'frozen') AS frozen_cases,
       (SELECT count(*)::int FROM public.seller_violations v
         WHERE v.tenant_id = s.tenant_id AND v.seller_id = s.id) AS violations,
       (SELECT count(*)::int FROM public.dmca_details dd
         WHERE dd.tenant_id = s.tenant_id AND dd.target_seller_id = s.id) AS dmca_claims,
       (SELECT count(*)::int ${OPTOUT_JOIN.replace("l.tenant_id = $1", "l.tenant_id = s.tenant_id")} AND l.seller_id = s.id) AS optout_listings
     FROM public.sellers s
     WHERE s.tenant_id = $1`,
    [tenant],
  );
  const drafts: DetectionDraft[] = [];
  for (const r of rows) {
    const components = {
      open_cases: num(r.open_cases),
      frozen_cases: num(r.frozen_cases),
      violations: num(r.violations),
      dmca_claims: num(r.dmca_claims),
      optout_listings: num(r.optout_listings),
    };
    const score =
      components.open_cases +
      components.frozen_cases +
      components.violations +
      components.dmca_claims +
      components.optout_listings;
    if (score < 2) continue;
    drafts.push({
      signal: "seller_risk",
      subject_type: "seller",
      subject_id: String(r.id),
      subject_key: `seller:${r.id}`,
      severity: score >= 4 ? "high" : "medium",
      evidence: {
        ...components,
        score,
        formula:
          "score = open cases + frozen cases + violations + DMCA claims + opt-out listings (recorded adverse facts; orders carry no seller attribution, so no per-seller order share is counted)",
      },
      recommended_responses: ["open_case", "freeze_payout", "suspend_seller_temporary", "notify"],
    });
  }
  return drafts;
}

const DETECTORS: { signal: OperatorSignal; run: (c: Client, t: string) => Promise<DetectionDraft[]> }[] = [
  { signal: "refund_fraud", run: detectRefundFraud },
  { signal: "dispute_open", run: detectOpenDisputes },
  { signal: "order_sla", run: detectOrderSla },
  { signal: "dmca_repeat", run: detectDmcaRepeat },
  { signal: "optout_listing", run: detectOptoutListings },
  { signal: "review_burst", run: detectReviewBursts },
  { signal: "seller_risk", run: detectSellerRisk },
];

export interface ScanResult {
  run_task_id: string;
  detections_created: number;
  by_signal: Record<string, number>;
  skipped_duplicates: number;
  detector_errors: Record<string, string>;
  detections: { id: string; signal: string; subject_key: string; severity: string }[];
}

export async function runFraudScan(
  c: Client,
  tenant: string,
  actorId: string | null,
  ipAddress: string | null,
): Promise<ScanResult> {
  const drafts: DetectionDraft[] = [];
  const detectorErrors: Record<string, string> = {};
  for (const d of DETECTORS) {
    try {
      drafts.push(...(await d.run(c, tenant)));
    } catch (e: any) {
      detectorErrors[d.signal] = String(e?.message || e);
    }
  }
  // Dedupe against detections still awaiting a human decision.
  const { rows: open } = await c.query(
    `SELECT output->>'signal' AS signal, output->>'subject_key' AS subject_key
       FROM public.ai_tasks
      WHERE tenant_id = $1 AND function = 'fraud_scan' AND state = 'proposed'`,
    [tenant],
  );
  const openKeys = new Set(open.map((r) => `${r.signal}::${r.subject_key}`));

  const created: ScanResult["detections"] = [];
  const bySignal: Record<string, number> = {};
  let skipped = 0;
  for (const draft of drafts) {
    const key = `${draft.signal}::${draft.subject_key}`;
    if (openKeys.has(key)) {
      skipped += 1;
      continue;
    }
    openKeys.add(key);
    const citation = await resolveCitation(c, tenant, draft.signal, { brandId: draft.brand_id });
    const { rows } = await c.query(
      `INSERT INTO public.ai_tasks (tenant_id, function, subject_type, subject_id, input, output)
       VALUES ($1::uuid, 'fraud_scan', $2, $3::uuid, $4::jsonb, $5::jsonb)
       RETURNING id`,
      [
        tenant,
        draft.subject_type,
        draft.subject_id,
        JSON.stringify({
          signal: draft.signal,
          subject_key: draft.subject_key,
          seller_id:
            draft.subject_type === "seller"
              ? draft.subject_id
              : (draft.evidence as any)?.seller_id ?? null,
        }),
        JSON.stringify({
          signal: draft.signal,
          subject_key: draft.subject_key,
          severity: draft.severity,
          evidence: draft.evidence,
          citation,
          recommended_responses: draft.recommended_responses,
        }),
      ],
    );
    created.push({
      id: String(rows[0].id),
      signal: draft.signal,
      subject_key: draft.subject_key,
      severity: draft.severity,
    });
    bySignal[draft.signal] = (bySignal[draft.signal] ?? 0) + 1;
  }

  const { rows: runRows } = await c.query(
    `INSERT INTO public.ai_tasks (tenant_id, function, subject_type, state, input, output)
     VALUES ($1::uuid, 'fraud_scan', 'scan_run', 'recorded', $2::jsonb, $3::jsonb)
     RETURNING id`,
    [
      tenant,
      JSON.stringify({ trigger: "admin_run", actor_id: actorId }),
      JSON.stringify({
        detections_created: created.length,
        by_signal: bySignal,
        skipped_duplicates: skipped,
        detector_errors: detectorErrors,
        evaluated_at: new Date().toISOString(),
      }),
    ],
  );
  const runId = String(runRows[0].id);
  await writeSellerAudit(c as any, {
    tenantId: tenant,
    actorId,
    ipAddress,
    action: "operator.scan_run",
    entityType: "ai_task",
    entityId: runId,
    afterState: { detections_created: created.length, by_signal: bySignal },
  });
  return {
    run_task_id: runId,
    detections_created: created.length,
    by_signal: bySignal,
    skipped_duplicates: skipped,
    detector_errors: detectorErrors,
    detections: created,
  };
}

// ===========================================================================
// 2. RESPONSES — governed acts applied BY A HUMAN from a detection.
// ===========================================================================

export class OperatorRefusal extends Error {
  kind: "bad" | "state" | "missing" = "bad";
  constructor(message: string, kind: "bad" | "state" | "missing" = "bad") {
    super(message);
    this.kind = kind;
  }
}

interface TaskRow {
  id: string;
  function: string;
  subject_type: string | null;
  subject_id: string | null;
  state: string;
  input: Record<string, any>;
  output: Record<string, any>;
}

async function loadTask(c: Client, tenant: string, taskId: string): Promise<TaskRow> {
  const { rows } = await c.query(
    `SELECT id, function, subject_type, subject_id, state, input, output
       FROM public.ai_tasks WHERE tenant_id = $1 AND id = $2::uuid`,
    [tenant, taskId],
  );
  if (!rows[0]) throw new OperatorRefusal("Task not found.", "missing");
  return rows[0] as TaskRow;
}

/** The case a detection's responses have already opened, if any — the
 *  response chain (open → freeze → suspend) hangs off it. */
function taskCaseId(task: TaskRow): string | null {
  const responses = Array.isArray(task.output?.responses) ? task.output.responses : [];
  for (const r of responses) {
    if (r?.kind === "open_case" && typeof r?.result?.case_id === "string") {
      return r.result.case_id;
    }
  }
  const legacy = task.output?.response?.result?.case_id;
  return typeof legacy === "string" ? legacy : null;
}

function taskSellerId(task: TaskRow): string | null {
  if (task.subject_type === "seller" && task.subject_id) return task.subject_id;
  const fromInput = task.input?.seller_id;
  if (typeof fromInput === "string" && UUID_RE.test(fromInput)) return fromInput;
  const fromEvidence = task.output?.evidence?.seller_id;
  if (typeof fromEvidence === "string" && UUID_RE.test(fromEvidence)) return fromEvidence;
  return null;
}

function citationLine(citation: PolicyCitation): string {
  return `Policy cited: ${citation.title ?? citation.source}${citation.version ? ` (v${citation.version})` : ""} [${citation.source}:${citation.id ?? "unrecorded"}]`;
}

async function openSellerCase(
  c: Client,
  tenant: string,
  sellerId: string,
  signal: string,
  reason: string,
  citation: PolicyCitation,
  orderId: string | null,
): Promise<string> {
  const { rows } = await c.query(
    `INSERT INTO public.seller_disputes (tenant_id, seller_id, order_id, status, dispute_type, notes)
     VALUES ($1::uuid, $2::uuid, $3::uuid, 'open', $4, $5)
     RETURNING id`,
    [
      tenant,
      sellerId,
      orderId && UUID_RE.test(orderId) ? orderId : null,
      signal || "operator_case",
      `Opened from an AI operator detection. ${reason}\n${citationLine(citation)}`,
    ],
  );
  return String(rows[0].id);
}

async function openOrderCase(
  c: Client,
  tenant: string,
  orderIdText: string,
  signal: string,
  reason: string,
  citation: PolicyCitation,
): Promise<string> {
  const { rows: ord } = await c.query(
    `SELECT metadata FROM public.commerce_orders WHERE tenant_id = $1 AND id = $2`,
    [tenant, orderIdText],
  );
  const meta = (ord[0]?.metadata ?? {}) as Record<string, any>;
  const { rows } = await c.query(
    `INSERT INTO public.order_cases (tenant_id, order_id, customer_id, customer_email, subject, reason, note)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      tenant,
      orderIdText,
      typeof meta.customer_id === "string" ? meta.customer_id : null,
      typeof meta.customer_email === "string" ? meta.customer_email : null,
      `AI fraud detection — ${SIGNAL_LABELS[signal as OperatorSignal] ?? signal}`.slice(0, 300),
      reason.slice(0, 120),
      `Opened from an AI operator detection. ${reason}\n${citationLine(citation)}`.slice(0, 4000),
    ],
  );
  return String(rows[0].id);
}

/** The temporary-suspension fact lives ON THE CASE — seller_disputes'
 *  evidence column (evidence_urls) is a jsonb ARRAY of evidence entries
 *  (the store's designed shape, verified firsthand), so the fact rides
 *  as the array element carrying `temporary_suspension`. */
export function readTemporarySuspension(evidence: unknown): any | null {
  const arr = Array.isArray(evidence)
    ? evidence
    : evidence && typeof evidence === "object"
      ? [evidence]
      : [];
  for (const e of arr) {
    if (e && typeof e === "object" && (e as any).temporary_suspension) {
      return (e as any).temporary_suspension;
    }
  }
  return null;
}

async function stampTemporarySuspension(
  c: Client,
  tenant: string,
  caseId: string,
  fact: Record<string, unknown>,
): Promise<void> {
  const { rows } = await c.query(
    `SELECT evidence_urls FROM public.seller_disputes WHERE tenant_id = $1 AND id = $2::uuid`,
    [tenant, caseId],
  );
  const ev = rows[0]?.evidence_urls;
  const arr: any[] = Array.isArray(ev)
    ? [...ev]
    : ev && typeof ev === "object"
      ? [ev]
      : [];
  const idx = arr.findIndex(
    (e) => e && typeof e === "object" && "temporary_suspension" in e,
  );
  if (idx >= 0) arr[idx] = { temporary_suspension: fact };
  else arr.push({ temporary_suspension: fact });
  await c.query(
    `UPDATE public.seller_disputes
        SET evidence_urls = $3::jsonb, updated_at = now()
      WHERE tenant_id = $1 AND id = $2::uuid`,
    [tenant, caseId, JSON.stringify(arr)],
  );
}

async function notifySeller(
  c: Client,
  tenant: string,
  sellerId: string,
  type: string,
  title: string,
  body: string,
): Promise<number> {
  const { rows } = await c.query(
    `INSERT INTO public.seller_notifications (tenant_id, seller_id, notification_type, title, body)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5) RETURNING id`,
    [tenant, sellerId, type, title, body],
  );
  return rows.length;
}

async function notifyStaffOwners(
  c: Client,
  tenant: string,
  type: string,
  title: string,
  body: string,
): Promise<number> {
  const { rows } = await c.query(
    `INSERT INTO public.employee_notifications (tenant_id, staff_id, notification_type, title, body)
     SELECT $1::uuid, s.id, $2, $3, $4
       FROM public.crm_staff s
      WHERE s.tenant_id = $1::uuid AND s.is_active AND s.role IN ('owner','staff')
     RETURNING id`,
    [tenant, type, title, body],
  );
  return rows.length;
}

export interface ResponseResult {
  task_id: string;
  response: string;
  response_task_id?: string;
  case_id?: string;
  case_kind?: "seller_dispute" | "order_case";
  notified?: number;
  seller_status?: string;
}

async function executeResponse(
  c: Client,
  tenant: string,
  actorId: string | null,
  ipAddress: string | null,
  task: TaskRow,
  input: ResponseInput & { citation: PolicyCitation },
): Promise<ResponseResult> {
  const reason = String(input.reason ?? "").trim();
  const citation = input.citation;
  const signal = String(task.output?.signal ?? task.input?.signal ?? "operator");
  const result: ResponseResult = { task_id: task.id, response: input.response };

  if (input.response === "open_case") {
    const sellerId = taskSellerId(task);
    if (sellerId) {
      const caseId = await openSellerCase(c, tenant, sellerId, signal, reason, citation, null);
      result.case_id = caseId;
      result.case_kind = "seller_dispute";
      await writeSellerAudit(c as any, {
        tenantId: tenant, sellerId, actorId, ipAddress,
        action: "operator.case_opened", entityType: "seller_dispute", entityId: caseId,
        afterState: { from_task: task.id, signal, citation },
      });
    } else if (task.subject_type === "order") {
      const orderId = String(task.output?.evidence?.order_id ?? "");
      if (!orderId) throw new OperatorRefusal("This detection carries no order to open a case on.", "state");
      const caseId = await openOrderCase(c, tenant, orderId, signal, reason, citation);
      result.case_id = caseId;
      result.case_kind = "order_case";
      await writeSellerAudit(c as any, {
        tenantId: tenant, actorId, ipAddress,
        action: "operator.case_opened", entityType: "order_case", entityId: caseId,
        afterState: { from_task: task.id, signal, citation },
      });
    } else {
      throw new OperatorRefusal(
        "open_case applies to seller and order detections — this detection's subject carries neither.",
        "state",
      );
    }
  }

  if (input.response === "freeze_payout") {
    const caseId = String(input.case_id);
    const { rows } = await c.query(
      `SELECT id, seller_id, order_id, status FROM public.seller_disputes
        WHERE tenant_id = $1 AND id = $2::uuid`,
      [tenant, caseId],
    );
    if (!rows[0]) throw new OperatorRefusal("Case not found.", "missing");
    const kase = rows[0];
    const status = kase.status ? String(kase.status) : null;
    if (status === "frozen") throw new OperatorRefusal("Case payout is already frozen.", "state");
    if (status && ["released", "refunded", "reversed"].includes(status)) {
      throw new OperatorRefusal(`Case already closed by intervention ("${status}") — a closed case cannot be frozen.`, "state");
    }
    let paymentIntentId: string | null = null;
    if (kase.order_id) {
      const { rows: ord } = await c.query(
        `SELECT stripe_payment_intent_id FROM public.commerce_orders WHERE tenant_id = $1 AND id = $2`,
        [tenant, String(kase.order_id)],
      );
      paymentIntentId = ord[0]?.stripe_payment_intent_id ?? null;
    }
    const { rows: updated } = await c.query(
      `UPDATE public.seller_disputes
          SET status = 'frozen', updated_at = now()
        WHERE tenant_id = $1 AND id = $2::uuid AND status IS NOT DISTINCT FROM $3
        RETURNING id`,
      [tenant, caseId, status],
    );
    if (updated.length === 0) throw new OperatorRefusal("Case changed underneath — retry.", "state");
    const call = buildCaseFreezeCall({
      disputeId: caseId,
      tenantId: tenant,
      sellerId: String(kase.seller_id),
      orderId: kase.order_id ? String(kase.order_id) : null,
      paymentIntentId,
    });
    await writeSellerAudit(c as any, {
      tenantId: tenant, sellerId: String(kase.seller_id), actorId, ipAddress,
      action: "operator.payout_frozen", entityType: "seller_dispute", entityId: caseId,
      beforeState: { status },
      afterState: { status: "frozen", from_task: task.id, citation, stripe_call: call },
    });
    result.case_id = caseId;
    result.case_kind = "seller_dispute";
  }

  if (input.response === "notify") {
    const audience = String(input.audience);
    const title = `Platform notice — ${SIGNAL_LABELS[signal as OperatorSignal] ?? "operator detection"}`;
    const body = `${reason}\n${citationLine(citation)}`;
    if (audience === "seller") {
      const sellerId = taskSellerId(task);
      if (!sellerId) throw new OperatorRefusal("This detection carries no seller to notify.", "state");
      result.notified = await notifySeller(c, tenant, sellerId, "operator_notice", title, body);
    } else if (audience === "staff") {
      result.notified = await notifyStaffOwners(c, tenant, "operator_notice", title, body);
    } else {
      const customerRef = task.output?.evidence?.customer_id;
      if (typeof customerRef !== "string" || !customerRef) {
        throw new OperatorRefusal("This detection carries no resolvable shop customer to notify.", "state");
      }
      const { rows } = await c.query(
        `INSERT INTO public.customer_notifications (tenant_id, "customerId", type, title, body)
         SELECT $1::uuid, c.id, 'operator_notice', $2, $3
           FROM public.customers c WHERE c.id = $4
         RETURNING id`,
        [tenant, title, body, customerRef],
      );
      if (rows.length === 0) {
        throw new OperatorRefusal("The detection's customer reference does not resolve to a shop customer.", "state");
      }
      result.notified = rows.length;
    }
    await writeSellerAudit(c as any, {
      tenantId: tenant, sellerId: taskSellerId(task), actorId, ipAddress,
      action: "operator.notification_sent", entityType: "ai_task", entityId: task.id,
      afterState: { audience, notified: result.notified, signal },
    });
  }

  if (input.response === "suspend_seller_temporary") {
    const sellerId = taskSellerId(task);
    if (!sellerId) throw new OperatorRefusal("Temporary suspension applies to seller detections.", "state");
    let caseId = input.case_id && UUID_RE.test(input.case_id) ? input.case_id : null;
    if (!caseId) caseId = taskCaseId(task);
    if (!caseId) {
      caseId = await openSellerCase(c, tenant, sellerId, signal, reason, citation, null);
    }
    result.case_id = caseId;
    result.case_kind = "seller_dispute";
    const { rows: updated } = await c.query(
      `UPDATE public.sellers SET status = 'suspended', updated_at = now()
        WHERE tenant_id = $1 AND id = $2::uuid AND status = 'approved'
        RETURNING id, status`,
      [tenant, sellerId],
    );
    if (updated.length === 0) {
      const { rows: cur } = await c.query(
        `SELECT status FROM public.sellers WHERE tenant_id = $1 AND id = $2::uuid`,
        [tenant, sellerId],
      );
      throw new OperatorRefusal(
        `Seller is not in an approved state (current: ${cur[0]?.status ?? "not found"}) — temporary suspension applies from approved.`,
        "state",
      );
    }
    await stampTemporarySuspension(c, tenant, caseId, {
      state: "active",
      applied_at: new Date().toISOString(),
      applied_by: actorId,
      reason,
      citation,
    });
    await notifySeller(
      c, tenant, sellerId, "suspension_notice",
      "Your seller account is temporarily suspended",
      `Your account has been TEMPORARILY suspended under an open platform case. ${reason}\n${citationLine(citation)}\nThis is a temporary, risk-mitigation hold while the case is reviewed — it is not a permanent closure. The platform will review the case and either lift the suspension or move it into the standard governance process.`,
    );
    await writeSellerAudit(c as any, {
      tenantId: tenant, sellerId, actorId, ipAddress,
      action: "operator.seller_suspended_temporary", entityType: "seller", entityId: sellerId,
      beforeState: { status: "approved" },
      afterState: { status: "suspended", temporary: true, case_id: caseId, citation, from_task: task.id },
    });
    result.seller_status = "suspended";
  }

  // The response's own record: a child ai_task born 'applied' (the
  // operator's click IS the decision — decider stamped at birth), chained
  // to the detection. The detection itself flips proposed → applied on
  // its FIRST response (the §J decision) and accumulates every response
  // in output.responses — a detection's response chain (open → freeze →
  // notify → suspend) is plural by design, so later responses record
  // against it without re-deciding it.
  const responseSummary = {
    kind: input.response,
    reason,
    citation,
    result,
    applied_at: new Date().toISOString(),
    applied_by: actorId,
  };
  const { rows: recRows } = await c.query(
    `INSERT INTO public.ai_tasks (tenant_id, function, subject_type, subject_id, state, decided_by, decided_at, input, output)
     VALUES ($1::uuid, $7, $2, $3::uuid, 'applied', $4::uuid, now(), $5::jsonb, $6::jsonb)
     RETURNING id`,
    [
      tenant,
      task.subject_type,
      task.subject_id,
      actorId,
      JSON.stringify({ response_to: task.id, act: input.response }),
      JSON.stringify({ response: responseSummary, detection_task_id: task.id }),
      task.function,
    ],
  );
  result.response_task_id = String(recRows[0].id);
  await c.query(
    `UPDATE public.ai_tasks
        SET state = CASE WHEN state = 'proposed' THEN 'applied' ELSE state END,
            decided_by = CASE WHEN state = 'proposed' THEN $3::uuid ELSE decided_by END,
            decided_at = CASE WHEN state = 'proposed' THEN now() ELSE decided_at END,
            updated_at = now(),
            output = jsonb_set(output, '{responses}',
              COALESCE(output->'responses', '[]'::jsonb) || $4::jsonb)
      WHERE tenant_id = $1 AND id = $2::uuid`,
    [tenant, task.id, actorId, JSON.stringify([responseSummary])],
  );
  return result;
}

export async function applyResponseToTask(
  c: Client,
  tenant: string,
  actorId: string | null,
  ipAddress: string | null,
  taskId: string,
  input: ResponseInput,
): Promise<ResponseResult> {
  const task = await loadTask(c, tenant, taskId);
  if (task.function !== "fraud_scan" || task.subject_type === "scan_run") {
    throw new OperatorRefusal("Responses apply to fraud-scan detections.", "state");
  }
  if (task.input?.response_to) {
    throw new OperatorRefusal("Responses apply to detections, not to response records.", "state");
  }
  if (task.state === "dismissed") {
    throw new OperatorRefusal("Task was dismissed — a dismissed detection takes no responses.", "state");
  }
  const merged: ResponseInput & { citation: PolicyCitation } = {
    ...input,
    citation: (input.citation ?? (task.output?.citation as PolicyCitation) ?? null) as PolicyCitation,
  };
  // The response chain hangs off the detection's opened case: a freeze
  // or a suspension that names no case uses the one this detection's
  // earlier responses opened (filled before validation, which requires
  // the case for a freeze).
  if (!merged.case_id) {
    const chained = taskCaseId(task);
    if (chained) merged.case_id = chained;
  }
  const verdict = validateResponseInput(merged);
  if (!verdict.ok) throw new OperatorRefusal(verdict.error, "bad");
  if (
    ["open_case", "freeze_payout", "suspend_seller_temporary"].includes(input.response) &&
    !(await verifyCitationRow(c, tenant, merged.citation))
  ) {
    throw new OperatorRefusal(
      "The cited policy does not resolve to a recorded policy in its seat — the response is refused.",
      "bad",
    );
  }
  return executeResponse(c, tenant, actorId, ipAddress, task, merged);
}

/** The paired governed act to a temporary suspension: lift it. The
 *  case's recorded fact flips to 'lifted'; the seller returns to
 *  'approved' through the same guarded status write. */
export async function reinstateSeller(
  c: Client,
  tenant: string,
  actorId: string | null,
  ipAddress: string | null,
  caseId: string,
  reason: string,
): Promise<{ seller_id: string; case_id: string }> {
  if (!reason.trim()) throw new OperatorRefusal("A reason is required to lift a suspension.", "bad");
  const { rows } = await c.query(
    `SELECT id, seller_id, evidence_urls FROM public.seller_disputes
      WHERE tenant_id = $1 AND id = $2::uuid`,
    [tenant, caseId],
  );
  if (!rows[0]) throw new OperatorRefusal("Case not found.", "missing");
  const kase = rows[0];
  const ts = readTemporarySuspension(kase.evidence_urls);
  if (!ts || ts.state !== "active") {
    throw new OperatorRefusal("This case carries no active temporary suspension to lift.", "state");
  }
  const sellerId = String(kase.seller_id);
  const { rows: updated } = await c.query(
    `UPDATE public.sellers SET status = 'approved', updated_at = now()
      WHERE tenant_id = $1 AND id = $2::uuid AND status = 'suspended'
      RETURNING id`,
    [tenant, sellerId],
  );
  if (updated.length === 0) {
    throw new OperatorRefusal("Seller is not currently suspended — nothing to lift.", "state");
  }
  await stampTemporarySuspension(c, tenant, caseId, {
    ...ts,
    state: "lifted",
    lifted_at: new Date().toISOString(),
    lifted_by: actorId,
    lift_reason: reason,
  });
  await notifySeller(
    c, tenant, sellerId, "suspension_lifted",
    "Your temporary suspension has been lifted",
    `The temporary suspension on your seller account has been lifted and your account is active again. ${reason}`,
  );
  await c.query(
    `INSERT INTO public.ai_tasks (tenant_id, function, subject_type, subject_id, state, input, output)
     VALUES ($1::uuid, 'directed_action', 'seller', $2::uuid, 'recorded', $3::jsonb, $4::jsonb)`,
    [
      tenant,
      sellerId,
      JSON.stringify({ act: "reinstate_seller", case_id: caseId }),
      JSON.stringify({ reason, citation: ts.citation ?? null }),
    ],
  );
  await writeSellerAudit(c as any, {
    tenantId: tenant, sellerId, actorId, ipAddress,
    action: "operator.seller_reinstated", entityType: "seller", entityId: sellerId,
    beforeState: { status: "suspended" },
    afterState: { status: "approved", case_id: caseId },
  });
  return { seller_id: sellerId, case_id: caseId };
}

// ===========================================================================
// 3. DIRECTED ACTIONS — a click executes a governed act.
// ===========================================================================

export interface CreatedNode {
  id: string;
  node_type: string;
  name: string;
  slug: string;
  path: string;
  depth: number;
}

async function insertNode(
  c: Client,
  tenant: string,
  parent: { id: string; node_type: string; path: string; depth: number; subject_id: string | null },
  name: string,
): Promise<CreatedNode> {
  const type = childNodeType(parent.node_type);
  if (!type) {
    throw new OperatorRefusal(
      `"${parent.node_type}" is the deepest taxonomy level — nothing can be built under it.`,
      "state",
    );
  }
  const slug = slugifyNodeName(name);
  if (!slug) throw new OperatorRefusal("The name produces an empty slug.", "bad");
  const path = childNodePath(parent.path, slug);
  const { rows: existing } = await c.query(
    `SELECT id FROM public.taxonomy_nodes WHERE tenant_id = $1 AND path = $2 LIMIT 1`,
    [tenant, path],
  );
  if (existing[0]) {
    throw new OperatorRefusal(`A node already exists at ${path}.`, "state");
  }
  const { rows: sortRows } = await c.query(
    `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM public.taxonomy_nodes
      WHERE tenant_id = $1 AND parent_id = $2::uuid`,
    [tenant, parent.id],
  );
  const animalId = parent.node_type === "animal" ? parent.id : parent.subject_id;
  const { rows } = await c.query(
    `INSERT INTO public.taxonomy_nodes
       (tenant_id, parent_id, subject_id, node_type, name, display_name, slug, path, depth, sort_order, status)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $5, $6, $7, $8, $9, 'published')
     RETURNING id, node_type, name, slug, path, depth`,
    [tenant, parent.id, animalId, type, name, slug, path, Number(parent.depth) + 1, Number(sortRows[0].next)],
  );
  const r = rows[0];
  return {
    id: String(r.id),
    node_type: String(r.node_type),
    name: String(r.name),
    slug: String(r.slug),
    path: String(r.path),
    depth: Number(r.depth),
  };
}

export async function createCategory(
  c: Client,
  tenant: string,
  actorId: string | null,
  ipAddress: string | null,
  input: { name: string; parent_id: string; subcategory_name?: string | null },
): Promise<{ category: CreatedNode; subcategory: CreatedNode | null; task_id: string }> {
  const name = String(input.name ?? "").trim();
  if (!name) throw new OperatorRefusal("A category name is required.", "bad");
  if (!UUID_RE.test(String(input.parent_id ?? ""))) {
    throw new OperatorRefusal("parent_id must name the taxonomy node to build under.", "bad");
  }
  const { rows: parents } = await c.query(
    `SELECT id, node_type, path, depth, subject_id FROM public.taxonomy_nodes
      WHERE tenant_id = $1 AND id = $2::uuid`,
    [tenant, input.parent_id],
  );
  if (!parents[0]) throw new OperatorRefusal("Parent node not found in this tenant's taxonomy.", "missing");
  const parent = parents[0];
  const subName = String(input.subcategory_name ?? "").trim();
  if (subName) {
    const childType = childNodeType(String(parent.node_type));
    if (!childType || childNodeType(childType) !== "subcategory") {
      throw new OperatorRefusal(
        "A subcategory can only be built in the same act when the new node lands at category level (build under a department). Nothing was created.",
        "state",
      );
    }
  }
  const category = await insertNode(c, tenant, parent, name);
  let subcategory: CreatedNode | null = null;
  if (subName) {
    subcategory = await insertNode(
      c,
      tenant,
      { id: category.id, node_type: category.node_type, path: category.path, depth: category.depth, subject_id: parent.node_type === "animal" ? parent.id : parent.subject_id },
      subName,
    );
  }
  const { rows: taskRows } = await c.query(
    `INSERT INTO public.ai_tasks (tenant_id, function, subject_type, subject_id, state, decided_by, decided_at, input, output)
     VALUES ($1::uuid, 'directed_action', 'taxonomy_node', $2::uuid, 'applied', $3::uuid, now(), $4::jsonb, $5::jsonb)
     RETURNING id`,
    [
      tenant,
      category.id,
      actorId,
      JSON.stringify({ act: "create_category", name, parent_id: input.parent_id, subcategory_name: subName || null }),
      JSON.stringify({ category, subcategory }),
    ],
  );
  await writeSellerAudit(c as any, {
    tenantId: tenant, actorId, ipAddress,
    action: "operator.category_created", entityType: "taxonomy_node", entityId: category.id,
    afterState: { path: category.path, node_type: category.node_type, subcategory: subcategory ? { id: subcategory.id, path: subcategory.path } : null },
  });
  return { category, subcategory, task_id: String(taskRows[0].id) };
}

/** A governed act aimed from the high-risk seller file: the act is
 *  recorded as a directed_action task and executed through the same
 *  response machinery as a scanner detection's response. */
export async function sellerDirectedAct(
  c: Client,
  tenant: string,
  actorId: string | null,
  ipAddress: string | null,
  input: {
    seller_id: string;
    act: "open_case" | "suspend_seller_temporary" | "notify";
    citation: PolicyCitation;
    reason: string;
  },
): Promise<ResponseResult> {
  const verdict = validateResponseInput({
    response: input.act,
    reason: input.reason,
    citation: input.citation,
    audience: input.act === "notify" ? "seller" : undefined,
  });
  if (!verdict.ok) throw new OperatorRefusal(verdict.error, "bad");
  if (
    ["open_case", "suspend_seller_temporary"].includes(input.act) &&
    !(await verifyCitationRow(c, tenant, input.citation))
  ) {
    throw new OperatorRefusal("The cited policy does not resolve to a recorded policy in its seat — the act is refused.", "bad");
  }
  const { rows } = await c.query(
    `INSERT INTO public.ai_tasks (tenant_id, function, subject_type, subject_id, state, input, output)
     VALUES ($1::uuid, 'directed_action', 'seller', $2::uuid, 'proposed', $3::jsonb, $4::jsonb)
     RETURNING id`,
    [
      tenant,
      input.seller_id,
      JSON.stringify({ act: input.act, seller_id: input.seller_id }),
      JSON.stringify({ signal: "directed", citation: input.citation }),
    ],
  );
  const task: TaskRow = {
    id: String(rows[0].id),
    function: "directed_action",
    subject_type: "seller",
    subject_id: input.seller_id,
    state: "proposed",
    input: { act: input.act, seller_id: input.seller_id },
    output: { signal: "directed", citation: input.citation },
  };
  return executeResponse(c, tenant, actorId, ipAddress, task, {
    response: input.act,
    reason: input.reason,
    citation: input.citation,
    audience: input.act === "notify" ? "seller" : undefined,
  });
}

// ===========================================================================
// The high-risk seller file — one assembled view of the seller's recorded
// risk facts, from the stores themselves.
// ===========================================================================

export async function getSellerRiskFile(c: Client, tenant: string, sellerId: string) {
  const { rows: sellerRows } = await c.query(
    `SELECT id, display_name, legal_name, status, seller_type, commission_rate::float AS commission_rate, created_at
       FROM public.sellers WHERE tenant_id = $1 AND id = $2::uuid`,
    [tenant, sellerId],
  );
  if (!sellerRows[0]) return null;
  const seller = sellerRows[0];
  const [cap, disputes, violations, appeals, investigations, facts, snapshots, returns, refunds, listings, flagged, auths, tasks, delayPolicy] =
    await Promise.all([
      c.query(`SELECT pro_tier, is_pro, status FROM public.seller_capabilities WHERE tenant_id = $1 AND seller_id = $2::uuid`, [tenant, sellerId]),
      c.query(
        `SELECT id, status, dispute_type, order_id, notes, created_at, updated_at, evidence_urls
           FROM public.seller_disputes WHERE tenant_id = $1 AND seller_id = $2::uuid
          ORDER BY created_at DESC LIMIT 25`,
        [tenant, sellerId],
      ),
      c.query(
        `SELECT id, violation_type, severity, status, policy_id, created_at
           FROM public.seller_violations WHERE tenant_id = $1 AND seller_id = $2::uuid
          ORDER BY created_at DESC LIMIT 25`,
        [tenant, sellerId],
      ),
      c.query(`SELECT status, count(*)::int AS n FROM public.seller_appeals WHERE tenant_id = $1 AND seller_id = $2::uuid GROUP BY status`, [tenant, sellerId]),
      c.query(`SELECT status, count(*)::int AS n FROM public.seller_investigations WHERE tenant_id = $1 AND seller_id = $2::uuid GROUP BY status`, [tenant, sellerId]),
      c.query(
        `SELECT DISTINCT ON (metric_key) metric_key, value::float AS value, measured_at
           FROM public.seller_metric_facts WHERE tenant_id = $1 AND seller_id = $2::uuid
          ORDER BY metric_key, measured_at DESC`,
        [tenant, sellerId],
      ),
      c.query(
        `SELECT DISTINCT ON (kpi_key) kpi_key, value::float AS value, snapshot_date
           FROM public.seller_kpi_snapshots WHERE tenant_id = $1 AND seller_id = $2::uuid
          ORDER BY kpi_key, snapshot_date DESC`,
        [tenant, sellerId],
      ),
      c.query(`SELECT status, count(*)::int AS n FROM public.seller_return_requests WHERE tenant_id = $1 AND seller_id = $2::uuid GROUP BY status`, [tenant, sellerId]),
      c.query(
        `SELECT status, count(*)::int AS n, COALESCE(sum(amount),0)::float AS total
           FROM public.seller_refunds WHERE tenant_id = $1 AND seller_id = $2::uuid GROUP BY status`,
        [tenant, sellerId],
      ),
      c.query(`SELECT status, count(*)::int AS n FROM public.seller_listings WHERE tenant_id = $1 AND seller_id = $2::uuid GROUP BY status`, [tenant, sellerId]),
      c.query(
        `SELECT l.id, l.title, l.brand, oo.strength, oo.id AS optout_id ${OPTOUT_JOIN} AND l.seller_id = $2::uuid`,
        [tenant, sellerId],
      ),
      c.query(`SELECT status, count(*)::int AS n FROM public.seller_brand_authorizations WHERE seller_id = $1::uuid GROUP BY status`, [sellerId]),
      c.query(
        `SELECT id, state, output->>'signal' AS signal, output->>'severity' AS severity, created_at
           FROM public.ai_tasks
          WHERE tenant_id = $1 AND function = 'fraud_scan' AND input->>'response_to' IS NULL
            AND (subject_id = $2::uuid OR input->>'seller_id' = $2::text)
          ORDER BY created_at DESC LIMIT 10`,
        [tenant, sellerId],
      ),
      c.query(
        `SELECT key, value FROM public.policy_settings WHERE tenant_id = $1 AND scope = 'payout_delay' ORDER BY key`,
        [tenant],
      ),
    ]);
  return {
    seller,
    capabilities: cap.rows[0] ?? null,
    payout_delay_policy: delayPolicy.rows,
    cases: disputes.rows.map((r) => ({
      ...r,
      evidence_urls: undefined,
      temporary_suspension: readTemporarySuspension(r.evidence_urls),
    })),
    violations: violations.rows,
    appeals_by_status: appeals.rows,
    investigations_by_status: investigations.rows,
    kpi_facts: facts.rows,
    kpi_snapshots: snapshots.rows,
    returns_by_status: returns.rows,
    refunds_by_status: refunds.rows,
    listings_by_status: listings.rows,
    optout_flagged_listings: flagged.rows,
    brand_authorizations_by_status: auths.rows,
    operator_detections: tasks.rows,
  };
}

// ===========================================================================
// The operator overview read (the face's one GET).
// ===========================================================================

export async function getOperatorOverview(c: Client, tenant: string) {
  const [lastRun, detections, bySignal, sellerPolicies, sitePolicies, parents, sellers, recentReviews] =
    await Promise.all([
      c.query(
        `SELECT id, output, created_at FROM public.ai_tasks
          WHERE tenant_id = $1 AND function = 'fraud_scan' AND subject_type = 'scan_run'
          ORDER BY created_at DESC LIMIT 1`,
        [tenant],
      ),
      c.query(
        `SELECT t.id, t.subject_type, t.subject_id, t.state, t.created_at,
                t.output->>'signal' AS signal, t.output->>'severity' AS severity,
                t.output->'evidence' AS evidence, t.output->'citation' AS citation,
                t.output->'recommended_responses' AS recommended_responses,
                COALESCE(jsonb_array_length(COALESCE(t.output->'responses', '[]'::jsonb)), 0) AS responses_applied,
                s.display_name AS seller_name
           FROM public.ai_tasks t
           LEFT JOIN public.sellers s ON s.id = t.subject_id AND s.tenant_id = t.tenant_id
          WHERE t.tenant_id = $1 AND t.function = 'fraud_scan'
            AND t.subject_type <> 'scan_run' AND t.input->>'response_to' IS NULL
            AND t.state IN ('proposed','applied')
          ORDER BY t.created_at DESC LIMIT 100`,
        [tenant],
      ),
      c.query(
        `SELECT output->>'signal' AS signal, state, count(*)::int AS n FROM public.ai_tasks
          WHERE tenant_id = $1 AND function = 'fraud_scan' AND subject_type <> 'scan_run'
            AND input->>'response_to' IS NULL
          GROUP BY 1, 2 ORDER BY 1, 2`,
        [tenant],
      ),
      c.query(
        `SELECT id, title, current_version FROM public.seller_policies
          WHERE tenant_id = $1 AND status = 'published' ORDER BY title`,
        [tenant],
      ),
      c.query(`SELECT id, title FROM public.seller_policies WHERE tenant_id = $1 AND category = 'Site policy' ORDER BY title`, [tenant]),
      c.query(
        `SELECT id, name, path, node_type, depth FROM public.taxonomy_nodes
          WHERE tenant_id = $1 AND node_type IN ('animal','department','category')
          ORDER BY depth, sort_order, name LIMIT 500`,
        [tenant],
      ),
      c.query(
        `SELECT id, display_name, status FROM public.sellers WHERE tenant_id = $1 ORDER BY display_name`,
        [tenant],
      ),
      c.query(
        `SELECT count(*)::int AS n FROM public.reviews WHERE tenant_id = $1 AND created_at > now() - interval '24 hours'`,
        [tenant],
      ),
    ]);
  return {
    last_run: lastRun.rows[0] ?? null,
    detections: detections.rows,
    counts_by_signal: bySignal.rows,
    citations: {
      seller_policies: sellerPolicies.rows.map((r) => ({
        source: "seller_policies", id: r.id, title: r.title, version: num(r.current_version) || null,
      })),
      site_policies: sitePolicies.rows.map((r) => ({
        source: "site_policies", id: r.id, title: r.title, version: null,
      })),
    },
    taxonomy_parents: parents.rows,
    sellers: sellers.rows,
    watch: {
      reviews: {
        state: "live",
        note: "Review bursts are evaluated by the fraud scanner over the reviews store.",
        reviews_last_24h: num(recentReviews.rows[0]?.n),
      },
      social_comments: {
        state: "not_connected",
        note: "No social-media ingestion exists in this platform today — no connector, no store, no reader. The watch seat is recorded here; comments are not monitored until an ingestion is built. Nothing about this state is faked.",
      },
    },
  };
}

/**
 * Register-open response — Sunny's doctrine ("if a register opens,
 * send notification to user, email a receipt"): when a NEW register
 * session lands, the platform responds with owner/staff notification
 * records and the session receipt email. The response is BEST-EFFORT
 * by design — the caller wraps it in try/catch and the register open
 * stands regardless. This build does not yet write those records, so
 * this resolves as a typed no-op (identical runtime outcome to a
 * failed dynamic import).
 */
export async function respondToRegisterOpen(
  _client: unknown,
  _tenant: string,
  _session: {
    id: string;
    register_id: string;
    opened_by: string | null;
    opening_cash: number;
    opened_at: string;
  },
): Promise<void> {
  // Notification records + receipt email land with the comms build.
}
