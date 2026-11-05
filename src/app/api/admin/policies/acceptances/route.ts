import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// H3 · Acceptance Tracking — the admin-side registry view.
// Two real acceptance stores exist:
//   public.seller_policy_acceptances — marketplace governance acceptances
//     (counted per policy in the marketplace route; this view aggregates
//     them registry-wide, incl. how many are stale against the policy's
//     current version).
//   public.cms_policy_acceptances — the CMS-domain registry (page_id,
//     page_version, customer_id | user_id, accepted_at). Until now it had
//     exactly one reader (the employee read leg) and NO admin view. This
//     route groups its records by audience, resolved from the accepting
//     identity's home: crm_staff (employee; is_service_staff → groomer),
//     clinical.veterinarians (vet), public.customers (buyer). Page titles
//     resolve against the doc store (post-S1 the policies live there);
//     an unresolved page_id is shown as-is, never given an invented title.
// Telemed has no acceptance store of its own (see
// lib/telemedicine/commercial.ts) — vet rows appear here only when a vet
// identity actually recorded a CMS-registry acceptance.
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("policies", "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  try {
    const out = await withPg(async (c) => {
      const { rows: cmsRows } = await c.query(
        `SELECT a.id::text AS id, a.page_id::text AS page_id, a.page_version,
                a.accepted_at, a.user_id::text AS user_id,
                a.customer_id::text AS customer_id,
                CASE
                  WHEN st.id IS NOT NULL AND st.is_service_staff THEN 'groomer'
                  WHEN st.id IS NOT NULL THEN 'employee'
                  WHEN v.id IS NOT NULL THEN 'vet'
                  WHEN a.customer_id IS NOT NULL OR cu.id IS NOT NULL THEN 'buyer'
                  ELSE 'unknown'
                END AS audience,
                COALESCE(st.display_name, v.display_name,
                         NULLIF(TRIM(COALESCE(cu."firstName", '') || ' ' || COALESCE(cu."lastName", '')), ''),
                         cu.email) AS actor_name,
                da.title AS page_title
           FROM public.cms_policy_acceptances a
           LEFT JOIN public.crm_staff st
             ON st.tenant_id = a.tenant_id AND st.user_id = a.user_id
           LEFT JOIN clinical.veterinarians v
             ON v.tenant_id = a.tenant_id AND v.user_id = a.user_id
           LEFT JOIN public.customers cu
             ON cu.id = a.customer_id OR (a.user_id IS NOT NULL AND cu."userId" = a.user_id)
           LEFT JOIN public.seller_policies da
             ON da.tenant_id = a.tenant_id AND da.id::text = a.page_id::text
          WHERE a.tenant_id = $1
          ORDER BY a.accepted_at DESC
          LIMIT 200`,
        [tenant]
      );
      const cmsCounts: Record<string, number> = { buyer: 0, employee: 0, vet: 0, groomer: 0, unknown: 0 };
      for (const r of cmsRows) {
        const k = String(r.audience);
        cmsCounts[k] = (cmsCounts[k] ?? 0) + 1;
      }
      const { rows: sellerPolicies } = await c.query(
        `SELECT p.id::text AS policy_id, p.title, p.status, p.current_version,
                count(a.id)::int AS acceptance_count,
                count(a.id) FILTER (WHERE a.policy_version < p.current_version)::int AS stale_count,
                max(a.accepted_at) AS last_accepted_at
           FROM public.seller_policies p
           LEFT JOIN public.seller_policy_acceptances a
             ON a.tenant_id = p.tenant_id AND a.policy_id = p.id
          WHERE p.tenant_id = $1
          GROUP BY p.id, p.title, p.status, p.current_version
          ORDER BY p.title`,
        [tenant]
      );
      const { rows: sellerTotal } = await c.query(
        `SELECT count(*)::int AS n FROM public.seller_policy_acceptances WHERE tenant_id = $1`,
        [tenant]
      );
      return {
        cms: { counts: cmsCounts, total: cmsRows.length, records: cmsRows },
        seller: { total: sellerTotal[0]?.n ?? 0, policies: sellerPolicies },
      };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: "acceptance tracking failed" }, { status: 500 });
  }
}
