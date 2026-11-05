import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgExec, pgQuery } from "@/lib/pg";
import { auditAction, getActorIdFromRequest } from "@/lib/quick-actions/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// /api/admin/returns — §D RETURNS ADMIN oversight (Admin tree §D; data
// graph contracts: D1 rides `return_requests`, D2 rides `refunds`, D3 is
// Admin Write → Seller Read; flows: "Returns → D1", "Refund decisions
// ← D2", "Return rule configuration → D3", "Return policy exemptions
// ← D3"). Gate: the portal-nav SECTION_MODULE already seats the returns
// section under the 'orders' module code.
//
// FIRSTHAND CENSUS (2026-10-14, foreground information_schema /
// pg_constraint / pg_class + live counts + firsthand code reads):
//
// THE RETURNS-STORE BOUNDARY — four families, drawn from data + writers,
// never from names:
//  1. public.customer_return_requests (0 rows) — the CUSTOMER-filed leg.
//     Columns: order_number/order_email (NOT NULL — the filing identity),
//     order_id uuid NULL (commerce_orders.id is TEXT; the number/email are
//     the durable link), customer_id, auth_user_id, seller_id (FK→sellers
//     SET NULL), request_type CHECK (return|exchange), reason_code (text,
//     as filed), item_name/item_sku/quantity, details, status, admin_notes,
//     seller_response, seller_read_at, handled_by (text), tenant_id
//     NULLABLE with NO FK. Status CHECK = the 12-state lifecycle:
//     requested|approved|awaiting_package|in_transit|received|inspection|
//     approved_for_refund|rejected|refunded|exchanged|completed|cancelled.
//     On THIS lineage its ONLY code reference is the admin orders/actions
//     route (create / review / track / view single-record acts) — there is
//     NO list/queue reader anywhere and no customer-side writer here (the
//     customer writer lives on the customer-portal lineage). D1's
//     `return_requests` in the data graph is THIS store.
//  2. public.erp_return_authorizations (1 row: RMA-TEST-007, status
//     'inspection') — the RMA hub over erp_orders: composite FK
//     (tenant_id, order_id) → erp_orders RESTRICT, (tenant_id,
//     crm_customer_id) → crm_customers. status is the enum
//     erp_return_status = the SAME 12 states + 'restocked'. Children:
//     erp_return_lines (0), erp_return_inspections (0), erp_return_refunds
//     (0; status CHECK pending|approved|rejected|processing|completed|
//     failed). Admin mechanism WIRED in /api/admin/commerce/actions
//     (list_returns / review_return / track_return / view_return, decision
//     map + auditAction domain 'erp') with the ReturnsView face mounted at
//     /admin/returns — the RMA workbench. It is NOT rebuilt here.
//  3. public.commerce_refunds (2 rows, both 'completed', cash, sale-keyed,
//     rma_id NULL) — the money record. status CHECK: pending|
//     requires_approval|approved|rejected|processing|completed|failed|
//     cancelled|void; approval columns (requires_approval, approved_by/at,
//     rejected_by/at + rejection_reason); reason_code CHECK includes
//     'fraud' (the designed fraud vocabulary); refund_method CHECK
//     (original_payment|store_credit|gift_card|cash|check|manual).
//     Composite FK (tenant_id, rma_id) → erp_return_authorizations is the
//     DESIGNED refund↔RMA bridge. Writers: issue_refund = POST
//     /api/admin/refunds (approval policy → 'requires_approval', GL posted
//     at issue/approval), approve_refund / reject_refund in
//     /api/admin/finance/actions (SA-63/64). Face: RefundsView at
//     /admin/refunds + GET /api/admin/refunds (§C3). D2's refund queue is
//     WIRED there — this route surfaces the RMA linkage that face lacks;
//     it never duplicates the queue or the money acts.
//  4. The SELLER leg: public.seller_return_requests (0),
//     public.seller_refunds (0), public.seller_return_rules (0) — designed
//     seller stores carrying ONLY primary keys, with ZERO code references
//     on this lineage. The seller portal's returns face here reads phantom
//     table names (return_requests / return_rules / refunds — none exist)
//     via /api/seller/returns and renders honest empties; the repointed
//     seller stack lives on the seller lineages (assembly). The rule
//     vocabulary is the seller UI's own (seller/returns/rules page):
//     rule_type ∈ keep_it | replacement | exemption, with listing_id
//     marking item-level rules. (acct_ar_refunds, 0 rows, is the AR
//     invoice-refund store — B.3 accounting's, not a §D surface.)
//
// WHAT THIS ROUTE BUILDS (the missing oversight remainder):
//  GET — the unified D1 read: BOTH return legs with TRUE statuses and
//        their source store named per row; server-side facets over the
//        union; the RMA→refund linkage as recorded; the D2 seller-leg
//        reads (seller_refunds — non-standard refunds + adjustments ride
//        refund_type as recorded); the D3 oversight read of
//        seller_return_rules (usage by rule_type + the full register).
//  POST — decisions written through the EXISTING mechanisms' exact write
//        shapes: customer requests mirror the orders/actions review_return
//        patch (decision map, handled_by 'admin', admin_notes); RMAs
//        mirror the commerce/actions review_return UPDATE (enum cast +
//        timestamp stamps) and its auditAction call. Both legs add the
//        decide-once guard §C established (a terminal row 409s instead of
//        being rewritten). No parallel vocabulary, no second money path.
//
// FACET PREDICATES (stated, server-side; applied to the package-waiting
// states):
//   action_required  = customer 'requested' + RMA 'requested'|'inspection'
//   awaiting_package = status 'awaiting_package' (either leg)
//   overdue          = status IN ('awaiting_package','in_transit') AND
//                      updated_at older than the EFFECTIVE return
//                      window (either leg — see D3 below)
//   fraud_flags      = reason_code = 'fraud' (either leg; the refunds
//                      CHECK vocabulary's word, recorded as filed)
//
// D3 RETURN WINDOWS (built with migration 20261084 + the rules desk at
// /api/admin/returns/rules): public.return_policy_rules carries the
// platform window (scope 'global'), per-category windows (scope
// 'category'), and legal-minimum rows (is_legal_minimum). Return rows
// record no category, so the overdue derivation applies the effective
// PLATFORM window = max(global window, legal minimum) in days; the
// per-category windows are served in the response and govern the desk.
// When no rule is configured the derivation falls back to the
// platform's standing SLA convention — the 48h from original-tree §2.1
// that §C's order facets run on — and the response says so
// (returnWindows.fallback). D3 exemption DECISIONS — seller_return_rules
// carries no decision state (is_active is the seller's own switch; no
// decided_by/at), so exemptions are served as recorded configuration,
// not an approval queue. Seller-portal returns surfaces are the seller
// track's (read-only census here).
// ============================================================================

