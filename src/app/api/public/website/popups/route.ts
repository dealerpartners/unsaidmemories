import { NextRequest, NextResponse } from "next/server";
import { isLive, isValidPlacement, getLivePopup } from "@/lib/website-cms";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/website/popups?placement=/ — the ONE live pop-up for
 * a page, or null. Public on purpose: this is storefront content.
 * Frequency (once per session / day / every visit) is enforced by the
 * storefront pop-up component, not by this endpoint.
 */
export async function GET(req: NextRequest) {
  const placement = req.nextUrl.searchParams.get("placement") ?? "";
  if (!isValidPlacement(placement)) {
    return NextResponse.json({ error: "placement must be a page path like /shop/accessories" }, { status: 400 });
  }
  try {
    const row = await getLivePopup(placement);
    const popup = row && isLive(row as { status: string; starts_at: string | null; ends_at: string | null }) ? row : null;
    return NextResponse.json({ popup }, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch {
    return NextResponse.json({ popup: null }, { headers: { "Cache-Control": "public, max-age=60" } });
  }
}
