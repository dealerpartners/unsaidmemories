import { NextResponse } from "next/server";
import { creativeDestination, recordAdEvent } from "@/lib/ads/serve-core";
import { VIEWER_COOKIE } from "@/lib/ads-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/ads/click/:creativeId — the tracked click-through for
 * Ads v2. Records a 'click' row in the ad_events ledger (joined to
 * the served impression by ?tid=<tracking_id> when the link carries
 * one), bumps the campaign's daily click counter, then 307-redirects
 * to the creative's click_url (fallback "/shop"). Recording is
 * best-effort; the redirect always happens. Creative ids are the new
 * subsystem's bigint ids, as issued by /api/ads/serve.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ creativeId: string }> },
) {
  const { creativeId } = await params;
  const url = new URL(req.url);
  let destination = "/shop";
  try {
    const creative = await creativeDestination(creativeId);
    if (creative) {
      if (creative.click_url) destination = creative.click_url;
      const cookieHeader = req.headers.get("cookie") ?? "";
      const match = cookieHeader.match(
        new RegExp(`(?:^|;\\s*)${VIEWER_COOKIE}=([^;]+)`),
      );
      await recordAdEvent({
        event_type: "click",
        tracking_id: url.searchParams.get("tid"),
        campaign_id: creative.campaign_id,
        creative_id: creativeId,
        ad_uid: match?.[1] ? decodeURIComponent(match[1]) : null,
      }).catch(() => false);
    }
  } catch {
    // fall through to the default destination
  }
  const dest = destination.startsWith("http")
    ? destination
    : new URL(destination, req.url).toString();
  return NextResponse.redirect(dest, 307);
}
