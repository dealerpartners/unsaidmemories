import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";

export const dynamic = "force-dynamic";

// GET /api/admin/policies/versions -> policy version history.
// Backed by public.seller_policy_versions joined to public.seller_policies
// (both exist live — verified 2026-10-13; the versions page previously
// claimed the table did not exist and fabricated a "v1 (current)" badge for
// every site policy). Also returns the policy registry itself so the page
// can show each policy's real current_version. Since BL-13 the site
// policies are rows of this same store (category 'Site policy') and their
// versions are minted here too — one history for the one store.
export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("policies", "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  try {
    const out = await withPg(async (c) => {
      const versions = await c.query(
        `SELECT v.id, v.policy_id, v.version, v.change_notes, v.published_by, v.published_at, v.created_at,
                p.title AS policy_title, p.slug AS policy_slug, p.current_version AS policy_current_version
           FROM public.seller_policy_versions v
           JOIN public.seller_policies p ON p.id = v.policy_id AND p.tenant_id = v.tenant_id
          WHERE v.tenant_id = $1
          ORDER BY v.published_at DESC NULLS LAST, v.created_at DESC
          LIMIT 200`,
        [tenant]
      );
      const policies = await c.query(
        `SELECT id, title, slug, status, current_version, updated_at
           FROM public.seller_policies
          WHERE tenant_id = $1
          ORDER BY title`,
        [tenant]
      );
      return { versions: versions.rows, marketplacePolicies: policies.rows };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "policy versions failed" }, { status: 500 });
  }
}
