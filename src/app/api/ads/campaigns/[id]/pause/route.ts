import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";
import { loadOwnedCampaign } from "@/lib/ads/advertiser";

export const dynamic = "force-dynamic";

/**
 * POST /api/ads/campaigns/:id/pause — active -> paused (spec section
 * 24). A paused campaign is ineligible in serve from the next
 * request; its reservations and snapshots are untouched. Resume is
 * POST /:id/launch.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const owned = await loadOwnedCampaign(user.id, id);
    if (!owned) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (owned.campaign.status !== "active") {
      return NextResponse.json(
        { error: "invalid_transition", from: owned.campaign.status, to: "paused" },
        { status: 409 },
      );
    }
    await pgQueryStrict(
      `UPDATE public.ad_campaigns SET status = 'paused', updated_at = now()
        WHERE id = $1`,
      [id],
    );
    return NextResponse.json({ campaign_id: id, status: "paused" });
  } catch {
    return NextResponse.json({ error: "pause_unavailable" }, { status: 503 });
  }
}
