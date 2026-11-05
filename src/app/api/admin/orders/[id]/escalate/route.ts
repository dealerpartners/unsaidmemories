import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { loadOrder, logOrderEvent } from "@/lib/orders/lifecycle";
import { auditAction, getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit";
import { isInvestigationType } from "@/lib/trust-safety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// POST /api/admin/orders/[id]/escalate — Admin Tree C2 · Escalate to
// Trust & Safety.
//
// Until this route there was no order → T&S handoff anywhere (census
// C2, 2026-10-15): order_cases existed as an order-case store with no
// handoff, and seller_investigations had no order-born writer. One
// escalation writes BOTH halves of the handoff, linked both ways:
//
//   1. an order_cases row on the order (subject names the escalation;
//      the investigation id rides the case's investigation_id column —
//      migration 20261084 — and its note text, so the link is readable
//      from the order and the customer profile either way);
//   2. a seller_investigations row born 'open' in the T&S queue,
//      typed with the F3 vocabulary (lib/trust-safety), carrying the
//      order id in its order_id column (20261080) and its notes. The
//      seller is the order's attributed seller (the orders queue's own
//      attribution: seller_listings via the items, or the catalog
//      item's metadata seller_id). A house order with no attributed
//      seller still escalates — seller_id is NULL on the investigation
//      (20261080 dropped its NOT NULL, the appeals precedent) and the
//      queue shows it seller-less rather than losing the escalation.
//
// Duplicate guard: an order with an investigation still open or in
// progress 409s and names it — re-escalation is possible once the
// earlier investigation closes, never stacked silently.
//
// Audit: 'escalated_to_trust_safety' fulfillment event on the order,
// auditAction on the commerce log, and seller_audit_log when a seller
// is attributed (investigation.opened_from_order).
// ============================================================================

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireModuleApi("orders", "write");
  if (gate) return gate;

  const { id } = await params;
  const tenant = resolveTenantId(req);
  const body = await req.json().catch(() => ({}));
  const reason = String(body?.reason || "").trim();
  if (!reason) {
    return NextResponse.json({ error: "A reason is required — Trust & Safety needs to know what they are looking at." }, { status: 400 });
  }
  const investigationType = body?.investigation_type ? String(body.investigation_type).trim() : "fraud_patterns";
  if (!isInvestigationType(investigationType)) {
    return NextResponse.json({ error: "investigation_type must be one of the F3 types (counterfeit, stolen_property, ip_infringement, fraud_patterns, safety_incidents)" }, { status: 400 });
  }
  const priority = body?.priority ? String(body.priority).trim().toLowerCase() : "high";
  if (!["critical", "high", "medium", "low"].includes(priority)) {
    return NextResponse.json({ error: "priority must be critical|high|medium|low" }, { status: 400 });
  }
  const note = body?.note ? String(body.note).trim().slice(0, 4000) : null;
  const actorId = await getActorIdFromRequest(req);
  const ipAddress = requestIp(req);

  const outcome = await withPg(async (client) => {
    const order = await loadOrder(client, tenant, id);
    if (!order) return { error: "Order not found", status: 404 } as const;

    // Already escalated and still open? Name it instead of stacking.
    const dup = await client.query(
      `SELECT id::text AS id, status FROM public.seller_investigations
        WHERE tenant_id = $1 AND order_id = $2 AND status IN ('open', 'in_progress')
        ORDER BY created_at DESC LIMIT 1`,
      [tenant, id]
    );
    if (dup.rows[0]) {
      return {
        error: `This order is already escalated — investigation ${dup.rows[0].id} is '${dup.rows[0].status}' in the Trust & Safety queue`,
        status: 409,
      } as const;
    }

    // The attributed seller, via the orders queue's own attribution.
    const sellerRes = await client.query(
      `SELECT s.id::text AS id, COALESCE(s.display_name, s.legal_name) AS name
         FROM public.sellers s
        WHERE s.tenant_id = $1
          AND (EXISTS (SELECT 1 FROM public.commerce_order_items oi
                         JOIN public.seller_listings sl ON sl.product_id::text = oi.product_id::text
                        WHERE oi.order_id::text = $2 AND sl.seller_id = s.id)
               OR EXISTS (SELECT 1 FROM public.commerce_order_items oi
                            JOIN public.commerce_catalog_items ci ON ci.id::text = oi.product_id::text
                           WHERE oi.order_id::text = $2 AND ci.metadata->>'seller_id' = s.id::text))
        LIMIT 1`,
      [tenant, id]
    );
    const seller = sellerRes.rows[0] || null;

    // 1) The investigation (born 'open' in the T&S queue). order_id is a
    // 20261080 column — if the migration has not applied yet the insert
    // retries without it; the link still rides notes + the case row.
    const invNotes = [
      `Escalated from order ${id}.`,
      `Reason: ${reason.slice(0, 1000)}`,
      note ? `Note: ${note}` : null,
      seller ? null : "No seller is attributed to this order (house order) — seller_id is unset.",
    ].filter(Boolean).join("\n");
    let investigation: any = null;
    try {
      const r = await client.query(
        `INSERT INTO public.seller_investigations
           (tenant_id, seller_id, investigation_type, status, priority, notes, order_id)
         VALUES ($1, $2::uuid, $3, 'open', $4, $5, $6)
         RETURNING id::text AS id, status, priority, investigation_type, created_at::text AS created_at`,
        [tenant, seller?.id ?? null, investigationType, priority, invNotes, id]
      );
      investigation = r.rows[0];
    } catch (e: any) {
      if (!/order_id/.test(String(e?.message || ""))) throw e;
      const r = await client.query(
        `INSERT INTO public.seller_investigations
           (tenant_id, seller_id, investigation_type, status, priority, notes)
         VALUES ($1, $2::uuid, $3, 'open', $4, $5)
         RETURNING id::text AS id, status, priority, investigation_type, created_at::text AS created_at`,
        [tenant, seller?.id ?? null, investigationType, priority, invNotes]
      );
      investigation = r.rows[0];
    }

    if (!investigation) throw new Error("Investigation insert did not land");
    // 2) The order case, linked to the investigation both in its column
    // (when 20261080 has applied) and in its note text (always).
    const caseNote = [
      `Escalated to Trust & Safety — investigation ${investigation.id} (${investigationType}, ${priority}).`,
      note,
    ].filter(Boolean).join("\n");
    const caseRes = await client.query(
      `INSERT INTO public.order_cases
         (tenant_id, order_id, customer_id, customer_email, subject, reason, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id::text AS id, subject, status, created_at::text AS created_at`,
      [tenant, id, order.customer_id || null, order.customer_email_resolved || null,
       `Escalated to Trust & Safety: ${reason.slice(0, 220)}`, reason.slice(0, 120),
       caseNote, actorId]
    );
    if (!caseRes.rows[0]) throw new Error("Order case insert did not land");
    const orderCase = caseRes.rows[0];
    await client.query(
      `UPDATE public.order_cases
          SET investigation_id = $2::uuid, escalated_at = now(), escalated_by = $3, updated_at = now()
        WHERE tenant_id = $1 AND id = $4::uuid`,
      [tenant, investigation.id, actorId, orderCase.id]
    ).catch((e: any) => console.error("[orders/escalate] case link columns unavailable (pre-20261080?):", e?.message || e));

    await logOrderEvent(client, tenant, id, "escalated_to_trust_safety",
      String(order.fulfillment_status || "pending"), String(order.fulfillment_status || "pending"),
      { reason, investigationId: investigation.id, caseId: orderCase.id, investigationType, priority, sellerId: seller?.id ?? null });

    if (seller) {
      await writeSellerAudit(client, {
        tenantId: tenant, sellerId: seller.id, actorId, ipAddress,
        action: "investigation.opened_from_order", entityType: "seller_investigation",
        entityId: investigation.id,
        afterState: { order_id: id, case_id: orderCase.id, investigation_type: investigationType, priority, reason },
      });
    }
    return { ok: true, orderCase, investigation, seller } as const;
  });

  if (!outcome) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  if ("error" in outcome) return NextResponse.json({ error: outcome.error }, { status: outcome.status });

  await auditAction({
    action: "escalate_to_trust_safety", domain: "commerce", tableName: "seller_investigations",
    recordId: outcome.investigation.id, actorUserId: actorId, ipAddress,
    afterData: { order_id: id, case_id: outcome.orderCase.id, investigation_type: outcome.investigation.investigation_type, seller_id: outcome.seller?.id ?? null, reason },
  }).catch(() => { /* fail-soft */ });

  try {
    revalidatePath("/admin/orders");
    revalidatePath("/admin/trust-safety/investigations");
  } catch { /* best-effort */ }

  return NextResponse.json({
    ok: true, orderId: id,
    case: outcome.orderCase,
    investigation: outcome.investigation,
    seller: outcome.seller,
    note: outcome.seller
      ? `Escalated: case opened on the order and investigation opened for ${outcome.seller.name || "the attributed seller"} in the Trust & Safety queue.`
      : "Escalated: case opened on the order and investigation opened in the Trust & Safety queue. No seller is attributed to this order, so the investigation carries no seller.",
  }, { status: 201 });
}
