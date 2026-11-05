import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Content moderation — message flag review (Admin tree F5 · Flag queue).
//
// The store is public.message_flags (migration 20261089), written by the
// message surfaces — the first writer is the customer's support thread
// (POST /api/customer/messages action=flag). Each flag points at a
// crm_messages row; the queue reads the flag joined to the message it
// flags (body, channel, direction, when it was sent). Review actions:
//   dismiss  -> status 'dismissed' (reviewed, no action warranted)
//   actioned -> status 'actioned'  (reviewed, handled outside this queue —
//               e.g. a support ticket or a governance case; the flag row
//               records who decided and when)
// Every decision is stamped into seller_audit_log via writeSellerAudit
// (entity_type 'message_flag'), the same decision record the sibling
// review queue uses.
// ---------------------------------------------------------------------------

const STATE_COND: Record<string, string> = {
  open: "f.status = 'open'",
  dismissed: "f.status = 'dismissed'",
  actioned: "f.status = 'actioned'",
  all: "TRUE",
};

const ACTIONS: Record<string, { status: string; audit: string }> = {
  dismiss: { status: "dismissed", audit: "message_flag.dismissed" },
  actioned: { status: "actioned", audit: "message_flag.actioned" },
  reopen: { status: "open", audit: "message_flag.reopened" },
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/admin/trust-safety/moderation/flags?state=open|dismissed|actioned|all
export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("trust_safety", "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  const state = (req.nextUrl.searchParams.get("state") || "open").trim();
  const cond = STATE_COND[state] ?? STATE_COND.open;

  try {
    const out = await withPg(async (c) => {
      const { rows } = await c.query(
        `SELECT f.id, f.message_id, f.reporter_type, f.reporter_id, f.reason,
                f.status, f.reviewed_by, f.reviewed_at, f.created_at,
                m.body AS message_body, m.subject AS message_subject,
                m.channel AS message_channel, m.direction AS message_direction,
                COALESCE(m.sent_at, m.created_at) AS message_at,
                m.customer_id AS message_customer_id
           FROM public.message_flags f
           JOIN public.crm_messages m ON m.id = f.message_id
          WHERE f.tenant_id = $1 AND ${cond}
          ORDER BY f.created_at DESC LIMIT 200`,
        [tenant]
      );
      const { rows: counts } = await c.query(
        `SELECT count(*) FILTER (WHERE status = 'open')::int AS open,
                count(*) FILTER (WHERE status = 'dismissed')::int AS dismissed,
                count(*) FILTER (WHERE status = 'actioned')::int AS actioned,
                count(*)::int AS total
           FROM public.message_flags WHERE tenant_id = $1`,
        [tenant]
      );
      return { flags: rows, counts: counts[0] ?? { open: 0, dismissed: 0, actioned: 0, total: 0 } };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json(
      { error: "flag queue failed (is migration 20261089 applied?)" },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/trust-safety/moderation/flags { id, action }
export async function PATCH(req: NextRequest) {
  const denied = await requireModuleApi("trust_safety", "write");
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "");
  const action = ACTIONS[String(body.action || "")];
  if (!UUID_RE.test(id) || !action) {
    return NextResponse.json({ error: "id (uuid) and a valid action (dismiss|actioned|reopen) required" }, { status: 400 });
  }
  const tenant = resolveTenantId(req);
  const actorId = await getActorIdFromRequest(req);
  const ipAddress = requestIp(req);

  try {
    const out = await withPg(async (c) => {
      const { rows: before } = await c.query(
        `SELECT status FROM public.message_flags WHERE id = $1::uuid AND tenant_id = $2`,
        [id, tenant]
      );
      if (!before[0]) return { updated: false, flag: null };
      const { rows } = await c.query(
        `UPDATE public.message_flags
            SET status = $1, reviewed_by = $2,
                reviewed_at = CASE WHEN $1 = 'open' THEN NULL ELSE now() END
          WHERE id = $3::uuid AND tenant_id = $4
          RETURNING id, status, reviewed_by, reviewed_at`,
        [action.status, actorId, id, tenant]
      );
      return { updated: true, flag: rows[0], beforeStatus: before[0].status };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    if (!out.updated) return NextResponse.json({ error: "Flag not found" }, { status: 404 });
    await writeSellerAudit(null, {
      tenantId: tenant,
      actorId,
      entityType: "message_flag",
      entityId: id,
      action: action.audit,
      beforeState: { status: (out as any).beforeStatus },
      afterState: { status: action.status },
      ipAddress,
    }).catch(() => {});
    return NextResponse.json({ flag: out.flag });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "flag action failed" }, { status: 500 });
  }
}
