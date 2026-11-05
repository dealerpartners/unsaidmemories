import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/crm/campaigns — the tenant's real marketing campaigns
// (public.crm_campaigns), for the customer profile's Add to Campaign
// picker. Enrollment itself posts to /api/admin/crm/actions
// (crm_add_to_campaign → crm_campaign_members).
export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("customers", "read");
  if (gate) return gate;
  const result = await withPg(async (client) => {
    const tenant = resolveTenantId(req);
    const r = await client.query(
      `SELECT id::text AS id, name, campaign_type, status, channel
         FROM public.crm_campaigns
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT 200`,
      [tenant],
    );
    return NextResponse.json({ data: r.rows, total: r.rows.length });
  });
  return result ?? NextResponse.json({ data: [], total: 0 });
}