const REQUEST_TERMINAL = ["rejected", "refunded", "exchanged", "completed", "cancelled"];
const RMA_TERMINAL = ["rejected", "restocked", "refunded", "exchanged", "completed", "cancelled"];

// The orders/actions review_return decision map, verbatim — the existing
// mechanism's vocabulary for customer requests.
const REQUEST_DECISIONS: Record<string, string> = {
  approve: "approved", approved: "approved",
  reject: "rejected", rejected: "rejected",
  requested: "requested", completed: "completed",
  cancelled: "cancelled", refunded: "refunded",
};

// The commerce/actions review_return decision map, verbatim (approve →
// inspection is that route's documented mapping: approve the request →
// move to inspection).
const RMA_DECISIONS: Record<string, string> = {
  approve: "inspection",
  reject: "rejected",
  approved: "approved",
  inspection: "inspection",
  awaiting_package: "awaiting_package",
  in_transit: "in_transit",
  received: "received",
  approved_for_refund: "approved_for_refund",
  rejected: "rejected",
  restocked: "restocked",
  refunded: "refunded",
  exchanged: "exchanged",
  completed: "completed",
  cancelled: "cancelled",
};

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("orders", "read");
  if (gate) return gate;
  const tenant = resolveTenantId(req);

  // ── D1 leg 1: customer-filed requests (customer_return_requests) ──────
  const requests = await pgQuery<Record<string, any>>(
    `SELECT r.id::text AS id, r.order_id::text AS order_id, r.order_number,
            r.order_email, r.customer_id::text AS customer_id,
            r.seller_id::text AS seller_id,
            COALESCE(s.display_name, s.legal_name) AS seller_name,
            r.request_type, r.reason_code, r.item_name, r.item_sku,
            r.quantity, r.details, r.status, r.admin_notes,
            r.seller_response, r.handled_by,
            r.created_at::text AS created_at, r.updated_at::text AS updated_at
       FROM public.customer_return_requests r
       LEFT JOIN public.sellers s ON s.id = r.seller_id
      WHERE r.tenant_id = $1
      ORDER BY r.created_at DESC
      LIMIT 500`,
    [tenant],
  );

  // Rows filed without a tenant exist in no tenant's queue (the column is
  // nullable and carries no FK). Their COUNT is admitted, never their rows.
  const untenanted = await pgQuery<{ n: string }>(
    `SELECT count(*)::text AS n FROM public.customer_return_requests WHERE tenant_id IS NULL`,
    [],
  );

  // ── D1 leg 2: RMAs (erp_return_authorizations) + recorded refunds ────
  const rmas = await pgQuery<Record<string, any>>(
    `SELECT r.id::text AS id, r.rma_number, r.status::text AS status,
            r.order_id::text AS order_id, r.crm_customer_id::text AS customer_id,
            (c.first_name || ' ' || c.last_name) AS customer_name,
            COALESCE(eo.order_number, o.id) AS order_number,
            r.reason_code, r.notes,
            r.requested_at::text AS requested_at, r.approved_at::text AS approved_at,
            r.received_at::text AS received_at, r.completed_at::text AS completed_at,
            tev.payload->>'carrier' AS tracking_carrier,
            tev.payload->>'tracking_number' AS tracking_number,
            tev.payload->>'carrier_status' AS tracking_carrier_status,
            tev.created_at::text AS tracking_recorded_at,
            (SELECT count(*)::int FROM public.erp_return_lines l
              WHERE l.rma_id = r.id AND l.tenant_id = r.tenant_id) AS line_count
       FROM public.erp_return_authorizations r
       LEFT JOIN LATERAL (
         SELECT payload, created_at FROM public.commerce_return_events ev
          WHERE ev.rma_id = r.id AND ev.tenant_id = r.tenant_id
            AND ev.event_type = 'tracking_update'
          ORDER BY ev.created_at DESC LIMIT 1
       ) tev ON true
       LEFT JOIN public.crm_customers c ON c.id = r.crm_customer_id AND c.tenant_id = r.tenant_id
       LEFT JOIN public.commerce_orders o ON o.id = r.order_id::text AND o.tenant_id = r.tenant_id
       LEFT JOIN public.erp_orders eo ON eo.id = r.order_id AND eo.tenant_id = r.tenant_id
      WHERE r.tenant_id = $1
      ORDER BY r.requested_at DESC
      LIMIT 500`,
    [tenant],
  );

  const rmaRefunds = await pgQuery<Record<string, any>>(
    `SELECT f.id::text AS id, f.rma_id::text AS rma_id, 'commerce_refunds' AS source,
            f.refund_number AS reference, f.amount::text AS amount, f.status,
            f.refund_method, f.reason_code, f.created_at::text AS created_at
       FROM public.commerce_refunds f
      WHERE f.tenant_id = $1 AND f.rma_id IS NOT NULL
      UNION ALL
      SELECT f.id::text AS id, f.rma_id::text AS rma_id, 'erp_return_refunds' AS source,
             f.payment_reference AS reference, f.amount::text AS amount, f.status,
             NULL AS refund_method, NULL AS reason_code, f.created_at::text AS created_at
       FROM public.erp_return_refunds f
      WHERE f.tenant_id = $1
      ORDER BY created_at DESC`,
    [tenant],
  );
  const refundsByRma = new Map<string, any[]>();
  for (const f of rmaRefunds) {
    const arr = refundsByRma.get(f.rma_id) || [];
    arr.push(f);
    refundsByRma.set(f.rma_id, arr);
  }

  // ── D3 policy rules: the configured return windows (return_policy_rules)
  // Read BEFORE the facets — the overdue predicate applies them. A
  // missing store (pre-20261080) reads as "nothing configured", never
  // as an error: the fallback convention below governs, honestly named.
  const policyRules = await pgQuery<Record<string, any>>(
    `SELECT id::text AS id, scope, category_id::text AS category_id,
            category_label, window_days, is_legal_minimum, notes, is_active,
            created_at::text AS created_at, updated_at::text AS updated_at
       FROM public.return_policy_rules
      WHERE tenant_id = $1 AND is_active
      ORDER BY scope, window_days`,
    [tenant],
  ).catch(() => [] as Record<string, any>[]);
  const globalRule = policyRules.find((r) => r.scope === "global" && !r.is_legal_minimum) || null;
  const legalRule = policyRules.find((r) => r.is_legal_minimum) || null;
  const globalDays = globalRule ? Number(globalRule.window_days) : null;
  const legalMinimumDays = legalRule ? Number(legalRule.window_days) : null;
  const effectiveDays = Math.max(globalDays ?? 0, legalMinimumDays ?? 0) || null;
  const returnWindows = {
    configured: effectiveDays !== null,
    fallback: effectiveDays === null,
    globalDays,
    legalMinimumDays,
    effectiveDays,
    overdueHours: effectiveDays ? effectiveDays * 24 : 48,
    categoryRules: policyRules
      .filter((r) => r.scope === "category")
      .map((r) => ({ id: r.id, category_id: r.category_id, category_label: r.category_label, window_days: Number(r.window_days), is_legal_minimum: !!r.is_legal_minimum })),
  };

  // ── Facets over the union (predicates in the header) ──────────────────
  const facetRows = await pgQuery<{ facet: string; n: string }>(
    `SELECT 'action_required' AS facet, count(*)::text AS n FROM (
       SELECT 1 FROM public.customer_return_requests WHERE tenant_id = $1 AND status = 'requested'
       UNION ALL
       SELECT 1 FROM public.erp_return_authorizations WHERE tenant_id = $1 AND status IN ('requested','inspection')
     ) u
     UNION ALL
     SELECT 'awaiting_package', count(*)::text FROM (
       SELECT 1 FROM public.customer_return_requests WHERE tenant_id = $1 AND status = 'awaiting_package'
       UNION ALL
       SELECT 1 FROM public.erp_return_authorizations WHERE tenant_id = $1 AND status = 'awaiting_package'
     ) u
     UNION ALL
     SELECT 'overdue', count(*)::text FROM (
       SELECT 1 FROM public.customer_return_requests WHERE tenant_id = $1 AND status IN ('awaiting_package','in_transit') AND updated_at < now() - ($2 || ' hours')::interval
       UNION ALL
       SELECT 1 FROM public.erp_return_authorizations WHERE tenant_id = $1 AND status IN ('awaiting_package','in_transit') AND updated_at < now() - ($2 || ' hours')::interval
     ) u
     UNION ALL
     SELECT 'fraud_flags', count(*)::text FROM (
       SELECT 1 FROM public.customer_return_requests WHERE tenant_id = $1 AND lower(reason_code) = 'fraud'
       UNION ALL
       SELECT 1 FROM public.erp_return_authorizations WHERE tenant_id = $1 AND lower(reason_code) = 'fraud'
     ) u`,
    [tenant, String(returnWindows.overdueHours)],
  );
  const facets: Record<string, number> = { action_required: 0, awaiting_package: 0, overdue: 0, fraud_flags: 0 };
  for (const r of facetRows) facets[r.facet] = Number(r.n || 0);
  facets.all = requests.length + rmas.length;

  // ── D2 seller leg: seller-issued refunds (seller_refunds) ─────────────
  // Non-standard refunds + adjustments ride refund_type AS RECORDED — the
  // rows are served verbatim, never relabeled into the platform's types.
  const sellerRefunds = await pgQuery<Record<string, any>>(
    `SELECT f.id::text AS id, f.seller_id::text AS seller_id,
            COALESCE(s.display_name, s.legal_name) AS seller_name,
            f.return_id::text AS return_id, f.order_id::text AS order_id,
            f.amount::text AS amount, f.refund_type, f.status, f.notes,
            f.created_at::text AS created_at
       FROM public.seller_refunds f
       LEFT JOIN public.sellers s ON s.id = f.seller_id
      WHERE f.tenant_id = $1
      ORDER BY f.created_at DESC
      LIMIT 500`,
    [tenant],
  );

  // ── D3 oversight: seller return-rule configuration (seller_return_rules)
  const rules = await pgQuery<Record<string, any>>(
    `SELECT g.id::text AS id, g.seller_id::text AS seller_id,
            COALESCE(s.display_name, s.legal_name) AS seller_name,
            g.rule_type, g.listing_id::text AS listing_id,
            g.conditions, g.is_active, g.created_at::text AS created_at
       FROM public.seller_return_rules g
       LEFT JOIN public.sellers s ON s.id = g.seller_id
      WHERE g.tenant_id = $1
      ORDER BY g.created_at DESC
      LIMIT 500`,
    [tenant],
  );
  const ruleUsage = { keep_it: 0, replacement: 0, exemption: 0, other: 0, item_level: 0, total: rules.length };
  for (const g of rules) {
    const t = String(g.rule_type || "").toLowerCase();
    if (t === "keep_it") ruleUsage.keep_it++;
    else if (t === "replacement") ruleUsage.replacement++;
    else if (t === "exemption") ruleUsage.exemption++;
    else ruleUsage.other++;
    if (g.listing_id) ruleUsage.item_level++;
  }

  return NextResponse.json({
    requests: requests.map((r) => ({ ...r, source: "customer_return_requests" })),
    requestsUntenanted: Number(untenanted[0]?.n || 0),
    rmas: rmas.map((r) => ({
      ...r,
      source: "erp_return_authorizations",
      refunds: refundsByRma.get(r.id) || [],
    })),
    facets,
    sellerRefunds: sellerRefunds.map((f) => ({ ...f, source: "seller_refunds" })),
    rules: rules.map((g) => ({ ...g, source: "seller_return_rules" })),
    ruleUsage,
    policyRules: policyRules.map((r) => ({ ...r, source: "return_policy_rules" })),
    returnWindows,
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("orders", "write");
  if (gate) return gate;
  const tenant = resolveTenantId(req);

  let body: Record<string, any> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const leg = String(body.leg || "");
  const id = String(body.id || "");
  const notes = body.notes ? String(body.notes).slice(0, 4000) : null;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const actorId = await getActorIdFromRequest(req);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  // §2.2.7b — inbound-return tracking, recorded ON the return: the
  // carrier + tracking number the customer is shipping back with, kept
  // as a commerce_return_events 'tracking_update' event against the RMA
  // (the designed event store — previously written by nothing) and read
  // back on the GET above and by the workbench's track_return. Recording
  // tracking on an approved/awaiting-package RMA moves it to in_transit.
  if (String(body.action || "") === "tracking") {
    if (leg !== "rma") {
      return NextResponse.json({ error: "Inbound tracking is recorded on the RMA leg" }, { status: 400 });
    }
    const carrier = String(body.carrier || "").trim().slice(0, 80);
    const trackingNumber = String(body.tracking_number || "").trim().slice(0, 120);
    const carrierStatus = body.carrier_status ? String(body.carrier_status).trim().slice(0, 120) : null;
    if (!carrier || !trackingNumber) {
      return NextResponse.json({ error: "carrier and tracking_number are required to record inbound tracking" }, { status: 400 });
    }
    const cur = await pgQuery<{ status: string }>(
      `SELECT status::text AS status FROM public.erp_return_authorizations WHERE id = $1::uuid AND tenant_id = $2`,
      [id, tenant],
    );
    if (!cur.length) return NextResponse.json({ error: "Return not found" }, { status: 404 });
    if (RMA_TERMINAL.includes(cur[0].status)) {
      return NextResponse.json({ error: `Return is '${cur[0].status}' — it is closed and cannot take tracking` }, { status: 409 });
    }
    const newStatus = ["approved", "awaiting_package"].includes(cur[0].status) ? "in_transit" : cur[0].status;
    await pgQuery(
      `INSERT INTO public.commerce_return_events
         (id, tenant_id, rma_id, event_type, old_status, new_status, payload, created_by, created_at)
       VALUES (gen_random_uuid(), $1, $2::uuid, 'tracking_update', $3, $4, $5::jsonb,
               CASE WHEN $6 ~ '^[0-9a-fA-F-]{36}$' THEN $6::uuid ELSE NULL END, now())`,
      [tenant, id, cur[0].status, newStatus, JSON.stringify({ carrier, tracking_number: trackingNumber, carrier_status: carrierStatus, source: "admin_oversight" }), actorId],
    );
    if (newStatus !== cur[0].status) {
      await pgExec(
        `UPDATE public.erp_return_authorizations
            SET status = 'in_transit'::erp_return_status, updated_at = now()
          WHERE id = $1::uuid AND tenant_id = $2`,
        [id, tenant],
      );
    }
    await auditAction({ action: "track_return_inbound", domain: "erp", tableName: "commerce_return_events", recordId: id, afterData: { carrier, trackingNumber, fromStatus: cur[0].status, newStatus }, actorUserId: actorId, ipAddress: ip });
    return NextResponse.json({ ok: true, leg, id, carrier, trackingNumber, newStatus, message: `Inbound tracking recorded — return ${newStatus.replace(/_/g, " ")}` });
  }

  if (leg === "request") {
    const newStatus = REQUEST_DECISIONS[String(body.decision || "").toLowerCase()];
    if (!newStatus) {
      return NextResponse.json({ error: `Unknown review decision "${body.decision}" — use approve or reject` }, { status: 400 });
    }
    // §2.2.7a — a rejection records its reason: the review's notes ARE
    // the reason (stored in admin_notes); a reject without one is refused.
    if (newStatus === "rejected" && !notes) {
      return NextResponse.json({ error: "A reason is required to reject a return — add it in the review notes; it is recorded on the return." }, { status: 400 });
    }
    const cur = await pgQuery<{ status: string }>(
      `SELECT status FROM public.customer_return_requests WHERE id = $1::uuid AND tenant_id = $2`,
      [id, tenant],
    );
    if (!cur.length) return NextResponse.json({ error: "Return request not found" }, { status: 404 });
    if (REQUEST_TERMINAL.includes(cur[0].status)) {
      return NextResponse.json({ error: `Return request is '${cur[0].status}' — it is decided and cannot be rewritten` }, { status: 409 });
    }
    // The orders/actions review_return write shape: status + handled_by +
    // admin_notes, nothing else.
    const updated = await pgExec(
      `UPDATE public.customer_return_requests
          SET status = $1, handled_by = 'admin',
              admin_notes = COALESCE($2, admin_notes), updated_at = now()
        WHERE id = $3::uuid AND tenant_id = $4`,
      [newStatus, notes, id, tenant],
    );
    if (!updated) return NextResponse.json({ error: "Return request not found" }, { status: 404 });
    await auditAction({ action: "review_return", domain: "commerce", tableName: "customer_return_requests", recordId: id, afterData: { newStatus, notes, updated }, actorUserId: actorId, ipAddress: ip });
    return NextResponse.json({ ok: true, leg, id, newStatus, message: `Return request ${newStatus}` });
  }

  if (leg === "rma") {
    const newStatus = RMA_DECISIONS[String(body.decision || "").toLowerCase()];
    if (!newStatus) {
      return NextResponse.json({ error: `Unknown review decision "${body.decision}" — use approve, reject, or a return status` }, { status: 400 });
    }
    // §2.2.7a — same rule as the request leg: rejection requires the
    // reason, recorded in the RMA's notes.
    if (newStatus === "rejected" && !notes) {
      return NextResponse.json({ error: "A reason is required to reject a return — add it in the review notes; it is recorded on the return." }, { status: 400 });
    }
    const cur = await pgQuery<{ status: string }>(
      `SELECT status::text AS status FROM public.erp_return_authorizations WHERE id = $1::uuid AND tenant_id = $2`,
      [id, tenant],
    );
    if (!cur.length) return NextResponse.json({ error: "Return not found" }, { status: 404 });
    if (RMA_TERMINAL.includes(cur[0].status)) {
      return NextResponse.json({ error: `Return is '${cur[0].status}' — it is closed and cannot be rewritten from oversight (the workbench's rules govern reopening)` }, { status: 409 });
    }
    // The commerce/actions review_return UPDATE, verbatim.
    const updated = await pgExec(
      `UPDATE public.erp_return_authorizations
          SET status = $1::erp_return_status, notes = COALESCE($2, notes),
              approved_at = CASE WHEN $1 IN ('approved_for_refund','restocked','completed') THEN now() ELSE approved_at END,
              received_at = CASE WHEN $1 = 'received' THEN now() ELSE received_at END,
              completed_at = CASE WHEN $1 IN ('completed','refunded','exchanged','restocked') THEN now() ELSE completed_at END,
              updated_at = now()
        WHERE id = $3::uuid AND tenant_id = $4`,
      [newStatus, notes, id, tenant],
    );
    if (!updated) return NextResponse.json({ error: "Return not found" }, { status: 404 });
    await auditAction({ action: "review_return", domain: "erp", tableName: "erp_return_authorizations", recordId: id, afterData: { newStatus, notes, updated }, actorUserId: actorId, ipAddress: ip });
    return NextResponse.json({ ok: true, leg, id, newStatus, message: `Return ${newStatus}` });
  }

  return NextResponse.json({ error: `Unknown leg "${leg}" — use "request" or "rma"` }, { status: 400 });
}
