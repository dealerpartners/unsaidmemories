import { NextResponse } from "next/server";
import { recordAdEvent } from "@/lib/ads/serve-core";

export const dynamic = "force-dynamic";

/**
 * POST /api/ads/events — the client event beacon for the Ads v2
 * ledger (spec section 24). Body:
 *   { type: "click" | "impression", tracking_id?, campaign_id,
 *     creative_id, placement?, ad_uid?, page_id?, category_id? }
 * Writes one ad_events row (clicks also bump the campaign's daily
 * click counter). Validated in serve-core: the creative must exist
 * and belong to the named campaign; anything else is refused. This is
 * also the endpoint smart links (W8) record clicks through.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const type = body.type === "impression" ? "impression" : "click";
  try {
    const recorded = await recordAdEvent({
      event_type: type,
      tracking_id: body.tracking_id != null ? String(body.tracking_id) : null,
      campaign_id: String(body.campaign_id ?? ""),
      creative_id: String(body.creative_id ?? ""),
      placement: body.placement != null ? String(body.placement) : null,
      ad_uid: body.ad_uid != null ? String(body.ad_uid) : null,
      page_id: body.page_id != null ? Number(body.page_id) : null,
      category_id: body.category_id != null ? String(body.category_id) : null,
    });
    if (!recorded) {
      return NextResponse.json({ error: "unknown_creative" }, { status: 422 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "events_unavailable" }, { status: 503 });
  }
}
