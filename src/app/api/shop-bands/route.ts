import { NextResponse } from "next/server";
import { getShopBands } from "@/lib/shop-bands";

export const runtime = "nodejs";

/**
 * GET /api/shop-bands — card data for the Featured Collections and
 * Your People bands rendered at the foot of every shop page. The
 * assembly is cached server-side (lib/shop-bands); every href in the
 * payload is a real route and every image is real catalogue imagery.
 */
export async function GET() {
  const data = await getShopBands();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" },
  });
}
