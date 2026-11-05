import { NextRequest, NextResponse } from "next/server";
import { findGifts } from "@/lib/gift-finder";
import { PRICE_BANDS } from "@/lib/gift-finder-options";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/gift-finder — the live finder behind the box on /shop.
 * Query params: recipient, occasion, personalization (custom|ready),
 * memoryLink=1, material, price (band value), supplier (slug).
 * Returns only priced, PDP-resolvable products; `total` is the true
 * size of the full match set and `capped` says whether the search
 * hit its cap. Results are paged 60 at a time — pass `offset` for
 * the next page of the same match set.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const band = PRICE_BANDS.find((b) => b.value === sp.get("price"));
  try {
    const result = await findGifts({
      recipient: sp.get("recipient") || undefined,
      occasion: sp.get("occasion") || undefined,
      personalization: sp.get("personalization") || undefined,
      memoryLink: sp.get("memoryLink") === "1",
      material: sp.get("material") || undefined,
      priceMax: band?.max,
      supplierSlug: sp.get("supplier") || undefined,
      offset: Math.max(0, Math.min(100000, Number(sp.get("offset")) || 0)),
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[gift-finder]", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "The finder couldn't search just now. Please try again." },
      { status: 500 },
    );
  }
}
