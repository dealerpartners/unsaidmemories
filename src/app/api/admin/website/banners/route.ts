import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/gate";
import { parseBanner, unpublishOthers, insertBanner, listBanners } from "@/lib/website-cms";

export const dynamic = "force-dynamic";

/** GET /api/admin/website/banners — list banners (admin only). */
export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  try {
    const banners = await listBanners(
      req.nextUrl.searchParams.get("placement"),
      req.nextUrl.searchParams.get("status"),
    );
    return NextResponse.json({ banners });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Read failed" }, { status: 500 });
  }
}

/** POST /api/admin/website/banners — create a banner (admin only). */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const body = await req.json().catch(() => null);
  const { errors, data } = parseBanner(body);
  if (!data) return NextResponse.json({ errors }, { status: 400 });
  try {
    if (data.status === "published") {
      await unpublishOthers("banners", String(data.placement));
    }
    const banner = await insertBanner(data, gate.context?.email ?? null);
    return NextResponse.json({ banner }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Save failed" }, { status: 500 });
  }
}
