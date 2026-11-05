import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/server";
import { adminSetCampaignStatus } from "@/lib/ads/admin";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/ads/campaigns/:id — W9 campaign status control
 * over the P3 lifecycle: approve a preflight campaign (the admin
 * review act the launch route waits on), return it to draft, pause
 * or resume a live campaign, activate an approved one (with the
 * launch rate-snapshot transaction), or end it. Admin only.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (body.status === undefined) {
    return NextResponse.json({ error: "status_required" }, { status: 400 });
  }
  const result = await adminSetCampaignStatus(id, String(body.status));
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, detail: result.detail },
      { status: result.status },
    );
  }
  return NextResponse.json({
    campaign_id: id,
    status: result.campaign.status,
    rates: result.rates,
  });
}
