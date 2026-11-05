import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Trust & Safety — repeat offenders (Admin tree F1 · Repeat offenders).
//
// The violations queue lists individual rows; nothing aggregated them
// per seller. This read rolls public.seller_violations up by seller:
// totals, open count, and counts by severity, newest violation last.
// REPEAT_THRESHOLD is the platform's repeat-offender line — a seller at
// or over it is flagged is_repeat so the desk can prioritize.
// Read-only: enforcement actions stay in the violations queue.
// ---------------------------------------------------------------------------

const REPEAT_THRESHOLD = 3;

// GET /api/admin/trust-safety/repeat-offenders
export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("trust_safety", "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);

  try {
    const out = await withPg(async (c) => {
      const { rows } = await c.query(
        `SELECT v.seller_id, s.display_name AS seller_name,
                count(*)::int AS total,
                count(*) FILTER (WHERE v.status = 'open')::int AS open_count,
                count(*) FILTER (WHERE v.severity = 'critical')::int AS critical_count,
                count(*) FILTER (WHERE v.severity = 'high')::int AS high_count,
                count(*) FILTER (WHERE v.severity = 'medium')::int AS medium_count,
                count(*) FILTER (WHERE v.severity = 'low')::int AS low_count,
                max(v.created_at) AS latest_at,
                (count(*) >= $2) AS is_repeat
           FROM public.seller_violations v
           LEFT JOIN public.sellers s ON s.id = v.seller_id AND s.tenant_id = v.tenant_id
          WHERE v.tenant_id = $1
          GROUP BY v.seller_id, s.display_name
          ORDER BY total DESC, critical_count DESC, high_count DESC
          LIMIT 200`,
        [tenant, REPEAT_THRESHOLD]
      );
      return { offenders: rows, repeatThreshold: REPEAT_THRESHOLD };
    });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "repeat offenders failed" }, { status: 500 });
  }
}
