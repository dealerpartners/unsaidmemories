import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/gate";
import { parseBanner, unpublishOthers, updateBanner, getBanner } from "@/lib/website-cms";

export const dynamic = "force-dynamic";

function numId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** GET /api/admin/website/banners/[id] — one banner (admin only). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const id = numId((await params).id);
  if (id === null) return NextResponse.json({ error: "Banner not found" }, { status: 404 });
  try {
    const banner = await getBanner(id);
    if (!banner) return NextResponse.json({ error: "Banner not found" }, { status: 404 });
    return NextResponse.json({ banner });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Read failed" }, { status: 500 });
  }
}

/** PATCH /api/admin/website/banners/[id] — edit / publish / unpublish. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const id = numId((await params).id);
  if (id === null) return NextResponse.json({ error: "Banner not found" }, { status: 404 });
  const body = await req.json().catch(() => null);
  const { errors, data } = parseBanner(body);
  if (!data) return NextResponse.json({ errors }, { status: 400 });
  try {
    if (data.status === "published") {
      await unpublishOthers("banners", String(data.placement), id);
    }
    const banner = await updateBanner(id, data);
    if (!banner) return NextResponse.json({ error: "Banner not found" }, { status: 404 });
    return NextResponse.json({ banner });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Save failed" }, { status: 500 });
  }
}

// No DELETE route, by the owner's no-delete rule: a banner is taken
// down by unpublishing it (PATCH status draft), never deleted.
