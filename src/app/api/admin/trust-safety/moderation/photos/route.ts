import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Content moderation — listing photos (Admin tree F5 · Photo moderation).
//
// Store: public.seller_listing_media. Nothing at main read this table
// before this route, and the table carried NO decision column until
// migration 20261054 added moderation_status (pending | approved |
// rejected, default 'pending') + moderated_by/at. The queue below is
// the only writer of that column.
// Actions stamp seller_audit_log (entity_type 'listing_media').
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATES = ["pending", "approved", "rejected", "all"];

// GET /api/admin/trust-safety/moderation/photos?state=pending|approved|rejected|all
export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("trust_safety", "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  const state = (req.nextUrl.searchParams.get("state") || "pending").trim();
  const filter = STATES.includes(state) ? state : "pending";

  try {
    const out = await withPg(async (c) => {
      const conds = ["m.tenant_id = $1"];
      const params: any[] = [tenant];
      if (filter !== "all") {
        params.push(filter);
        conds.push(`m.moderation_status = $${params.length}`);
      }
      const { rows } = await c.query(
        `SELECT m.id, m.listing_id, l.title AS listing_title, l.seller_id,
                s.display_name AS seller_name, m.url, m.alt_text, m.sort_order,
                m.is_primary, m.moderation_status, m.moderated_at, m.created_at
           FROM public.seller_listing_media m
           LEFT JOIN public.seller_listings l
             ON l.id = m.listing_id AND l.tenant_id = m.tenant_id
           LEFT JOIN public.sellers s
             ON s.id = l.seller_id AND s.tenant_id = m.tenant_id
          WHERE ${conds.join(" AND ")}
          ORDER BY m.created_at DESC LIMIT 200`,
        params
      );
      const { rows: counts } = await c.query(
        `SELECT count(*) FILTER (WHERE moderation_status = 'pending')::int AS pending,
                count(*) FILTER (WHERE moderation_status = 'approved')::int AS approved,
                count(*) FILTER (WHERE moderation_status = 'rejected')::int AS rejected,
                count(*)::int AS total
           FROM public.seller_listing_media WHERE tenant_id = $1`,
        [tenant]
      );
      return { photos: rows, counts: counts[0] ?? { pending: 0, approved: 0, rejected: 0, total: 0 } };
    });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "photo queue failed" }, { status: 500 });
  }
}

// PATCH /api/admin/trust-safety/moderation/photos { id, action: approve|reject }
export async function PATCH(req: NextRequest) {
  const denied = await requireModuleApi("trust_safety", "write");
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "");
  const actionName = String(body.action || "");
  const next = actionName === "approve" ? "approved" : actionName === "reject" ? "rejected" : null;
  if (!id || !next) {
    return NextResponse.json({ error: "id and action (approve|reject) required" }, { status: 400 });
  }
  const tenant = resolveTenantId(req);
  const actorId = await getActorIdFromRequest(req);
  const ipAddress = requestIp(req);

  try {
    const out = await withPg(async (c) => {
      const { rows: before } = await c.query(
        `SELECT m.moderation_status, l.seller_id
           FROM public.seller_listing_media m
           LEFT JOIN public.seller_listings l
             ON l.id = m.listing_id AND l.tenant_id = m.tenant_id
          WHERE m.id = $1::uuid AND m.tenant_id = $2`,
        [id, tenant]
      );
      if (!before[0]) return { updated: false, photo: null };
      const { rows } = await c.query(
        `UPDATE public.seller_listing_media
            SET moderation_status = $1, moderated_by = $2::uuid, moderated_at = now()
          WHERE id = $3::uuid AND tenant_id = $4
          RETURNING id, moderation_status`,
        [next, actorId && UUID_RE.test(actorId) ? actorId : null, id, tenant]
      );
      if (rows[0]) {
        await writeSellerAudit(c, {
          tenantId: tenant, sellerId: before[0].seller_id ?? null, actorId, ipAddress,
          action: `listing_media.${next}`, entityType: "listing_media", entityId: id,
          beforeState: { moderation_status: before[0].moderation_status },
          afterState: { moderation_status: next },
        });
      }
      return { updated: rows.length > 0, photo: rows[0] || null };
    });
    if (!out?.updated) return NextResponse.json({ error: "photo not found" }, { status: 404 });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "photo moderation failed" }, { status: 500 });
  }
}
