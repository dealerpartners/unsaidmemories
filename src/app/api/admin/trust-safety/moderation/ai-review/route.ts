import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit";
import { runReviewModerationPass, type ReviewRecommendation } from "@/lib/ai-ops/review-moderation";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// AI content review queue (Admin tree F5 · AI content review).
// Proposals are ai_tasks of the registered review_moderation function,
// produced by the deterministic pass in src/lib/ai-ops/review-moderation
// .ts over PENDING reviews — the manual review queue's exact pending
// set. The desk decides here: 'applied' takes the proposal's
// recommended action on the review (through the manual queue's own
// column semantics and audit actions); 'dismissed' records the human
// override and changes nothing. A proposal NEVER executes itself.
// ---------------------------------------------------------------------------

// GET -> proposed + recently decided AI review proposals, with the
// review's current state read alongside.
export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("trust_safety", "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);

  try {
    const out = await withPg(async (c) => {
      const { rows } = await c.query(
        `SELECT t.id, t.state, t.decided_at, t.created_at,
                t.output->>'recommendation' AS recommendation,
                t.output->>'rationale' AS rationale,
                t.output->'signals' AS signals,
                t.output->'review' AS review_snapshot,
                r.id AS review_id, r.rating, r.title, r.body, r.author_name,
                r.is_published, r.status AS review_status,
                p.name AS product_name
           FROM public.ai_tasks t
           LEFT JOIN public.reviews r ON r.id = t.subject_id AND r.tenant_id = t.tenant_id
           LEFT JOIN public.commerce_products p ON p.id = r.product_id::text
          WHERE t.tenant_id = $1 AND t.function = 'review_moderation' AND t.subject_type = 'review'
          ORDER BY (t.state = 'proposed') DESC, t.created_at DESC LIMIT 200`,
        [tenant]
      );
      return { proposals: rows };
    });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "ai review queue failed" }, { status: 500 });
  }
}

// POST -> run the producer pass over pending reviews now.
export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("trust_safety", "write");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  const actorId = await getActorIdFromRequest(req);
  const ipAddress = requestIp(req);

  try {
    const out = await withPg(async (c) => runReviewModerationPass(c as any, tenant, actorId, ipAddress));
    return NextResponse.json({ run: out });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "ai review pass failed" }, { status: 500 });
  }
}

const APPLY: Record<ReviewRecommendation, { isPublished: boolean; status: string; audit: string }> = {
  approve: { isPublished: true, status: "published", audit: "review.approved" },
  reject: { isPublished: false, status: "rejected", audit: "review.rejected" },
  hide: { isPublished: false, status: "pending", audit: "review.hidden" },
};

// PATCH { id, decision: 'applied'|'dismissed' } -> decide one proposal.
export async function PATCH(req: NextRequest) {
  const denied = await requireModuleApi("trust_safety", "write");
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "");
  const decision = String(body.decision || "");
  if (!id || !["applied", "dismissed"].includes(decision)) {
    return NextResponse.json({ error: "id and decision (applied|dismissed) required" }, { status: 400 });
  }
  const tenant = resolveTenantId(req);
  const actorId = await getActorIdFromRequest(req);
  const ipAddress = requestIp(req);

  try {
    const out = await withPg(async (c) => {
      const { rows: taskRows } = await c.query(
        `SELECT id, subject_id, state, output->>'recommendation' AS recommendation
           FROM public.ai_tasks
          WHERE tenant_id = $1 AND id = $2::uuid AND function = 'review_moderation' AND subject_type = 'review'`,
        [tenant, id]
      );
      const task = taskRows[0];
      if (!task) return { error: "proposal not found" as const };
      if (task.state !== "proposed") return { error: "proposal already decided" as const };

      let appliedAction: string | null = null;
      if (decision === "applied") {
        const apply = APPLY[task.recommendation as ReviewRecommendation];
        if (!apply) return { error: "proposal carries no applicable recommendation" as const };
        const { rows: before } = await c.query(
          `SELECT status, is_published FROM public.reviews WHERE id = $1::uuid AND tenant_id = $2`,
          [task.subject_id, tenant]
        );
        if (!before[0]) return { error: "review not found" as const };
        await c.query(
          `UPDATE public.reviews SET is_published = $1, status = $2, updated_at = now()
            WHERE id = $3::uuid AND tenant_id = $4`,
          [apply.isPublished, apply.status, task.subject_id, tenant]
        );
        appliedAction = task.recommendation;
        await writeSellerAudit(c, {
          tenantId: tenant, sellerId: null, actorId, ipAddress,
          action: apply.audit, entityType: "product_review", entityId: String(task.subject_id),
          beforeState: { status: before[0].status, is_published: before[0].is_published },
          afterState: { status: apply.status, is_published: apply.isPublished, via: "ai_content_review", task_id: id },
        });
      }

      const { rows } = await c.query(
        `UPDATE public.ai_tasks
            SET state = $3, decided_by = $4::uuid, decided_at = now(), updated_at = now()
          WHERE tenant_id = $1 AND id = $2::uuid AND state = 'proposed'
          RETURNING id, state, decided_at`,
        [tenant, id, decision, actorId]
      );
      if (!rows[0]) return { error: "proposal already decided" as const };
      await writeSellerAudit(c, {
        tenantId: tenant, actorId, ipAddress,
        action: "ai_task.decided", entityType: "ai_task", entityId: id,
        afterState: { decision, function: "review_moderation", applied_action: appliedAction },
      });
      return { task: rows[0], applied_action: appliedAction };
    });
    if (!out) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }
    if ("error" in out) {
      return NextResponse.json({ error: out.error }, { status: out.error === "proposal not found" || out.error === "review not found" ? 404 : 409 });
    }
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "ai review decision failed" }, { status: 500 });
  }
}
