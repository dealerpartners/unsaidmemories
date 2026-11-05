import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";

export const dynamic = "force-dynamic";

// GET /api/admin/trust-safety/summary -> real counts for the Trust & Safety dashboard
export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("trust_safety", "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);

  try {
    const out = await withPg(async (c) => {
      const v = await c.query(
        `SELECT count(*) FILTER (WHERE status = 'open')::int AS open_violations,
                count(*) FILTER (WHERE status = 'resolved' AND created_at > now() - interval '30 days')::int AS resolved_30d
           FROM public.seller_violations WHERE tenant_id = $1`,
        [tenant]
      );
      const a = await c.query(
        `SELECT count(*) FILTER (WHERE status = 'pending')::int AS pending_appeals
           FROM public.seller_appeals WHERE tenant_id = $1`,
        [tenant]
      );
      const i = await c.query(
        `SELECT count(*) FILTER (WHERE status IN ('open','in_progress'))::int AS active_investigations
           FROM public.seller_investigations WHERE tenant_id = $1`,
        [tenant]
      );
      const recent = await c.query(
        `SELECT id, 'violation' AS kind, violation_type AS label, status, created_at
           FROM public.seller_violations WHERE tenant_id = $1
          UNION ALL
         SELECT id, 'appeal' AS kind, appeal_text AS label, status, created_at
           FROM public.seller_appeals WHERE tenant_id = $1
          UNION ALL
         SELECT id, 'investigation' AS kind, findings AS label, status, created_at
           FROM public.seller_investigations WHERE tenant_id = $1
          ORDER BY created_at DESC LIMIT 10`,
        [tenant]
      );
      return {
        openViolations: v.rows[0]?.open_violations ?? 0,
        resolved30d: v.rows[0]?.resolved_30d ?? 0,
        pendingAppeals: a.rows[0]?.pending_appeals ?? 0,
        activeInvestigations: i.rows[0]?.active_investigations ?? 0,
        recent: recent.rows,
      };
    });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "summary failed" }, { status: 500 });
  }
}
