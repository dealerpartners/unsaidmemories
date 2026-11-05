import { NextRequest, NextResponse } from "next/server";
import { isLive, isValidPlacement, getLiveBanner } from "@/lib/website-cms";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/website/banners?placement=/shop/accessories — the ONE
 * live banner for a page, or null. Public on purpose: this is
 * storefront content. At most one row can be published per placement
 * (partial unique index), so the storefront never stacks banners.
 */
export async function GET(req: NextRequest) {
  const placement = req.nextUrl.searchParams.get("placement") ?? "";
  if (!isValidPlacement(placement)) {
    return NextResponse.json({ error: "placement must be a page path like /shop/accessories" }, { status: 400 });
  }
  try {
    const row = await getLiveBanner(placement);
    const banner = row && isLive(row as { status: string; starts_at: string | null; ends_at: string | null }) ? row : null;
    return NextResponse.json({ banner }, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch {
    return NextResponse.json({ banner: null }, { headers: { "Cache-Control": "public, max-age=60" } });
  }
}
