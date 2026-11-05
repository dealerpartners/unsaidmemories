import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Content moderation — seller forum (Admin tree F5 · Forum moderation).
//
// Stores: public.seller_forum_threads + public.seller_forum_replies.
// Nothing at main read or wrote either table before this route.
//   Threads carry a free-text status (default 'open') — the moderation
//   vocabulary here is: open | hidden | closed | removed.
//   Replies carried NO state column at all until migration 20261054
//   added moderation_status (visible | hidden | removed, default
//   'visible') + moderated_by/at — an individual reply can now be
//   hidden or removed without touching its thread.
// Every action stamps seller_audit_log (entity forum_thread/forum_reply).
// ---------------------------------------------------------------------------

const THREAD_STATUSES = ["open", "hidden", "closed", "removed"];
const REPLY_STATUSES = ["visible", "hidden", "removed"];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/admin/trust-safety/moderation/forum
export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("trust_safety", "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);

  try {
    const out = await withPg(async (c) => {
      const { rows: threads } = await c.query(
        `SELECT t.id, t.title, t.body, t.status, t.seller_id,
                s.display_name AS seller_name, t.created_at, t.updated_at,
                (SELECT count(*)::int FROM public.seller_forum_replies r
                  WHERE r.thread_id = t.id AND r.tenant_id = t.tenant_id) AS reply_count
           FROM public.seller_forum_threads t
           LEFT JOIN public.sellers s ON s.id = t.seller_id AND s.tenant_id = t.tenant_id
          WHERE t.tenant_id = $1
          ORDER BY t.updated_at DESC LIMIT 200`,
        [tenant]
      );
      const { rows: replies } = await c.query(
        `SELECT r.id, r.thread_id, th.title AS thread_title, r.seller_id,
                s.display_name AS seller_name, r.body, r.moderation_status, r.created_at
           FROM public.seller_forum_replies r
           JOIN public.seller_forum_threads th
             ON th.id = r.thread_id AND th.tenant_id = r.tenant_id
           LEFT JOIN public.sellers s ON s.id = r.seller_id AND s.tenant_id = r.tenant_id
          WHERE r.tenant_id = $1
          ORDER BY r.created_at DESC LIMIT 200`,
        [tenant]
      );
      return { threads, replies };
    });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "forum moderation failed" }, { status: 500 });
  }
}

// PATCH /api/admin/trust-safety/moderation/forum
//   { kind: 'thread', id, status } | { kind: 'reply', id, moderation_status }
export async function PATCH(req: NextRequest) {
  const denied = await requireModuleApi("trust_safety", "write");
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const kind = String(body.kind || "");
  const id = String(body.id || "");
  const tenant = resolveTenantId(req);
  const actorId = await getActorIdFromRequest(req);
  const ipAddress = requestIp(req);

  try {
    const out = await withPg(async (c) => {
      if (kind === "thread") {
        const status = String(body.status || "");
        if (!THREAD_STATUSES.includes(status)) return { error: "invalid thread status" };
        const { rows: before } = await c.query(
          `SELECT status, seller_id FROM public.seller_forum_threads WHERE id = $1::uuid AND tenant_id = $2`,
          [id, tenant]
        );
        if (!before[0]) return { error: "thread not found" };
        const { rows } = await c.query(
          `UPDATE public.seller_forum_threads SET status = $1, updated_at = now()
            WHERE id = $2::uuid AND tenant_id = $3 RETURNING id, status`,
          [status, id, tenant]
        );
        await writeSellerAudit(c, {
          tenantId: tenant, sellerId: before[0].seller_id ?? null, actorId, ipAddress,
          action: "forum_thread.status_changed", entityType: "forum_thread", entityId: id,
          beforeState: { status: before[0].status }, afterState: { status },
        });
        return { updated: true, thread: rows[0] };
      }
      if (kind === "reply") {
        const moderationStatus = String(body.moderation_status || "");
        if (!REPLY_STATUSES.includes(moderationStatus)) return { error: "invalid reply moderation_status" };
        const { rows: before } = await c.query(
          `SELECT moderation_status, seller_id FROM public.seller_forum_replies WHERE id = $1::uuid AND tenant_id = $2`,
          [id, tenant]
        );
        if (!before[0]) return { error: "reply not found" };
        const { rows } = await c.query(
          `UPDATE public.seller_forum_replies
              SET moderation_status = $1, moderated_by = $2::uuid, moderated_at = now()
            WHERE id = $3::uuid AND tenant_id = $4
            RETURNING id, moderation_status`,
          [moderationStatus, actorId && UUID_RE.test(actorId) ? actorId : null, id, tenant]
        );
        await writeSellerAudit(c, {
          tenantId: tenant, sellerId: before[0].seller_id ?? null, actorId, ipAddress,
          action: "forum_reply.moderation_changed", entityType: "forum_reply", entityId: id,
          beforeState: { moderation_status: before[0].moderation_status },
          afterState: { moderation_status: moderationStatus },
        });
        return { updated: true, reply: rows[0] };
      }
      return { error: "kind must be 'thread' or 'reply'" };
    });
    if ((out as any)?.error) {
      const msg = String((out as any).error);
      return NextResponse.json({ error: msg }, { status: msg.includes("not found") ? 404 : 400 });
    }
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "forum moderation update failed" }, { status: 500 });
  }
}
