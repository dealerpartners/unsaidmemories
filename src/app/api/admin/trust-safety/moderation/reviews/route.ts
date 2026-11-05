import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Content moderation — shop product reviews (Admin tree F5 · Review queue).
//
// The store is public.reviews. The shop writes through the product_reviews
// VIEW (visible -> is_published) and its public GET only returns rows with
// visible = true. A submission therefore lands is_published = false
// (status defaults to 'published') and, until this route existed, NO admin
// surface could ever flip it — reviews accumulated invisible forever.
//
// Moderation state is derived from the row's own columns (no new schema):
//   pending  = is_published false AND status <> 'rejected'  (undecided)
//   visible  = is_published true
//   rejected = status = 'rejected'
// Actions keep the two columns consistent with the CHECK vocabulary
// (pending | published | rejected):
//   approve -> is_published true,  status 'published'
//   reject  -> is_published false, status 'rejected'
//   hide    -> is_published false, status 'pending'   (back to the queue)
// Every action is stamped into seller_audit_log via writeSellerAudit
// (entity_type 'product_review') — reviews carries no decision columns,
// so the audit log is the decision record.
// ---------------------------------------------------------------------------

const STATE_COND: Record<string, string> = {
  pending: "NOT r.is_published AND r.status <> 'rejected'",
  visible: "r.is_published",
  rejected: "r.status = 'rejected'",
  all: "TRUE",
};

const ACTIONS: Record<string, { isPublished: boolean; status: string; audit: string }> = {
  approve: { isPublished: true, status: "published", audit: "review.approved" },
  reject: { isPublished: false, status: "rejected", audit: "review.rejected" },
  hide: { isPublished: false, status: "pending", audit: "review.hidden" },
};

// GET /api/admin/trust-safety/moderation/reviews?state=pending|visible|rejected|all
export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("trust_safety", "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  const state = (req.nextUrl.searchParams.get("state") || "pending").trim();
  const cond = STATE_COND[state] ?? STATE_COND.pending;

  try {
    const out = await withPg(async (c) => {
      const { rows } = await c.query(
        `SELECT r.id, r.product_id, p.name AS product_name, p.slug AS product_slug,
                r.customer_id, cu.email AS customer_email, r.author_name,
                r.rating, r.title, r.body, r.is_verified_purchase,
                r.is_published, r.status, r.created_at
           FROM public.reviews r
           LEFT JOIN public.commerce_products p ON p.id = r.product_id::text
           LEFT JOIN public.customers cu ON cu.id = r.customer_id
          WHERE r.tenant_id = $1 AND ${cond}
          ORDER BY r.created_at DESC LIMIT 200`,
        [tenant]
      );
      const { rows: counts } = await c.query(
        `SELECT count(*) FILTER (WHERE NOT is_published AND status <> 'rejected')::int AS pending,
                count(*) FILTER (WHERE is_published)::int AS visible,
                count(*) FILTER (WHERE status = 'rejected')::int AS rejected,
                count(*)::int AS total
           FROM public.reviews WHERE tenant_id = $1`,
        [tenant]
      );
      return { reviews: rows, counts: counts[0] ?? { pending: 0, visible: 0, rejected: 0, total: 0 } };
    });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "review queue failed" }, { status: 500 });
  }
}

// PATCH /api/admin/trust-safety/moderation/reviews { id, action }
export async function PATCH(req: NextRequest) {
  const denied = await requireModuleApi("trust_safety", "write");
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "");
  const action = ACTIONS[String(body.action || "")];
  if (!id || !action) {
    return NextResponse.json({ error: "id and a valid action (approve|reject|hide) required" }, { status: 400 });
  }
  const tenant = resolveTenantId(req);
  const actorId = await getActorIdFromRequest(req);
  const ipAddress = requestIp(req);

  try {
    const out = await withPg(async (c) => {
      const { rows: before } = await c.query(
        `SELECT status, is_published FROM public.reviews WHERE id = $1::uuid AND tenant_id = $2`,
        [id, tenant]
      );
      if (!before[0]) return { updated: false, review: null };
      const { rows } = await c.query(
        `UPDATE public.reviews
            SET is_published = $1, status = $2, updated_at = now()
          WHERE id = $3::uuid AND tenant_id = $4
          RETURNING id, status, is_published`,
        [action.isPublished, action.status, id, tenant]
      );
      if (rows[0]) {
        await writeSellerAudit(c, {
          tenantId: tenant, sellerId: null, actorId, ipAddress,
          action: action.audit, entityType: "product_review", entityId: id,
          beforeState: { status: before[0].status, is_published: before[0].is_published },
          afterState: { status: action.status, is_published: action.isPublished },
        });
      }
      return { updated: rows.length > 0, review: rows[0] || null };
    });
    if (!out?.updated) return NextResponse.json({ error: "review not found" }, { status: 404 });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "review moderation failed" }, { status: 500 });
  }
}
