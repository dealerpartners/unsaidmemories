import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";

export const dynamic = "force-dynamic";

// GET /api/admin/trust-safety/zero-tolerance -> the F1 Zero tolerance
// queue: seller_violations in the CRITICAL severity band (the store's
// severity vocabulary is critical|high|medium|low — verified against
// the generic queue's filter and the repeat-offenders counts) that are
// still live (open or under review). Until this route existed the band
// existed only as a filter value inside the generic violations queue.
// Status changes ride the audited violations PATCH — same records,
// same decision path, no second writer.
export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("trust_safety", "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);

  try {
    const out = await withPg(async (c) => {
      const { rows } = await c.query(
        `SELECT v.id, v.tenant_id, v.seller_id, v.violation_type, v.severity, v.status,
                v.description, v.created_at,
                s.display_name AS seller_name
           FROM public.seller_violations v
           LEFT JOIN public.sellers s ON s.id = v.seller_id AND s.tenant_id = v.tenant_id
          WHERE v.tenant_id = $1 AND v.severity = 'critical'
            AND v.status IN ('open', 'under-review')
          ORDER BY v.created_at DESC LIMIT 200`,
        [tenant]
      );
      return { violations: rows };
    });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "zero tolerance queue failed" }, { status: 500 });
  }
}
